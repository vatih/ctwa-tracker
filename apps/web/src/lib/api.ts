import type { ApiType } from "@ctwa/api/client";
import { hc } from "hono/client";
import type { ClientResponse } from "hono/client";
import type { SuccessStatusCode } from "hono/utils/http-status";

export const api = hc<ApiType>("/api", { init: { credentials: "include" } });

type IsOk<S> = S extends SuccessStatusCode ? true : never;
/** Ambil tipe body dari response sukses (2xx) saja */
type OkBody<R> = R extends ClientResponse<infer T, infer S, infer _F> ? ([IsOk<S>] extends [never] ? never : T) : never;

/** Error dari server; field + fieldMessage diisi bila error terkait satu kolom form */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public field?: string,
    public fieldMessage?: string,
  ) {
    super(message);
  }
}

/** Lempar error dengan pesan dari server bila response tidak ok */
export async function unwrap<R extends ClientResponse<unknown, number, string>>(res: Promise<R>): Promise<OkBody<R>> {
  const r = await res;
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string; field?: string; fieldMessage?: string };
    throw new ApiError(body.error ?? `HTTP ${r.status}`, r.status, body.field, body.fieldMessage);
  }
  return (await r.json()) as OkBody<R>;
}
