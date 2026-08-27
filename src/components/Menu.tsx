import { Link, useLocation } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import type { NavItem } from "@/app/navItems";

export interface MenuProps {
  items: NavItem[];
  onLogout: () => void;
}

export function Menu({ items, onLogout }: MenuProps) {
  const location = useLocation();

  return (
    <nav aria-label="Navegación principal" className="border-b-2 border-foreground bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex h-8 w-8 items-center justify-center rounded-md bg-foreground text-base text-background"
          >
            🎟
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">entraditas</span>
        </span>

        <ul className="flex flex-1 flex-wrap items-center gap-1">
          {items.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={cn(
                    "inline-block rounded-md border-2 px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-colors",
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

        <Button variant="ghost" onClick={onLogout}>
          Cerrar sesión
        </Button>
      </div>
    </nav>
  );
}
