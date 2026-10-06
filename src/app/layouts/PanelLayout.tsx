import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu } from "@/components/Menu";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useInactivityLogout } from "@/shared/auth/useInactivityLogout";
import { cn } from "@/shared/lib/cn";
import { recordPanelVisit, resetPanelHistory } from "@/shared/ui/panelHistory";
import { AvisoGlobal } from "@/shared/ui/AvisoGlobal";
import { ConfirmProvider } from "@/shared/ui/useConfirm";
import { getAccessibleNavItems } from "../navItems";

export function PanelLayout() {
  const effectivePermissions = useSessionStore((s) => s.effectivePermissions);
  const user = useSessionStore((s) => s.user);
  const logout = useSessionStore((s) => s.logout);
  const queryClient = useQueryClient();
  const location = useLocation();
  const mounted = useRef(false);
  const visibleItems = getAccessibleNavItems(effectivePermissions);

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

  // Las tablas de Ventas (12 columnas) y la de Eventos son anchas: esas secciones abren mas el
  // main en pantallas grandes. El resto del panel se queda en max-w-7xl para no estirar tarjetas
  // y detalle.
  const cajaAncha = ["/ventas", "/eventos"].some((seccion) => location.pathname.startsWith(seccion));

  return (
    <div className="min-h-screen bg-background">
      <Menu
        items={visibleItems}
        user={user}
        onLogout={() => logout()}
        onRefresh={handleRefresh}
        refreshing={actualizando}
      />
      <main className={cn("mx-auto px-4 py-6 sm:px-6 sm:py-8", cajaAncha ? "max-w-[1728px]" : "max-w-7xl")}>
        <AvisoGlobal />
        <ConfirmProvider>
          <Outlet />
        </ConfirmProvider>
      </main>
    </div>
  );
}
