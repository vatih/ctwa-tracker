import { createBrowserRouter, Navigate } from "react-router";
import { AppLayout } from "./layouts/AppLayout";
import { PanelLayout } from "./layouts/PanelLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { RegisterPage } from "./pages/auth/RegisterPage";
import { CapiLogsPage } from "./pages/capi-logs/CapiLogsPage";
import { DocsPage } from "./pages/docs/DocsPage";
import { EventsPage } from "./pages/events/EventsPage";
import { LeadsPage } from "./pages/leads/LeadsPage";
import { UsersPage } from "./pages/panel/UsersPage";
import { PixelsPage } from "./pages/pixels/PixelsPage";
import { TriggersPage } from "./pages/triggers/TriggersPage";
import { WaAccountsPage } from "./pages/wa-accounts/WaAccountsPage";

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/app/leads" replace /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    path: "/app",
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="leads" replace /> },
      { path: "leads", element: <LeadsPage /> },
      { path: "leads/:leadId", element: <LeadsPage /> },
      { path: "triggers", element: <TriggersPage /> },
      { path: "events", element: <EventsPage /> },
      // URL lama, tetap diarahkan supaya bookmark tidak rusak
      { path: "leads/triggers", element: <Navigate to="/app/triggers" replace /> },
      { path: "pixels", element: <PixelsPage /> },
      { path: "capi-logs", element: <CapiLogsPage /> },
      { path: "wa-accounts", element: <WaAccountsPage /> },
      { path: "panduan", element: <DocsPage /> },
      { path: "panduan/:slug", element: <DocsPage /> },
    ],
  },
  {
    path: "/panel",
    element: <PanelLayout />,
    children: [
      { index: true, element: <Navigate to="users" replace /> },
      { path: "users", element: <UsersPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/app/leads" replace /> },
]);
