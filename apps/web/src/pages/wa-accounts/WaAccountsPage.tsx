import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import {
  IconBrandWhatsapp,
  IconDots,
  IconLink,
  IconLogout,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, unwrap } from "../../lib/api";
import { formatDateTime } from "../../lib/format";
import { PairModal } from "./PairModal";

const statusMeta: Record<string, { label: string; color: string }> = {
  pending: { label: "Belum terhubung", color: "gray" },
  connected: { label: "Terhubung", color: "teal" },
  disconnected: { label: "Terputus", color: "yellow" },
  logged_out: { label: "Logout", color: "red" },
  suspended: { label: "Ditangguhkan", color: "orange" },
};

export function WaAccountsPage() {
  const qc = useQueryClient();
  const [pairId, setPairId] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ["wa-accounts"],
    queryFn: () => unwrap(api["wa-accounts"].$get()),
    refetchInterval: 15_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["wa-accounts"] });

  const [renaming, setRenaming] = useState<{ id: string; phone: string | null; pushName: string | null } | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const openRename = (a: { id: string; phone: string | null; pushName: string | null; label: string | null }) => {
    setRenaming(a);
    setNameDraft(a.label ?? "");
  };
  const rename = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      unwrap(api["wa-accounts"][":id"].$patch({ param: { id }, json: { label } })),
    onSuccess: () => {
      setRenaming(null);
      refresh();
      // Nama nomor juga tampil di inbox Leads.
      qc.invalidateQueries({ queryKey: ["leads"] });
      qc.invalidateQueries({ queryKey: ["lead"] });
    },
    onError: (e) => notifications.show({ color: "red", title: "Gagal menyimpan nama", message: e.message }),
  });

  const add = useMutation({
    mutationFn: () => unwrap(api["wa-accounts"].$post({ json: {} })),
    onSuccess: (acc) => {
      refresh();
      setPairId(acc.id);
    },
    onError: (e) => {
      notifications.show({ color: "orange", title: "Tidak bisa menambah nomor", message: e.message });
    },
  });

  const confirmLogout = (id: string) =>
    modals.openConfirmModal({
      title: "Logout nomor?",
      children: <Text size="sm">Perangkat tertaut akan dihapus dari WhatsApp. Data lead yang sudah ada tetap tersimpan.</Text>,
      labels: { confirm: "Logout", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await unwrap(api["wa-accounts"][":id"].logout.$post({ param: { id } })).catch((e) =>
          notifications.show({ color: "red", message: e.message }),
        );
        refresh();
      },
    });

  const confirmDelete = (id: string) =>
    modals.openConfirmModal({
      title: "Hapus nomor?",
      children: (
        <Text size="sm">
          Nomor beserta <b>semua lead dan pesannya</b> akan dihapus permanen.
        </Text>
      ),
      labels: { confirm: "Hapus permanen", cancel: "Batal" },
      confirmProps: { color: "red" },
      onConfirm: async () => {
        await unwrap(api["wa-accounts"][":id"].$delete({ param: { id } })).catch((e) =>
          notifications.show({ color: "red", message: e.message }),
        );
        refresh();
      },
    });

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>WA Accounts</Title>
          <Text c="dimmed" size="sm">
            Nomor WhatsApp yang terhubung untuk tracking lead dari iklan.
          </Text>
        </div>
        <Button leftSection={<IconPlus size={16} />} onClick={() => add.mutate()} loading={add.isPending}>
          Tambah Nomor
        </Button>
      </Group>

      {!isLoading && data.length === 0 ? (
        <Card withBorder p="xl">
          <Stack align="center" gap="xs">
            <IconBrandWhatsapp size={40} color="var(--mantine-color-teal-6)" />
            <Text fw={600}>Belum ada nomor terhubung</Text>
            <Text size="sm" c="dimmed" ta="center" maw={420}>
              Hubungkan nomor WhatsApp yang dipakai untuk iklan Click-to-WhatsApp. CTWA Tracker hanya membaca pesan,
              tidak pernah membalas.
            </Text>
            <Button mt="sm" onClick={() => add.mutate()} loading={add.isPending}>
              Hubungkan nomor
            </Button>
          </Stack>
        </Card>
      ) : (
        <Card withBorder p={0}>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nomor</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Terakhir terhubung</Table.Th>
                  <Table.Th w={60} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {data.map((a) => {
                  const st = statusMeta[a.status] ?? statusMeta.pending;
                  const canPair = a.status !== "connected";
                  return (
                    <Table.Tr key={a.id}>
                      <Table.Td>
                        <Text fw={600}>{a.phone ? `+${a.phone}` : "—"}</Text>
                        <UnstyledButton onClick={() => openRename(a)} title="Ubah nama nomor">
                          <Group gap={4} wrap="nowrap">
                            <Text size="xs" c={a.label ? undefined : "dimmed"} fw={a.label ? 500 : undefined}>
                              {a.label || a.pushName || "Beri nama"}
                            </Text>
                            <IconPencil size={12} color="var(--mantine-color-dimmed)" />
                          </Group>
                        </UnstyledButton>
                      </Table.Td>
                      <Table.Td>
                        <Badge color={st.color} variant="light">
                          {st.label}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{a.lastConnectedAt ? formatDateTime(new Date(a.lastConnectedAt)) : "—"}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          {canPair && (
                            <Button size="xs" variant="light" leftSection={<IconLink size={14} />} onClick={() => setPairId(a.id)}>
                              Hubungkan
                            </Button>
                          )}
                          <Menu position="bottom-end">
                            <Menu.Target>
                              <ActionIcon variant="subtle" color="gray" aria-label="Aksi">
                                <IconDots size={16} />
                              </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>
                              <Menu.Item leftSection={<IconPencil size={14} />} onClick={() => openRename(a)}>
                                Ubah nama
                              </Menu.Item>
                              {a.status === "connected" && (
                                <Menu.Item leftSection={<IconLogout size={14} />} onClick={() => confirmLogout(a.id)}>
                                  Logout
                                </Menu.Item>
                              )}
                              <Menu.Item color="red" leftSection={<IconTrash size={14} />} onClick={() => confirmDelete(a.id)}>
                                Hapus
                              </Menu.Item>
                            </Menu.Dropdown>
                          </Menu>
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <Modal opened={!!renaming} onClose={() => setRenaming(null)} title="Nama nomor" size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (renaming) rename.mutate({ id: renaming.id, label: nameDraft.trim() });
          }}
        >
          <Stack>
            <TextInput
              label={renaming?.phone ? `+${renaming.phone}` : "Nomor belum terhubung"}
              description="Tampil di WA Accounts dan inbox Leads. Kosongkan untuk memakai nama profil WhatsApp."
              placeholder={renaming?.pushName ?? "mis. Admin CS, Toko Cabang Jogja"}
              maxLength={60}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.currentTarget.value)}
              data-autofocus
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setRenaming(null)}>
                Batal
              </Button>
              <Button type="submit" loading={rename.isPending}>
                Simpan
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      <PairModal
        accountId={pairId}
        onClose={() => {
          setPairId(null);
          refresh();
        }}
        onPaired={refresh}
      />
    </Stack>
  );
}
