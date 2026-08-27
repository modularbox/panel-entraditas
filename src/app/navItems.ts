export interface NavItem {
  label: string;
  path: string;
  permission: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Eventos", path: "/eventos", permission: "events:read" },
  { label: "Dashboard", path: "/dashboard", permission: "reports:read" },
  { label: "Ventas", path: "/ventas", permission: "orders:read" },
  { label: "Control de accesos", path: "/accesos", permission: "scan:validate" },
  { label: "Informes", path: "/informes", permission: "reports:read" },
  { label: "Finanzas", path: "/finanzas", permission: "finance:read" },
  { label: "Equipo", path: "/equipo", permission: "users:manage" },
  { label: "Auditoría", path: "/auditoria", permission: "audit:read" },
  { label: "Organizaciones", path: "/organizaciones", permission: "organizations:manage" }
];
