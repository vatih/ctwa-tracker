import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Group,
  Menu,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { isNotEmpty, useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPencil, IconPlus, IconSettingsAutomation, IconTrash, IconX } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ScopeField } from "../../components/ScopeField";
import { api, unwrap } from "../../lib/api";
import { formatRupiah } from "../../lib/format";
import { fetchEventSettings } from "../events/EventsPage";

type Trigger = Awaited<ReturnType<typeof fetchTriggers>>[number];
const fetchTriggers = () => unwrap(api.triggers.$get());

const scopeLabel = { lead: "dari customer", admin: "dari admin", both: "dari siapa saja" } as const;

export function TriggersPage() {
  const qc = useQueryClient();
  const triggers = useQuery({ queryKey: ["triggers"], queryFn: fetchTriggers });
  const accounts = useQuery({ queryKey: ["wa-accounts"], queryFn: () => unwrap(api["wa-accounts"].$get()) });
  const [editing, setEditing] = useState<Trigger | "new" | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["triggers"] });

  const toggle = useMutation({
    mutationFn: (t: Trigger) => unwrap(api.triggers[":id"].enabled.$patch({ param: { id: t.id }, json: { enabled: !t.enabled } })),
    onSuccess: refresh,
  });

  const remove = (t: Trigger) =>
    modals.openConfirmModal({
      title: `Hapus trigger ${t.name}?`,
      labels: { confirm: "Hapus", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await unwrap(api.triggers[":id"].$delete({ param: { id: t.id } }));
        refresh();
      },
    });

  const accountLabel = (id: string) => {
    const a = accounts.data?.find((x) => x.id === id);
    return a?.phone ? `+${a.phone}` : (a?.label ?? "Nomor");
  };

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Triggers</Title>
          <Text c="dimmed" size="sm">
            Aturan kapan lead ditandai Potential dan dikirim ke Meta.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
          Tambah Trigger
        </Button>
      </Group>

      {triggers.data?.length === 0 && (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconSettingsAutomation size={40} color="var(--mantine-color-teal-6)" />
            <Text fw={600}>Belum ada trigger</Text>
            <Text size="sm" c="dimmed" ta="center" maw={460}>
              Tentukan kapan lead dianggap potensial, misalnya setelah 5 pesan atau saat admin mengirim kata
              &ldquo;no rekening&rdquo;. Lalu pilih apakah otomatis dikirim ke Meta atau direview manual.
            </Text>
            <Button mt="sm" onClick={() => setEditing("new")}>
              Buat trigger
            </Button>
          </Stack>
        </Card>
      )}

      {triggers.data?.map((t) => (
        <Card key={t.id} withBorder opacity={t.enabled ? 1 : 0.6}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div style={{ minWidth: 0 }}>
              <Group gap="xs">
                <Text fw={700}>{t.name}</Text>
                <Badge color={t.mode === "auto" ? "teal" : "orange"} variant="light">
                  {t.mode === "auto" ? "Otomatis" : "Manual"}
                </Badge>
                <Badge variant="outline" color="gray">
                  {t.eventName}
                  {t.value != null ? ` · ${formatRupiah(t.value)}` : ""}
                </Badge>
              </Group>
              <Text size="sm" mt={6}>
                Potential bila{" "}
                {[
                  t.minMessages != null
                    ? `≥ ${t.minMessages} pesan (${t.countMode === "customer_only" ? "customer saja" : "customer + admin"})`
                    : null,
                  t.keywords.length ? `mengandung kata kunci` : null,
                ]
                  .filter(Boolean)
                  .join(" atau ")}
              </Text>
              {t.keywords.length > 0 && (
                <Group gap={4} mt={6}>
                  {t.keywords.map((k, i) => (
                    <Badge key={i} variant="light" color="gray" tt="none">
                      &ldquo;{k.keyword}&rdquo; {scopeLabel[k.senderScope]}
                    </Badge>
                  ))}
                </Group>
              )}
              <Group gap={4} mt={6}>
                <Text size="xs" c="dimmed">
                  Nomor:
                </Text>
                {t.applyAll ? (
                  <Text size="xs">semua</Text>
                ) : (
                  <Text size="xs">{t.waAccountIds.map(accountLabel).join(", ")}</Text>
                )}
              </Group>
            </div>
            <Group gap="xs" wrap="nowrap">
              <Switch checked={t.enabled} onChange={() => toggle.mutate(t)} aria-label="Aktif" />
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label="Aksi">
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(t)}>
                    Ubah
                  </Menu.Item>
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => remove(t)}>
                    Hapus
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>
        </Card>
      ))}

      <TriggerForm
        trigger={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refresh();
        }}
      />
    </Stack>
  );
}

type Keyword = { keyword: string; senderScope: "lead" | "admin" | "both"; match: "contains" | "word" };

const emptyValues = {
  name: "",
  applyAll: true,
  waAccountIds: [] as string[],
  useCount: true,
  minMessages: 5 as number | string,
  countMode: "customer_only" as "customer_only" | "customer_admin",
  keywords: [] as Keyword[],
  mode: "manual" as "auto" | "manual",
  eventName: "InitiateCheckout",
  value: "" as number | string,
  currency: "IDR",
  enabled: true,
};

function TriggerForm({ trigger, onClose, onSaved }: { trigger: Trigger | "new" | null; onClose: () => void; onSaved: () => void }) {
  const existing = trigger && trigger !== "new" ? trigger : null;
  const [error, setError] = useState<string | null>(null);
  const form = useForm({
    mode: "uncontrolled",
    initialValues: emptyValues,
    validate: {
      name: isNotEmpty("Nama wajib diisi"),
      minMessages: (v, values) => (values.useCount && (!v || Number(v) < 1) ? "Minimal 1 pesan" : null),
      waAccountIds: (v, values) => (!values.applyAll && v.length === 0 ? "Pilih minimal satu nomor" : null),
      keywords: {
        keyword: isNotEmpty("Kata kunci tidak boleh kosong"),
      },
      eventName: (v) => (/^[A-Za-z0-9_ ]+$/.test(v) ? null : "Pilih event"),
      value: (v, values) => (values.eventName === "Purchase" && !Number(v) ? "Meta mewajibkan nilai untuk Purchase" : null),
    },
  });
  const applyAll = form.useWatchValue("applyAll");
  const waAccountIds = form.useWatchValue("waAccountIds");
  const useCount = form.useWatchValue("useCount");
  const mode = form.useWatchValue("mode");
  const currentEvent = form.useWatchValue("eventName");
  const eventSettings = useQuery({ queryKey: ["event-settings"], queryFn: fetchEventSettings });
  // event aktif dari menu Events; event lama trigger tetap ditampilkan agar tidak hilang
  const eventOptions = (eventSettings.data ?? [])
    .filter((e) => e.enabled)
    .map((e) => ({ value: e.name, label: e.label || e.name }));
  if (existing && !eventOptions.some((o) => o.value === existing.eventName)) {
    eventOptions.unshift({ value: existing.eventName, label: `${existing.eventName} (lama)` });
  }

  const key = existing?.id ?? (trigger === "new" ? "new" : null);
  useEffect(() => {
    if (!key) return;
    setError(null);
    form.setValues(
      existing
        ? {
            name: existing.name,
            applyAll: existing.applyAll,
            waAccountIds: existing.waAccountIds,
            useCount: existing.minMessages != null,
            minMessages: existing.minMessages ?? 5,
            countMode: existing.countMode,
            keywords: existing.keywords,
            mode: existing.mode,
            eventName: existing.eventName,
            value: existing.value ?? "",
            currency: existing.currency ?? "IDR",
            enabled: existing.enabled,
          }
        : emptyValues,
    );
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useMutation({
    mutationFn: (v: typeof emptyValues) => {
      const json = {
        name: v.name,
        applyAll: v.applyAll,
        waAccountIds: v.waAccountIds,
        minMessages: v.useCount ? Number(v.minMessages) : null,
        countMode: v.countMode,
        mode: v.mode,
        eventName: v.eventName.trim(),
        value: v.value === "" ? null : Number(v.value),
        currency: v.currency,
        enabled: v.enabled,
        keywords: v.keywords.map((k) => ({ ...k, keyword: k.keyword.trim() })),
      };
      return existing
        ? unwrap(api.triggers[":id"].$put({ param: { id: existing.id }, json }))
        : unwrap(api.triggers.$post({ json }));
    },
    onSuccess: () => {
      notifications.show({ color: "teal", message: "Trigger tersimpan" });
      onSaved();
    },
    onError: (e) => setError(e.message),
  });

  const keywords = form.getValues().keywords;

  return (
    <Modal opened={!!trigger} onClose={onClose} title={existing ? "Ubah Trigger" : "Tambah Trigger"} size="xl">
      <form
        onSubmit={form.onSubmit((v) => {
          if (!v.useCount && v.keywords.length === 0) {
            setError("Isi minimal satu metrik: jumlah pesan atau kata kunci.");
            return;
          }
          save.mutate(v);
        })}
      >
        <Stack>
          <TextInput label="Nama trigger" placeholder="Lead serius" key={form.key("name")} {...form.getInputProps("name")} />

          <Divider label="1. Lead Metrix" labelPosition="left" />
          <Text size="sm" c="dimmed" mt={-8}>
            Lead ditandai <b>Potential</b> bila salah satu kondisi terpenuhi.
          </Text>

          <Checkbox
            label="Jumlah pesan mencapai"
            key={form.key("useCount")}
            {...form.getInputProps("useCount", { type: "checkbox" })}
          />
          {useCount && (
            <Group align="flex-start" grow pl="xl">
              <NumberInput min={1} max={1000} suffix=" pesan" key={form.key("minMessages")} {...form.getInputProps("minMessages")} />
              <Select
                allowDeselect={false}
                data={[
                  { value: "customer_only", label: "Dihitung dari customer saja" },
                  { value: "customer_admin", label: "Dihitung dari customer + admin" },
                ]}
                key={form.key("countMode")}
                {...form.getInputProps("countMode")}
              />
            </Group>
          )}

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Chat mengandung kata kunci
            </Text>
            {keywords.map((_, i) => (
              <Group key={i} align="flex-start" wrap="nowrap" gap="xs">
                <TextInput
                  placeholder="mis. no rekening"
                  style={{ flex: 2 }}
                  key={form.key(`keywords.${i}.keyword`)}
                  {...form.getInputProps(`keywords.${i}.keyword`)}
                />
                <Select
                  style={{ flex: 1.3 }}
                  allowDeselect={false}
                  data={[
                    { value: "lead", label: "Dari customer" },
                    { value: "admin", label: "Dari admin" },
                    { value: "both", label: "Dari siapa saja" },
                  ]}
                  key={form.key(`keywords.${i}.senderScope`)}
                  {...form.getInputProps(`keywords.${i}.senderScope`)}
                />
                <Select
                  style={{ flex: 1.2 }}
                  allowDeselect={false}
                  data={[
                    { value: "contains", label: "Mengandung" },
                    { value: "word", label: "Kata utuh" },
                  ]}
                  key={form.key(`keywords.${i}.match`)}
                  {...form.getInputProps(`keywords.${i}.match`)}
                />
                <ActionIcon variant="subtle" color="red" mt={6} onClick={() => form.removeListItem("keywords", i)} aria-label="Hapus kata kunci">
                  <IconX size={16} />
                </ActionIcon>
              </Group>
            ))}
            <Button
              variant="light"
              size="xs"
              w="fit-content"
              leftSection={<IconPlus size={14} />}
              onClick={() => form.insertListItem("keywords", { keyword: "", senderScope: "lead", match: "contains" })}
            >
              Tambah kata kunci
            </Button>
          </Stack>

          <Divider label="2. Pengiriman ke Meta" labelPosition="left" />
          <SegmentedControl
            data={[
              { value: "manual", label: "Manual (review dulu)" },
              { value: "auto", label: "Otomatis" },
            ]}
            key={form.key("mode")}
            {...form.getInputProps("mode")}
          />
          <Text size="sm" c="dimmed" mt={-8}>
            {mode === "auto"
              ? "Lead yang memenuhi metrik langsung dikirim ke Meta dan mendapat tag CAPI Sent."
              : "Lead yang memenuhi metrik mendapat tag Potential. Anda mereview lalu klik Kirim ke Meta."}
          </Text>
          <Group grow align="flex-start">
            <Select
              label="Nama event"
              description={
                <>
                  Daftar dari menu <Anchor component={Link} to="/app/events" size="xs">Events</Anchor>
                </>
              }
              data={eventOptions}
              searchable
              allowDeselect={false}
              key={form.key("eventName")}
              {...form.getInputProps("eventName")}
            />
            <NumberInput
              label={currentEvent === "Purchase" ? "Nilai (wajib untuk Purchase)" : "Nilai (opsional)"}
              prefix="Rp "
              thousandSeparator="."
              decimalSeparator=","
              min={0}
              key={form.key("value")}
              {...form.getInputProps("value")}
            />
          </Group>

          <Divider label="3. Cakupan" labelPosition="left" />
          <ScopeField
            applyAll={applyAll}
            onApplyAllChange={(v) => form.setFieldValue("applyAll", v)}
            waAccountIds={waAccountIds}
            onWaAccountIdsChange={(v) => form.setFieldValue("waAccountIds", v)}
            error={form.errors.waAccountIds as string | undefined}
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
