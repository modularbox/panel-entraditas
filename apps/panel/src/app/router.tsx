import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "@/features/auth/LoginPage";
import { InvitationAcceptPage } from "@/features/auth/InvitationAcceptPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { EventDetailPage } from "@/features/events/detail/EventDetailPage";
import { EventsListPage } from "@/features/events/list/EventsListPage";
import { EventWizardPage } from "@/features/events/wizard/EventWizardPage";
import { TeamMemberFormPage } from "@/features/team/form/TeamMemberFormPage";
import { TeamListPage } from "@/features/team/list/TeamListPage";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { RequirePermission } from "@/shared/auth/RequirePermission";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AuthLayout } from "./layouts/AuthLayout";
import { PanelLayout } from "./layouts/PanelLayout";
import { NAV_ITEMS } from "./navItems";

const PLACEHOLDER_PATHS = new Set(["/eventos", "/equipo", "/dashboard"]);

export function AppRoutes() {
  const status = useSessionStore((s) => s.status);
  const restore = useSessionStore((s) => s.restore);

  useEffect(() => {
    if (status === "idle") void restore();
  }, [status, restore]);

  if (status === "idle") return <div>Cargando…</div>;

  if (status !== "authenticated") {
    return (
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invitacion/:token" element={<InvitationAcceptPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Navigate to="/eventos" replace />} />
        <Route path="/invitacion/:token" element={<Navigate to="/eventos" replace />} />
      </Route>
      <Route element={<PanelLayout />}>
        {NAV_ITEMS.filter((item) => !PLACEHOLDER_PATHS.has(item.path)).map((item) => (
          <Route key={item.path} element={<RequirePermission permission={item.permission} />}>
            <Route
              path={`${item.path}/*`}
              element={<PlaceholderPage title={item.label} />}
            />
          </Route>
        ))}
        <Route element={<RequirePermission permission="events:read" />}>
          <Route path="/eventos" element={<EventsListPage />} />
        </Route>
        <Route element={<RequirePermission permission="reports:read" />}>
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
        <Route element={<RequirePermission permission="events:create" />}>
          <Route path="/eventos/nuevo/editar" element={<EventWizardPage />} />
          <Route path="/eventos/:id/editar" element={<EventWizardPage />} />
        </Route>
        <Route element={<RequirePermission permission="events:read" />}>
          <Route path="/eventos/:id" element={<EventDetailPage />} />
        </Route>
        <Route element={<RequirePermission permission="users:manage" />}>
          <Route path="/equipo" element={<TeamListPage />} />
          <Route path="/equipo/invitar" element={<TeamMemberFormPage />} />
          <Route path="/equipo/:id/editar" element={<TeamMemberFormPage />} />
        </Route>
        <Route path="/sin-acceso" element={<div>No tienes acceso a esta sección.</div>} />
        <Route path="/" element={<Navigate to="/eventos" replace />} />
      </Route>
    </Routes>
  );
}
