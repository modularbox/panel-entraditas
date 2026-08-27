import { Outlet } from "react-router-dom";
import { Menu } from "@/components/Menu";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { usePermissions } from "@/shared/auth/usePermissions";
import { NAV_ITEMS } from "../navItems";

export function PanelLayout() {
  const { has } = usePermissions();
  const logout = useSessionStore((s) => s.logout);
  const visibleItems = NAV_ITEMS.filter((item) => has(item.permission));

  return (
    <div className="min-h-screen bg-background">
      <Menu items={visibleItems} onLogout={() => logout()} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
