import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Menu,
  Modal,
  PasswordInput,
  ScrollArea,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { isNotEmpty, matches, useForm } from "@mantine/form";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconDots, IconPencil, IconPlus, IconSend, IconTarget, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ScopeField } from "../../components/ScopeField";
import { api, ApiError, unwrap } from "../../lib/api";
import { formatDateTime } from "../../lib/format";

type Pixel = Awaited<ReturnType<typeof fetchPixels>>[number];
const fetchPixels = () => unwrap(api.pixels.$get());

/**
 * Form Pixel bukan form login: cegah browser & password manager mengisi otomatis
 * (email ke WABA ID, password tersimpan ke access token).
 */
const noAutofill = {
  autoComplete: "off",
  "data-1p-ignore": true,
  "data-lpignore": "true",
  "data-bwignore": true,
  "data-form-type": "other",
} as const;

export function PixelsPage() {
  const qc = useQueryClient();
  const pixels = useQuery({ queryKey: ["pixels"], queryFn: fetchPixels });
  const accounts = useQuery({ queryKey: ["wa-accounts"], queryFn: () => unwrap(api["wa-accounts"].$get()) });
  const [editing, setEditing] = useState<Pixel | "new" | null>(null);
  const [testing, setTesting] = useState<Pixel | null>(null);

  const accountLabel = (id: string) => {
    const a = accounts.data?.find((x) => x.id === id);
    if (!a) return "Nomor";
    return a.phone ? `+${a.phone}${a.label ? ` · ${a.label}` : ""}` : (a.label ?? "Nomor belum terhubung");
  };

  const remove = (p: Pixel) =>
    modals.openConfirmModal({
      title: `Hapus dataset ${p.name}?`,
      children: <Text size="sm">Lead pada nomor terkait tidak bisa dikirim ke Meta sampai ada pixel lain.</Text>,
      labels: { confirm: "Hapus", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await unwrap(api.pixels[":id"].$delete({ param: { id: p.id } }));
        qc.invalidateQueries({ queryKey: ["pixels"] });
      },
    });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Datasets (Pixel)</Title>
          <Text c="dimmed" size="sm">
            Dataset (Pixel) Meta dan token Conversions API tujuan pengiriman lead.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => setEditing("new")}>
          Tambah Dataset
        </Button>
      </Group>

      {pixels.data?.length === 0 && (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconTarget size={40} color="var(--mantine-color-teal-6)" />
            <Text fw={600}>Belum ada dataset</Text>
            <Text size="sm" c="dimmed" ta="center" maw={440}>
              Masukkan Dataset ID (Pixel ID) dan access token Conversions API dari Events Manager. Data akan divalidasi ke Meta saat
              disimpan.
            </Text>
            <Button mt="sm" onClick={() => setEditing("new")}>
              Tambah Dataset
            </Button>
          </Stack>
        </Card>
      )}

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {pixels.data?.map((p) => (
          <Card key={p.id} withBorder>
            <Group justify="space-between" align="flex-start" wrap="nowrap">
              <div style={{ minWidth: 0 }}>
                <Text fw={700} truncate>
                  {p.name}
                </Text>
                <Text size="sm" c="dimmed">
                  ID {p.pixelId}
                </Text>
              </div>
              <Menu position="bottom-end">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="gray" aria-label="Aksi">
                    <IconDots size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => setEditing(p)}>
                    Ubah
                  </Menu.Item>
                  <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => remove(p)}>
                    Hapus
                  </Menu.Item>
                </Menu.Dropdown>
              </Menu>
            </Group>
            <Stack gap={4} mt="sm">
              <Text size="sm">Token: {p.accessTokenMasked}</Text>
              {p.testEventCode && (
                <Group gap={6}>
                  <Badge color="yellow" variant="light">
                    Mode test
                  </Badge>
                  <Text size="sm">
                    {p.testEventCode} · kirim lead dinonaktifkan
                  </Text>
                </Group>
              )}
              {p.waAccountIds.length ? (
                <Group gap={4}>
                  <Text size="sm">Nomor:</Text>
                  {p.waAccountIds.map((id) => (
                    <Badge key={id} variant="light" color="gray" tt="none">
                      {accountLabel(id)}
                    </Badge>
                  ))}
                </Group>
              ) : (
                <Text size="sm" c="orange">
                  Belum terhubung ke nomor mana pun, jadi lead belum dikirim ke dataset ini. Pilih nomor lewat menu Ubah.
                </Text>
              )}
              {p.validatedAt && (
                <Text size="xs" c="dimmed">
                  Tervalidasi {formatDateTime(new Date(p.validatedAt))}
                </Text>
              )}
            </Stack>
            <Group mt="sm">
              <Button size="xs" variant="light" leftSection={<IconSend size={14} />} onClick={() => setTesting(p)}>
                Test kirim ke Meta
              </Button>
            </Group>
          </Card>
        ))}
      </SimpleGrid>

      <TestModal pixel={testing} onClose={() => setTesting(null)} />

      <PixelForm
        pixel={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["pixels"] });
        }}
      />
    </Stack>
  );
}

function PixelForm({ pixel, onClose, onSaved }: { pixel: Pixel | "new" | null; onClose: () => void; onSaved: () => void }) {
  const isNew = pixel === "new";
  const existing = pixel && pixel !== "new" ? pixel : null;
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: "",
      pixelId: "",
      accessToken: "",
      wabaId: "",
      pageId: "",
      testEventCode: "",
      waAccountIds: [] as string[],
    },
    validate: {
      name: isNotEmpty("Nama wajib diisi"),
      pixelId: matches(/^\d{5,20}$/, "Pixel ID berupa angka"),
      wabaId: matches(/^\d*$/, "WABA ID berupa angka"),
      pageId: matches(/^\d*$/, "Page ID berupa angka"),
      waAccountIds: (v) => (v.length === 0 ? "Pilih minimal satu nomor" : null),
    },
  });
  const waAccountIds = form.useWatchValue("waAccountIds");

  // isi form saat modal dibuka
  const key = existing?.id ?? (isNew ? "new" : null);
  useEffect(() => {
    if (!key) return;
    setError(null);
    form.setValues({
      name: existing?.name ?? "",
      pixelId: existing?.pixelId ?? "",
      accessToken: "",
      wabaId: existing?.wabaId ?? "",
      pageId: existing?.pageId ?? "",
      testEventCode: existing?.testEventCode ?? "",
      waAccountIds: existing?.waAccountIds ?? [],
    });
    form.clearErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const save = useMutation({
    mutationFn: async (values: typeof form.values) => {
      const json = {
        ...values,
        accessToken: values.accessToken.trim() || undefined,
        wabaId: values.wabaId.trim() || undefined,
        pageId: values.pageId.trim() || undefined,
        testEventCode: values.testEventCode.trim() || undefined,
      };
      return existing
        ? unwrap(api.pixels[":id"].$put({ param: { id: existing.id }, json }))
        : unwrap(api.pixels.$post({ json }));
    },
    onSuccess: (r) => {
      notifications.show({
        color: "teal",
        title: "Dataset tervalidasi & tersimpan",
        message: [r.name ? `Dataset: ${r.name}` : null, r.note].filter(Boolean).join(". ") || "OK",
      });
      onSaved();
    },
    onError: (e) => {
      // error milik satu kolom tampil di helper kolom itu, sisanya di alert bawah
      if (e instanceof ApiError && e.field && e.field in form.getValues()) {
        form.setFieldError(e.field, e.fieldMessage ?? e.message);
      } else setError(e.message);
    },
  });

  return (
    <Modal opened={!!pixel} onClose={onClose} title={isNew ? "Tambah Dataset" : "Ubah Dataset"} size="lg">
      <form
        autoComplete="off"
        onSubmit={form.onSubmit((v) => {
          setError(null);
          if (!existing && v.accessToken.trim().length < 20) {
            form.setFieldError("accessToken", "Access token wajib diisi");
            return;
          }
          save.mutate(v);
        })}
      >
        <Stack>
          <TextInput label="Nama" placeholder="Dataset Toko Utama" {...noAutofill} key={form.key("name")} {...form.getInputProps("name")} />
          <TextInput
            label="Dataset ID / Pixel ID"
            placeholder="1234567890123456"
            {...noAutofill}
            key={form.key("pixelId")}
            {...form.getInputProps("pixelId")}
          />
          <PasswordInput
            label="Access token Conversions API"
            description={
              existing ? (
                `Kosongkan bila tidak diganti (sekarang ${existing.accessTokenMasked})`
              ) : (
                <>
                  Events Manager → pilih dataset → Settings → <i>Generate access token</i>
                </>
              )
            }
            {...noAutofill}
            autoComplete="new-password"
            key={form.key("accessToken")}
            {...form.getInputProps("accessToken")}
          />
          <TextInput
            label="Test event code (opsional)"
            description="Selama terisi, dataset dalam mode test: kirim lead dari halaman Leads dinonaktifkan dan hanya tombol Test yang mengirim ke Meta. Kosongkan setelah uji selesai."
            placeholder="TEST12345"
            {...noAutofill}
            key={form.key("testEventCode")}
            {...form.getInputProps("testEventCode")}
          />
          <div>
            <Text size="sm" fw={500}>
              ID bisnis untuk lead dari iklan WhatsApp
            </Text>
            <Text size="xs" c="dimmed">
              Lead dari iklan Click-to-WhatsApp wajib disertai salah satu: Facebook Page ID atau WhatsApp Business
              Account ID, yang tertaut ke dataset ini. Tanpa ini Meta menolak event.{" "}
              <Anchor component={Link} to="/app/panduan/hubungkan-dataset-page" size="sm" target="_blank">
                Cara menghubungkan dataset ke Halaman
              </Anchor>
            </Text>
          </div>
          <TextInput
            label="Facebook Page ID"
            description="Halaman Facebook yang dipakai untuk iklan & terhubung ke nomor WhatsApp."
            placeholder="102345678901234"
            {...noAutofill}
            key={form.key("pageId")}
            {...form.getInputProps("pageId")}
          />
          <TextInput
            label="WhatsApp Business Account ID"
            description="Opsional bila Page ID sudah diisi."
            {...noAutofill}
            key={form.key("wabaId")}
            {...form.getInputProps("wabaId")}
          />
          <ScopeField
            allowAll={false}
            applyAll={false}
            onApplyAllChange={() => {}}
            waAccountIds={waAccountIds}
            onWaAccountIdsChange={(v) => {
              form.setFieldValue("waAccountIds", v);
              form.clearFieldError("waAccountIds");
            }}
            error={form.errors.waAccountIds as string | undefined}
          />
          {error && (
            <Alert color="red" title="Gagal menyimpan">
              {error}
            </Alert>
          )}
          <Group justify="space-between">
            <Anchor size="xs" href="https://business.facebook.com/events_manager2" target="_blank" rel="noreferrer">
              Buka Events Manager
            </Anchor>
            <Group>
              <Button variant="default" onClick={onClose}>
                Batal
              </Button>
              <Button type="submit" loading={save.isPending}>
                Validasi & Simpan
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

type TestKind = "ad" | "organic";
const sendTest = (id: string, json: { kind: TestKind; eventName: string; testEventCode?: string }) =>
  unwrap(api.pixels[":id"].test.$post({ param: { id }, json }));
type TestResult = Awaited<ReturnType<typeof sendTest>>;

/** Kirim satu event uji ke Meta dari Pixel, lalu tampilkan balasan Meta */
function TestModal({ pixel, onClose }: { pixel: Pixel | null; onClose: () => void }) {
  const [kind, setKind] = useState<TestKind>("ad");
  const [eventName, setEventName] = useState("Lead");
  const [code, setCode] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (!pixel) return;
    setKind(pixel.pageId ? "ad" : "organic");
    setEventName("Lead");
    setCode(pixel.testEventCode ?? "");
    setResult(null);
  }, [pixel]);

  const send = useMutation({
    mutationFn: () =>
      sendTest(pixel!.id, { kind, eventName: eventName.trim(), testEventCode: code.trim() || undefined }),
    onMutate: () => setResult(null),
    onSuccess: setResult,
  });

  const adBlocked = kind === "ad" && !pixel?.pageId;

  return (
    <Modal opened={!!pixel} onClose={onClose} title={`Test kirim ke Meta: ${pixel?.name ?? ""}`} size="lg">
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Jenis lead
          </Text>
          <SegmentedControl
            fullWidth
            value={kind}
            onChange={(v) => {
              setKind(v as TestKind);
              setResult(null);
            }}
            data={[
              { value: "ad", label: "Dari iklan WhatsApp" },
              { value: "organic", label: "Organik" },
            ]}
          />
          <Text size="xs" c="dimmed" mt={4}>
            {kind === "ad"
              ? "Dikirim sebagai business_messaging (WhatsApp) dengan Page ID, sama seperti lead dari iklan CTWA. Ini juga mengecek apakah dataset sudah tertaut ke Halaman."
              : "Dikirim sebagai chat dengan nomor ter-hash, sama seperti lead organik."}
          </Text>
        </div>
        {adBlocked && (
          <Alert color="yellow">Isi Facebook Page ID di dataset ini dulu (menu Ubah) untuk tes lead dari iklan.</Alert>
        )}
        <Group grow align="flex-start">
          <TextInput
            label="Nama event"
            value={eventName}
            onChange={(e) => setEventName(e.currentTarget.value)}
            placeholder="Lead"
          />
          <TextInput
            label="Test event code"
            description="Dari Events Manager → Test events"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
            placeholder="TEST12345"
          />
        </Group>
        <Text size="xs" c="dimmed">
          Event uji memakai nomor dummy, jadi tidak tercocokkan ke orang mana pun. Meta tetap mencatatnya di Events Manager
          walaupun memakai test event code. Event lead WhatsApp mungkin tidak tampil di tab Test events; cek juga tab
          Overview dataset.
        </Text>

        {send.isError && <Alert color="red">{send.error.message}</Alert>}
        {result && <TestResultView result={result} />}

        <Group justify="space-between">
          <Anchor component={Link} to="/app/capi-logs" size="xs" onClick={onClose}>
            Lihat Log CAPI
          </Anchor>
          <Button
            leftSection={<IconSend size={16} />}
            loading={send.isPending}
            disabled={adBlocked || !eventName.trim()}
            onClick={() => send.mutate()}
          >
            Kirim tes
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function TestResultView({ result }: { result: TestResult }) {
  return (
    <Stack gap="xs">
      {result.ok ? (
        <Alert color="teal" title="Diterima Meta">
          {result.eventsReceived} event diterima{result.fbtraceId ? ` · fbtrace_id ${result.fbtraceId}` : ""}.
          {result.testEventCode
            ? ` Cek di Events Manager → Test events (kode ${result.testEventCode}).`
            : " Tanpa test event code, event masuk sebagai data biasa."}
          {result.messages.length > 0 && ` Pesan Meta: ${result.messages.join("; ")}`}
        </Alert>
      ) : (
        <Alert color="red" title={result.httpStatus ? `Ditolak Meta (HTTP ${result.httpStatus})` : "Gagal menghubungi Meta"}>
          {result.message}
          {result.fbtraceId && (
            <Text size="xs" mt={4}>
              fbtrace_id {result.fbtraceId}
            </Text>
          )}
        </Alert>
      )}
      <Text size="xs" c="dimmed">
        Request yang dikirim (tanpa access token)
      </Text>
      <ScrollArea.Autosize mah={220}>
        <Code block style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
          {JSON.stringify(result.request, null, 2)}
        </Code>
      </ScrollArea.Autosize>
    </Stack>
  );
}
