import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  NumberInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, unwrap } from "../../lib/api";
import { formatRupiah } from "../../lib/format";

export type EventSetting = Awaited<ReturnType<typeof fetchEventSettings>>[number];
export const fetchEventSettings = () => unwrap(api["event-settings"].$get());

const STANDARD_HINT: Record<string, string> = {
  InitiateCheckout: "Customer menunjukkan niat beli, misalnya minta nomor rekening atau total harga.",
  Purchase: "Customer sudah membayar. Meta mewajibkan nilai transaksi untuk event ini.",
};

export function EventsPage() {
  const qc = useQueryClient();
  const events = useQuery({ queryKey: ["event-settings"], queryFn: fetchEventSettings });
  const [editing, setEditing] = useState<EventSetting | "new" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["event-settings"] });

  const toggle = useMutation({
    mutationFn: (e: EventSetting) =>
      unwrap(api["event-settings"][":id"].enabled.$patch({ param: { id: e.id }, json: { enabled: !e.enabled } })),
    onSuccess: refresh,
  });

  const remove = (e: EventSetting) =>
    modals.openConfirmModal({
      title: `Hapus event ${e.label || e.name}?`,
      children: <Text size="sm">Riwayat event yang sudah terkirim ke Meta tidak ikut terhapus.</Text>,
      labels: { confirm: "Hapus", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await unwrap(api["event-settings"][":id"].$delete({ param: { id: e.id } }));
        refresh();
      },
    });

  const standard = events.data?.filter((e) => e.kind === "standard") ?? [];
  const custom = events.data?.filter((e) => e.kind === "custom") ?? [];

  const row = (e: EventSetting) => (
    <Card key={e.id} withBorder opacity={e.enabled ? 1 : 0.6} padding="sm">
      <Group justify="space-between" wrap="nowrap">
        <div style={{ minWidth: 0 }}>
          <Group gap="xs">
            <Text fw={700}>{e.label || e.name}</Text>
            {e.label && e.label !== e.name && (
              <Badge variant="outline" color="gray" tt="none">
                {e.name}
              </Badge>
            )}
            {e.defaultValue != null && (
              <Badge variant="light" color="teal" tt="none">
                Default {formatRupiah(e.defaultValue)}
              </Badge>
            )}
          </Group>
          {e.kind === "standard" && STANDARD_HINT[e.name] && (
            <Text size="sm" c="dimmed" mt={4}>
              {STANDARD_HINT[e.name]}
            </Text>
          )}
        </div>
        <Group gap="xs" wrap="nowrap">
          <Switch checked={e.enabled} onChange={() => toggle.mutate(e)} aria-label="Aktif" />
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" aria-label="Aksi">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(e)}>
                Ubah
              </Menu.Item>
              {e.kind === "custom" && (
                <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => remove(e)}>
                  Hapus
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>
    </Card>
  );

  return (
    <Stack>
      <div>
        <Title order={2}>Events</Title>
        <Text c="dimmed" size="sm">
          Event yang bisa dikirim ke Meta. Event aktif muncul sebagai pilihan di detail lead dan di form trigger.
        </Text>
      </div>

      <Stack gap="xs">
        <Text fw={600}>Event standar Meta</Text>
        {standard.map(row)}
      </Stack>

      <Stack gap="xs">
        <Group justify="space-between">
          <div>
            <Text fw={600}>Event custom</Text>
            <Text size="sm" c="dimmed">
              Nama bebas, misalnya SudahTransfer atau Survey. Bisa dipakai sebagai custom conversion di Events Manager.
            </Text>
          </div>
          <Button variant="light" leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
            Tambah event
          </Button>
        </Group>
        {custom.length === 0 && (
          <Text size="sm" c="dimmed">
            Belum ada event custom.
          </Text>
        )}
        {custom.map(row)}
      </Stack>

      <EventForm
        event={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
          qc.invalidateQueries({ queryKey: ["lead"] });
        }}
      />
    </Stack>
  );
}

const emptyValues = { name: "", label: "", defaultValue: "" as number | string, enabled: true };

function EventForm({ event, onClose, onSaved }: { event: EventSetting | "new" | null; onClose: () => void; onSaved: () => void }) {
  const existing = event && event !== "new" ? event : null;
  const isStandard = existing?.kind === "standard";
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    mode: "uncontrolled",
    initialValues: emptyValues,
    validate: {
      name: (v) =>
        isStandard ? null : (isNotEmpty("Nama event wajib diisi")(v) ?? (/^[A-Za-z0-9_ ]+$/.test(v.trim()) ? null : "Hanya huruf, angka, spasi, _")),
    },
  });

  const key = existing?.id ?? (event === "new" ? "new" : null);
  useEffect(() => {
    if (!key) return;
    setError(null);
    form.setValues(
      existing
        ? { name: existing.name, label: existing.label ?? "", defaultValue: existing.defaultValue ?? "", enabled: existing.enabled }
        : emptyValues,
    );
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useMutation({
    mutationFn: (v: typeof emptyValues) => {
      const json = {
        name: v.name.trim(),
        label: v.label.trim() || null,
        defaultValue: v.defaultValue === "" ? null : Number(v.defaultValue),
        currency: "IDR",
        enabled: v.enabled,
      };
      return existing
        ? unwrap(api["event-settings"][":id"].$put({ param: { id: existing.id }, json }))
        : unwrap(api["event-settings"].$post({ json }));
    },
    onSuccess: () => {
      notifications.show({ color: "teal", message: "Event tersimpan" });
      onSaved();
    },
    onError: (e) => setError(e.message),
  });

  return (
    <Modal opened={!!event} onClose={onClose} title={existing ? "Ubah Event" : "Tambah Event Custom"}>
      <form onSubmit={form.onSubmit((v) => save.mutate(v))}>
        <Stack>
          <TextInput
            label="Nama event (dikirim ke Meta)"
            description={isStandard ? "Nama event standar tidak bisa diubah." : "Huruf, angka, spasi, _. Contoh: SudahTransfer"}
            placeholder="SudahTransfer"
            disabled={isStandard}
            key={form.key("name")}
            {...form.getInputProps("name")}
          />
          <TextInput
            label="Label (opsional)"
            description="Nama yang tampil di aplikasi."
            placeholder="Sudah transfer"
            key={form.key("label")}
            {...form.getInputProps("label")}
          />
          <NumberInput
            label="Nilai default (opsional)"
            description="Terisi otomatis saat kirim dari detail lead, tetap bisa diubah per lead."
            prefix="Rp "
            thousandSeparator="."
            decimalSeparator=","
            min={0}
            key={form.key("defaultValue")}
            {...form.getInputProps("defaultValue")}
          />
          {error && (
            <Alert color="red" title="Gagal menyimpan">
              {error}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Batal
            </Button>
            <Button type="submit" loading={save.isPending}>
              Simpan
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
