import { useQueryClient } from "@tanstack/react-query";
import { Outlet } from "react-router-dom";
import { Menu } from "@/components/Menu";
import { db, resetDb, sessions } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { usePermissions } from "@/shared/auth/usePermissions";
import { NAV_ITEMS } from "../navItems";

export function PanelLayout() {
  const { has } = usePermissions();
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const queryClient = useQueryClient();
  const visibleItems = NAV_ITEMS.filter((item) => has(item.permission));

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
      />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
