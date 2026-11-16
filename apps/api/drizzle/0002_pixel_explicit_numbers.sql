ALTER TABLE "pixels" ALTER COLUMN "apply_all" SET DEFAULT false;--> statement-breakpoint
-- Pixel "semua nomor" -> daftar nomor eksplisit: setiap nomor user yang belum punya pixel khusus
-- dihubungkan ke pixel "semua nomor" terbaru (sama dengan hasil resolvePixel sebelumnya)
INSERT INTO "pixel_wa_accounts" ("pixel_id", "wa_account_id")
SELECT DISTINCT ON (w."id") p."id", w."id"
FROM "pixels" p
JOIN "wa_accounts" w ON w."user_id" = p."user_id"
WHERE p."apply_all" = true
  AND NOT EXISTS (SELECT 1 FROM "pixel_wa_accounts" x WHERE x."wa_account_id" = w."id")
ORDER BY w."id", p."created_at" DESC;--> statement-breakpoint
UPDATE "pixels" SET "apply_all" = false WHERE "apply_all" = true;
