const dateFmt = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" });
const rupiahFmt = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });

export const formatDate = (d: Date) => dateFmt.format(d);
export const formatDateTime = (d: Date) => dateTimeFmt.format(d);
export const formatTime = (d: Date) => timeFmt.format(d);
export const formatRupiah = (n: number) => rupiahFmt.format(n);

/** "14:05" untuk hari ini, "5 Nov" untuk tanggal lain */
export function formatListTime(d: Date) {
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(d);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(d);
}

/** Nama tampilan nomor WA: nama yang diberi user, lalu nama profil WA, lalu nomornya. */
export function accountName(a: { label?: string | null; pushName?: string | null; phone?: string | null }) {
  return a.label || a.pushName || (a.phone ? `+${a.phone}` : "Nomor");
}
