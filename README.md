# CTWA Tracker

Aplikasi self-host untuk melacak lead **Click-to-WhatsApp (CTWA)** dan mengirimkannya ke **Meta Conversions API**.
Read-only: aplikasi hanya membaca chat WhatsApp, tidak pernah membalas.

> Versi ini dibuat untuk peserta kelas **Membuat Aplikasi CTWA Tracker**.
> Tanpa billing, tanpa kuota, tanpa batas jumlah nomor. Silakan dipakai dan dimodifikasi untuk bisnis Anda sendiri.

## Fitur

- Hubungkan nomor WhatsApp sebanyak yang Anda perlukan (QR atau pairing code)
- Lead dari iklan otomatis terdeteksi (badge "Iklan", `ctwa_clid` terekam)
- Trigger berbasis kata kunci / jumlah pesan → tandai lead Potential → kirim event ke Meta (otomatis atau manual)
- Banyak Pixel/Dataset, bisa dipetakan per nomor
- Log CAPI untuk audit request/response ke Meta
- Panduan di dalam aplikasi (menu Panduan)
- Panel admin sederhana (kelola user, status engine)

## Arsitektur

| Bagian | Stack | Folder |
|---|---|---|
| Frontend | Vite + React + Mantine | `apps/web` |
| API | Hono (Bun) + Drizzle + Zod + Better Auth | `apps/api` |
| WhatsApp Engine | Go + whatsmeow (1 proses, banyak sesi) | `engine` |
| Database | PostgreSQL | `apps/api/drizzle` |

Alur data: engine menerima pesan → buffer → batch insert ke Postgres → `NOTIFY ctwa_ingest` → API mengevaluasi trigger & mengirim CAPI.

## Pasang di Dokploy (tanpa coding)

Di panel Dokploy: **Create Project → Create Service → Compose**, lalu:

| Tab | Isi |
| --- | --- |
| General → Provider **Git** | Repository URL `https://github.com/vatih/ctwa-tracker.git`, Branch `stable`, Compose Path `./deploy/docker-compose.dokploy.yml` |
| Environment | `APP_URL=https://ctwa.domainanda.com` |
| Advanced | **Isolated Deployment** aktif |
| Domains | Host `ctwa.domainanda.com`, Service `app`, Port `3000`, HTTPS aktif, Certificate **None** |

Klik **Deploy**. Subdomain di Cloudflare: A record ke IP VPS, Proxied, SSL/TLS mode **Full**.
Secret dibuat otomatis. User pertama yang mendaftar menjadi admin.

## Setup cepat dengan AI

Salin `.env.setup.example` menjadi `.env.setup`, isi, lalu minta AI assistant (Claude Code, Copilot, Cursor):

> Pasang aplikasi ini mengikuti docs/setup-ai.md

Ada dua mode: `dokploy` (VPS + Dokploy; subdomain lewat proxy Cloudflare, dibuat manual) dan `local` (laptop, cukup Docker Desktop).
User pertama yang mendaftar otomatis menjadi admin.

## Prasyarat (setup manual / development)

- [Bun](https://bun.sh) 1.3+
- [Go](https://go.dev) 1.26+
- Docker (untuk Postgres lokal & deploy)

## Development

```bash
docker compose -f deploy/docker-compose.dev.yml up -d   # Postgres lokal di port 55432
cp .env.example .env && cp .env apps/api/.env            # lalu sesuaikan
bun install
bun run db:migrate
bun run dev:api                                           # http://localhost:3000
bun run dev:web                                           # http://localhost:5173 (proxy /api)
cd engine && go run ./cmd/engine                          # butuh DATABASE_URL & INTERNAL_TOKEN di environment
```

Buka http://localhost:5173/register dan buat akun. User pertama otomatis menjadi admin.
Admin tambahan: `cd apps/api && bun src/db/make-admin.ts email@lain.com`.

Data contoh untuk latihan (opsional):

```bash
cd apps/api && bun src/db/seed-dev.ts email@anda.com
```

Tes:

```bash
bun run typecheck
bun run test                                              # integration test jalan bila DATABASE_URL = localhost
cd engine && go test ./...
```

## Deploy

Lihat [deploy/README.md](deploy/README.md). Cukup satu VPS kecil (RAM 1 GB) dengan Docker.

## Catatan

- Migrasi dijalankan dengan `bun run db:migrate` (migrator drizzle-orm), karena `drizzle-kit migrate` tidak jalan dengan postgres.js 4.x.
  Setelah mengubah `apps/api/src/db/schema.ts`, buat migrasi baru dengan `bun run db:generate`.
- Tabel `whatsmeow_*` dibuat otomatis oleh engine, bukan oleh Drizzle.
- `LISTEN/NOTIFY` butuh koneksi Postgres langsung (bukan pooler mode transaction).
- Halaman pendaftaran (`/register`) terbuka untuk siapa saja. Kalau aplikasi dipasang di domain publik,
  pertimbangkan menutupnya setelah akun Anda dibuat.
- Aplikasi ini memakai WhatsApp Web multi-device (whatsmeow), bukan API resmi WhatsApp. Gunakan dengan bijak.

## Lisensi

[PolyForm Internal Use 1.0.0](LICENSE.md). Ringkasnya:

- ✅ Boleh dipakai dan dimodifikasi untuk operasional bisnis Anda sendiri, berapa pun jumlah nomornya.
- ❌ Tidak boleh dibagikan ulang, dijual, atau dijadikan layanan (SaaS) untuk orang lain.
- Simpan salinan/fork Anda sebagai repo **private**.

Ringkasan ini bukan pengganti teks lisensi; yang berlaku adalah [LICENSE.md](LICENSE.md).

Required Notice: Copyright (c) 2026 Ibrahim Vatih (https://github.com/vatih/ctwa-tracker)
