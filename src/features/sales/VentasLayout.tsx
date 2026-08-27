import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/shared/lib/cn";

const ENABLED_TABS = [
  { to: "/ventas/pedidos", label: "Pedidos" },
  { to: "/ventas/reembolsos", label: "Reembolsos" },
  { to: "/ventas/taquilla", label: "Taquilla (POS)" },
  { to: "/ventas/asistentes", label: "Asistentes (CRM)" }
] as const;
const DISABLED_TABS: string[] = [];

export function VentasLayout() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Ventas</p>

      <nav aria-label="Secciones de ventas">
        <ul className="flex flex-wrap gap-2">
          {ENABLED_TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "inline-block rounded-md border-2 border-foreground px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-colors",
                    isActive ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-muted"
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
          {DISABLED_TABS.map((label) => (
            <li key={label}>
              <button
                type="button"
                disabled
                title="Disponible en una fase posterior"
                className="rounded-md border-2 border-border px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground opacity-60"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
}
