import { and, eq, ne } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db, schema } from "../db";
import { type AppEnv, requireUser } from "../lib/context";
import { v } from "../lib/validator";
import { EVENT_NAME_RE, listEventSettings, RESERVED_NAMES } from "../services/event-settings";

const E = schema.eventSettings;

const common = {
  label: z.string().trim().max(60).nullable().default(null),
  defaultValue: z.number().int().min(0).nullable().default(null),
  currency: z.string().trim().length(3).default("IDR"),
  enabled: z.boolean().default(true),
};
const customBody = z.object({
  name: z.string().trim().min(1).max(50).regex(EVENT_NAME_RE, "Nama event hanya huruf, angka, spasi, _"),
  ...common,
});
// event standar: nama tidak bisa diubah
const updateBody = customBody.partial({ name: true });

async function ownedEvent(userId: string, id: string) {
  const [row] = await db.select().from(E).where(and(eq(E.id, id), eq(E.userId, userId)));
  if (!row) throw new HTTPException(404, { message: "Event tidak ditemukan" });
  return row;
}

async function assertCustomName(userId: string, name: string, selfId?: string) {
  if (RESERVED_NAMES.has(name.toLowerCase())) {
    throw new HTTPException(400, { message: `${name} adalah nama event standar Meta, pakai nama lain untuk event custom.` });
  }
  const where = selfId ? and(eq(E.userId, userId), eq(E.name, name), ne(E.id, selfId)) : and(eq(E.userId, userId), eq(E.name, name));
  const [dup] = await db.select({ id: E.id }).from(E).where(where);
  if (dup) throw new HTTPException(409, { message: `Event ${name} sudah ada.` });
}

export const eventSettingRoutes = new Hono<AppEnv>()
  .use(requireUser)
  .get("/", async (c) => {
    const user = c.get("user")!;
    return c.json(await listEventSettings(user.id));
  })

  .post("/", v("json", customBody), async (c) => {
    const user = c.get("user")!;
    const b = c.req.valid("json");
    await assertCustomName(user.id, b.name);
    const [row] = await db
      .insert(E)
      .values({ userId: user.id, kind: "custom", ...b, label: b.label || null, currency: b.currency.toUpperCase() })
      .returning({ id: E.id });
    return c.json({ id: row.id }, 201);
  })

  .put("/:id", v("param", z.object({ id: z.uuid() })), v("json", updateBody), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const b = c.req.valid("json");
    const ev = await ownedEvent(user.id, id);
    let name = ev.name;
    if (ev.kind === "custom" && b.name && b.name !== ev.name) {
      await assertCustomName(user.id, b.name, id);
      name = b.name;
    }
    await db
      .update(E)
      .set({
        name,
        label: b.label || null,
        defaultValue: b.defaultValue,
        currency: b.currency.toUpperCase(),
        enabled: b.enabled,
      })
      .where(eq(E.id, id));
    return c.json({ id });
  })

  .patch("/:id/enabled", v("param", z.object({ id: z.uuid() })), v("json", z.object({ enabled: z.boolean() })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    await ownedEvent(user.id, id);
    await db.update(E).set({ enabled: c.req.valid("json").enabled }).where(eq(E.id, id));
    return c.json({ ok: true });
  })

  .delete("/:id", v("param", z.object({ id: z.uuid() })), async (c) => {
    const user = c.get("user")!;
    const { id } = c.req.valid("param");
    const ev = await ownedEvent(user.id, id);
    if (ev.kind === "standard") throw new HTTPException(400, { message: "Event standar tidak bisa dihapus, cukup dinonaktifkan." });
    await db.delete(E).where(eq(E.id, id));
    return c.json({ ok: true });
  });
