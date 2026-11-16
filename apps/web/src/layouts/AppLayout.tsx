import { AppShell, Box, Burger, Center, Group, Loader, Menu, NavLink, Text, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconBook,
  IconBolt,
  IconBrandWhatsapp,
  IconChevronDown,
  IconInbox,
  IconListDetails,
  IconLogout,
  IconSettingsAutomation,
  IconShieldLock,
  IconTarget,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { authClient } from "../lib/auth";
import { useMe } from "../lib/queries";
import { useRealtime } from "../lib/realtime";

const nav = [
  { to: "/app/leads", label: "Leads", icon: IconInbox, exact: true },
  { to: "/app/pixels", label: "Datasets (Pixel)", icon: IconTarget },
  { to: "/app/wa-accounts", label: "WA Accounts", icon: IconBrandWhatsapp },
  { to: "/app/triggers", label: "Triggers", icon: IconSettingsAutomation },
  { to: "/app/events", label: "Events", icon: IconBolt },
  { to: "/app/capi-logs", label: "Log CAPI", icon: IconListDetails },
  { to: "/app/panduan", label: "Panduan", icon: IconBook },
];

export function AppLayout() {
  const [opened, { toggle, close }] = useDisclosure();
  const { data, isLoading, isError } = useMe();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  useRealtime(!!data);

  if (isLoading)
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  if (isError || !data) return <Navigate to="/login" replace />;

  const logout = async () => {
    await authClient.signOut();
    qc.clear();
    navigate("/login");
  };

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{ width: 230, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Text fw={800}>CTWA Tracker</Text>
          </Group>
          <Menu position="bottom-end">
            <Menu.Target>
              <UnstyledButton>
                <Group gap={4}>
                  <Text size="sm">{data.user.name}</Text>
                  <IconChevronDown size={14} />
                </Group>
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{data.user.email}</Menu.Label>
              {data.user.role === "admin" && (
                <Menu.Item component={Link} to="/panel" leftSection={<IconShieldLock size={16} />}>
                  Admin Panel
                </Menu.Item>
              )}
              <Menu.Item color="red" leftSection={<IconLogout size={16} />} onClick={logout}>
                Keluar
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            component={Link}
            to={n.to}
            label={n.label}
            leftSection={<n.icon size={18} />}
            active={n.exact ? pathname === n.to || /^\/app\/leads\/[0-9a-f-]{36}$/.test(pathname) : pathname.startsWith(n.to)}
            onClick={close}
          />
        ))}
      </AppShell.Navbar>

      <AppShell.Main style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
        <Box style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          <Outlet />
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}
