import { and, desc, eq, ilike, isNotNull, lt, or, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db";
import { type AppEnv, requireUser } from "../lib/context";
import { v } from "../lib/validator";
import { sendLeadToMeta } from "../services/capi";
import { evaluate } from "../services/evaluator";
import { listEventSettings, VALUE_REQUIRED } from "../services/event-settings";
import { MISSING_BUSINESS_ID, needsBusinessId, testModeMessage } from "../services/meta";
import { resolvePixel, resolveTrigger } from "../services/resolve";

const L = schema.leads;
const A = schema.waAccounts;
const M = schema.messages;

const PAGE = 30;

const listQuery = z.object({
  accountId: z.uuid().optional(),
  tag: z.enum(["all", "ad", "potential", "capi_sent"]).default("all"),
  q: z.string().trim().max(100).optional(),
  // cursor = "<ISO last_message_at>|<lead id>"
  cursor: z.string().optional(),
});

async function ownedLead(userId: string, id: string) {
  const [row] = await db
    .select({ lead: L, account: { id: A.id, label: A.label, phone: A.phone, pushName: A.pushName } })
    .from(L)
    .innerJoin(A, eq(L.waAccountId, A.id))
    .where(and(eq(L.id, id), eq(A.userId, userId)));
  if (!row) throw new HTTPException(404, { message: "Lead tidak ditemukan" });
  return row;
}

export const leadRoutes = new Hono<AppEnv>()
  .use(requireUser)

  .get("/", v("query", listQuery), async (c) => {
    const user = c.get("user")!;
    const { accountId, tag, q, cursor } = c.req.valid("query");

    const where: (SQL | undefined)[] = [eq(A.userId, user.id)];
    if (accountId) where.push(eq(L.waAccountId, accountId));
    if (tag === "ad") where.push(or(isNotNull(L.ctwaClid), isNotNull(L.adSourceId)));
    if (tag === "potential") where.push(eq(L.isPotential, true));
    if (tag === "capi_sent") where.push(isNotNull(L.capiSentAt));
    if (q) {
      const like = `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      where.push(or(ilike(L.name, like), ilike(L.phone, like), ilike(L.lastMessagePreview, like)));
    }
    if (cursor) {
      const [ts, id] = cursor.split("|");
      const d = new Date(ts);
      if (!Number.isNaN(d.getTime()) && id) {
        where.push(or(lt(L.lastMessageAt, d), and(eq(L.lastMessageAt, d), lt(L.id, id))));
      }
    }

    const rows = await db
      .select({
        id: L.id,
        waAccountId: L.waAccountId,
        name: L.name,
        phone: L.phone,
        contactJid: L.contactJid,
        lastMessageAt: L.lastMessageAt,
        lastMessagePreview: L.lastMessagePreview,
        isPotential: L.isPotential,
        capiSentAt: L.capiSentAt,
        ctwaClid: L.ctwaClid,
        adSourceId: L.adSourceId,
        accountLabel: A.label,
        accountPhone: A.phone,
      })
      .from(L)
      .innerJoin(A, eq(L.waAccountId, A.id))
      .where(and(...where))
      .orderBy(desc(L.lastMessageAt), desc(L.id))
      .limit(PAGE + 1);

    const hasMore = rows.length > PAGE;
    const items = rows.slice(0, PAGE).map(({ ctwaClid, adSourceId, ...r }) => ({
      ...r,
      fromAd: !!(ctwaClid || adSourceId),
    }));
    const last = items.at(-1);
    return c.json({
      items,
      nextCursor: hasMore && last ? `${last.lastMessageAt.toISOString()}|${last.id}` : null,
    });
  })

  .get("/:id", v("param", z.object({ id: z.uuid() })), async (c) => {
    const user = c.get("user")!;
    const { lead, account } = await ownedLead(user.id, c.req.valid("param").id);
    const events = await db
      .select({
        id: schema.capiEvents.id,
        eventName: schema.capiEvents.eventName,
        trigger: schema.capiEvents.trigger,
        status: schema.capiEvents.status,
        fbtraceId: schema.capiEvents.fbtraceId,
        response: schema.capiEvents.response,
        createdAt: schema.capiEvents.createdAt,
      })
      .from(schema.capiEvents)
      .where(eq(schema.capiEvents.leadId, lead.id))
      .orderBy(desc(schema.capiEvents.createdAt))
      .limit(20);

    // status Lead Metrix & kesiapan kirim (untuk panel kanan)
    const [pixel, trigger, eventSettings] = await Promise.all([
      resolvePixel(user.id, account.id),
      resolveTrigger(user.id, account.id),
      listEventSettings(user.id),
    ]);
    let metrics = null;
    if (trigger) {
      const msgs = trigger.keywords.length
        ? await db
            .select({ fromMe: M.fromMe, text: M.text })
            .from(M)
            .where(eq(M.leadId, lead.id))
            .orderBy(desc(M.id))
            .limit(300)
        : [];
      const r = evaluate(trigger, { inCount: lead.msgInCount, outCount: lead.msgOutCount }, msgs);
      metrics = {
        triggerName: trigger.name,
        mode: trigger.mode,
        eventName: trigger.eventName,
        minMessages: trigger.minMessages,
        countMode: trigger.countMode,
        messageCount: r.messageCount,
        matchedKeywords: r.matchedKeywords,
        keywordCount: trigger.keywords.length,
      };
    }
    // alasan tombol kirim nonaktif (urutan sama dengan cek di sendLeadToMeta)
    const block: { canSend: boolean; blockedCode: string | null; blockedReason: string | null } = !pixel
      ? { canSend: false, blockedCode: "no_pixel", blockedReason: "Belum ada Pixel untuk nomor ini." }
      : pixel.testEventCode
        ? { canSend: false, blockedCode: "test_mode", blockedReason: testModeMessage(pixel.testEventCode) }
        : needsBusinessId(lead, pixel)
          ? { canSend: false, blockedCode: "missing_business_id", blockedReason: MISSING_BUSINESS_ID }
          : { canSend: true, blockedCode: null, blockedReason: null };

    // pilihan event di panel kanan: event trigger + event aktif di menu Events
    const triggerEvent = trigger?.eventName ?? null;
    const sentNames = new Set(events.filter((e) => e.status !== "failed").map((e) => e.eventName));
    const eventOptions = eventSettings
      .filter((e) => e.enabled)
      .map((e) => ({
        name: e.name,
        label: e.label || e.name,
        kind: e.kind,
        defaultValue: (e.name === triggerEvent ? trigger?.value : null) ?? e.defaultValue,
        valueRequired: VALUE_REQUIRED.has(e.name),
        fromTrigger: e.name === triggerEvent,
        sent: sentNames.has(e.name),
      }));
    if (triggerEvent && !eventOptions.some((e) => e.name === triggerEvent)) {
      eventOptions.unshift({
        name: triggerEvent,
        label: triggerEvent,
        kind: "standard",
        defaultValue: trigger?.value ?? null,
        valueRequired: VALUE_REQUIRED.has(triggerEvent),
        fromTrigger: true,
        sent: sentNames.has(triggerEvent),
      });
    }

    return c.json({
      lead,
      account,
      events,
      metrics,
      capi: {
        pixelName: pixel?.name ?? null,
        eventName: triggerEvent ?? "Lead",
        eventOptions,
        testEventCode: pixel?.testEventCode ?? null,
        ...block,
      },
    });
  })

  // Kirim manual ke Meta (user review lead Potential)
  .post(
    "/:id/send",
    v("param", z.object({ id: z.uuid() })),
    v(
      "json",
      z.object({
        eventName: z.string().trim().min(1).max(50).optional(),
        value: z.number().int().min(0).nullable().optional(),
      }),
    ),
    async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    await ownedLead(user.id, id);
    const r = await sendLeadToMeta(id, {
      trigger: "manual",
      sentBy: user.id,
      userId: user.id,
      eventName: b.eventName,
      value: b.value,
    });
    if (!r.ok) {
      const status =
        r.code === "not_found"
          ? 404
          : r.code === "meta_error"
            ? 502
            : r.code === "already_sent"
              ? 409
              : 422;
      throw new HTTPException(status, { message: r.message });
    }
    return c.json({ ok: true as const, eventId: r.eventId });
    },
  )

  // 50 pesan per halaman, urut lama -> baru; before = id pesan tertua yang sudah dimuat
  .get(
    "/:id/messages",
    v("param", z.object({ id: z.uuid() })),
    v("query", z.object({ before: z.coerce.number().int().positive().optional() })),
    async (c) => {
      const user = c.get("user")!;
      const { lead } = await ownedLead(user.id, c.req.valid("param").id);
      const { before } = c.req.valid("query");
      const rows = await db
        .select({ id: M.id, fromMe: M.fromMe, type: M.type, text: M.text, sentAt: M.sentAt })
        .from(M)
        .where(and(eq(M.leadId, lead.id), before ? lt(M.id, before) : undefined))
        .orderBy(desc(M.id))
        .limit(51);
      const hasMore = rows.length > 50;
      const items = rows.slice(0, 50).reverse();
      return c.json({ items, hasMore });
    },
  );
