import type { PermissionOverride, RoleSlug } from "@entraditas/types";

export const PERMISSIONS = [
  "organizations:manage",
  "events:read", "events:create", "events:update", "events:delete", "events:publish",
  "subevents:read", "subevents:create", "subevents:update", "subevents:delete",
  "capacity:update",
  "tickettypes:read", "tickettypes:create", "tickettypes:update", "tickettypes:delete",
  "orders:read", "orders:refund", "orders:export",
  "guestlist:read", "guestlist:manage",
  "scan:validate", "scan:reverse",
  "reports:read", "reports:export",
  "finance:read", "finance:settle",
  "users:read", "users:manage", "roles:manage", "audit:read", "settings:manage"
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL_EXCEPT_ORG_MANAGE = PERMISSIONS.filter((p) => p !== "organizations:manage");

// Base sets below mirror the role matrix in entraditas-requerimientos.pdf §5.1:
// "Sí" -> included; "No" -> excluded; "Solo los suyos" / "Solo su puerta" / "Solo su lista"
// -> included (the *scoping* is handled by eventScopes, not by the permission set itself);
// "Configurable" -> excluded by default (an admin grants it per person via an allow override).
export const ROLE_BASE_PERMISSIONS: Record<RoleSlug, readonly Permission[]> = {
  superadmin: PERMISSIONS,
  admin: ALL_EXCEPT_ORG_MANAGE,
  user: [
    "events:read", "events:create", "events:update",
    "subevents:read", "subevents:create", "subevents:update",
    "capacity:update",
    "tickettypes:read", "tickettypes:create", "tickettypes:update",
    "orders:read",
    "guestlist:read", "guestlist:manage",
    "reports:read",
    "scan:validate"
  ],
  subuser: ["events:read", "scan:validate", "guestlist:read"]
};

export function resolveEffectivePermissions(
  role: RoleSlug,
  overrides: PermissionOverride[]
): Set<string> {
  const effective = new Set<string>(ROLE_BASE_PERMISSIONS[role]);
  for (const override of overrides) {
    if (override.effect === "allow") effective.add(override.permission);
  }
  for (const override of overrides) {
    if (override.effect === "deny") effective.delete(override.permission);
  }
  return effective;
}

export function hasPermission(
  effective: Set<string>,
  permission: string,
  opts?: { eventId?: string; eventScopes?: string[] }
): boolean {
  if (!effective.has(permission)) return false;
  if (!opts?.eventScopes || opts.eventScopes.length === 0) return true;
  if (!opts.eventId) return true;
  return opts.eventScopes.includes(opts.eventId);
}
