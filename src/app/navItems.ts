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
  { label: "Equipo", path: "/equipo", permission: "users:manage" },
  { label: "Clientes", path: "/clientes", permission: "orders:read" },
  { label: "Organizaciones", path: "/organizaciones", permission: "organizations:manage" }
];

export function getAccessibleNavItems(permissions: ReadonlySet<string>): NavItem[] {
  return NAV_ITEMS.filter((item) => permissions.has(item.permission));
}

export function getDefaultSectionPath(permissions: ReadonlySet<string>): string | null {
  return getAccessibleNavItems(permissions)[0]?.path ?? null;
}
