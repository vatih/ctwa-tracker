import { MultiSelect, Radio, Stack } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../lib/api";

type Props = {
  applyAll: boolean;
  onApplyAllChange: (v: boolean) => void;
  waAccountIds: string[];
  onWaAccountIdsChange: (v: string[]) => void;
  error?: string;
  /** false = hanya pilih nomor (tanpa opsi "semua nomor"), dipakai Pixel */
  allowAll?: boolean;
};

/** Pilihan cakupan: semua nomor atau nomor tertentu (Pixel & Trigger) */
export function ScopeField({ applyAll, onApplyAllChange, waAccountIds, onWaAccountIdsChange, error, allowAll = true }: Props) {
  const accounts = useQuery({ queryKey: ["wa-accounts"], queryFn: () => unwrap(api["wa-accounts"].$get()) });
  const data = (accounts.data ?? []).map((a) => ({
    value: a.id,
    label: a.phone ? `+${a.phone}${a.label ? ` · ${a.label}` : ""}` : (a.label ?? "Nomor belum terhubung"),
  }));
  if (!allowAll) {
    return (
      <MultiSelect
        label="Nomor WhatsApp"
        description="Lead dari nomor yang dipilih dikirim ke dataset ini. Satu nomor hanya bisa terhubung ke satu Pixel."
        placeholder={waAccountIds.length ? undefined : "Pilih nomor"}
        value={waAccountIds}
        onChange={onWaAccountIdsChange}
        error={error}
        searchable
        data={data}
      />
    );
  }
  return (
    <Stack gap="xs">
      <Radio.Group
        label="Berlaku untuk"
        value={applyAll ? "all" : "some"}
        onChange={(v) => onApplyAllChange(v === "all")}
        // saat "semua nomor", error cakupan (mis. sudah ada konfigurasi semua nomor) tampil di sini
        error={applyAll ? error : undefined}
      >
        <Stack gap={6} mt={6}>
          <Radio value="all" label="Semua nomor" />
          <Radio value="some" label="Nomor tertentu" />
        </Stack>
      </Radio.Group>
      {!applyAll && (
        <MultiSelect
          placeholder="Pilih nomor"
          value={waAccountIds}
          onChange={onWaAccountIdsChange}
          error={error}
          searchable
          data={data}
        />
      )}
    </Stack>
  );
}
