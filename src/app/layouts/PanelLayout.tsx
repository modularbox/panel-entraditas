import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Menu } from "@/components/Menu";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useInactivityLogout } from "@/shared/auth/useInactivityLogout";
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

  // Aqui dentro, y no en el enrutador: vive mientras hay sesion abierta y se va con ella. Al
  // cerrarse, el enrutador manda solo al login, que es donde se cuenta lo que ha pasado.
  useInactivityLogout();

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

  /**
   * Volver a pedir los datos, sin recargar la pagina.
   *
   * `refetchQueries` y no `clear()`: clear() tira la cache entera y deja cada pantalla en blanco
   * mientras vuelve a pedir, que se ve como si el panel se hubiera roto. Asi se refresca lo que
   * hay en pantalla y lo de antes sigue puesto hasta que llega lo nuevo.
   */
  const [actualizando, setActualizando] = useState(false);
  const handleRefresh = async () => {
    setActualizando(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setActualizando(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Menu
        items={visibleItems}
        user={user}
        onLogout={() => logout()}
        onRefresh={handleRefresh}
        refreshing={actualizando}
        onReturnToSuperadmin={impersonatorToken ? handleReturnToSuperadmin : undefined}
      />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
