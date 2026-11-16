import { Alert, Anchor, Code, List, Table, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { Link } from "react-router";

export type Article = {
  slug: string;
  title: string;
  summary: string;
  body: ReactNode;
};

const H = ({ children }: { children: ReactNode }) => (
  <Title order={4} mt="lg">
    {children}
  </Title>
);
const P = ({ children }: { children: ReactNode }) => <Text size="sm">{children}</Text>;
const To = ({ to, children }: { to: string; children: ReactNode }) => (
  <Anchor component={Link} to={to} size="sm">
    {children}
  </Anchor>
);
const MenuNote = () => (
  <Text size="xs" c="dimmed">
    Nama menu di Meta bisa sedikit berbeda tergantung bahasa dan versi tampilan. Label bahasa Inggris ditulis dalam kurung.
  </Text>
);

export const articles: Article[] = [
  {
    slug: "mulai",
    title: "Mulai cepat: dari WhatsApp sampai event di Meta",
    summary: "Urutan setup dari nol supaya lead CTWA bisa dikirim ke Conversions API.",
    body: (
      <>
        <P>Ikuti urutan ini sekali saja. Setelah selesai, lead dari iklan Click to WhatsApp akan terekam dan bisa dikirim ke Meta.</P>
        <List type="ordered" size="sm" spacing="xs">
          <List.Item>
            <b>Hubungkan nomor WhatsApp</b> di <To to="/app/wa-accounts">WA Accounts</To>. Pindai QR dari aplikasi WhatsApp di HP.
          </List.Item>
          <List.Item>
            <b>Tambah Pixel</b> di <To to="/app/pixels">Pixel</To>: isi Dataset ID dan access token Conversions API dari Events
            Manager, lalu pilih nomor WhatsApp yang memakai pixel ini.
          </List.Item>
          <List.Item>
            <b>Isi Facebook Page ID</b> di Pixel yang sama, dan pastikan dataset sudah terhubung ke Halaman itu. Lihat{" "}
            <To to="/app/panduan/hubungkan-dataset-page">Menghubungkan Dataset dengan Halaman</To>.
          </List.Item>
          <List.Item>
            <b>Uji pengiriman</b> dengan tombol <b>Test kirim ke Meta</b> di kartu Pixel. Lihat{" "}
            <To to="/app/panduan/uji-pengiriman">Menguji pengiriman ke Meta</To>.
          </List.Item>
          <List.Item>
            <b>Buat Trigger</b> di <To to="/app/triggers">Triggers</To> untuk menentukan kapan lead dianggap potensial dan event
            apa yang dikirim, otomatis atau manual.
          </List.Item>
          <List.Item>
            Pantau lead di <To to="/app/leads">Leads</To> dan setiap kiriman di <To to="/app/capi-logs">Log CAPI</To>.
          </List.Item>
        </List>
      </>
    ),
  },
  {
    slug: "hubungkan-dataset-page",
    title: "Menghubungkan Dataset dengan Halaman Facebook",
    summary: "Wajib untuk lead dari iklan CTWA. Tanpa ini Meta menolak event dengan error dataset tidak tertaut.",
    body: (
      <>
        <P>
          Event dari iklan Click to WhatsApp dikirim dengan <Code>action_source: business_messaging</Code>. Untuk jenis event ini
          Meta mewajibkan dua hal: event membawa <b>Page ID</b> (atau WhatsApp Business Account ID), dan <b>dataset tujuan
          sudah terhubung ke Halaman tersebut</b>. Kalau salah satu belum ada, Meta menolak event-nya.
        </P>

        <H>1. Cari Page ID Halaman Anda</H>
        <P>Gunakan Halaman Facebook yang menjalankan iklan CTWA dan terhubung ke nomor WhatsApp Anda.</P>
        <List size="sm" spacing="xs">
          <List.Item>
            Buka Halaman Facebook → <b>Tentang</b> (About) → <b>Transparansi Halaman</b> (Page transparency). Page ID tertera di
            sana.
          </List.Item>
          <List.Item>
            Atau di Meta Business Suite → <b>Pengaturan</b> (Settings) → <b>Akun</b> → <b>Halaman</b> (Pages), lalu pilih Halaman.
            ID tampil di detailnya.
          </List.Item>
        </List>

        <H>2. Hubungkan dataset ke Halaman</H>
        <List type="ordered" size="sm" spacing="xs">
          <List.Item>
            Buka <b>Pengaturan Bisnis</b> (Business Settings) di business.facebook.com/settings.
          </List.Item>
          <List.Item>
            Pilih <b>Sumber Data</b> (Data sources) → <b>Set Data</b> (Datasets), lalu klik dataset yang ID-nya Anda isi di
            CTWA Tracker.
          </List.Item>
          <List.Item>
            Buka tab <b>Aset Terhubung</b> (Connected assets) → <b>Tambahkan Aset</b> (Add assets) → pilih <b>Halaman</b> (Pages),
            centang Halaman yang menjalankan iklan, lalu simpan.
          </List.Item>
        </List>
        <MenuNote />
        <Alert color="yellow" variant="light" mt="xs">
          <Text size="sm">
            Dataset dan Halaman sebaiknya berada di <b>Business Portfolio yang sama</b>. Kalau Halaman belum ada di portfolio itu,
            tambahkan dulu Halamannya ke portfolio, baru hubungkan ke dataset.
          </Text>
        </Alert>

        <H>3. Isi Page ID di CTWA Tracker</H>
        <P>
          Buka <To to="/app/pixels">Pixel</To> → edit pixel → isi <b>Facebook Page ID</b> → simpan. Lalu klik{" "}
          <b>Test kirim ke Meta</b> dengan pilihan <b>Dari iklan WhatsApp</b> untuk memastikan semuanya sudah benar.
        </P>

        <H>Pesan error yang berhubungan</H>
        <Table withTableBorder fz="sm" mt="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pesan dari Meta</Table.Th>
              <Table.Th>Artinya</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>tidak memiliki &lsquo;page_id&rsquo; atau &lsquo;whatsapp_business_account_id&rsquo;</Table.Td>
              <Table.Td>Page ID belum diisi di Pixel. Kerjakan langkah 3.</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>set data tidak ditautkan / not linked ke Halaman</Table.Td>
              <Table.Td>Page ID sudah dikirim, tapi dataset belum terhubung ke Halaman itu. Kerjakan langkah 2.</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </>
    ),
  },
  {
    slug: "skor-kualitas-kecocokan",
    title: "Kenapa skor kualitas kecocokan (web) rendah, misalnya 2,5/10?",
    summary: "Skor itu menilai event website, bukan event WhatsApp dari CTWA Tracker.",
    body: (
      <>
        <P>
          Di Events Manager → dataset → <b>Ringkasan</b> (Overview), Meta menampilkan <b>Skor kualitas kecocokan peristiwa
          (web)</b>. Banyak user kaget melihat angka seperti 2,5/10 lalu mengira kiriman dari CTWA Tracker bermasalah. Tidak
          begitu.
        </P>

        <H>Skor itu untuk event web</H>
        <P>
          Perhatikan label <b>(web)</b>. Skor ini menilai event dari Meta Pixel atau Conversions API di <b>website</b>. Event web
          harus mencocokkan pengunjung anonim dengan akun Facebook, sehingga butuh banyak data: email, IP, user agent, cookie{" "}
          <Code>fbc</Code>/<Code>fbp</Code>, dan lain-lain. Karena itu rekomendasi di bawah skor juga khas website, seperti{" "}
          <i>kirim parameter ID Klik (fbc)</i>, <i>kirim Alamat IP dan Agen Pengguna</i>, dan <i>kirim Email</i>.
        </P>

        <H>Event CTWA dicocokkan lewat ID klik iklan</H>
        <P>
          Lead yang datang dari iklan Click to WhatsApp membawa <Code>ctwa_clid</Code>, ID unik klik iklan dari Meta. CTWA Tracker
          mengirimnya bersama Page ID dan nomor HP yang sudah di-hash. Meta memakai <Code>ctwa_clid</Code> untuk menautkan event
          langsung ke klik iklan yang spesifik, jadi pencocokannya pasti, tidak menebak seperti event web. Fungsinya setara{" "}
          <Code>fbc</Code> di website, bahkan lebih kuat.
        </P>
        <P>
          Rekomendasi <i>fbc</i>, IP, user agent, dan email <b>tidak perlu</b> diikuti untuk alur WhatsApp, dan data itu memang
          tidak tersedia dari percakapan WhatsApp.
        </P>

        <H>Lalu skor 2,5 itu dari mana?</H>
        <List size="sm" spacing="xs">
          <List.Item>Dari Pixel website yang memakai dataset yang sama, kalau ada.</List.Item>
          <List.Item>Dari event uji, yang hanya membawa nomor HP contoh.</List.Item>
          <List.Item>
            Dari lead organik (chat tanpa klik iklan), yang hanya bisa dikirim dengan nomor HP. Lihat{" "}
            <To to="/app/panduan/lead-iklan-organik">Lead iklan vs organik</To>.
          </List.Item>
        </List>
        <P>
          Cek menu <b>Sumber peristiwa</b> (Event sources) di halaman yang sama untuk melihat asal event yang dinilai.
        </P>

        <H>Yang benar-benar berpengaruh untuk CTWA</H>
        <List size="sm" spacing="xs">
          <List.Item>Lead berasal dari klik iklan, sehingga punya <Code>ctwa_clid</Code>.</List.Item>
          <List.Item>Page ID terisi dan dataset terhubung ke Halaman.</List.Item>
          <List.Item>Event dikirim secepatnya, jangan ditunda berhari-hari.</List.Item>
        </List>
      </>
    ),
  },
  {
    slug: "uji-pengiriman",
    title: "Menguji pengiriman ke Meta (test event code)",
    summary: "Cara memakai tombol Test, mode test, dan di mana event uji muncul di Events Manager.",
    body: (
      <>
        <H>Cara menguji</H>
        <List type="ordered" size="sm" spacing="xs">
          <List.Item>
            Di Events Manager → dataset → <b>Uji peristiwa</b> (Test events), salin kode uji, misalnya <Code>TEST12345</Code>.
          </List.Item>
          <List.Item>
            Di <To to="/app/pixels">Pixel</To>, klik <b>Test kirim ke Meta</b> pada kartu pixel. Pilih <b>Dari iklan WhatsApp</b>{" "}
            (butuh Page ID) atau <b>Organik</b>, isi kode uji, lalu klik <b>Kirim tes</b>.
          </List.Item>
          <List.Item>
            Kalau hasilnya <b>Diterima Meta</b>, kiriman sudah benar. Kalau gagal, pesan error dari Meta langsung ditampilkan.
          </List.Item>
        </List>

        <H>Di mana event uji muncul?</H>
        <P>
          Untuk event WhatsApp, event uji biasanya muncul di tab <b>Ringkasan</b> (Overview), bukan di <b>Uji peristiwa</b>.
          Tunggu beberapa menit. Artinya event uji <b>ikut tercatat sebagai data asli</b>, jadi jangan terlalu sering mengirim
          tes, dan sebaiknya uji memakai event yang tidak dipakai untuk optimasi iklan, misalnya <Code>Contact</Code>.
        </P>

        <H>Mode test</H>
        <P>
          Kalau kolom <b>Test event code</b> di Pixel diisi, pixel masuk <b>mode test</b>. Selama itu, semua kiriman lead
          (otomatis maupun manual) dari pixel tersebut <b>diblokir</b>, dan halaman Leads menampilkan peringatan &ldquo;Sedang di
          mode test&rdquo;. Ini mencegah lead asli terkirim sebagai event uji.
        </P>
        <Alert color="yellow" variant="light">
          <Text size="sm">
            Setelah selesai menguji, <b>kosongkan Test event code</b> di Pixel lalu simpan. Lead yang sempat tertahan bisa dikirim
            manual dari halaman Leads.
          </Text>
        </Alert>
      </>
    ),
  },
  {
    slug: "lead-iklan-organik",
    title: "Lead iklan vs lead organik",
    summary: "Kenapa sebagian lead dikirim sebagai event iklan dan sebagian sebagai chat biasa.",
    body: (
      <>
        <P>CTWA Tracker membedakan lead berdasarkan asal percakapannya.</P>
        <Table withTableBorder fz="sm" mt="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th />
              <Table.Th>Lead dari iklan</Table.Th>
              <Table.Th>Lead organik</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Asal</Table.Td>
              <Table.Td>Klik iklan Click to WhatsApp</Table.Td>
              <Table.Td>Chat langsung, tanpa klik iklan</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Data pencocokan</Table.Td>
              <Table.Td>
                <Code>ctwa_clid</Code> + Page ID + nomor HP (hash)
              </Table.Td>
              <Table.Td>Nomor HP (hash)</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Dikirim sebagai</Table.Td>
              <Table.Td>
                <Code>business_messaging</Code> (WhatsApp)
              </Table.Td>
              <Table.Td>
                <Code>chat</Code>
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Untuk optimasi iklan</Table.Td>
              <Table.Td>Kuat, tertaut ke klik iklan</Table.Td>
              <Table.Td>Lemah, hanya dicocokkan lewat nomor HP</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        <H>Tips</H>
        <List size="sm" spacing="xs">
          <List.Item>
            Kirim event secepatnya setelah lead memenuhi syarat. Meta umumnya hanya menerima event maksimal 7 hari ke belakang.
          </List.Item>
          <List.Item>
            Kalau lead dari iklan terdeteksi sebagai organik, pastikan calon pembeli mengirim pesan pertama dari tombol iklan, bukan
            menyimpan nomor lalu chat terpisah.
          </List.Item>
        </List>
      </>
    ),
  },
  {
    slug: "log-capi",
    title: "Membaca Log CAPI dan error umum",
    summary: "Cara mengaudit setiap kiriman ke Meta dan arti pesan error yang sering muncul.",
    body: (
      <>
        <P>
          <To to="/app/capi-logs">Log CAPI</To> mencatat setiap panggilan ke Meta Conversions API: kiriman lead (termasuk tiap
          percobaan ulang) dan event uji dari tombol Test. Hanya 200 log terbaru per akun yang disimpan. Klik sebuah baris untuk
          melihat request yang dikirim (tanpa access token) dan respons lengkap dari Meta.
        </P>
        <P>
          Respons sukses berisi <Code>events_received: 1</Code>. Simpan <Code>fbtrace_id</Code> bila perlu bertanya ke dukungan
          Meta.
        </P>

        <H>Error umum</H>
        <Table withTableBorder fz="sm" mt="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Pesan</Table.Th>
              <Table.Th>Solusi</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>Tidak memiliki page_id atau whatsapp_business_account_id</Table.Td>
              <Table.Td>
                Isi Facebook Page ID di Pixel. Lihat <To to="/app/panduan/hubungkan-dataset-page">panduan ini</To>.
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Dataset tidak ditautkan ke Halaman</Table.Td>
              <Table.Td>
                Hubungkan dataset ke Halaman di Pengaturan Bisnis. Lihat{" "}
                <To to="/app/panduan/hubungkan-dataset-page">panduan ini</To>.
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Invalid OAuth access token / token kedaluwarsa</Table.Td>
              <Table.Td>Buat access token baru di Events Manager → dataset → Pengaturan → Conversions API, lalu ganti di Pixel.</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Sedang di mode test</Table.Td>
              <Table.Td>Kosongkan Test event code di Pixel setelah selesai menguji.</Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td>Gagal koneksi</Table.Td>
              <Table.Td>Gangguan jaringan sementara. Kirim ulang dari halaman lead beberapa saat lagi.</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </>
    ),
  },
];
