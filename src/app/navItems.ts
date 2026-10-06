export interface NavItem {
  label: string;
  path: string;
  permission: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", permission: "reports:read" },
  { label: "Eventos", path: "/eventos", permission: "events:read" },
  { label: "Ventas", path: "/ventas", permission: "orders:read" },
  { label: "Clientes", path: "/clientes", permission: "orders:read" },
  { label: "Organizaciones", path: "/organizaciones", permission: "organizations:manage" },
  { label: "Equipo", path: "/equipo", permission: "users:manage" },
  { label: "Papelera", path: "/papelera", permission: "trash:manage" }
];

export function getAccessibleNavItems(permissions: ReadonlySet<string>): NavItem[] {
  return NAV_ITEMS.filter((item) => permissions.has(item.permission));
}

export function getDefaultSectionPath(permissions: ReadonlySet<string>): string | null {
  return getAccessibleNavItems(permissions)[0]?.path ?? null;
}
