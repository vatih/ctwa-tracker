import { and, eq, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { decrypt } from "../lib/crypto";
import { capiLogger } from "./capi-log";
import {
  buildLeadEvent,
  MetaError,
  MISSING_BUSINESS_ID,
  metaErrorMessage,
  needsBusinessId,
  sendEvents,
  testModeMessage,
} from "./meta";
import { findEnabledEvent, supportsEvent, VALUE_REQUIRED } from "./event-settings";
import { publish } from "./realtime";
import { resolvePixel, resolveTrigger } from "./resolve";

export type SendResult =
  | { ok: true; eventId: string; fbtraceId?: string }
  | {
      ok: false;
      code:
        | "not_found"
        | "no_pixel"
        | "test_mode"
        | "missing_business_id"
        | "invalid_event"
        | "unsupported_event"
        | "value_required"
        | "already_sent"
        | "meta_error";
      message: string;
    };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Kirim lead ke Meta CAPI (jalur otomatis & manual memakai fungsi yang sama).
 * Urutan: reservasi baris capi_events pending (unik per lead+event)
 * -> kirim dengan retry -> sukses: tandai CAPI Sent, gagal: status failed.
 */
export async function sendLeadToMeta(
  leadId: string,
  opts: {
    trigger: "auto" | "manual";
    sentBy?: string;
    userId?: string;
    /** event pilihan user (manual); kosong = event dari trigger */
    eventName?: string;
    /** nilai transaksi; kosong = nilai default event / trigger */
    value?: number | null;
  },
): Promise<SendResult> {
  const [row] = await db
    .select({ lead: schema.leads, account: schema.waAccounts })
    .from(schema.leads)
    .innerJoin(schema.waAccounts, eq(schema.leads.waAccountId, schema.waAccounts.id))
    .where(eq(schema.leads.id, leadId));
  if (!row || (opts.userId && row.account.userId !== opts.userId)) {
    return { ok: false, code: "not_found", message: "Lead tidak ditemukan" };
  }
  const { lead, account } = row;
  const userId = account.userId;

  const pixel = await resolvePixel(userId, account.id);
  if (!pixel) return { ok: false, code: "no_pixel", message: "Belum ada Pixel untuk nomor ini. Tambahkan di menu Datasets (Pixel)." };

  // mode test: lead asli tidak dikirim sampai test event code dikosongkan
  if (pixel.testEventCode) return { ok: false, code: "test_mode", message: testModeMessage(pixel.testEventCode) };
  if (needsBusinessId(lead, pixel)) return { ok: false, code: "missing_business_id", message: MISSING_BUSINESS_ID };

  const trigger = await resolveTrigger(userId, account.id);
  const eventName = opts.eventName ?? trigger?.eventName ?? "InitiateCheckout";
  const setting = await findEnabledEvent(userId, eventName);
  const fromTrigger = !!trigger && trigger.eventName === eventName;
  // event di luar trigger harus terdaftar & aktif di menu Events
  if (!setting && !fromTrigger && opts.eventName) {
    return { ok: false, code: "invalid_event", message: `Event ${eventName} tidak aktif. Aktifkan di menu Events.` };
  }
  if (!supportsEvent(lead, eventName)) {
    return {
      ok: false,
      code: "unsupported_event",
      message: `Event ${eventName} tidak bisa dikirim untuk lead dari iklan CTWA. Lead iklan hanya menerima Qualified Lead, Initiate Checkout, dan Purchase; event custom hanya untuk lead organik.`,
    };
  }
  const value = opts.value ?? (fromTrigger ? trigger?.value : null) ?? setting?.defaultValue ?? null;
  const currency = (fromTrigger ? trigger?.currency : null) ?? setting?.currency ?? "IDR";
  if (VALUE_REQUIRED.has(eventName) && !value) {
    return { ok: false, code: "value_required", message: `Event ${eventName} wajib disertai nilai transaksi (Meta mewajibkan value).` };
  }

  // reservasi atomik
  let capiEventId: string;
  try {
    capiEventId = await db.transaction(async (tx) => {
      const [ev] = await tx
        .insert(schema.capiEvents)
        .values({
          leadId,
          pixelId: pixel.id,
          eventName,
          eventId: `${leadId}:${eventName}`,
          trigger: opts.trigger,
          sentBy: opts.sentBy ?? null,
        })
        .returning({ id: schema.capiEvents.id });
      return ev.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, code: "already_sent", message: `Lead ini sudah dikirim sebagai ${eventName}.` };
    throw e;
  }

  const event = buildLeadEvent(lead, {
    eventName,
    value,
    currency,
    wabaId: pixel.wabaId,
    pageId: pixel.pageId,
  });
  const token = decrypt(pixel.accessTokenEnc);

  let lastErr: MetaError | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const log = capiLogger({
        userId,
        source: opts.trigger === "auto" ? "send_auto" : "send_manual",
        pixelId: pixel.id,
        leadId,
        attempt,
      });
      const res = await sendEvents(pixel.pixelId, token, [event], pixel.testEventCode, log);
      await db.transaction(async (tx) => {
        await tx
          .update(schema.capiEvents)
          .set({ status: "success", request: { data: [event] }, response: res, fbtraceId: res.fbtrace_id ?? null })
          .where(eq(schema.capiEvents.id, capiEventId));
        await tx.update(schema.leads).set({ capiSentAt: new Date() }).where(eq(schema.leads.id, leadId));
      });
      publish(userId, { type: "leads", leadIds: [leadId] });
      return { ok: true, eventId: capiEventId, fbtraceId: res.fbtrace_id };
    } catch (e) {
      lastErr = e instanceof MetaError ? e : new MetaError((e as Error).message, 0, null);
      if (!lastErr.retryable || attempt === 3) break;
      await sleep(attempt * 1500);
    }
  }

  await db
    .update(schema.capiEvents)
    .set({
      status: "failed",
      request: { data: [event] },
      response: (lastErr?.body as object) ?? { message: lastErr?.message },
      fbtraceId: lastErr?.fbtraceId ?? null,
    })
    .where(eq(schema.capiEvents.id, capiEventId));
  publish(userId, { type: "leads", leadIds: [leadId] });
  return { ok: false, code: "meta_error", message: `Meta menolak event: ${metaErrorMessage(lastErr?.body, lastErr?.message) ?? "unknown"}` };
}

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

/** Event "pending" yang yatim (proses mati di tengah kirim) -> failed */
export async function recoverStuckEvents() {
  const stuck = await db
    .update(schema.capiEvents)
    .set({ status: "failed", response: { message: "Interrupted, silakan kirim ulang" } })
    .where(and(eq(schema.capiEvents.status, "pending"), lt(schema.capiEvents.createdAt, sql`now() - interval '5 minutes'`)))
    .returning({ leadId: schema.capiEvents.leadId });
  if (stuck.length) console.warn(`recovered ${stuck.length} stuck capi events`);
}
