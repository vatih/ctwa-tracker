# Setup CTWA Tracker oleh AI

Dokumen ini ditulis untuk **AI coding assistant** (Claude Code, Copilot agent, Cursor, dll) yang diminta
memasang CTWA Tracker untuk pengguna. Pengguna cukup mengisi `.env.setup`, lalu memberi prompt.
Di akhir, pengguna tinggal membuka URL aplikasi dan login.

## Aturan untuk AI

- Baca `.env.setup` di root repo. Kalau belum ada: salin `.env.setup.example` menjadi `.env.setup`,
  minta pengguna mengisinya, lalu berhenti sampai pengguna bilang sudah diisi.
- Ikuti `SETUP_MODE`: `local` → bagian A, `dokploy` → bagian B.
- **Jangan pernah menampilkan** isi token, password, atau secret di chat/log. Sebut nama variabelnya saja.
- Jangan commit `.env`, `.env.setup`, atau `.env.production.local` (semuanya sudah di-ignore).
- Semua langkah harus aman diulang: kalau sesuatu sudah ada (container, project, record DNS, akun), pakai yang ada.
- Jelaskan ke pengguna, dalam bahasa Indonesia yang sederhana, apa yang sedang dikerjakan di tiap langkah.
- Kalau sebuah langkah butuh tindakan pengguna (instal yang perlu izin admin, restart, membuka aplikasi),
  minta dengan jelas lalu tunggu.
- Secret acak = hex dari sumber kriptografis: `openssl rand -hex 32`, atau di PowerShell
  `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); -join ($b | ForEach-Object { '{0:x2}' -f $_ })`
  bila openssl tidak ada.

## A. Mode `local` (laptop/desktop)

Semua komponen (Postgres, app, WhatsApp engine) jalan di Docker. Tidak perlu Bun atau Go.

1. **Cek Docker.** Jalankan `docker info`.
   - Belum terpasang → pasang Docker Desktop:
     Windows `winget install -e --id Docker.DockerDesktop`, macOS `brew install --cask docker`,
     Linux `curl -fsSL https://get.docker.com | sh`.
   - Minta pengguna membuka Docker Desktop sampai statusnya "running" (Windows bisa meminta WSL2 dan restart).
     Ulangi `docker info` sampai berhasil.
2. **Buat `.env`** di root repo bila belum ada (jangan timpa yang sudah ada, karena `ENCRYPTION_KEY` tidak boleh berubah):
   ```
   POSTGRES_PASSWORD=<hex 24 byte>
   APP_PORT=3000
   APP_URL=http://localhost:3000
   BETTER_AUTH_SECRET=<hex 32 byte>
   ENCRYPTION_KEY=<hex 32 byte>
   INTERNAL_TOKEN=<hex 24 byte>
   ```
   Kalau port 3000 sudah dipakai, pilih port lain (3001, 3002, ...) dan samakan `APP_PORT` dengan port di `APP_URL`.
3. **Jalankan:**
   `docker compose -p ctwa-tracker -f deploy/docker-compose.yml --env-file .env up -d --build`
   (build pertama 3–10 menit).
4. **Tunggu sehat:** `GET http://localhost:<APP_PORT>/api/health` harus `{"ok":true}`.
   Kalau gagal, lihat `docker compose -p ctwa-tracker -f deploy/docker-compose.yml --env-file .env logs app engine`.
5. **Buat akun admin** (lihat bagian C) dengan `BASE=http://localhost:<APP_PORT>`.
6. **Laporan ke pengguna:** URL aplikasi, email login, dan cara menyalakan ulang:
   buka Docker Desktop; container `ctwa-tracker` otomatis hidup lagi (`restart: unless-stopped`).

Update versi: `git pull` lalu ulangi langkah 3.

## B. Mode `dokploy` (VPS + Dokploy)

Variabel wajib di `.env.setup`: `DOKPLOY_URL`, `DOKPLOY_API_KEY`, `APP_DOMAIN`, `GIT_REPO_URL`, `GIT_BRANCH`,
dan data admin.

HTTPS ditangani **Cloudflare**, bukan Let's Encrypt: pengguna membuat A record `APP_DOMAIN` → IP VPS dengan
proxy **aktif** (awan oranye) dan SSL/TLS mode **Full** secara manual. AI tidak memegang token Cloudflare.

### B1. Cek akses

- Rapikan `DOKPLOY_URL`: tanpa skema (mis. `dokploy.domain.com`) → tambahkan `https://`; buang `/` di akhir.
  Respons 301/308 = skema salah; ikuti alamat tujuannya.
- Dokploy: `GET {DOKPLOY_URL}/api/project.all` dengan header `x-api-key: {DOKPLOY_API_KEY}` → harus 200.
  401 → minta pengguna membuat ulang API key di Dokploy → Settings → Profile → API/CLI.
- Panggil API dengan `curl`, atau set header `User-Agent` sendiri (mis. `ctwa-tracker-setup/1.0`). Panel Dokploy
  di belakang Cloudflare bisa menolak User-Agent bawaan library (mis. `Python-urllib`) dengan 403 "Error 1010".
- Referensi lengkap API Dokploy: `{DOKPLOY_URL}/swagger` dan https://docs.dokploy.com/docs/api.
  Kalau bentuk respons berbeda dari dugaan, baca Swagger, jangan menebak.

### B2. Cek DNS (dibuat manual oleh pengguna)

- Jalankan `nslookup {APP_DOMAIN} 1.1.1.1`. Hasilnya harus IP milik Cloudflare (mis. `104.x.x.x` / `172.6x.x.x`),
  tanda record sudah Proxied.
- Tidak ditemukan → minta pengguna, dengan bahasa awam: Cloudflare → pilih domain → DNS → Records → Add record →
  Type `A`, Name = bagian depan subdomain (mis. `ctwa`), IPv4 address = IP VPS, Proxy status **aktif**
  (awan oranye) → Save. Lalu SSL/TLS → Overview → mode **Full**. Tunggu 1–5 menit, cek lagi.
- Hasilnya IP VPS (bukan Cloudflare) → record masih DNS only; minta pengguna mengaktifkan proxy (awan oranye).

### B3. Secret

Tidak perlu dibuat: `deploy/docker-compose.dokploy.yml` membuat `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY`, dan
`INTERNAL_TOKEN` sendiri saat deploy pertama (service `secrets`, disimpan di volume). Jangan menghapus volume
`secrets` atau `pgdata` di Dokploy, karena token Pixel yang tersimpan tidak bisa dibuka tanpa `ENCRYPTION_KEY` yang sama.

### B4. Project dan compose di Dokploy (semua `POST` JSON, header `x-api-key`)

Jangan mengubah atau menghapus project lain di Dokploy.

1. **Project + environment:** cari project bernama `CTWA Tracker` di `project.all` (setiap project punya
   `environments[]`, masing-masing berisi `environmentId`, `name`, `compose[]`). Kalau belum ada,
   `project.create {"name":"CTWA Tracker"}` → respons `{"project":{"projectId",...},"environment":{"environmentId","name":"production",...}}`.
   Kalau project sudah ada, ambil `environmentId` environment `production` dari `project.all`
   (atau `GET project.one?projectId=...`).
2. **Compose:** cari compose bernama `ctwa-tracker` di `environments[].compose[]`; kalau tidak ada,
   `compose.create {"name":"ctwa-tracker","environmentId":...,"composeType":"docker-compose"}` → respons berisi `composeId`.
3. **Sumber & env:** `compose.update` dengan:
   ```json
   {
     "composeId": "...",
     "sourceType": "git",
     "customGitUrl": "{GIT_REPO_URL}",
     "customGitBranch": "{GIT_BRANCH}",
     "composePath": "./deploy/docker-compose.dokploy.yml",
     "isolatedDeployment": true,
     "env": "APP_URL=https://{APP_DOMAIN}"
   }
   ```
   `isolatedDeployment: true` WAJIB: tanpa itu service `engine`/`db` bisa tertukar dengan service bernama sama
   milik aplikasi lain di jaringan bersama `dokploy-network`.
   Repo **private**: buat SSH key di Dokploy (bagian `sshKey` di Swagger), pasang public key-nya sebagai
   deploy key read-only di GitHub (`gh repo deploy-key add`), lalu pakai URL `git@github.com:<owner>/<repo>.git`
   dan isi `customGitSSHKeyId`.
4. **Domain:** kalau `GET domain.byComposeId?composeId=...` belum memuat `APP_DOMAIN`, buat:
   `certificateType: "none"`: sertifikat publik dari Cloudflare; Traefik cukup memakai sertifikat bawaannya
   (diterima oleh SSL mode Full).
   `domain.create {"host":"{APP_DOMAIN}","port":3000,"serviceName":"app","https":true,"certificateType":"none","composeId":"...","domainType":"compose"}`.
5. **Deploy:** `compose.deploy {"composeId":"..."}`. Build pertama 5–15 menit.
   Pantau `composeStatus` di `GET compose.one?composeId=...` (`running` → `done` atau `error`) tiap ~20 detik;
   `error` → minta pengguna membuka tab Deployments di Dokploy dan menyalin baris error terakhir.

### B5. Verifikasi

- Tunggu `GET https://{APP_DOMAIN}/api/health` → `{"ok":true}` (beberapa menit setelah deploy `done`).
- Error Cloudflare:
  - "too many redirects" / `ERR_TOO_MANY_REDIRECTS` → SSL/TLS mode masih **Flexible**; minta pengguna ganti ke **Full**.
  - 521 / 522 → Cloudflare tidak bisa menghubungi VPS: port 443 tertutup di firewall VPS, atau IP di A record salah.
  - 525 / 526 → SSL mode **Full (strict)**; minta pengguna ganti ke **Full**. Kalau VPS memakai Authenticated
    Origin Pulls (port 443 menjawab `alert certificate required`), fitur itu juga harus aktif di zona domain.
  - 502 dengan body `error code: 502` padahal container jalan → cek domain di Dokploy (port 3000, service `app`).
- Cek engine: setelah login, `GET {BASE}/api/panel/stats` (admin) harus punya `engine` yang tidak `null`.
  `null` = app tidak bisa menghubungi engine → pastikan `isolatedDeployment` aktif, lalu deploy ulang.
- Buat akun admin (bagian C) dengan `BASE=https://{APP_DOMAIN}`.
- Laporkan: URL aplikasi, email login, nama project di Dokploy.

Update versi: `compose.deploy` lagi (atau tombol Deploy di Dokploy).

## C. Membuat akun admin

User **pertama** yang mendaftar otomatis menjadi admin.

```
POST {BASE}/api/auth/sign-up/email
Content-Type: application/json
Origin: {BASE}

{"name":"{ADMIN_NAME}","email":"{ADMIN_EMAIL}","password":"{ADMIN_PASSWORD}"}
```

- 200 → akun dibuat.
- Error "user already exists" → akun sudah ada; lanjut.
- Lalu uji login: `POST {BASE}/api/auth/sign-in/email` dengan email & password yang sama → 200.
- `ADMIN_PASSWORD` minimal 8 karakter. Jangan tampilkan password di laporan.
