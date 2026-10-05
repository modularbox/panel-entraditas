import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import type { NavItem } from "@/app/navItems";
import type { SessionUser } from "@/shared/auth/sessionStore";

export interface MenuProps {
  items: NavItem[];
  user: SessionUser | null;
  onLogout: () => void;
  /** Volver a pedir los datos sin recargar la pagina entera. */
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function Menu({ items, user, onLogout, onRefresh, refreshing }: MenuProps) {
  const location = useLocation();
  // En el móvil el menú va plegado tras un botón (tanda 17, "todo responsive"): desplegado, ocupaba
  // la primera pantalla entera y había que bajar para ver la página. En ordenador se ve siempre.
  const [abierto, setAbierto] = useState(false);
  useEffect(() => setAbierto(false), [location.pathname]);
  const plegable = abierto ? "flex" : "hidden lg:flex";

  return (
    <nav aria-label="Navegación principal" className="border-b-2 border-foreground bg-surface">
      <div className="mx-auto flex w-full flex-wrap items-center gap-3 px-4 py-3 lg:min-h-28 lg:gap-4 lg:px-6">
        <span className="flex flex-col leading-tight">
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-base text-background"
            >
              🎟
            </span>
            <span className="font-display text-xl font-semibold tracking-tight">Entraditas</span>
          </span>
          {user?.fullName ? (
            <span className="ml-10 text-xs font-semibold uppercase tracking-wide text-foreground/70">
              {user.fullName}
            </span>
          ) : null}
        </span>

        <button
          type="button"
          className="ml-auto inline-flex h-10 items-center gap-2 rounded-md border-2 border-foreground bg-surface px-3 text-sm font-bold uppercase tracking-wide lg:hidden"
          aria-expanded={abierto}
          aria-controls="menu-principal"
          onClick={() => setAbierto((valor) => !valor)}
        >
          <span aria-hidden="true">{abierto ? "✕" : "☰"}</span>
          Menú
        </button>

        <ul
          id="menu-principal"
          className={cn("w-full flex-col items-stretch gap-1 lg:w-auto lg:flex-1 lg:flex-row lg:flex-wrap lg:items-center", plegable)}
        >
          {items.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    "block rounded-md border-2 px-3 py-2 text-sm font-bold uppercase tracking-wide transition-colors lg:inline-block lg:py-1.5",
                    isActive
                      ? "border-foreground bg-foreground text-background"
                      : "border-transparent text-foreground/80 hover:border-foreground/30 hover:bg-muted hover:text-foreground"
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <div className={cn("w-full flex-wrap items-center gap-2 lg:w-auto lg:gap-4", plegable)}>
          {onRefresh ? (
            <Button variant="outline" onClick={onRefresh} disabled={refreshing} aria-busy={refreshing}>
              {refreshing ? "Actualizando…" : "Actualizar información"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onLogout}>
            Cerrar sesión
          </Button>
        </div>
      </div>
    </nav>
  );
}
