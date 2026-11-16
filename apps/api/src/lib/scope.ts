import { and, eq, inArray, ne } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { db, schema } from "../db";
import { FieldError } from "./errors";

/**
 * Validasi cakupan "semua nomor / nomor tertentu" (dipakai Pixel & Trigger):
 *  - maksimal satu konfigurasi "semua nomor" per user
 *  - nomor tertentu harus milik user & belum dipakai konfigurasi lain
 */
export async function validateScope(opts: {
  userId: string;
  selfId?: string;
  applyAll: boolean;
  waAccountIds: string[];
  table: PgTable & { id: PgColumn; userId: PgColumn; applyAll: PgColumn };
  link: PgTable & { waAccountId: PgColumn };
  linkOwner: PgColumn;
  label: string;
}) {
  const { userId, selfId, applyAll, waAccountIds, table, link, linkOwner, label } = opts;
  if (applyAll) {
    const others = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.userId, userId), eq(table.applyAll, true), selfId ? ne(table.id, selfId) : undefined));
    if (others.length) throw new FieldError(409, "waAccountIds", `Sudah ada ${label} untuk semua nomor. Ubah yang lama atau pilih nomor tertentu.`);
    return;
  }
  if (!waAccountIds.length) throw new FieldError(400, "waAccountIds", "Pilih minimal satu nomor");
  const owned = await db
    .select({ id: schema.waAccounts.id })
    .from(schema.waAccounts)
    .where(and(eq(schema.waAccounts.userId, userId), inArray(schema.waAccounts.id, waAccountIds)));
  if (owned.length !== new Set(waAccountIds).size) throw new FieldError(400, "waAccountIds", "Nomor tidak valid");
  const taken = await db
    .select({ id: link.waAccountId })
    .from(link)
    .where(and(inArray(link.waAccountId, waAccountIds), selfId ? ne(linkOwner, selfId) : undefined));
  if (taken.length) throw new FieldError(409, "waAccountIds", `Sebagian nomor sudah memakai ${label} lain`);
}
