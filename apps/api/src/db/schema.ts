import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () =>
  ts("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Better Auth                                                         */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["user", "admin"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
  suspended: boolean("suspended").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/* ------------------------------------------------------------------ */
/* WhatsApp accounts                                                   */
/* ------------------------------------------------------------------ */

export const waStatus = pgEnum("wa_status", [
  "pending", // menunggu scan QR
  "connected",
  "disconnected",
  "logged_out",
  "suspended", // diputus oleh admin
]);

export const waAccounts = pgTable(
  "wa_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    label: text("label"),
    jid: text("jid"), // device JID whatsmeow, terisi setelah pairing
    phone: text("phone"),
    pushName: text("push_name"),
    status: waStatus("status").notNull().default("pending"),
    lastConnectedAt: ts("last_connected_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("wa_accounts_user_idx").on(t.userId),
    uniqueIndex("wa_accounts_jid_uq").on(t.jid),
  ],
);

/* ------------------------------------------------------------------ */
/* Pixel / CAPI                                                        */
/* ------------------------------------------------------------------ */

export const pixels = pgTable(
  "pixels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    pixelId: text("pixel_id").notNull(), // dataset id
    accessTokenEnc: text("access_token_enc").notNull(), // AES-256-GCM
    wabaId: text("waba_id"),
    pageId: text("page_id"), // Facebook Page yang terhubung ke WA (alternatif WABA ID)
    testEventCode: text("test_event_code"),
    applyAll: boolean("apply_all").notNull().default(true),
    validatedAt: ts("validated_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("pixels_user_idx").on(t.userId)],
);

export const pixelWaAccounts = pgTable(
  "pixel_wa_accounts",
  {
    pixelId: uuid("pixel_id")
      .notNull()
      .references(() => pixels.id, { onDelete: "cascade" }),
    waAccountId: uuid("wa_account_id")
      .notNull()
      .references(() => waAccounts.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.pixelId, t.waAccountId] }),
    // satu nomor hanya boleh terikat ke satu pixel spesifik
    uniqueIndex("pixel_wa_accounts_wa_uq").on(t.waAccountId),
  ],
);

/* ------------------------------------------------------------------ */
/* Triggers                                                            */
/* ------------------------------------------------------------------ */

export const countMode = pgEnum("count_mode", ["customer_only", "customer_admin"]);
export const triggerMode = pgEnum("trigger_mode", ["auto", "manual"]);
export const senderScope = pgEnum("sender_scope", ["lead", "admin", "both"]);
export const keywordMatch = pgEnum("keyword_match", ["contains", "word"]);

export const triggers = pgTable(
  "triggers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    applyAll: boolean("apply_all").notNull().default(true),
    // null = metrik jumlah pesan tidak dipakai
    minMessages: integer("min_messages"),
    countMode: countMode("count_mode").notNull().default("customer_only"),
    mode: triggerMode("mode").notNull().default("manual"),
    eventName: text("event_name").notNull().default("Lead"),
    value: bigint("value", { mode: "number" }),
    currency: text("currency").default("IDR"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("triggers_user_idx").on(t.userId)],
);

export const triggerWaAccounts = pgTable(
  "trigger_wa_accounts",
  {
    triggerId: uuid("trigger_id")
      .notNull()
      .references(() => triggers.id, { onDelete: "cascade" }),
    waAccountId: uuid("wa_account_id")
      .notNull()
      .references(() => waAccounts.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.triggerId, t.waAccountId] }),
    uniqueIndex("trigger_wa_accounts_wa_uq").on(t.waAccountId),
  ],
);

export const triggerKeywords = pgTable(
  "trigger_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    triggerId: uuid("trigger_id")
      .notNull()
      .references(() => triggers.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    senderScope: senderScope("sender_scope").notNull().default("lead"),
    match: keywordMatch("match").notNull().default("contains"),
  },
  (t) => [index("trigger_keywords_trigger_idx").on(t.triggerId)],
);

/* ------------------------------------------------------------------ */
/* Event yang bisa dikirim ke Meta                                     */
/* ------------------------------------------------------------------ */

export const eventKind = pgEnum("event_kind", ["standard", "custom"]);

/**
 * Daftar event per user. Event standar (InitiateCheckout, Purchase) dibuat otomatis
 * dan hanya bisa diaktif/nonaktifkan; event custom bebas ditambah user.
 * Event aktif muncul sebagai pilihan di detail lead dan di form trigger.
 */
export const eventSettings = pgTable(
  "event_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: eventKind("kind").notNull(),
    name: text("name").notNull(), // event_name yang dikirim ke Meta
    label: text("label"), // nama tampilan (opsional)
    defaultValue: bigint("default_value", { mode: "number" }),
    currency: text("currency").notNull().default("IDR"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("event_settings_user_name_uq").on(t.userId, t.name)],
);

/* ------------------------------------------------------------------ */
/* Leads & messages (ditulis oleh engine Go)                           */
/* ------------------------------------------------------------------ */

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    waAccountId: uuid("wa_account_id")
      .notNull()
      .references(() => waAccounts.id, { onDelete: "cascade" }),
    contactJid: text("contact_jid").notNull(),
    phone: text("phone"), // null bila hanya LID
    name: text("name"),
    // data iklan CTWA (terekam otomatis saat audience klik iklan)
    ctwaClid: text("ctwa_clid"),
    adSourceId: text("ad_source_id"),
    adSourceType: text("ad_source_type"),
    adSourceUrl: text("ad_source_url"),
    adHeadline: text("ad_headline"),
    firstMessageAt: ts("first_message_at").notNull(),
    lastMessageAt: ts("last_message_at").notNull(),
    lastMessagePreview: text("last_message_preview"),
    msgInCount: integer("msg_in_count").notNull().default(0),
    msgOutCount: integer("msg_out_count").notNull().default(0),
    isPotential: boolean("is_potential").notNull().default(false),
    potentialReason: jsonb("potential_reason").$type<PotentialReason>(),
    potentialAt: ts("potential_at"),
    capiSentAt: ts("capi_sent_at"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("leads_account_contact_uq").on(t.waAccountId, t.contactJid),
    index("leads_account_last_msg_idx").on(t.waAccountId, t.lastMessageAt.desc()),
  ],
);

export type PotentialReason = {
  triggerId: string;
  messageCount?: number;
  keywords?: string[];
};

export const messageType = pgEnum("message_type", [
  "text",
  "image",
  "video",
  "audio",
  "document",
  "sticker",
  "other",
]);

export const messages = pgTable(
  "messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    waAccountId: uuid("wa_account_id")
      .notNull()
      .references(() => waAccounts.id, { onDelete: "cascade" }),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    waMessageId: text("wa_message_id").notNull(),
    fromMe: boolean("from_me").notNull(),
    type: messageType("type").notNull(),
    text: text("text"), // teks atau caption; media tidak disimpan
    sentAt: ts("sent_at").notNull(),
  },
  (t) => [
    uniqueIndex("messages_account_wamid_uq").on(t.waAccountId, t.waMessageId),
    index("messages_lead_sent_idx").on(t.leadId, t.sentAt),
  ],
);

/* ------------------------------------------------------------------ */
/* CAPI events                                                         */
/* ------------------------------------------------------------------ */

export const capiTrigger = pgEnum("capi_trigger", ["auto", "manual"]);
export const capiStatus = pgEnum("capi_status", ["pending", "success", "failed"]);

export const capiEvents = pgTable(
  "capi_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    pixelId: uuid("pixel_id").references(() => pixels.id, { onDelete: "set null" }),
    eventName: text("event_name").notNull(),
    eventId: text("event_id").notNull(),
    trigger: capiTrigger("trigger").notNull(),
    sentBy: text("sent_by"), // user id untuk manual
    status: capiStatus("status").notNull().default("pending"),
    request: jsonb("request"),
    response: jsonb("response"),
    fbtraceId: text("fbtrace_id"),
    createdAt: createdAt(),
  },
  (t) => [
    index("capi_events_lead_idx").on(t.leadId),
    // satu lead hanya sekali per event (yang tidak gagal)
    uniqueIndex("capi_events_lead_event_uq")
      .on(t.leadId, t.eventName)
      .where(sql`${t.status} <> 'failed'`),
  ],
);

/**
 * Log audit setiap panggilan POST /{dataset}/events ke Meta (kirim lead, validasi pixel,
 * event uji), termasuk tiap percobaan retry. Disimpan 200 terakhir per user.
 */
export const capiLogs = pgTable(
  "capi_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pixelId: uuid("pixel_id").references(() => pixels.id, { onDelete: "set null" }),
    datasetId: text("dataset_id").notNull(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    source: text("source").notNull(), // send_auto | send_manual | validate | test
    eventName: text("event_name"),
    testEventCode: text("test_event_code"),
    attempt: integer("attempt").notNull().default(1),
    ok: boolean("ok").notNull(),
    httpStatus: integer("http_status").notNull(), // 0 = tidak sampai ke Meta
    durationMs: integer("duration_ms").notNull(),
    request: jsonb("request"), // body tanpa access token
    response: jsonb("response"),
    fbtraceId: text("fbtrace_id"),
    errorMessage: text("error_message"),
    createdAt: createdAt(),
  },
  (t) => [index("capi_logs_user_idx").on(t.userId, t.id)],
);
