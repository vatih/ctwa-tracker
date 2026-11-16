import { afterEach, describe, expect, mock, test } from "bun:test";
import { buildLeadEvent, buildTestEvent, MetaError, metaErrorMessage, needsBusinessId, validatePixel } from "./meta";

const realFetch = globalThis.fetch;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const missingPerm = { error: { message: "(#100) Missing Permission", type: "OAuthException", code: 100 } };

function mockMeta(handler: (method: string, url: string) => Response) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  globalThis.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const url = String(input);
    calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : null });
    return handler(method, url);
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("validatePixel", () => {
  test("token yang boleh baca pixel: pakai info pixel", async () => {
    const calls = mockMeta(() => json({ id: "111", name: "Pixel A" }));
    expect(await validatePixel("111", "tok")).toEqual({ id: "111", name: "Pixel A", verified: true });
    expect(calls).toHaveLength(1);
  });

  test("token CAPI tanpa izin baca: lolos tanpa mengirim event", async () => {
    const calls = mockMeta(() => json(missingPerm, 400));
    expect(await validatePixel("111", "tok")).toEqual({ id: "111", verified: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("GET");
  });

  test("pixel ID salah (subcode 33) ditolak tanpa mengirim event", async () => {
    const calls = mockMeta(() =>
      json(
        {
          error: {
            message:
              "Unsupported get request. Object with ID '999' does not exist, cannot be loaded due to missing permissions, or does not support this operation.",
            type: "GraphMethodException",
            code: 100,
            error_subcode: 33,
          },
        },
        400,
      ),
    );
    await expect(validatePixel("999", "tok")).rejects.toThrow("Pixel/Dataset ID 999 tidak ditemukan");
    expect(calls).toHaveLength(1);
  });

  test("error lain tidak memicu fallback", async () => {
    const calls = mockMeta(() => json({ error: { message: "Invalid OAuth access token.", code: 190 } }, 400));
    await expect(validatePixel("111", "tok")).rejects.toThrow("Invalid OAuth");
    expect(calls).toHaveLength(1);
  });
});

describe("buildLeadEvent (lead iklan WhatsApp)", () => {
  const adLead = { id: "l1", phone: "628123", ctwaClid: "clid", adSourceId: null };

  test("page_id & WABA ID masuk ke user_data", () => {
    const e = buildLeadEvent(adLead, { eventName: "Lead", pageId: "111", wabaId: "222" });
    expect(e.action_source).toBe("business_messaging");
    expect(e.user_data).toMatchObject({ ctwa_clid: "clid", page_id: "111", whatsapp_business_account_id: "222" });
  });

  test("needsBusinessId: lead iklan tanpa page/WABA ditahan, lead organik tidak", () => {
    expect(needsBusinessId(adLead, { wabaId: null, pageId: null })).toBe(true);
    expect(needsBusinessId(adLead, { wabaId: null, pageId: "111" })).toBe(false);
    expect(needsBusinessId({ ctwaClid: null }, { wabaId: null, pageId: null })).toBe(false);
  });
});

test("metaErrorMessage memakai error_user_msg bila ada", () => {
  const body = { error: { message: "Invalid parameter", error_user_msg: "ID Halaman hilang" } };
  expect(metaErrorMessage(body)).toBe("ID Halaman hilang");
  expect(metaErrorMessage({ error: { message: "Invalid parameter" } })).toBe("Invalid parameter");
  expect(metaErrorMessage(null, "fallback")).toBe("fallback");
});

describe("buildTestEvent", () => {
  const now = new Date("2026-11-15T07:00:00Z");

  test("ad: business_messaging WhatsApp dengan page_id, WABA & nomor dummy, tanpa ctwa_clid", () => {
    const e = buildTestEvent("ad", "InitiateCheckout", { pageId: "111", wabaId: "222" }, now);
    expect(e).toMatchObject({
      event_name: "InitiateCheckout",
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      event_id: `ctwa-test-${now.getTime()}`,
    });
    expect(e.user_data).toMatchObject({ page_id: "111", whatsapp_business_account_id: "222" });
    expect(e.user_data.ctwa_clid).toBeUndefined();
    expect((e.user_data.ph as string[])[0]).toHaveLength(64);
  });

  test("organic: chat tanpa id bisnis", () => {
    const e = buildTestEvent("organic", "Lead", { pageId: "111", wabaId: null }, now);
    expect(e.action_source).toBe("chat");
    expect(e.messaging_channel).toBeUndefined();
    expect(e.user_data.page_id).toBeUndefined();
  });
});
