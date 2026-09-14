import type { PermissionOverride, RoleSlug } from "@entraditas/types";

// Kept to exactly what the app actually enforces (a route guard in router.tsx or a permission
// check in a mocks/handlers/*.ts file) — no aspirational permissions for features that don't
// exist. Audited 2026-09-02: dropped events:update/delete/publish, subevents:*, capacity:update,
// tickettypes:*, orders:export, scan:reverse, finance:read/settle, roles:manage, audit:read,
// settings:manage — none of them were ever checked anywhere outside this file and its tests.
export const PERMISSIONS = [
  "organizations:manage",
  "events:read", "events:create",
  "orders:read", "orders:create", "orders:refund",
  "guestlist:read", "guestlist:manage",
  "scan:validate", "reports:read", "reports:export",
  "users:manage"
] as const;

export type Permission = (typeof PERMISSIONS)[number];
const ALL_EXCEPT_ORG_MANAGE = PERMISSIONS.filter((permission) => permission !== "organizations:manage");
// Superadmin handles organizations cross-tenant but never the day-to-day team of any
// one org; its users are managed by each admin. Keeps the "Equipo" nav gated off.
const ALL_EXCEPT_TEAM_MANAGE = PERMISSIONS.filter((permission) => permission !== "users:manage");

// Roles de staff_users en entraditas.sql. El admin es la cuenta principal de la organización (la
// que apunta "Conectar"); user y subuser son personal con permiso por evento que solo existe
// dentro de ella. Un user empieza sin nada y todo lo que el admin le concede llega como overrides
// allow (las casillas "Permisos adicionales" de Equipo), además del alcance por evento.
export const ROLE_BASE_PERMISSIONS: Record<RoleSlug, readonly Permission[]> = {
  superadmin: ALL_EXCEPT_TEAM_MANAGE,
  admin: ALL_EXCEPT_ORG_MANAGE,
  user: [],
  subuser: []
};

// El admin es la cuenta principal de la organización (el rol al que apunta "Conectar"). Solo
// puede existir uno por organización, así que ese rol no lo asigna nadie más que la app: su
// equipo son user y subuser. Constantes con nombre, en vez de literales de rol dispersos, para
// que los llamadores lean la intención.
export const ADMIN_ROLE = "admin" as const;
export const USER_ROLE = "user" as const;
export const SUBUSER_ROLE = "subuser" as const;

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

// Lower number = higher privilege (superadmin outranks admin outranks user/subuser).
export const ROLE_LEVEL: Record<RoleSlug, number> = { superadmin: 0, admin: 1, user: 2, subuser: 3 };
export function canAssignRole(actorRole: RoleSlug, targetRole: RoleSlug): boolean {
  // An actor can only assign roles at or below their own privilege level, never a higher one.
  // An admin can only assign user/subuser: there is exactly one admin per organization, so that
  // role is not assignable by anyone but the app itself.
  if (targetRole === "admin" && actorRole !== "superadmin") return false;
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
  { key: "manage_events", label: "Crear y editar eventos", permissions: ["events:create"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } },
  { key: "view_orders", label: "Ver pedidos y compradores", permissions: ["orders:read"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } },
  { key: "refund_orders", label: "Devolver dinero", permissions: ["orders:refund"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_no", subuser: "fixed_no" } },
  { key: "sell_tickets", label: "Vender entradas en taquilla", permissions: ["orders:create"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } },
  { key: "scan_tickets", label: "Escanear entradas en la puerta", permissions: ["scan:validate"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "configurable" } },
  { key: "manage_guestlist", label: "Gestionar invitados y cortesías", permissions: ["guestlist:read", "guestlist:manage"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } },
  { key: "view_reports", label: "Ver informes y estadísticas", permissions: ["reports:read"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } },
  { key: "manage_team", label: "Dar de alta a personas del equipo", permissions: ["users:manage"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_no", subuser: "fixed_no" } }
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
