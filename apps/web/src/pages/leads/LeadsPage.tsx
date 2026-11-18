import { ActionIcon, Box, Center, Drawer, Group, Stack, Tabs, Text } from "@mantine/core";
import { useDisclosure, useMediaQuery } from "@mantine/hooks";
import { IconArrowLeft, IconInbox, IconInfoCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { api, unwrap } from "../../lib/api";
import { accountName } from "../../lib/format";
import { ChatView } from "./ChatView";
import { LeadDetail } from "./LeadDetail";
import { LeadList } from "./LeadList";
import classes from "./Leads.module.css";

export function LeadsPage() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const isMobile = useMediaQuery("(max-width: 48em)");
  const isNarrow = useMediaQuery("(max-width: 75em)"); // kolom kanan jadi drawer
  const [detailOpen, detail] = useDisclosure(false);
  const [params, setParams] = useSearchParams();

  const accounts = useQuery({
    queryKey: ["wa-accounts"],
    queryFn: () => unwrap(api["wa-accounts"].$get()),
  });
  // Hanya nomor yang pernah dipairing (punya nomor HP); slot yang belum terhubung tidak punya leads.
  const accountList = (accounts.data ?? []).filter((a) => !!a.phone);
  // Nomor aktif disimpan di URL (?nomor=<id>) supaya bertahan saat buka lead / refresh.
  const requested = params.get("nomor");
  const accountId = accountList.some((a) => a.id === requested) ? requested : null;

  const switchAccount = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("nomor", id);
    else next.delete("nomor");
    // Ganti nomor = ganti inbox, jadi lead yang sedang terbuka ditutup.
    if (leadId) navigate({ pathname: "/app/leads", search: next.toString() });
    else setParams(next, { replace: true });
  };

  const lead = useQuery({
    queryKey: ["lead", leadId],
    queryFn: () => unwrap(api.leads[":id"].$get({ param: { id: leadId! } })),
    enabled: !!leadId,
  });
  const title = lead.data?.lead.name ?? (lead.data?.lead.phone ? `+${lead.data.lead.phone}` : "");

  const search = params.toString() ? `?${params.toString()}` : "";
  const select = (id: string) => navigate(`/app/leads/${id}${search}`);
  const showList = !isMobile || !leadId;
  const showChat = !isMobile || !!leadId;

  return (
    <Box className={classes.page}>
      {accountList.length > 1 && (!isMobile || !leadId) && (
        <Tabs
          value={accountId ?? "all"}
          onChange={(v) => switchAccount(v === "all" ? null : v)}
          classNames={{ list: classes.numberTabs }}
        >
          <Tabs.List>
            <Tabs.Tab value="all">Semua nomor</Tabs.Tab>
            {accountList.map((a) => (
              <Tabs.Tab
                key={a.id}
                value={a.id}
                leftSection={
                  <Box
                    className={classes.statusDot}
                    data-connected={a.status === "connected" || undefined}
                    title={a.status === "connected" ? "Terhubung" : "Tidak terhubung"}
                  />
                }
              >
                {accountName(a)}
                {a.phone && (a.label || a.pushName) && (
                  <Text span size="xs" c="dimmed" ml={6}>
                    +{a.phone}
                  </Text>
                )}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      )}

      <Box className={classes.inbox}>
        {showList && (
          <Box className={classes.col}>
            <LeadList
              key={accountId ?? "all"}
              selectedId={leadId}
              onSelect={select}
              accountId={accountId}
              showAccount={!accountId && accountList.length > 1}
            />
          </Box>
        )}

        {showChat && (
          <Box className={classes.col}>
            {leadId ? (
              <>
                <Group className={classes.colHeader} justify="space-between" wrap="nowrap">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    {isMobile && (
                      <ActionIcon variant="subtle" onClick={() => navigate(`/app/leads${search}`)} aria-label="Kembali">
                        <IconArrowLeft size={18} />
                      </ActionIcon>
                    )}
                    <Text fw={600} truncate>
                      {title}
                    </Text>
                  </Group>
                  {isNarrow && (
                    <ActionIcon variant="subtle" onClick={detail.open} aria-label="Detail kontak">
                      <IconInfoCircle size={18} />
                    </ActionIcon>
                  )}
                </Group>
                <Box style={{ flex: 1, minHeight: 0 }}>
                  <ChatView leadId={leadId} />
                </Box>
              </>
            ) : (
              <Center h="100%">
                <Stack align="center" gap={4}>
                  <IconInbox size={36} opacity={0.4} />
                  <Text c="dimmed" size="sm">
                    Pilih lead untuk melihat percakapan
                  </Text>
                  <Text c="dimmed" size="xs">
                    Tampilan read-only, CTWA Tracker tidak membalas chat.
                  </Text>
                </Stack>
              </Center>
            )}
          </Box>
        )}

        {!isNarrow && (
          <Box className={classes.col}>
            {leadId ? (
              <LeadDetail leadId={leadId} />
            ) : (
              <Center h="100%">
                <Text c="dimmed" size="sm">
                  Detail kontak
                </Text>
              </Center>
            )}
          </Box>
        )}

        {isNarrow && leadId && (
          <Drawer
            opened={detailOpen}
            onClose={detail.close}
            position="right"
            title="Detail kontak"
            size="sm"
            padding={0}
          >
            <LeadDetail leadId={leadId} />
          </Drawer>
        )}
      </Box>
    </Box>
  );
}
