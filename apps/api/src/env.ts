import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Secret yang tidak diisi lewat environment diambil dari SECRETS_FILE (KEY=VALUE per baris).
 * File ini dibuat otomatis oleh service `secrets` di deploy/docker-compose.dokploy.yml,
 * jadi pemasangan lewat Dokploy cukup mengisi APP_URL.
 */
const secretsFile = process.env.SECRETS_FILE;
if (secretsFile && existsSync(secretsFile)) {
  for (const line of readFileSync(secretsFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default("http://localhost:5173"),
  BETTER_AUTH_SECRET: z.string().min(16),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  ENCRYPTION_KEY: z.string().regex(/^[0-9a-f]{64}$/i, "32 byte hex"),
  META_GRAPH_VERSION: z.string().default("v23.0"),
  ENGINE_URL: z.string().url().default("http://localhost:8080"),
  INTERNAL_TOKEN: z.string().min(8),
  WEB_DIST: z.string().default("../web/dist"),
});

export const env = schema.parse(process.env);
