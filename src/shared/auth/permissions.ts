import type { PermissionOverride, RoleSlug } from "@entraditas/types";

// Kept to exactly what the app actually enforces (a route guard in router.tsx or a permission
// check in a mocks/handlers/*.ts file) — no aspirational permissions for features that don't
// exist. Audited 2026-09-02: dropped events:update/delete/publish, subevents:*, capacity:update,
// tickettypes:*, orders:export, scan:reverse, finance:read/settle, roles:manage, audit:read,
// settings:manage — none of them were ever checked anywhere outside this file and its tests.
export const PERMISSIONS = [
  "organizations:manage",
  "events:read", "events:create",
  "orders:read", "orders:create", "orders:refund", "guestlist:read", "guestlist:manage",
  "scan:validate", "reports:read", "reports:export",
  "users:read", "users:manage"
] as const;

export type Permission = (typeof PERMISSIONS)[number];
// users:read gates the superadmin's cross-tenant "Usuarios" directory (every user, every
// organization, connect-as-anyone) — an admin already sees their own org's people via users:manage
// (Equipo), so it's excluded here rather than granted twice with different semantics.
const ALL_EXCEPT_ORG_MANAGE = PERMISSIONS.filter((permission) => permission !== "organizations:manage" && permission !== "users:read");
// Superadmin handles organizations cross-tenant but never the day-to-day team of any
// one org; its users are managed by each admin. Keeps the "Equipo" nav gated off.
const ALL_EXCEPT_TEAM_MANAGE = PERMISSIONS.filter((permission) => permission !== "users:manage");

export const ROLE_BASE_PERMISSIONS: Record<RoleSlug, readonly Permission[]> = {
  superadmin: ALL_EXCEPT_TEAM_MANAGE,
  admin: ALL_EXCEPT_ORG_MANAGE,
  user: ["events:read", "events:create", "orders:read", "guestlist:read", "guestlist:manage", "reports:read", "scan:validate"],
  subuser: ["events:read", "scan:validate", "guestlist:read", "guestlist:manage"]
};

export function resolveEffectivePermissions(role: RoleSlug, overrides: PermissionOverride[]): Set<string> {
  const effective = new Set<string>(ROLE_BASE_PERMISSIONS[role]);
  // Two separate passes, not one: deny always wins over allow regardless of the overrides' order.
  for (const override of overrides) if (override.effect === "allow") effective.add(override.permission);
  for (const override of overrides) if (override.effect === "deny") effective.delete(override.permission);
  return effective;
}

export function hasPermission(effective: Set<string>, permission: string, opts?: { eventId?: string; eventScopes?: string[] }): boolean {
  if (!effective.has(permission)) return false;
  // No eventScopes (or an empty list) means unrestricted access to all events; otherwise the
  // target event must be explicitly in scope. Scoping is only enforced when an eventId is given.
  if (!opts?.eventScopes || opts.eventScopes.length === 0 || !opts.eventId) return true;
  return opts.eventScopes.includes(opts.eventId);
}

// Lower number = higher privilege (superadmin outranks admin outranks user outranks subuser).
export const ROLE_LEVEL: Record<RoleSlug, number> = { superadmin: 0, admin: 1, user: 2, subuser: 3 };
export function canAssignRole(actorRole: RoleSlug, targetRole: RoleSlug): boolean {
  // An actor can only assign roles at or below their own privilege level, never a higher one.
  return ROLE_LEVEL[actorRole] <= ROLE_LEVEL[targetRole];
}
export function canGrantPermission(actorEffective: Set<string>, permission: string): boolean {
  // Can't grant a permission you don't hold yourself.
  return actorEffective.has(permission);
}
export function canAssignEventScopes(actorScopes: string[], targetScopes: string[]): boolean {
  // Empty actor scope = unrestricted, so anything can be assigned; otherwise the target's
  // scopes must be a subset of the actor's own.
  return actorScopes.length === 0 || targetScopes.every((scope) => actorScopes.includes(scope));
}

export type CapabilityAccess = "fixed_yes" | "fixed_no" | "configurable";
export interface Capability {
  key: string;
  label: string;
  permissions: Permission[];
  accessByRole: Record<RoleSlug, CapabilityAccess>;
}

export const CAPABILITIES: Capability[] = [
  { key: "manage_organizations", label: "Gestionar organizadores", permissions: ["organizations:manage"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_no", user: "fixed_no", subuser: "fixed_no" } },
  { key: "manage_events", label: "Crear y editar eventos", permissions: ["events:create"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" } },
  { key: "view_orders", label: "Ver pedidos y compradores", permissions: ["orders:read"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" } },
  { key: "refund_orders", label: "Devolver dinero", permissions: ["orders:refund"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } },
  { key: "sell_tickets", label: "Vender entradas en taquilla", permissions: ["orders:create"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "configurable" } },
  { key: "scan_tickets", label: "Escanear entradas en la puerta", permissions: ["scan:validate"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "fixed_yes" } },
  { key: "manage_guestlist", label: "Gestionar invitados y cortesías", permissions: ["guestlist:read", "guestlist:manage"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "fixed_yes" } },
  { key: "view_reports", label: "Ver informes y estadísticas", permissions: ["reports:read"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" } },
  { key: "manage_team", label: "Dar de alta a personas del equipo", permissions: ["users:manage"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } }
];

export function getConfigurableCapabilities(role: RoleSlug): Capability[] {
  return CAPABILITIES.filter((capability) => capability.accessByRole[role] === "configurable");
}
export function capabilityKeysToOverrides(role: RoleSlug, enabledKeys: string[]): PermissionOverride[] {
  return getConfigurableCapabilities(role).filter((capability) => enabledKeys.includes(capability.key)).flatMap((capability) =>
    capability.permissions.map((permission) => ({ permission, effect: "allow" as const }))
  );
}
export function overridesToCapabilityKeys(role: RoleSlug, overrides: PermissionOverride[]): string[] {
  const allowed = new Set(overrides.filter((override) => override.effect === "allow").map((override) => override.permission));
  return getConfigurableCapabilities(role).filter((capability) => capability.permissions.every((permission) => allowed.has(permission))).map((capability) => capability.key);
}
