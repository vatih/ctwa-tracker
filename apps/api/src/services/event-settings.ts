import { and, asc, eq } from "drizzle-orm";
import { db, schema } from "../db";

const E = schema.eventSettings;

/** Event standar Meta yang didukung (urutan = urutan tampil) */
export const STANDARD_EVENTS = [
  { name: "QualifiedLead", label: "Qualified Lead" },
  { name: "InitiateCheckout", label: "Initiate Checkout" },
  { name: "Purchase", label: "Purchase" },
] as const;

/** Lead dari iklan CTWA (business_messaging) hanya menerima event standar di atas, bukan event custom */
export const supportsEvent = (lead: { ctwaClid: string | null }, name: string) =>
  !lead.ctwaClid || STANDARD_EVENTS.some((e) => e.name === name);

/** Meta mewajibkan value + currency untuk Purchase */
export const VALUE_REQUIRED = new Set(["Purchase"]);

export const EVENT_NAME_RE = /^[A-Za-z0-9_ ]+$/;

/** Nama event standar Meta lain: tidak boleh dipakai sebagai event custom (bukan custom di mata Meta) */
export const RESERVED_NAMES = new Set(
  [
    "AddPaymentInfo",
    "AddToCart",
    "AddToWishlist",
    "CompleteRegistration",
    "Contact",
    "CustomizeProduct",
    "Donate",
    "FindLocation",
    "InitiateCheckout",
    "Lead",
    "Purchase",
    "Schedule",
    "Search",
    "StartTrial",
    "SubmitApplication",
    "Subscribe",
    "ViewContent",
    "LeadSubmitted",
    "QualifiedLead",
  ].map((n) => n.toLowerCase()),
);

/** Buat baris event standar bila belum ada (lazy, idempoten) */
export async function ensureStandardEvents(userId: string) {
  await db
    .insert(E)
    .values(STANDARD_EVENTS.map((e) => ({ userId, kind: "standard" as const, name: e.name, label: e.label })))
    .onConflictDoNothing({ target: [E.userId, E.name] });
}

export async function listEventSettings(userId: string) {
  await ensureStandardEvents(userId);
  const rows = await db.select().from(E).where(eq(E.userId, userId)).orderBy(asc(E.createdAt), asc(E.name));
  // standar selalu di atas, sesuai urutan STANDARD_EVENTS
  const rank = (name: string) => {
    const i = STANDARD_EVENTS.findIndex((s) => s.name === name);
    return i === -1 ? STANDARD_EVENTS.length : i;
  };
  return rows.sort((a, b) => (a.kind === b.kind ? rank(a.name) - rank(b.name) : a.kind === "standard" ? -1 : 1));
}

export async function findEnabledEvent(userId: string, name: string) {
  await ensureStandardEvents(userId);
  const [row] = await db
    .select()
    .from(E)
    .where(and(eq(E.userId, userId), eq(E.name, name), eq(E.enabled, true)));
  return row ?? null;
}
