/**
 * Integration test (DB lokal) untuk alur kirim CAPI.
 * Meta Graph API di-mock lewat globalThis.fetch.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { encrypt } from "../lib/crypto";
import { sendLeadToMeta } from "./capi";
import { CAPI_LOG_LIMIT, capiLogger } from "./capi-log";

const local = /localhost|127\.0\.0\.1/.test(env.DATABASE_URL);
const d = local ? describe : describe.skip;

let userId: string;
let accountId: string;
let metaCalls: { url: string; body: unknown }[] = [];
let metaStatus = 200;
const realFetch = globalThis.fetch;

async function newLead(opts: { clid?: boolean } = {}) {
  const jid = `${crypto.randomUUID()}@s.whatsapp.net`;
  const [l] = await db
    .insert(schema.leads)
    .values({
      waAccountId: accountId,
      contactJid: jid,
      phone: "628123456789",
      ctwaClid: opts.clid === false ? null : "clid-test",
      adSourceId: "ad-1",
      firstMessageAt: new Date(),
      lastMessageAt: new Date(),
    })
    .returning({ id: schema.leads.id });
  return l.id;
}

const logsFor = (leadId: string) =>
  db.select().from(schema.capiLogs).where(eq(schema.capiLogs.leadId, leadId)).orderBy(schema.capiLogs.id);

d("sendLeadToMeta", () => {
  beforeAll(async () => {
    globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("https://graph.facebook.com")) return realFetch(input, init);
      metaCalls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (metaStatus !== 200) {
        return new Response(JSON.stringify({ error: { message: "Invalid parameter", code: 100, fbtrace_id: "trace-x" } }), {
          status: metaStatus,
        });
      }
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: "trace-ok" }));
    }) as unknown as typeof fetch;

    userId = crypto.randomUUID();
    await db.insert(schema.user).values({ id: userId, name: "capi-test", email: `${userId}@test.local` });
    [{ id: accountId }] = await db.insert(schema.waAccounts).values({ userId }).returning({ id: schema.waAccounts.id });
    await db.insert(schema.pixels).values({
      userId,
      name: "Test Pixel",
      pixelId: "1234567890",
      accessTokenEnc: encrypt("EAAtesttokentesttokentest"),
      pageId: "555000111",
      applyAll: true,
    });
  });

  afterAll(async () => {
    globalThis.fetch = realFetch;
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  beforeEach(async () => {
    metaCalls = [];
    metaStatus = 200;
  });

  test("sukses: CAPI Sent, payload business_messaging", async () => {
    const leadId = await newLead();
    const r = await sendLeadToMeta(leadId, { trigger: "manual", userId });
    expect(r.ok).toBe(true);
    const [l] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
    expect(l.capiSentAt).not.toBeNull();

    const ev = (metaCalls[0].body as { data: Record<string, any>[] }).data[0];
    expect(metaCalls[0].url).toContain("/1234567890/events");
    expect(ev.action_source).toBe("business_messaging");
    expect(ev.messaging_channel).toBe("whatsapp");
    expect(ev.user_data.ctwa_clid).toBe("clid-test");
    expect(ev.user_data.page_id).toBe("555000111");
    expect(ev.user_data.ph[0]).toHaveLength(64);
    expect(ev.event_id).toBe(`${leadId}:Lead`);

    // log audit: 1 baris sukses, tanpa access token
    const [log] = await logsFor(leadId);
    expect(log).toMatchObject({ userId, source: "send_manual", ok: true, httpStatus: 200, attempt: 1, fbtraceId: "trace-ok" });
    expect(log.datasetId).toBe("1234567890");
    expect(JSON.stringify(log.request)).not.toContain("EAAtest");
    expect((log.request as { data: { event_id: string }[] }).data[0].event_id).toBe(`${leadId}:Lead`);

    // kirim ulang ditolak
    const again = await sendLeadToMeta(leadId, { trigger: "manual", userId });
    expect(again).toMatchObject({ ok: false, code: "already_sent" });
  });

  test("event pilihan: Purchase setelah Lead, wajib value, custom harus aktif", async () => {
    const leadId = await newLead();
    expect(await sendLeadToMeta(leadId, { trigger: "manual", userId })).toMatchObject({ ok: true });

    // Purchase tanpa value ditolak sebelum ke Meta
    const callsBefore = metaCalls.length;
    expect(await sendLeadToMeta(leadId, { trigger: "manual", userId, eventName: "Purchase" })).toMatchObject({
      ok: false,
      code: "value_required",
    });
    expect(metaCalls.length).toBe(callsBefore);

    const r = await sendLeadToMeta(leadId, { trigger: "manual", userId, eventName: "Purchase", value: 250000 });
    expect(r.ok).toBe(true);
    const ev = (metaCalls.at(-1)!.body as { data: Record<string, any>[] }).data[0];
    expect(ev.event_name).toBe("Purchase");
    expect(ev.event_id).toBe(`${leadId}:Purchase`);
    expect(ev.custom_data).toMatchObject({ value: 250000, currency: "IDR" });

    // event custom belum terdaftar -> ditolak; setelah dibuat & aktif -> terkirim dengan nilai default
    expect(await sendLeadToMeta(leadId, { trigger: "manual", userId, eventName: "SudahTransfer" })).toMatchObject({
      ok: false,
      code: "invalid_event",
    });
    await db
      .insert(schema.eventSettings)
      .values({ userId, kind: "custom", name: "SudahTransfer", defaultValue: 100000, currency: "IDR" });
    expect(await sendLeadToMeta(leadId, { trigger: "manual", userId, eventName: "SudahTransfer" })).toMatchObject({ ok: true });
    const custom = (metaCalls.at(-1)!.body as { data: Record<string, any>[] }).data[0];
    expect(custom.event_name).toBe("SudahTransfer");
    expect(custom.custom_data.value).toBe(100000);

    // event standar yang dinonaktifkan tidak bisa dipilih
    await db
      .update(schema.eventSettings)
      .set({ enabled: false })
      .where(and(eq(schema.eventSettings.userId, userId), eq(schema.eventSettings.name, "InitiateCheckout")));
    expect(await sendLeadToMeta(leadId, { trigger: "manual", userId, eventName: "InitiateCheckout" })).toMatchObject({
      ok: false,
      code: "invalid_event",
    });
  });

  test("lead organik pakai action_source chat", async () => {
    const leadId = await newLead({ clid: false });
    await sendLeadToMeta(leadId, { trigger: "auto" });
    const ev = (metaCalls[0].body as { data: Record<string, any>[] }).data[0];
    expect(ev.action_source).toBe("chat");
    expect(ev.user_data.ctwa_clid).toBeUndefined();
  });

  test("tanpa limit: 50 lead paralel semuanya terkirim", async () => {
    const leads = await Promise.all(Array.from({ length: 50 }, () => newLead()));
    const results = await Promise.all(leads.map((id) => sendLeadToMeta(id, { trigger: "auto" })));
    expect(results.filter((r) => r.ok)).toHaveLength(50);
  });

  test("Meta menolak: status failed", async () => {
    metaStatus = 400;
    const leadId = await newLead();
    const r = await sendLeadToMeta(leadId, { trigger: "manual", userId });
    expect(r).toMatchObject({ ok: false, code: "meta_error" });
    expect(metaCalls).toHaveLength(1); // 400 tidak di-retry
    const [ev] = await db.select().from(schema.capiEvents).where(eq(schema.capiEvents.leadId, leadId));
    expect(ev.status).toBe("failed");
    expect(ev.fbtraceId).toBe("trace-x");

    const logs = await logsFor(leadId);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ ok: false, httpStatus: 400, errorMessage: "Invalid parameter", fbtraceId: "trace-x" });
  });

  test("error 5xx: tiap percobaan ulang tercatat di log", async () => {
    metaStatus = 500;
    const leadId = await newLead();
    await sendLeadToMeta(leadId, { trigger: "auto" });
    const logs = await logsFor(leadId);
    expect(logs.map((l) => [l.source, l.attempt, l.httpStatus])).toEqual([
      ["send_auto", 1, 500],
      ["send_auto", 2, 500],
      ["send_auto", 3, 500],
    ]);
  }, 15_000);

  test(`log dipangkas: hanya ${CAPI_LOG_LIMIT} terbaru per user`, async () => {
    const log = capiLogger({ userId, source: "test" });
    const call = (i: number) => ({
      datasetId: "1234567890",
      request: { data: [], test_event_code: `T${i}` },
      ok: true,
      httpStatus: 200,
      durationMs: 1,
      response: {},
      fbtraceId: null,
      errorMessage: null,
    });
    for (let i = 0; i < CAPI_LOG_LIMIT + 5; i++) await log(call(i));
    const rows = await db
      .select({ code: schema.capiLogs.testEventCode })
      .from(schema.capiLogs)
      .where(and(eq(schema.capiLogs.userId, userId)))
      .orderBy(desc(schema.capiLogs.id));
    expect(rows).toHaveLength(CAPI_LOG_LIMIT);
    expect(rows[0].code).toBe(`T${CAPI_LOG_LIMIT + 4}`);
  });

  test("lead iklan tanpa Page ID / WABA ID ditahan sebelum ke Meta", async () => {
    await db.update(schema.pixels).set({ pageId: null }).where(eq(schema.pixels.userId, userId));
    const r = await sendLeadToMeta(await newLead(), { trigger: "manual", userId });
    expect(r).toMatchObject({ ok: false, code: "missing_business_id" });
    expect(metaCalls).toHaveLength(0);
    await db.update(schema.pixels).set({ pageId: "555000111" }).where(eq(schema.pixels.userId, userId));
  });

  test("mode test (test event code terisi): kirim lead diblokir, tidak ke Meta", async () => {
    await db.update(schema.pixels).set({ testEventCode: "TEST123" }).where(eq(schema.pixels.userId, userId));
    const leadId = await newLead();
    for (const trigger of ["manual", "auto"] as const) {
      const r = await sendLeadToMeta(leadId, { trigger, userId });
      expect(r).toMatchObject({ ok: false, code: "test_mode" });
      if (!r.ok) expect(r.message).toContain("TEST123");
    }
    expect(metaCalls).toHaveLength(0);
    expect(await db.select().from(schema.capiEvents).where(eq(schema.capiEvents.leadId, leadId))).toHaveLength(0);
    await db.update(schema.pixels).set({ testEventCode: null }).where(eq(schema.pixels.userId, userId));

    // setelah test code dikosongkan, lead yang sama bisa dikirim
    expect(await sendLeadToMeta(leadId, { trigger: "manual", userId })).toMatchObject({ ok: true });
  });

  test("tanpa pixel -> no_pixel", async () => {
    await db.update(schema.pixels).set({ applyAll: false }).where(eq(schema.pixels.userId, userId));
    const r = await sendLeadToMeta(await newLead(), { trigger: "auto" });
    expect(r).toMatchObject({ ok: false, code: "no_pixel" });
    await db.update(schema.pixels).set({ applyAll: true }).where(eq(schema.pixels.userId, userId));
  });
});
