import { Alert, Anchor, Badge, Button, Group, NumberInput, Progress, Select, Stack, Text, Tooltip } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconFlask, IconSend } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { api, unwrap } from "../../lib/api";
import { formatDateTime, formatRupiah } from "../../lib/format";

type Detail = Awaited<ReturnType<typeof fetchDetail>>;
const fetchDetail = (id: string) => unwrap(api.leads[":id"].$get({ param: { id } }));

const statusColor: Record<string, string> = { success: "teal", failed: "red", pending: "gray" };

export function LeadActions({ data }: { data: Detail }) {
  const { lead, events, metrics, capi } = data;
  const qc = useQueryClient();

  // event pilihan: default event trigger bila belum terkirim, kalau tidak event aktif pertama yang belum terkirim
  const options = capi.eventOptions;
  const unsent = options.filter((o) => !o.sent);
  const defaultEvent = (unsent.find((o) => o.fromTrigger) ?? unsent[0])?.name ?? null;
  const [eventName, setEventName] = useState<string | null>(defaultEvent);
  const selected = useMemo(() => options.find((o) => o.name === eventName) ?? null, [options, eventName]);
  const [value, setValue] = useState<number | string>("");
  useEffect(() => {
    if (!eventName || !options.some((o) => o.name === eventName && !o.sent)) setEventName(defaultEvent);
  }, [lead.id, defaultEvent, eventName, options]);
  useEffect(() => setValue(selected?.defaultValue ?? ""), [selected?.name, selected?.defaultValue, lead.id]);

  const numValue = value === "" ? null : Number(value);
  const valueMissing = !!selected?.valueRequired && !numValue;
  const allSent = unsent.length === 0;

  const send = useMutation({
    mutationFn: (v: { eventName: string; value: number | null }) =>
      unwrap(api.leads[":id"].send.$post({ param: { id: lead.id }, json: v })),
    onSuccess: (_, v) => notifications.show({ color: "teal", message: `Terkirim ke Meta sebagai ${v.eventName}` }),
    onError: (e) => notifications.show({ color: "red", title: "Gagal mengirim", message: e.message }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["lead", lead.id] });
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });

  const confirmSend = () => {
    if (!selected) return;
    const v = { eventName: selected.name, value: numValue };
    modals.openConfirmModal({
      title: "Kirim lead ke Meta?",
      children: (
        <Text size="sm">
          Lead dikirim sebagai event <b>{selected.label}</b>
          {numValue != null ? ` senilai ${formatRupiah(numValue)}` : ""} ke pixel <b>{capi.pixelName}</b>. Pengiriman
          tidak bisa dibatalkan.
        </Text>
      ),
      labels: { confirm: "Kirim", cancel: "Batal" },
      onConfirm: () => send.mutate(v),
    });
  };

  const testMode = capi.blockedCode === "test_mode";
  // link perbaikan sesuai alasan tombol kirim nonaktif
  const fixLink = { to: "/app/pixels", label: capi.blockedCode === "no_pixel" ? "Tambah Pixel" : "Buka Pixel" };

  const reason = lead.potentialReason as { messageCount?: number; keywords?: string[] } | null;

  return (
    <Stack gap="sm">
      {metrics ? (
        <Stack gap={6}>
          <Text size="xs" c="dimmed">
            Trigger: {metrics.triggerName} ({metrics.mode === "auto" ? "otomatis" : "manual"})
          </Text>
          {metrics.minMessages != null && (
            <div>
              <Group justify="space-between">
                <Text size="sm">
                  Pesan {metrics.countMode === "customer_only" ? "customer" : "customer + admin"}
                </Text>
                <Text size="sm" fw={600}>
                  {metrics.messageCount}/{metrics.minMessages}
                </Text>
              </Group>
              <Progress
                value={Math.min(100, (metrics.messageCount / metrics.minMessages) * 100)}
                color={metrics.messageCount >= metrics.minMessages ? "teal" : "gray"}
                size="sm"
                mt={4}
              />
            </div>
          )}
          {metrics.keywordCount > 0 && (
            <Text size="sm">
              Kata kunci cocok:{" "}
              {metrics.matchedKeywords.length ? (
                metrics.matchedKeywords.map((k) => (
                  <Badge key={k} size="sm" variant="light" color="orange" tt="none" mr={4}>
                    {k}
                  </Badge>
                ))
              ) : (
                <Text span c="dimmed" size="sm">
                  belum ada
                </Text>
              )}
            </Text>
          )}
        </Stack>
      ) : (
        <Text size="sm" c="dimmed">
          Belum ada trigger untuk nomor ini.{" "}
          <Anchor component={Link} to="/app/triggers" size="sm">
            Atur trigger
          </Anchor>
        </Text>
      )}

      {lead.isPotential && reason && !lead.capiSentAt && (
        <Alert color="orange" variant="light" p="xs">
          <Text size="sm">
            Lead ini <b>Potential</b>
            {reason.messageCount ? ` (${reason.messageCount} pesan)` : ""}
            {reason.keywords?.length ? ` · kata kunci: ${reason.keywords.join(", ")}` : ""}.{" "}
            {testMode ? "Bisa dikirim setelah mode test dimatikan." : "Review percakapan lalu kirim ke Meta."}
          </Text>
        </Alert>
      )}

      {testMode && !allSent && (
        <Alert color="yellow" variant="light" p="xs" icon={<IconFlask size={18} />} title="Sedang di mode test">
          <Text size="sm">
            Pixel <b>{capi.pixelName}</b> memakai test event code <b>{capi.testEventCode}</b>, jadi lead tidak bisa dikirim ke
            Meta (termasuk trigger otomatis). Pakai tombol Test di menu Pixel untuk uji coba, lalu kosongkan test event
            code untuk mengirim data asli.{" "}
            <Anchor component={Link} to="/app/pixels" size="sm">
              Buka Pixel
            </Anchor>
          </Text>
        </Alert>
      )}

      {lead.capiSentAt && (
        <Text size="sm">
          <Badge color="teal" variant="light" mr={6}>
            CAPI Sent
          </Badge>
          {formatDateTime(new Date(lead.capiSentAt))}
        </Text>
      )}

      {allSent ? (
        <Text size="xs" c="dimmed">
          Semua event aktif sudah terkirim untuk lead ini.{" "}
          <Anchor component={Link} to="/app/events" size="xs">
            Atur event
          </Anchor>
        </Text>
      ) : (
        <Stack gap="xs">
          <Select
            label="Event"
            size="sm"
            allowDeselect={false}
            value={eventName}
            onChange={setEventName}
            data={options.map((o) => ({
              value: o.name,
              label: `${o.label}${o.fromTrigger ? " (trigger)" : ""}${o.sent ? " · terkirim" : ""}`,
              disabled: o.sent,
            }))}
          />
          <NumberInput
            label={selected?.valueRequired ? "Nilai transaksi" : "Nilai (opsional)"}
            size="sm"
            prefix="Rp "
            thousandSeparator="."
            decimalSeparator=","
            min={0}
            value={value}
            onChange={setValue}
            error={valueMissing ? `Wajib diisi untuk ${selected?.label}` : undefined}
          />
          <Tooltip label={capi.blockedReason} disabled={capi.canSend || testMode} multiline w={240}>
            <div>
              <Button
                fullWidth
                leftSection={<IconSend size={16} />}
                disabled={!capi.canSend || !selected || valueMissing}
                loading={send.isPending}
                onClick={confirmSend}
                variant={lead.isPotential || lead.capiSentAt ? "filled" : "light"}
              >
                Kirim ke Meta{selected ? ` (${selected.label})` : ""}
              </Button>
            </div>
          </Tooltip>
        </Stack>
      )}
      {!capi.canSend && !testMode && capi.blockedReason && !allSent && (
        <Text size="xs" c="red">
          {capi.blockedReason}{" "}
          <Anchor component={Link} to={fixLink.to} size="xs">
            {fixLink.label}
          </Anchor>
        </Text>
      )}

      {events.length > 0 && (
        <Stack gap={6} mt="xs">
          <Text size="xs" c="dimmed">
            Riwayat pengiriman
          </Text>
          {events.map((e) => {
            const errMsg =
              e.status === "failed"
                ? (() => {
                    const r = e.response as {
                      error?: { message?: string; error_user_msg?: string };
                      message?: string;
                    } | null;
                    return r?.error?.error_user_msg || r?.error?.message || r?.message;
                  })()
                : null;
            return (
              <div key={e.id}>
                <Group justify="space-between" wrap="nowrap">
                  <div>
                    <Text size="sm" fw={500}>
                      {e.eventName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {e.trigger === "auto" ? "Otomatis" : "Manual"} · {formatDateTime(new Date(e.createdAt))}
                    </Text>
                  </div>
                  <Badge size="sm" variant="light" color={statusColor[e.status] ?? "gray"}>
                    {e.status}
                  </Badge>
                </Group>
                {errMsg && (
                  <Text size="xs" c="red">
                    {errMsg}
                  </Text>
                )}
              </div>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
