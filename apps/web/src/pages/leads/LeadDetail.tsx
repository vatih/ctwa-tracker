import { Anchor, Badge, Center, CopyButton, Divider, Group, Loader, ScrollArea, Stack, Text, Title, Tooltip } from "@mantine/core";
import { IconCheck, IconCopy } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api, unwrap } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { LeadActions } from "./LeadActions";
import { LeadTags } from "./LeadTags";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" component="div" style={{ wordBreak: "break-all" }}>
        {children ?? "—"}
      </Text>
    </div>
  );
}

function Copyable({ value }: { value: string }) {
  return (
    <Group gap={4} wrap="nowrap">
      <Text size="sm" truncate>
        {value}
      </Text>
      <CopyButton value={value}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? "Tersalin" : "Salin"}>
            {copied ? <IconCheck size={14} /> : <IconCopy size={14} style={{ cursor: "pointer", flexShrink: 0 }} onClick={copy} />}
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

export function LeadDetail({ leadId }: { leadId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => unwrap(api.leads[":id"].$get({ param: { id: leadId } })),
  });
  if (isLoading || !data)
    return (
      <Center h="100%">
        <Loader size="sm" />
      </Center>
    );
  const { lead, account } = data;
  const fromAd = !!(lead.ctwaClid || lead.adSourceId);

  return (
    <ScrollArea h="100%" type="auto">
      <Stack p="md" gap="md">
        <div>
          <Title order={4}>{lead.name ?? "Tanpa nama"}</Title>
          <Text size="sm" c="dimmed">
            {lead.phone ? `+${lead.phone}` : "Nomor disembunyikan WhatsApp (LID)"}
          </Text>
          <Group mt={6}>
            <LeadTags fromAd={fromAd} isPotential={lead.isPotential} capiSent={!!lead.capiSentAt} />
          </Group>
        </div>

        <Stack gap="xs">
          <Row label="Masuk ke nomor">
            {account.phone ? `+${account.phone}` : "—"}
            {account.label || account.pushName ? ` · ${account.label || account.pushName}` : ""}
          </Row>
          <Row label="Chat pertama">{formatDateTime(new Date(lead.firstMessageAt))}</Row>
          <Row label="Jumlah pesan">
            {lead.msgInCount} dari customer · {lead.msgOutCount} dari admin
          </Row>
        </Stack>

        <Divider label="Sumber iklan" labelPosition="left" />
        {fromAd ? (
          <Stack gap="xs">
            <Row label="Judul iklan">{lead.adHeadline}</Row>
            <Row label="Ad ID">{lead.adSourceId ? <Copyable value={lead.adSourceId} /> : null}</Row>
            <Row label="CTWA Click ID">
              {lead.ctwaClid ? (
                <Badge color="teal" variant="light" size="sm">
                  Terekam
                </Badge>
              ) : (
                <Badge color="gray" variant="light" size="sm">
                  Tidak ada
                </Badge>
              )}
            </Row>
            {lead.adSourceUrl && (
              <Row label="Link">
                <Anchor href={lead.adSourceUrl} target="_blank" rel="noreferrer" size="sm">
                  Buka iklan
                </Anchor>
              </Row>
            )}
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">
            Chat ini tidak berasal dari iklan Click-to-WhatsApp.
          </Text>
        )}

        <Divider label="Meta Conversions API" labelPosition="left" />
        <LeadActions data={data} />
      </Stack>
    </ScrollArea>
  );
}
