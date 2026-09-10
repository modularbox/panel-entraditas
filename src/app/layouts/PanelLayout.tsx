import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "@/components/Menu";
import { db, resetDb, sessions } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { usePermissions } from "@/shared/auth/usePermissions";
import { recordPanelVisit, resetPanelHistory } from "@/shared/ui/panelHistory";
import { NAV_ITEMS } from "../navItems";

export function PanelLayout() {
  const { has } = usePermissions();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const impersonatorToken = useSessionStore((s) => s.impersonatorToken);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const mounted = useRef(false);
  const visibleItems = NAV_ITEMS.filter((item) => has(item.permission));

  // Track which panel routes were visited so "Volver" can return to the previous in-app
  // view without relying on the browser history (which also holds /login and external pages).
  useEffect(() => {
    if (!mounted.current) {
      // A fresh mount means a new (or restored) session: don't carry a previous user's path.
      mounted.current = true;
      resetPanelHistory();
    }
    recordPanelVisit(location.pathname + location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  const handleReturnToSuperadmin = async () => {
    // Navigate to a section everyone has access to and let React commit that (flushSync) BEFORE
    // swapping the session — see OrganizationsListPage's connect() for why flushSync matters:
    // without it, RequirePermission on a page the superadmin can't see (e.g. "Equipo") would react
    // to the permission loss and redirect to /sin-acceso, racing this navigation.
    flushSync(() => navigate("/eventos"));
    await useSessionStore.getState().returnToSuperadmin();
    queryClient.clear();
  };

  const handleResetDemoData = () => {
    if (!window.confirm("¿Restablecer los datos de ejemplo? Se perderán los cambios guardados.")) return;
    resetDb();
    const { token, user: currentUser } = useSessionStore.getState();
    // resetDb clears the in-memory session map; re-register the current session so the
    // superadmin stays logged in on the freshly re-seeded data.
    if (token && currentUser && db.users.some((u) => u.id === currentUser.id)) {
      sessions.set(token, currentUser.id);
    }
    queryClient.clear();
  };

  return (
    <div className="min-h-screen bg-background">
      <Menu
        items={visibleItems}
        user={user}
        onLogout={() => logout()}
        onResetDemoData={user?.role === "superadmin" ? handleResetDemoData : undefined}
        onReturnToSuperadmin={impersonatorToken ? handleReturnToSuperadmin : undefined}
      />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
