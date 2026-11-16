import { createHash } from "node:crypto";
import { env } from "../env";

const GRAPH = () => `https://graph.facebook.com/${env.META_GRAPH_VERSION}`;

export type GraphError = { message: string; type?: string; code?: number; error_subcode?: number; fbtrace_id?: string };

export class MetaError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown,
    public fbtraceId?: string,
  ) {
    super(message);
  }
  /** error sementara (boleh retry) */
  get retryable() {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

async function graph<T>(path: string, init: RequestInit & { token: string }): Promise<T> {
  const url = new URL(`${GRAPH()}${path}`);
  url.searchParams.set("access_token", init.token);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    throw new MetaError(`Tidak bisa menghubungi Meta: ${(e as Error).message}`, 0, null);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: GraphError } & T;
  if (!res.ok || body.error) {
    const err = body.error;
    throw new MetaError(err?.message ?? `HTTP ${res.status}`, res.status, body, err?.fbtrace_id);
  }
  return body;
}

export const sha256 = (s: string) => createHash("sha256").update(s.trim().toLowerCase()).digest("hex");

export const graphError = (e: unknown) => (e instanceof MetaError ? (e.body as { error?: GraphError } | null)?.error : undefined);

/** Objek tidak ada / tidak terlihat sama sekali oleh token (mis. Pixel ID salah): code 100 subcode 33 */
export const isUnknownObject = (e: unknown) => graphError(e)?.code === 100 && graphError(e)?.error_subcode === 33;

/** Objek ada tapi field tidak boleh dibaca token (token CAPI dari Events Manager): "(#100) Missing Permission" */
const isMissingPermission = (e: unknown) =>
  graphError(e)?.code === 100 && !isUnknownObject(e) && /missing permission/i.test((e as Error).message);

/**
 * Validasi pixel + token tanpa mengirim event.
 * - Pixel ID salah / tidak terlihat oleh token: Meta membalas subcode 33 -> ditolak.
 * - Token CAPI dari Events Manager tidak boleh baca node pixel: "Missing Permission" berarti
 *   pixel ada & token valid (token salah dibalas error 190), tetapi akses kirim belum terbukti:
 *   verified = false, cek lewat tombol Test.
 */
export async function validatePixel(
  pixelId: string,
  token: string,
): Promise<{ id: string; name?: string; verified: boolean }> {
  try {
    const info = await graph<{ id: string; name?: string }>(`/${encodeURIComponent(pixelId)}?fields=id,name`, { token });
    return { ...info, verified: true };
  } catch (e) {
    if (isUnknownObject(e)) {
      const err = e as MetaError;
      throw new MetaError(
        `Pixel/Dataset ID ${pixelId} tidak ditemukan, atau token ini tidak punya akses ke dataset tersebut. Cek lagi ID di Events Manager.`,
        err.status,
        err.body,
        err.fbtraceId,
      );
    }
    if (!isMissingPermission(e)) throw e;
    return { id: pixelId, verified: false };
  }
}

export type CapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "business_messaging" | "chat" | "other";
  messaging_channel?: "whatsapp";
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};

export type CapiResponse = { events_received?: number; messages?: string[]; fbtrace_id?: string };

/** Hasil satu panggilan POST /events, untuk log audit (tanpa access token) */
export type CapiCall = {
  datasetId: string;
  request: { data: CapiEvent[]; test_event_code?: string };
  ok: boolean;
  httpStatus: number;
  durationMs: number;
  response: unknown;
  fbtraceId: string | null;
  errorMessage: string | null;
};
export type OnCapiCall = (call: CapiCall) => Promise<void> | void;

export async function sendEvents(
  pixelId: string,
  token: string,
  data: CapiEvent[],
  testEventCode?: string | null,
  onCall?: OnCapiCall,
) {
  const request = { data, ...(testEventCode ? { test_event_code: testEventCode } : {}) };
  const started = Date.now();
  let call: Omit<CapiCall, "datasetId" | "request" | "durationMs">;
  try {
    const res = await graph<CapiResponse>(`/${encodeURIComponent(pixelId)}/events`, {
      token,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
    call = { ok: true, httpStatus: 200, response: res, fbtraceId: res.fbtrace_id ?? null, errorMessage: null };
    return res;
  } catch (e) {
    const err = e instanceof MetaError ? e : new MetaError((e as Error).message, 0, null);
    call = {
      ok: false,
      httpStatus: err.status,
      response: err.body,
      fbtraceId: err.fbtraceId ?? null,
      errorMessage: metaErrorMessage(err.body, err.message) ?? err.message,
    };
    throw e;
  } finally {
    // log tidak boleh menggagalkan pengiriman
    if (onCall) {
      try {
        await onCall({ datasetId: pixelId, request, durationMs: Date.now() - started, ...call! });
      } catch (e) {
        console.warn("capi log gagal:", (e as Error).message);
      }
    }
  }
}

/** Pesan error Meta yang paling jelas: error_user_msg bila ada, kalau tidak message */
export function metaErrorMessage(body: unknown, fallback?: string): string | undefined {
  const err = (body as { error?: GraphError & { error_user_msg?: string } } | null)?.error;
  return err?.error_user_msg || err?.message || fallback;
}

export const MISSING_BUSINESS_ID =
  "Lead ini dari iklan WhatsApp, Meta mewajibkan Facebook Page ID atau WhatsApp Business Account ID. Isi salah satunya di menu Datasets (Pixel) (harus yang tertaut ke dataset di Events Manager).";

/** Pesan saat pixel dalam mode test (test event code terisi): kirim lead dinonaktifkan */
export const testModeMessage = (code: string) =>
  `Mode test aktif: Pixel memakai test event code ${code}, jadi kirim lead ke Meta dinonaktifkan. Kosongkan test event code di menu Pixel untuk mengirim data asli.`;

/** Lead iklan (ctwa_clid) butuh page_id / WABA ID di pixel */
export const needsBusinessId = (lead: { ctwaClid: string | null }, pixel: { wabaId: string | null; pageId: string | null }) =>
  !!lead.ctwaClid && !pixel.wabaId && !pixel.pageId;

/** Nomor dummy untuk event uji: tidak cocok dengan akun mana pun, jadi tidak memengaruhi atribusi */
export const TEST_PHONE = "6280000000000";

export const TEST_AD_NEEDS_PAGE =
  "Tes lead iklan butuh Facebook Page ID di dataset ini. Event uji tidak punya ctwa_clid, dan untuk itu Meta mewajibkan page_id.";

/**
 * Event uji dari tombol Test di Pixel.
 * - "ad": jalur lead iklan WhatsApp (business_messaging). Tanpa ctwa_clid, Meta mewajibkan
 *   page_id + data pelanggan ter-hash, dan memeriksa dataset tertaut ke Halaman.
 * - "organic": jalur lead organik (chat + hash nomor).
 */
export function buildTestEvent(
  kind: "ad" | "organic",
  eventName: string,
  pixel: { pageId: string | null; wabaId: string | null },
  now = new Date(),
): CapiEvent {
  const user_data: Record<string, unknown> = { ph: [sha256(TEST_PHONE)] };
  const base = {
    event_name: eventName,
    event_time: Math.floor(now.getTime() / 1000),
    event_id: `ctwa-test-${now.getTime()}`,
    user_data,
  };
  if (kind === "organic") return { ...base, action_source: "chat" };
  if (pixel.pageId) user_data.page_id = pixel.pageId;
  if (pixel.wabaId) user_data.whatsapp_business_account_id = pixel.wabaId;
  return { ...base, action_source: "business_messaging", messaging_channel: "whatsapp" };
}

export type LeadForCapi = {
  id: string;
  phone: string | null;
  ctwaClid: string | null;
  adSourceId: string | null;
};

/**
 * Bangun event CAPI untuk lead WhatsApp.
 * - Lead dari iklan: business_messaging + ctwa_clid (pencocokan via klik iklan),
 *   wajib disertai page_id atau whatsapp_business_account_id (lihat needsBusinessId)
 * - Lead organik: chat + hash nomor
 */
export function buildLeadEvent(
  lead: LeadForCapi,
  opts: {
    eventName: string;
    value?: number | null;
    currency?: string | null;
    wabaId?: string | null;
    pageId?: string | null;
    now?: Date;
  },
): CapiEvent {
  const user_data: Record<string, unknown> = {};
  if (lead.phone) user_data.ph = [sha256(lead.phone)];
  const event: CapiEvent = {
    event_name: opts.eventName,
    event_time: Math.floor((opts.now ?? new Date()).getTime() / 1000),
    event_id: `${lead.id}:${opts.eventName}`,
    action_source: lead.ctwaClid ? "business_messaging" : "chat",
    user_data,
  };
  if (lead.ctwaClid) {
    event.messaging_channel = "whatsapp";
    user_data.ctwa_clid = lead.ctwaClid;
    // Meta mewajibkan salah satu (page_id / whatsapp_business_account_id) untuk business_messaging
    if (opts.wabaId) user_data.whatsapp_business_account_id = opts.wabaId;
    if (opts.pageId) user_data.page_id = opts.pageId;
  }
  const custom: Record<string, unknown> = {};
  if (opts.value != null) {
    custom.value = opts.value;
    custom.currency = opts.currency ?? "IDR";
  }
  if (lead.adSourceId) custom.ad_id = lead.adSourceId;
  if (Object.keys(custom).length) event.custom_data = custom;
  return event;
}
