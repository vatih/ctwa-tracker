import {
  Box,
  Button,
  Center,
  Group,
  Loader,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "../../lib/api";
import { accountName, formatListTime } from "../../lib/format";
import { LeadTags } from "./LeadTags";
import classes from "./Leads.module.css";

type Tag = "all" | "ad" | "potential" | "capi_sent";

export function LeadList({
  selectedId,
  onSelect,
  accountId,
  showAccount,
}: {
  selectedId?: string;
  onSelect: (id: string) => void;
  accountId: string | null;
  /** Tampilkan nama nomor tujuan di tiap lead (saat melihat semua nomor). */
  showAccount?: boolean;
}) {
  const [tag, setTag] = useState<Tag>("all");
  const [search, setSearch] = useState("");
  const [q] = useDebouncedValue(search.trim(), 300);

  const list = useInfiniteQuery({
    queryKey: ["leads", { tag, accountId, q }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.leads.$get({
          query: { tag, accountId: accountId ?? undefined, q: q || undefined, cursor: pageParam },
        }),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Stack gap={0} h="100%">
      <Stack gap="xs" p="sm" className={classes.listHeader}>
        <TextInput
          placeholder="Cari nama, nomor, pesan"
          leftSection={<IconSearch size={16} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
        />
        <SegmentedControl
          size="xs"
          fullWidth
          value={tag}
          onChange={(v) => setTag(v as Tag)}
          data={[
            { value: "all", label: "Semua" },
            { value: "ad", label: "Iklan" },
            { value: "potential", label: "Potential" },
            { value: "capi_sent", label: "CAPI Sent" },
          ]}
        />
      </Stack>

      <ScrollArea style={{ flex: 1 }} type="auto">
        {list.isLoading && (
          <Center p="xl">
            <Loader size="sm" />
          </Center>
        )}
        {!list.isLoading && items.length === 0 && (
          <Text c="dimmed" size="sm" ta="center" p="xl">
            Belum ada lead{tag !== "all" || q ? " yang cocok dengan filter" : ""}.
          </Text>
        )}
        {items.map((l) => (
          <UnstyledButton
            key={l.id}
            className={classes.leadItem}
            data-active={l.id === selectedId || undefined}
            onClick={() => onSelect(l.id)}
          >
            <Group justify="space-between" wrap="nowrap" gap="xs">
              <Text fw={600} size="sm" truncate>
                {l.name ?? (l.phone ? `+${l.phone}` : "Tanpa nama")}
              </Text>
              <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
                {formatListTime(new Date(l.lastMessageAt))}
              </Text>
            </Group>
            <Text size="xs" c="dimmed" truncate mt={2}>
              {l.lastMessagePreview ?? ""}
            </Text>
            <Group mt={6} justify="space-between" wrap="nowrap" gap="xs">
              <LeadTags fromAd={l.fromAd} isPotential={l.isPotential} capiSent={!!l.capiSentAt} />
              {showAccount && (
                <Text
                  size="xs"
                  c="dimmed"
                  truncate
                  maw="45%"
                  style={{ flexShrink: 0 }}
                  title={l.accountPhone ? `Masuk ke +${l.accountPhone}` : undefined}
                >
                  {accountName({ label: l.accountLabel, pushName: l.accountPushName, phone: l.accountPhone })}
                </Text>
              )}
            </Group>
          </UnstyledButton>
        ))}
        {list.hasNextPage && (
          <Center p="sm">
            <Button variant="subtle" size="xs" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>
              Muat lebih banyak
            </Button>
          </Center>
        )}
      </ScrollArea>
    </Stack>
  );
}
