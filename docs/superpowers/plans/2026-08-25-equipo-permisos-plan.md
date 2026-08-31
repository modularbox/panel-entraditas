# Equipo y Permisos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the "Equipo" section of the panel — invite-by-email onboarding, per-person permission overrides scoped to a business-level capability catalog, event-scope restriction, and instant deactivation with session revocation — matching the role/capability table in the spec.

**Architecture:** Extend the existing client-side permission model (`permissions.ts`) with a capability catalog and privilege guards (pure functions, reused by both UI and mocked API). Add mock endpoints for team management and invitations (MSW handlers on the existing in-memory `db`/`sessions`). Add three new panel pages (`TeamListPage`, `TeamMemberFormPage`, `InvitationAcceptPage`) that reuse existing patterns (react-hook-form + zod, TanStack Query, `apiClient`, `Can`/`RequirePermission`).

**Tech Stack:** React 18, TypeScript, react-hook-form + zod, TanStack Query v5, MSW (mock backend), Vitest + Testing Library, zustand.

**Spec:** `docs/superpowers/specs/2026-08-25-equipo-permisos-design.md`

## Global Constraints

- No real email is sent; invite links are shown in-app (the panel stands in for a dev mailer like MailHog/Resend).
- No real password hashing in the mock backend — this is a mocked API, not production security.
- Nadie puede dar a otra persona un permiso, rol o alcance de evento que él mismo no tenga — enforced by `canAssignRole`, `canGrantPermission`, `canAssignEventScopes`, on both the UI (hide/filter controls) and the mock handlers (authoritative 403 `PRIVILEGE_ESCALATION`).
- Se puede desactivar a una persona al instante y cerrarle todas las sesiones abiertas — `disable` must call `revokeAllSessionsForUser`.
- El alta de personas se hace por invitación al correo, nunca creando contraseñas a mano — `/users/invite` creates a `status: "invited"` user with no password; the person sets their own password via `/invitacion/:token`.
- Rol asignable: nivel igual o inferior al del actor (`superadmin(0) ≥ admin(1) ≥ user(2) ≥ subuser(3)`), nunca superior.
- El selector de alcance por evento solo se muestra para roles Usuario y Subusuario; Administrador y Superadmin no lo tienen.
- La sección Equipo es una función de organizador; no se construye ni prueba un caso de uso para superadmin en esta entrega.
- Seguir las convenciones existentes del repo: formularios con `react-hook-form` + `zod` y clases Tailwind ya usadas (`border-2 border-foreground`, etc.), listados con TanStack Query + `apiClient`, gating de UI con `Can`/`RequirePermission`, tests colocados junto al código (`<Nombre>.test.tsx`/`.test.ts`) que llaman `resetDb()` y reinician `useSessionStore` en `afterEach`.

---

### Task 1: `Invitation` schema in `@entraditas/types`

**Files:**
- Modify: `packages/types/src/schemas.ts`
- Test: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Produces: `InvitationSchema` (zod), `Invitation` type — `{ id, token, userId, email, organizationId, invitedByUserId, status: "pending"|"accepted", createdAt }`. Consumed by Task 3 (`db.ts`).

- [ ] **Step 1: Write the failing tests**

In `packages/types/src/schemas.test.ts`, update the import at the top of the file to also pull in `InvitationSchema`:

```ts
import { EventSchema, InvitationSchema, TicketTypeSchema, UserSchema } from "./schemas";
```

Append this new `describe` block at the end of the file:

```ts
describe("InvitationSchema", () => {
  it("accepts a valid pending invitation", () => {
    expect(() =>
      InvitationSchema.parse({
        id: "inv-1",
        token: "tok-abc123",
        userId: "user-1",
        email: "nueva@example.com",
        organizationId: "org-1",
        invitedByUserId: "user-admin",
        status: "pending",
        createdAt: "2026-08-25T00:00:00.000Z"
      })
    ).not.toThrow();
  });

  it("rejects an invalid status", () => {
    expect(() =>
      InvitationSchema.parse({
        id: "inv-1",
        token: "tok-abc123",
        userId: "user-1",
        email: "nueva@example.com",
        organizationId: "org-1",
        invitedByUserId: "user-admin",
        status: "expired",
        createdAt: "2026-08-25T00:00:00.000Z"
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @entraditas/types test`
Expected: FAIL — `InvitationSchema` is not exported from `./schemas`.

- [ ] **Step 3: Implement `InvitationSchema`**

In `packages/types/src/schemas.ts`, add this block right after the `UserSchema` definition (after `export type User = z.infer<typeof UserSchema>;`):

```ts
export const InvitationSchema = z.object({
  id: z.string(),
  token: z.string(),
  userId: z.string(),
  email: z.string().email(),
  organizationId: z.string(),
  invitedByUserId: z.string(),
  status: z.enum(["pending", "accepted"]),
  createdAt: z.string()
});
export type Invitation = z.infer<typeof InvitationSchema>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @entraditas/types test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/schemas.ts packages/types/src/schemas.test.ts
git commit -m "feat(types): add Invitation schema"
```

---

### Task 2: Permission model — privilege guards and capability catalog

**Files:**
- Modify: `apps/panel/src/shared/auth/permissions.ts`
- Test: `apps/panel/src/shared/auth/permissions.test.ts`

**Interfaces:**
- Consumes: `Permission`, `ROLE_BASE_PERMISSIONS`, `resolveEffectivePermissions` (all pre-existing in this file).
- Produces: `ROLE_LEVEL`, `canAssignRole(actorRole, targetRole): boolean`, `canGrantPermission(actorEffective: Set<string>, permission: string): boolean`, `canAssignEventScopes(actorScopes: string[], targetScopes: string[]): boolean`, `CapabilityAccess` type, `Capability` interface, `CAPABILITIES: Capability[]`, `getConfigurableCapabilities(role): Capability[]`, `capabilityKeysToOverrides(role, enabledKeys: string[]): PermissionOverride[]`, `overridesToCapabilityKeys(role, overrides: PermissionOverride[]): string[]`. Consumed by Task 4 (mock handlers) and Tasks 6-7 (UI).
- Also changes `ROLE_BASE_PERMISSIONS.subuser` to include `"guestlist:manage"` as a base permission (was previously only reachable via an override).

- [ ] **Step 1: Write the failing tests**

In `apps/panel/src/shared/auth/permissions.test.ts`, replace the import line at the top with:

```ts
import { describe, expect, it } from "vitest";
import {
  CAPABILITIES,
  ROLE_LEVEL,
  canAssignEventScopes,
  canAssignRole,
  canGrantPermission,
  capabilityKeysToOverrides,
  getConfigurableCapabilities,
  hasPermission,
  overridesToCapabilityKeys,
  resolveEffectivePermissions,
  ROLE_BASE_PERMISSIONS
} from "./permissions";
```

Append these new `describe` blocks at the end of the file:

```ts
describe("ROLE_LEVEL and canAssignRole", () => {
  it("orders roles from superadmin (0) to subuser (3)", () => {
    expect(ROLE_LEVEL.superadmin).toBe(0);
    expect(ROLE_LEVEL.admin).toBe(1);
    expect(ROLE_LEVEL.user).toBe(2);
    expect(ROLE_LEVEL.subuser).toBe(3);
  });

  it("allows assigning a role of equal or lower level", () => {
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("admin", "user")).toBe(true);
    expect(canAssignRole("admin", "subuser")).toBe(true);
  });

  it("blocks assigning a role of higher level", () => {
    expect(canAssignRole("user", "admin")).toBe(false);
    expect(canAssignRole("subuser", "user")).toBe(false);
  });
});

describe("canGrantPermission", () => {
  it("allows granting a permission the actor already has", () => {
    const actorEffective = resolveEffectivePermissions("admin", []);
    expect(canGrantPermission(actorEffective, "orders:refund")).toBe(true);
  });

  it("blocks granting a permission the actor does not have", () => {
    const actorEffective = resolveEffectivePermissions("user", []);
    expect(canGrantPermission(actorEffective, "finance:read")).toBe(false);
  });
});

describe("canAssignEventScopes", () => {
  it("allows any target scope when the actor has no restriction", () => {
    expect(canAssignEventScopes([], ["event-1", "event-2"])).toBe(true);
  });

  it("allows a target scope that is a subset of the actor's own scope", () => {
    expect(canAssignEventScopes(["event-1", "event-2"], ["event-1"])).toBe(true);
  });

  it("blocks a target scope with an event outside the actor's own scope", () => {
    expect(canAssignEventScopes(["event-1"], ["event-1", "event-2"])).toBe(false);
  });
});

describe("CAPABILITIES", () => {
  it("marks organizations:manage as fixed_yes only for superadmin", () => {
    const capability = CAPABILITIES.find((c) => c.key === "manage_organizations")!;
    expect(capability.accessByRole.superadmin).toBe("fixed_yes");
    expect(capability.accessByRole.admin).toBe("fixed_no");
    expect(capability.accessByRole.user).toBe("fixed_no");
    expect(capability.accessByRole.subuser).toBe("fixed_no");
  });

  it("marks publishing events as configurable only for user", () => {
    const capability = CAPABILITIES.find((c) => c.key === "publish_events")!;
    expect(capability.accessByRole.user).toBe("configurable");
    expect(capability.accessByRole.subuser).toBe("fixed_no");
  });

  it("marks scanning tickets as fixed_yes for every role", () => {
    const capability = CAPABILITIES.find((c) => c.key === "scan_tickets")!;
    expect(capability.accessByRole.user).toBe("fixed_yes");
    expect(capability.accessByRole.subuser).toBe("fixed_yes");
  });
});

describe("getConfigurableCapabilities", () => {
  it("returns exactly the 3 configurable capabilities for user", () => {
    const keys = getConfigurableCapabilities("user").map((c) => c.key).sort();
    expect(keys).toEqual(["manage_team", "publish_events", "refund_orders"]);
  });

  it("returns exactly the 4 configurable capabilities for subuser", () => {
    const keys = getConfigurableCapabilities("subuser").map((c) => c.key).sort();
    expect(keys).toEqual(["manage_events", "manage_pricing_capacity", "view_orders", "view_reports"]);
  });

  it("returns none for admin and superadmin", () => {
    expect(getConfigurableCapabilities("admin")).toHaveLength(0);
    expect(getConfigurableCapabilities("superadmin")).toHaveLength(0);
  });
});

describe("capabilityKeysToOverrides and overridesToCapabilityKeys", () => {
  it("round-trips a set of enabled capability keys through overrides", () => {
    const overrides = capabilityKeysToOverrides("user", ["publish_events", "refund_orders"]);
    expect(overrides).toEqual([
      { permission: "events:publish", effect: "allow" },
      { permission: "orders:refund", effect: "allow" }
    ]);
    expect(overridesToCapabilityKeys("user", overrides).sort()).toEqual(["publish_events", "refund_orders"]);
  });

  it("only reports a capability as enabled when ALL of its permissions are granted", () => {
    const overrides = [{ permission: "tickettypes:create", effect: "allow" as const }];
    expect(overridesToCapabilityKeys("subuser", overrides)).not.toContain("manage_pricing_capacity");
  });
});

describe("subuser base permissions include guestlist:manage", () => {
  it("grants guestlist:manage to every subuser without needing an override", () => {
    const effective = resolveEffectivePermissions("subuser", []);
    expect(effective.has("guestlist:manage")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter panel test -- src/shared/auth/permissions.test.ts`
Expected: FAIL — none of `CAPABILITIES`, `ROLE_LEVEL`, `canAssignRole`, `canGrantPermission`, `canAssignEventScopes`, `getConfigurableCapabilities`, `capabilityKeysToOverrides`, `overridesToCapabilityKeys` exist yet, and the subuser base doesn't include `guestlist:manage`.

- [ ] **Step 3: Implement the permission model extension**

Replace the full contents of `apps/panel/src/shared/auth/permissions.ts` with:

```ts
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

// Base sets below mirror the role matrix in entraditas-requerimientos.pdf §5.1 and the
// team-capabilities table from the "Equipo y permisos" feature request:
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
  // scan:validate ("solo su puerta") and guestlist:manage ("solo su lista") are always-on
  // for a subusuario per the team-capabilities table — they are not "Configurable" rows,
  // just narrower in scope than the same permission for other roles. The narrower scoping
  // itself (a specific gate, a specific guest list) isn't modeled yet: those modules don't
  // exist as screens yet.
  subuser: ["events:read", "scan:validate", "guestlist:read", "guestlist:manage"]
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

// --- Team & permissions management (privilege guards + capability catalog) ---

export const ROLE_LEVEL: Record<RoleSlug, number> = { superadmin: 0, admin: 1, user: 2, subuser: 3 };

/** An actor can only assign a role at their own level or below (never a role above their own). */
export function canAssignRole(actorRole: RoleSlug, targetRole: RoleSlug): boolean {
  return ROLE_LEVEL[actorRole] <= ROLE_LEVEL[targetRole];
}

/** An actor can only grant a permission that is already in their own effective set. */
export function canGrantPermission(actorEffective: Set<string>, permission: string): boolean {
  return actorEffective.has(permission);
}

/**
 * An actor can only assign event scopes that are within their own scope.
 * An empty actor scope means "every event of the organization" (no restriction).
 */
export function canAssignEventScopes(actorScopes: string[], targetScopes: string[]): boolean {
  if (actorScopes.length === 0) return true;
  return targetScopes.every((id) => actorScopes.includes(id));
}

export type CapabilityAccess = "fixed_yes" | "fixed_no" | "configurable";

export interface Capability {
  key: string;
  label: string;
  permissions: Permission[];
  accessByRole: Record<RoleSlug, CapabilityAccess>;
}

// Mirrors the team-capabilities table from the feature request 1:1. Each row groups the raw
// permissions it represents, and declares whether it's a fixed yes/no or an admin-configurable
// toggle for a given role. Read-only base permissions (events:read, subevents:read,
// tickettypes:read) aren't modeled here: they're implicit in ROLE_BASE_PERMISSIONS for every
// role that has any access to events at all.
export const CAPABILITIES: Capability[] = [
  {
    key: "manage_organizations",
    label: "Gestionar organizadores",
    permissions: ["organizations:manage"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_no", user: "fixed_no", subuser: "fixed_no" }
  },
  {
    key: "manage_events",
    label: "Crear y editar eventos",
    permissions: ["events:create", "events:update", "subevents:create", "subevents:update"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "publish_events",
    label: "Publicar un evento",
    permissions: ["events:publish"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" }
  },
  {
    key: "manage_pricing_capacity",
    label: "Poner precios y aforos",
    permissions: ["tickettypes:create", "tickettypes:update", "capacity:update"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "view_orders",
    label: "Ver pedidos y compradores",
    permissions: ["orders:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "refund_orders",
    label: "Devolver dinero",
    permissions: ["orders:refund"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" }
  },
  {
    key: "scan_tickets",
    label: "Escanear entradas en la puerta",
    permissions: ["scan:validate"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "fixed_yes" }
  },
  {
    key: "manage_guestlist",
    label: "Gestionar invitados y cortesías",
    permissions: ["guestlist:read", "guestlist:manage"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "fixed_yes" }
  },
  {
    key: "view_reports",
    label: "Ver informes y estadísticas",
    permissions: ["reports:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "view_finance",
    label: "Ver el dinero y las liquidaciones",
    permissions: ["finance:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_no", subuser: "fixed_no" }
  },
  {
    key: "manage_team",
    label: "Dar de alta a personas del equipo",
    permissions: ["users:manage"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" }
  },
  {
    key: "view_audit_log",
    label: "Consultar el registro de actividad",
    permissions: ["audit:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_no", subuser: "fixed_no" }
  }
];

/** The capabilities that show as a toggle in the team member form for this role. */
export function getConfigurableCapabilities(role: RoleSlug): Capability[] {
  return CAPABILITIES.filter((c) => c.accessByRole[role] === "configurable");
}

/** Turns a set of enabled capability keys into the `allow` overrides they represent. */
export function capabilityKeysToOverrides(role: RoleSlug, enabledKeys: string[]): PermissionOverride[] {
  const configurable = getConfigurableCapabilities(role);
  const overrides: PermissionOverride[] = [];
  for (const key of enabledKeys) {
    const capability = configurable.find((c) => c.key === key);
    if (!capability) continue;
    for (const permission of capability.permissions) {
      overrides.push({ permission, effect: "allow" });
    }
  }
  return overrides;
}

/** The inverse of capabilityKeysToOverrides: which configurable capabilities are fully granted. */
export function overridesToCapabilityKeys(role: RoleSlug, overrides: PermissionOverride[]): string[] {
  const allowed = new Set(overrides.filter((o) => o.effect === "allow").map((o) => o.permission));
  return getConfigurableCapabilities(role)
    .filter((c) => c.permissions.every((p) => allowed.has(p)))
    .map((c) => c.key);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter panel test -- src/shared/auth/permissions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/shared/auth/permissions.ts apps/panel/src/shared/auth/permissions.test.ts
git commit -m "feat(panel): add privilege guards and capability catalog to the permission model"
```

---

### Task 3: Invitations store, session revocation, and seed cleanup

**Files:**
- Modify: `apps/panel/src/mocks/db.ts`
- Modify: `apps/panel/src/mocks/db.test.ts`
- Modify: `apps/panel/src/mocks/state.ts`
- Test: `apps/panel/src/mocks/state.test.ts` (new)

**Interfaces:**
- Consumes: `Invitation` type (Task 1).
- Produces: `Database.invitations: Invitation[]` field, `revokeAllSessionsForUser(userId: string): void`. Consumed by Task 4.

- [ ] **Step 1: Write the failing tests**

In `apps/panel/src/mocks/db.test.ts`, replace this block (inside `"gives the 4 demo users the expected effective permissions"`):

```ts
    const subuser = byId(DEMO_SUBUSER_ID);
    const subuserEffective = resolveEffectivePermissions(subuser.role, subuser.permissionOverrides);
    expect(subuserEffective.has("guestlist:manage")).toBe(true); // granted via an allow override in seed
    expect(subuserEffective.has("finance:read")).toBe(false);
```

with:

```ts
    const subuser = byId(DEMO_SUBUSER_ID);
    expect(subuser.permissionOverrides).toHaveLength(0); // guestlist:manage is now a base permission, not an override
    const subuserEffective = resolveEffectivePermissions(subuser.role, subuser.permissionOverrides);
    expect(subuserEffective.has("guestlist:manage")).toBe(true);
    expect(subuserEffective.has("finance:read")).toBe(false);
```

Append this new test at the end of the `describe("createSeedDatabase", ...)` block:

```ts
  it("seeds an empty invitations list", () => {
    const db = createSeedDatabase();
    expect(db.invitations).toEqual([]);
  });
```

Create `apps/panel/src/mocks/state.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { resetDb, revokeAllSessionsForUser, sessions } from "./state";

describe("revokeAllSessionsForUser", () => {
  afterEach(() => resetDb());

  it("removes every session token that belongs to the given user, and leaves others untouched", () => {
    sessions.set("token-a", "user-1");
    sessions.set("token-b", "user-1");
    sessions.set("token-c", "user-2");

    revokeAllSessionsForUser("user-1");

    expect(sessions.has("token-a")).toBe(false);
    expect(sessions.has("token-b")).toBe(false);
    expect(sessions.has("token-c")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter panel test -- src/mocks/db.test.ts src/mocks/state.test.ts`
Expected: FAIL — `db.invitations` is `undefined`, the subuser still has an override, and `revokeAllSessionsForUser` doesn't exist.

- [ ] **Step 3: Implement the changes**

In `apps/panel/src/mocks/db.ts`, update the type import at the top of the file:

```ts
import type {
  CapacityPool, Event, Invitation, Organization, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
} from "@entraditas/types";
```

Add `invitations: Invitation[];` to the `Database` interface:

```ts
export interface Database {
  organizations: Organization[];
  users: User[];
  venues: Venue[];
  zones: Zone[];
  events: Event[];
  subEvents: SubEvent[];
  capacityPools: CapacityPool[];
  ticketTypes: TicketType[];
  ticketTypePrices: TicketTypePrice[];
  invitations: Invitation[];
}
```

Replace the `DEMO_SUBUSER_ID` seed user's `permissionOverrides` (it currently reads `permissionOverrides: [{ permission: "guestlist:manage", effect: "allow" }],`) with:

```ts
      permissionOverrides: [],
```

Add `invitations: [],` to the object returned at the end of `createSeedDatabase()`:

```ts
  return {
    organizations: [org1, org2],
    users,
    venues: [venue1, venue2, venue3],
    zones: [zonePista, zoneGrada],
    events: [event1, event2, event3, event4, event5],
    subEvents: [event1SubEvent, event2SubEvent, ...event3SubEvents, ...event4SubEvents, event5SubEvent],
    capacityPools: [event1Pool, event2PoolPista, event2PoolGrada],
    ticketTypes: [event1TicketType, event2TicketTypePista, event2TicketTypeGrada, event3TicketType, event4PassTicketType],
    ticketTypePrices: [],
    invitations: []
  };
```

Replace the full contents of `apps/panel/src/mocks/state.ts` with:

```ts
import { createSeedDatabase, type Database } from "./db";

export let db: Database = createSeedDatabase();
export const sessions = new Map<string, string>();

export function resetDb(): void {
  db = createSeedDatabase();
  sessions.clear();
}

export function revokeAllSessionsForUser(userId: string): void {
  for (const [token, sessionUserId] of sessions) {
    if (sessionUserId === userId) sessions.delete(token);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter panel test -- src/mocks/db.test.ts src/mocks/state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/db.ts apps/panel/src/mocks/db.test.ts apps/panel/src/mocks/state.ts apps/panel/src/mocks/state.test.ts
git commit -m "feat(panel): add invitations store and session-revocation helper to the mock backend"
```

---

### Task 4: Mock handlers — `/users` (list, invite, edit, disable/enable, resend-invite)

**Files:**
- Create: `apps/panel/src/mocks/handlers/users.ts`
- Modify: `apps/panel/src/mocks/handlers/index.ts`
- Test: `apps/panel/src/mocks/handlers/users.test.ts`

**Interfaces:**
- Consumes: `canAssignRole`, `canGrantPermission`, `canAssignEventScopes`, `resolveEffectivePermissions` (Task 2); `db`, `revokeAllSessionsForUser` (Task 3); `Invitation` (Task 1).
- Produces: HTTP endpoints `GET /users`, `POST /users/invite`, `PATCH /users/:id`, `POST /users/:id/disable`, `POST /users/:id/enable`, `POST /users/:id/resend-invite`; error code `PRIVILEGE_ESCALATION`. Consumed by Tasks 6-8 (UI) and registered into the MSW handler list consumed by every test via `setupTests.ts`.

- [ ] **Step 1: Write the failing tests**

Create `apps/panel/src/mocks/handlers/users.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import type { User } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { DEMO_ADMIN_ID, DEMO_SUBUSER_ID, DEMO_USER_ID } from "@/mocks/db";
import { db, resetDb, sessions } from "@/mocks/state";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

function grantUsersManageToDemoUser() {
  const demoUser = db.users.find((u) => u.id === DEMO_USER_ID)!;
  demoUser.permissionOverrides.push({ permission: "users:manage", effect: "allow" });
}

describe("users handlers", () => {
  afterEach(() => resetDb());

  it("an admin can list their organization's team (3 members, superadmin excluded)", async () => {
    const token = await loginAs("admin@entraditas.com");
    const members = await apiClient.get<User[]>("/users", { token });
    expect(members.map((m) => m.id).sort()).toEqual([DEMO_ADMIN_ID, DEMO_SUBUSER_ID, DEMO_USER_ID].sort());
  });

  it("a user without users:manage cannot list the team", async () => {
    const token = await loginAs("usuario@entraditas.com");
    await expect(apiClient.get("/users", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("an admin invites a new user, who starts in invited status with an invite link", async () => {
    const token = await loginAs("admin@entraditas.com");
    const result = await apiClient.post<{ user: User; inviteUrl: string }>(
      "/users/invite",
      { email: "nueva@example.com", fullName: "Nueva Persona", role: "user" },
      { token }
    );
    expect(result.user.status).toBe("invited");
    expect(result.inviteUrl).toContain("/invitacion/");
  });

  it("rejects an invite with a role above the actor's own", async () => {
    grantUsersManageToDemoUser();
    const token = await loginAs("usuario@entraditas.com");
    await expect(
      apiClient.post("/users/invite", { email: "otro@example.com", fullName: "Otro", role: "admin" }, { token })
    ).rejects.toMatchObject({ code: "PRIVILEGE_ESCALATION" });
  });

  it("rejects an invite that grants a permission the actor doesn't have", async () => {
    grantUsersManageToDemoUser();
    const token = await loginAs("usuario@entraditas.com");
    await expect(
      apiClient.post(
        "/users/invite",
        {
          email: "otro@example.com",
          fullName: "Otro",
          role: "subuser",
          permissionOverrides: [{ permission: "finance:read", effect: "allow" }]
        },
        { token }
      )
    ).rejects.toMatchObject({ code: "PRIVILEGE_ESCALATION" });
  });

  it("rejects an invite with an event scope outside the actor's own scope", async () => {
    grantUsersManageToDemoUser();
    const token = await loginAs("usuario@entraditas.com");
    await expect(
      apiClient.post(
        "/users/invite",
        { email: "otro@example.com", fullName: "Otro", role: "subuser", eventScopes: ["event-3"] },
        { token }
      )
    ).rejects.toMatchObject({ code: "PRIVILEGE_ESCALATION" });
  });

  it("rejects an invite reusing an existing email", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/users/invite", { email: "admin@entraditas.com", fullName: "Duplicado", role: "user" }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("an admin edits a team member's permission overrides and event scope", async () => {
    const token = await loginAs("admin@entraditas.com");
    const updated = await apiClient.patch<User>(
      `/users/${DEMO_SUBUSER_ID}`,
      { permissionOverrides: [{ permission: "reports:read", effect: "allow" }], eventScopes: ["event-1", "event-2"] },
      { token }
    );
    expect(updated.permissionOverrides).toEqual([{ permission: "reports:read", effect: "allow" }]);
    expect(updated.eventScopes).toEqual(["event-1", "event-2"]);
  });

  it("rejects a PATCH that would assign a role above the actor's own", async () => {
    grantUsersManageToDemoUser();
    const token = await loginAs("usuario@entraditas.com");
    await expect(apiClient.patch(`/users/${DEMO_SUBUSER_ID}`, { role: "admin" }, { token })).rejects.toMatchObject({
      code: "PRIVILEGE_ESCALATION"
    });
  });

  it("disabling a person revokes their sessions immediately", async () => {
    const subuserToken = await loginAs("subusuario@entraditas.com");
    expect(sessions.has(subuserToken)).toBe(true);

    const adminToken = await loginAs("admin@entraditas.com");
    const disabled = await apiClient.post<User>(`/users/${DEMO_SUBUSER_ID}/disable`, undefined, { token: adminToken });
    expect(disabled.status).toBe("disabled");
    expect(sessions.has(subuserToken)).toBe(false);

    await expect(apiClient.get("/auth/me", { token: subuserToken })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("re-enabling a disabled person restores active status", async () => {
    const adminToken = await loginAs("admin@entraditas.com");
    await apiClient.post(`/users/${DEMO_SUBUSER_ID}/disable`, undefined, { token: adminToken });
    const enabled = await apiClient.post<User>(`/users/${DEMO_SUBUSER_ID}/enable`, undefined, { token: adminToken });
    expect(enabled.status).toBe("active");
  });

  it("resend-invite issues a fresh invite link for a still-invited person", async () => {
    const token = await loginAs("admin@entraditas.com");
    const invited = await apiClient.post<{ user: User }>(
      "/users/invite",
      { email: "reenviar@example.com", fullName: "Reenviar", role: "user" },
      { token }
    );
    const first = await apiClient.post<{ inviteUrl: string }>(`/users/${invited.user.id}/resend-invite`, undefined, { token });
    const second = await apiClient.post<{ inviteUrl: string }>(`/users/${invited.user.id}/resend-invite`, undefined, { token });
    expect(first.inviteUrl).not.toBe(second.inviteUrl);
  });

  it("rejects resend-invite once the person has already accepted", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(apiClient.post(`/users/${DEMO_ADMIN_ID}/resend-invite`, undefined, { token })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter panel test -- src/mocks/handlers/users.test.ts`
Expected: FAIL — `GET /users` etc. are unhandled requests (the test setup uses `onUnhandledRequest: "error"`).

- [ ] **Step 3: Implement the handlers**

Create `apps/panel/src/mocks/handlers/users.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { PermissionOverride, RoleSlug, User } from "@entraditas/types";
import {
  canAssignEventScopes,
  canAssignRole,
  canGrantPermission,
  resolveEffectivePermissions
} from "@/shared/auth/permissions";
import { db, revokeAllSessionsForUser } from "../state";
import { getSessionUserId } from "../authContext";

const BASE = "http://localhost:4000/api/v1";
const PANEL_URL = "http://localhost:5174";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}

function forbidden(requestId: string) {
  return HttpResponse.json(
    { error: { code: "FORBIDDEN", message: "No tienes permiso para gestionar el equipo", requestId } },
    { status: 403 }
  );
}

function privilegeEscalation(requestId: string, message: string) {
  return HttpResponse.json({ error: { code: "PRIVILEGE_ESCALATION", message, requestId } }, { status: 403 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Persona no encontrada", requestId } }, { status: 404 });
}

function requireTeamManager(request: Request, requestId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated(requestId) };
  const actor = db.users.find((u) => u.id === userId);
  if (!actor) return { error: unauthenticated(requestId) };
  const effective = resolveEffectivePermissions(actor.role, actor.permissionOverrides);
  if (!effective.has("users:manage")) return { error: forbidden(requestId) };
  return { actor, effective };
}

/** Validates that the actor isn't granting a role, permission, or event scope beyond their own. */
function validateAssignment(
  actor: User,
  actorEffective: Set<string>,
  role: RoleSlug,
  overrides: PermissionOverride[],
  eventScopes: string[]
): string | null {
  if (!canAssignRole(actor.role, role)) return "No puedes asignar un rol superior al tuyo";
  for (const override of overrides) {
    if (override.effect === "allow" && !canGrantPermission(actorEffective, override.permission)) {
      return "No puedes otorgar un permiso que tú mismo no tienes";
    }
  }
  if (!canAssignEventScopes(actor.eventScopes, eventScopes)) {
    return "No puedes dar acceso a eventos fuera de tu propio alcance";
  }
  return null;
}

interface InviteBody {
  email: string;
  fullName: string;
  role: RoleSlug;
  permissionOverrides?: PermissionOverride[];
  eventScopes?: string[];
}

interface UpdateBody {
  role?: RoleSlug;
  permissionOverrides?: PermissionOverride[];
  eventScopes?: string[];
}

function createInvitation(actorId: string, target: User): string {
  db.invitations = db.invitations.filter((i) => i.userId !== target.id);
  const token = `invite-token-${db.invitations.length + 1}-${target.id}`;
  db.invitations.push({
    id: `inv-${db.invitations.length + 1}`,
    token,
    userId: target.id,
    email: target.email,
    organizationId: target.organizationId!,
    invitedByUserId: actorId,
    status: "pending",
    createdAt: new Date().toISOString()
  });
  return `${PANEL_URL}/invitacion/${token}`;
}

export const usersHandlers = [
  http.get(`${BASE}/users`, ({ request }) => {
    const result = requireTeamManager(request, "req_users_list");
    if ("error" in result) return result.error;
    const members = db.users.filter((u) => u.organizationId === result.actor.organizationId);
    return HttpResponse.json({
      data: members,
      meta: { page: 1, perPage: members.length, total: members.length, nextCursor: null }
    });
  }),

  http.post(`${BASE}/users/invite`, async ({ request }) => {
    const result = requireTeamManager(request, "req_users_invite");
    if ("error" in result) return result.error;
    const { actor, effective } = result;
    const body = (await request.json()) as InviteBody;

    if (db.users.some((u) => u.email === body.email)) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Ya existe una persona con ese correo", requestId: "req_users_invite" } },
        { status: 409 }
      );
    }

    const overrides = body.permissionOverrides ?? [];
    const eventScopes = body.eventScopes ?? [];
    const validationError = validateAssignment(actor, effective, body.role, overrides, eventScopes);
    if (validationError) return privilegeEscalation("req_users_invite", validationError);

    const newUser: User = {
      id: `user-invited-${db.users.length + 1}`,
      organizationId: actor.organizationId,
      parentUserId: actor.id,
      role: body.role,
      email: body.email,
      fullName: body.fullName,
      status: "invited",
      permissionOverrides: overrides,
      eventScopes
    };
    db.users.push(newUser);
    const inviteUrl = createInvitation(actor.id, newUser);

    return HttpResponse.json({ data: { user: newUser, inviteUrl }, meta: { requestId: "req_users_invite" } }, { status: 201 });
  }),

  http.patch(`${BASE}/users/:id`, async ({ request, params }) => {
    const result = requireTeamManager(request, "req_users_patch");
    if ("error" in result) return result.error;
    const { actor, effective } = result;
    const target = db.users.find((u) => u.id === params.id && u.organizationId === actor.organizationId);
    if (!target) return notFound("req_users_patch");

    const body = (await request.json()) as UpdateBody;
    const role = body.role ?? target.role;
    const overrides = body.permissionOverrides ?? target.permissionOverrides;
    const eventScopes = body.eventScopes ?? target.eventScopes;
    const validationError = validateAssignment(actor, effective, role, overrides, eventScopes);
    if (validationError) return privilegeEscalation("req_users_patch", validationError);

    if (body.role !== undefined) target.role = body.role;
    if (body.permissionOverrides !== undefined) target.permissionOverrides = body.permissionOverrides;
    if (body.eventScopes !== undefined) target.eventScopes = body.eventScopes;

    return HttpResponse.json({ data: target, meta: { requestId: "req_users_patch" } });
  }),

  http.post(`${BASE}/users/:id/disable`, ({ request, params }) => {
    const result = requireTeamManager(request, "req_users_disable");
    if ("error" in result) return result.error;
    const target = db.users.find((u) => u.id === params.id && u.organizationId === result.actor.organizationId);
    if (!target) return notFound("req_users_disable");
    target.status = "disabled";
    revokeAllSessionsForUser(target.id);
    return HttpResponse.json({ data: target, meta: { requestId: "req_users_disable" } });
  }),

  http.post(`${BASE}/users/:id/enable`, ({ request, params }) => {
    const result = requireTeamManager(request, "req_users_enable");
    if ("error" in result) return result.error;
    const target = db.users.find((u) => u.id === params.id && u.organizationId === result.actor.organizationId);
    if (!target) return notFound("req_users_enable");
    target.status = "active";
    return HttpResponse.json({ data: target, meta: { requestId: "req_users_enable" } });
  }),

  http.post(`${BASE}/users/:id/resend-invite`, ({ request, params }) => {
    const result = requireTeamManager(request, "req_users_resend_invite");
    if ("error" in result) return result.error;
    const target = db.users.find((u) => u.id === params.id && u.organizationId === result.actor.organizationId);
    if (!target) return notFound("req_users_resend_invite");
    if (target.status !== "invited") {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Esta persona ya activó su cuenta", requestId: "req_users_resend_invite" } },
        { status: 409 }
      );
    }
    const inviteUrl = createInvitation(result.actor.id, target);
    return HttpResponse.json({ data: { inviteUrl }, meta: { requestId: "req_users_resend_invite" } });
  })
];
```

In `apps/panel/src/mocks/handlers/index.ts`, replace the full contents with:

```ts
import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { eventsHandlers } from "./events";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { usersHandlers } from "./users";
import { venuesHandlers } from "./venues";

export const handlers: HttpHandler[] = [
  ...authHandlers,
  ...eventsHandlers,
  ...venuesHandlers,
  ...subEventsHandlers,
  ...capacityPoolsHandlers,
  ...ticketTypesHandlers,
  ...usersHandlers
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter panel test -- src/mocks/handlers/users.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/handlers/users.ts apps/panel/src/mocks/handlers/users.test.ts apps/panel/src/mocks/handlers/index.ts
git commit -m "feat(panel): add /users mock endpoints for team management with privilege guards"
```

---

### Task 5: Mock handlers — invitations (`GET /invitations/:token`, `POST /invitations/:token/accept`)

**Files:**
- Create: `apps/panel/src/mocks/handlers/invitations.ts`
- Modify: `apps/panel/src/mocks/handlers/index.ts`
- Test: `apps/panel/src/mocks/handlers/invitations.test.ts`

**Interfaces:**
- Consumes: `db`, `sessions` (Task 3); `resolveEffectivePermissions` (Task 2); the `usersHandlers` registered in Task 4 (tests invite through `/users/invite` first).
- Produces: `GET /invitations/:token`, `POST /invitations/:token/accept`; error codes `INVITATION_NOT_FOUND`, `INVITATION_ALREADY_ACCEPTED`. Consumed by Task 8 (`InvitationAcceptPage`).

- [ ] **Step 1: Write the failing tests**

Create `apps/panel/src/mocks/handlers/invitations.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

async function inviteUser(adminToken: string) {
  return apiClient.post<{ user: { id: string }; inviteUrl: string }>(
    "/users/invite",
    { email: "nueva@example.com", fullName: "Nueva Persona", role: "user" },
    { token: adminToken }
  );
}

describe("invitations handlers", () => {
  afterEach(() => resetDb());

  it("returns the invitation details for a pending token", async () => {
    const adminToken = await loginAs("admin@entraditas.com");
    const { inviteUrl } = await inviteUser(adminToken);
    const token = inviteUrl.split("/invitacion/")[1];

    const details = await apiClient.get<{ email: string; fullName: string; role: string }>(`/invitations/${token}`);
    expect(details.email).toBe("nueva@example.com");
    expect(details.fullName).toBe("Nueva Persona");
    expect(details.role).toBe("user");
  });

  it("returns INVITATION_NOT_FOUND for an unknown token", async () => {
    await expect(apiClient.get("/invitations/does-not-exist")).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
  });

  it("accepting an invitation activates the user and logs them in", async () => {
    const adminToken = await loginAs("admin@entraditas.com");
    const { user, inviteUrl } = await inviteUser(adminToken);
    const token = inviteUrl.split("/invitacion/")[1];

    const session = await apiClient.post<{ accessToken: string; user: { id: string } }>(`/invitations/${token}/accept`, {
      password: "nueva1234"
    });
    expect(session.accessToken).toBeTruthy();
    expect(session.user.id).toBe(user.id);
    expect(db.users.find((u) => u.id === user.id)!.status).toBe("active");
  });

  it("rejects accepting the same invitation twice", async () => {
    const adminToken = await loginAs("admin@entraditas.com");
    const { inviteUrl } = await inviteUser(adminToken);
    const token = inviteUrl.split("/invitacion/")[1];

    await apiClient.post(`/invitations/${token}/accept`, { password: "nueva1234" });
    await expect(apiClient.post(`/invitations/${token}/accept`, { password: "otra1234" })).rejects.toMatchObject({
      code: "INVITATION_ALREADY_ACCEPTED"
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter panel test -- src/mocks/handlers/invitations.test.ts`
Expected: FAIL — `/invitations/:token` is unhandled.

- [ ] **Step 3: Implement the handlers**

Create `apps/panel/src/mocks/handlers/invitations.ts`:

```ts
import { http, HttpResponse } from "msw";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { db, sessions } from "../state";

const BASE = "http://localhost:4000/api/v1";

function invitationNotFound(requestId: string) {
  return HttpResponse.json(
    { error: { code: "INVITATION_NOT_FOUND", message: "La invitación no existe o ha caducado", requestId } },
    { status: 404 }
  );
}

function invitationAlreadyAccepted(requestId: string) {
  return HttpResponse.json(
    { error: { code: "INVITATION_ALREADY_ACCEPTED", message: "Esta invitación ya fue aceptada", requestId } },
    { status: 409 }
  );
}

function serializeSession(userId: string) {
  const user = db.users.find((u) => u.id === userId)!;
  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizationId: user.organizationId
    },
    effectivePermissions: [...resolveEffectivePermissions(user.role, user.permissionOverrides)],
    eventScopes: user.eventScopes
  };
}

export const invitationsHandlers = [
  http.get(`${BASE}/invitations/:token`, ({ params }) => {
    const invitation = db.invitations.find((i) => i.token === params.token);
    if (!invitation) return invitationNotFound("req_invitation_get");
    if (invitation.status === "accepted") return invitationAlreadyAccepted("req_invitation_get");
    const organization = db.organizations.find((o) => o.id === invitation.organizationId);
    const user = db.users.find((u) => u.id === invitation.userId)!;
    return HttpResponse.json({
      data: {
        email: invitation.email,
        fullName: user.fullName,
        organizationName: organization?.name ?? "",
        role: user.role
      },
      meta: { requestId: "req_invitation_get" }
    });
  }),

  http.post(`${BASE}/invitations/:token/accept`, async ({ request, params }) => {
    const invitation = db.invitations.find((i) => i.token === params.token);
    if (!invitation) return invitationNotFound("req_invitation_accept");
    if (invitation.status === "accepted") return invitationAlreadyAccepted("req_invitation_accept");

    await request.json(); // { password } — accepted but not persisted; this mock has no real password storage

    const user = db.users.find((u) => u.id === invitation.userId)!;
    user.status = "active";
    invitation.status = "accepted";

    const token = `token_${user.id}_${sessions.size}`;
    sessions.set(token, user.id);

    return HttpResponse.json({
      data: { accessToken: token, ...serializeSession(user.id) },
      meta: { requestId: "req_invitation_accept" }
    });
  })
];
```

In `apps/panel/src/mocks/handlers/index.ts`, add the import and spread it in:

```ts
import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { eventsHandlers } from "./events";
import { invitationsHandlers } from "./invitations";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { usersHandlers } from "./users";
import { venuesHandlers } from "./venues";

export const handlers: HttpHandler[] = [
  ...authHandlers,
  ...eventsHandlers,
  ...venuesHandlers,
  ...subEventsHandlers,
  ...capacityPoolsHandlers,
  ...ticketTypesHandlers,
  ...usersHandlers,
  ...invitationsHandlers
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter panel test -- src/mocks/handlers/invitations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/handlers/invitations.ts apps/panel/src/mocks/handlers/invitations.test.ts apps/panel/src/mocks/handlers/index.ts
git commit -m "feat(panel): add invitation-acceptance mock endpoints"
```

---

### Task 6: `TeamListPage`

**Files:**
- Create: `apps/panel/src/features/team/list/useTeamQuery.ts`
- Create: `apps/panel/src/features/team/list/TeamListPage.tsx`
- Test: `apps/panel/src/features/team/list/TeamListPage.test.tsx`

**Interfaces:**
- Consumes: `GET /users`, `POST /users/:id/disable`, `POST /users/:id/enable`, `POST /users/:id/resend-invite` (Task 4); `apiClient`, `AppError`, `useSessionStore`, `Button` (all pre-existing).
- Produces: `useTeamQuery()` hook (query key `["team"]`), `TeamListPage` component. Consumed by Task 7 (shares the query key for cache invalidation) and Task 9 (routing).

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/team/list/TeamListPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { TeamListPage } from "./TeamListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TeamListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TeamListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("lists the 3 organization members to an admin, with role and status labels", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4)); // header + 3 members
    expect(screen.getByText("Personal de puerta")).toBeInTheDocument();
    expect(screen.getAllByText("Activo").length).toBeGreaterThan(0);
  });

  it("disabling a member flips its action button to Activar", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));

    const subuserRow = screen.getByText("Personal de puerta").closest("tr")!;
    fireEvent.click(within(subuserRow).getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(within(subuserRow).getByRole("button", { name: "Activar" })).toBeInTheDocument());
  });

  it("shows an invite link after resending an invitation", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const { apiClient } = await import("@/shared/lib/apiClient");
    await apiClient.post(
      "/users/invite",
      { email: "invitada@example.com", fullName: "Invitada Pendiente", role: "user" },
      { token: useSessionStore.getState().token! }
    );

    renderPage();
    await waitFor(() => expect(screen.getByText("Invitada Pendiente")).toBeInTheDocument());

    const invitedRow = screen.getByText("Invitada Pendiente").closest("tr")!;
    fireEvent.click(within(invitedRow).getByRole("button", { name: "Reenviar invitación" }));

    await waitFor(() => expect(within(invitedRow).getByText(/\/invitacion\//)).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter panel test -- src/features/team/list/TeamListPage.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement `useTeamQuery` and `TeamListPage`**

Create `apps/panel/src/features/team/list/useTeamQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useTeamQuery() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["team"],
    queryFn: () => apiClient.get<User[]>("/users", { token: token! }),
    enabled: Boolean(token)
  });
}
```

Create `apps/panel/src/features/team/list/TeamListPage.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { RoleSlug, User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useTeamQuery } from "./useTeamQuery";

const ROLE_LABELS: Record<RoleSlug, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  user: "Usuario",
  subuser: "Subusuario"
};

const STATUS_LABELS: Record<User["status"], string> = {
  active: "Activo",
  invited: "Invitado",
  disabled: "Desactivado"
};

export function TeamListPage() {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: members = [], isLoading } = useTeamQuery();
  const [error, setError] = useState<string | null>(null);
  const [resentLinks, setResentLinks] = useState<Record<string, string>>({});

  async function toggleStatus(member: User) {
    setError(null);
    try {
      const action = member.status === "disabled" ? "enable" : "disable";
      await apiClient.post(`/users/${member.id}/${action}`, undefined, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function resendInvite(member: User) {
    setError(null);
    try {
      const result = await apiClient.post<{ inviteUrl: string }>(`/users/${member.id}/resend-invite`, undefined, {
        token: token!
      });
      setResentLinks((prev) => ({ ...prev, [member.id]: result.inviteUrl }));
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Equipo</h1>
        <Link to="/equipo/invitar">
          <Button>Invitar persona</Button>
        </Link>
      </header>

      {error && <p role="alert">{error}</p>}

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Correo</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Rol</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id} className="border-t border-border">
                  <td className="px-4 py-3">{member.fullName}</td>
                  <td className="px-4 py-3">{member.email}</td>
                  <td className="px-4 py-3">{ROLE_LABELS[member.role]}</td>
                  <td className="px-4 py-3">{STATUS_LABELS[member.status]}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/equipo/${member.id}/editar`}>
                        <Button type="button" variant="outline" className="h-8 px-2 text-xs">
                          Editar
                        </Button>
                      </Link>
                      <Button
                        type="button"
                        variant={member.status === "disabled" ? "outline" : "destructive"}
                        className="h-8 px-2 text-xs"
                        onClick={() => toggleStatus(member)}
                      >
                        {member.status === "disabled" ? "Activar" : "Desactivar"}
                      </Button>
                      {member.status === "invited" && (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 px-2 text-xs"
                          onClick={() => resendInvite(member)}
                        >
                          Reenviar invitación
                        </Button>
                      )}
                    </div>
                    {resentLinks[member.id] && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Enlace: <code>{resentLinks[member.id]}</code>
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter panel test -- src/features/team/list/TeamListPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/team/list
git commit -m "feat(panel): add TeamListPage with disable/enable and resend-invite actions"
```

---

### Task 7: `TeamMemberFormPage` (invite + edit)

**Files:**
- Create: `apps/panel/src/features/team/form/teamMemberSchema.ts`
- Create: `apps/panel/src/features/team/form/TeamMemberFormPage.tsx`
- Test: `apps/panel/src/features/team/form/TeamMemberFormPage.test.tsx`

**Interfaces:**
- Consumes: `canAssignRole`, `getConfigurableCapabilities`, `capabilityKeysToOverrides`, `overridesToCapabilityKeys` (Task 2); `POST /users/invite`, `PATCH /users/:id` (Task 4); `useTeamQuery` (Task 6); `useEventsQuery` (pre-existing, `apps/panel/src/features/events/list/useEventsQuery.ts`).
- Produces: `TeamMemberFormPage` component, mounted at both `/equipo/invitar` and `/equipo/:id/editar`. Consumed by Task 9 (routing).

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/team/form/TeamMemberFormPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { DEMO_SUBUSER_ID } from "@/mocks/db";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { TeamMemberFormPage } from "./TeamMemberFormPage";

function renderInvite() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/equipo/invitar"]}>
        <Routes>
          <Route path="/equipo/invitar" element={<TeamMemberFormPage />} />
          <Route path="/equipo/:id/editar" element={<TeamMemberFormPage />} />
          <Route path="/equipo" element={<div>Listado de equipo</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function renderEdit(id: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/equipo/${id}/editar`]}>
        <Routes>
          <Route path="/equipo/:id/editar" element={<TeamMemberFormPage />} />
          <Route path="/equipo" element={<div>Listado de equipo</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TeamMemberFormPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("offers admin/user/subuser as assignable roles to an admin, with no event-scope picker for the admin role", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderInvite();
    await waitFor(() => expect(screen.getByLabelText("Rol")).toBeInTheDocument());
    const options = within(screen.getByLabelText("Rol")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Administrador", "Usuario", "Subusuario"]);
    expect(screen.queryByText(/Alcance por evento/)).not.toBeInTheDocument();
  });

  it("shows the event-scope picker with the admin's accessible events once the role is switched to Usuario", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderInvite();
    await waitFor(() => expect(screen.getByLabelText("Rol")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "user" } });
    await waitFor(() => expect(screen.getByText(/Alcance por evento/)).toBeInTheDocument());
    expect(screen.getByLabelText("Rock en Directo")).toBeInTheDocument();
  });

  it("only offers user/subuser to a usuario actor", async () => {
    await useSessionStore.getState().login("usuario@entraditas.com", "demo1234");
    renderInvite();
    await waitFor(() => expect(screen.getByLabelText("Rol")).toBeInTheDocument());
    const options = within(screen.getByLabelText("Rol")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Usuario", "Subusuario"]);
  });

  it("submitting an invite creates the person and shows the invite link", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderInvite();
    await waitFor(() => expect(screen.getByLabelText("Rol")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "nueva@example.com" } });
    fireEvent.change(screen.getByLabelText("Nombre completo"), { target: { value: "Nueva Persona" } });
    fireEvent.click(screen.getByRole("button", { name: "Invitar persona" }));
    await waitFor(() => expect(screen.getByText(/Invitación creada/)).toBeInTheDocument());
    expect(screen.getByText(/\/invitacion\//)).toBeInTheDocument();
  });

  it("pre-fills an existing subuser's role and configurable capabilities, with email/fullName disabled", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderEdit(DEMO_SUBUSER_ID);
    await waitFor(() => expect(screen.getByLabelText("Rol")).toHaveValue("subuser"));
    expect(screen.getByLabelText("Correo electrónico")).toBeDisabled();
    expect(screen.getByLabelText("Nombre completo")).toBeDisabled();
    expect(screen.getByLabelText("Ver informes y estadísticas")).not.toBeChecked();
  });

  it("editing a member's capabilities and saving sends a PATCH and returns to the team list", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderEdit(DEMO_SUBUSER_ID);
    await waitFor(() => expect(screen.getByLabelText("Rol")).toHaveValue("subuser"));
    fireEvent.click(screen.getByLabelText("Ver informes y estadísticas"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByText("Listado de equipo")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter panel test -- src/features/team/form/TeamMemberFormPage.test.tsx`
Expected: FAIL — the module doesn't exist yet.

- [ ] **Step 3: Implement the schema and component**

Create `apps/panel/src/features/team/form/teamMemberSchema.ts`:

```ts
import { z } from "zod";
import { RoleSlugSchema } from "@entraditas/types";

export const teamMemberSchema = z.object({
  email: z.string().min(1, "El correo es obligatorio").email("Correo no válido"),
  fullName: z.string().min(1, "El nombre es obligatorio"),
  role: RoleSlugSchema,
  capabilityKeys: z.array(z.string()),
  eventScopes: z.array(z.string())
});

export type TeamMemberFormValues = z.infer<typeof teamMemberSchema>;
```

Create `apps/panel/src/features/team/form/TeamMemberFormPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { RoleSlug, User } from "@entraditas/types";
import {
  canAssignRole,
  capabilityKeysToOverrides,
  getConfigurableCapabilities,
  overridesToCapabilityKeys
} from "@/shared/auth/permissions";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useTeamQuery } from "../list/useTeamQuery";
import { teamMemberSchema, type TeamMemberFormValues } from "./teamMemberSchema";

const ROLE_LABELS: Record<RoleSlug, string> = {
  superadmin: "Superadministrador",
  admin: "Administrador",
  user: "Usuario",
  subuser: "Subusuario"
};

const ALL_ROLES: RoleSlug[] = ["superadmin", "admin", "user", "subuser"];
const SCOPABLE_ROLES: RoleSlug[] = ["user", "subuser"];

export function TeamMemberFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useSessionStore((s) => s.token);
  const actorRole = useSessionStore((s) => s.user!.role);
  const actorEffective = useSessionStore((s) => s.effectivePermissions);

  const { data: members = [] } = useTeamQuery();
  const existingMember: User | undefined = isEdit ? members.find((m) => m.id === id) : undefined;
  const { data: events = [] } = useEventsQuery();

  const assignableRoles = ALL_ROLES.filter((role) => canAssignRole(actorRole, role));
  const defaultRole = assignableRoles[assignableRoles.length - 1] ?? actorRole;

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting }
  } = useForm<TeamMemberFormValues>({
    resolver: zodResolver(teamMemberSchema),
    defaultValues: { email: "", fullName: "", role: defaultRole, capabilityKeys: [], eventScopes: [] }
  });

  const selectedRole = watch("role");

  useEffect(() => {
    if (existingMember) {
      reset({
        email: existingMember.email,
        fullName: existingMember.fullName,
        role: existingMember.role,
        capabilityKeys: overridesToCapabilityKeys(existingMember.role, existingMember.permissionOverrides),
        eventScopes: existingMember.eventScopes
      });
    }
  }, [existingMember, reset]);

  // The available capability toggles depend on the role currently in the form. Only clear them
  // when the person picks a different role by hand — not when `reset()` above programmatically
  // sets the role while loading an existing member (reset() doesn't fire this onChange).
  const roleFieldProps = register("role", { onChange: () => setValue("capabilityKeys", []) });

  const configurableCapabilities = getConfigurableCapabilities(selectedRole).filter((capability) =>
    capability.permissions.every((permission) => actorEffective.has(permission))
  );
  const showEventScopes = SCOPABLE_ROLES.includes(selectedRole);

  async function onSubmit(values: TeamMemberFormValues) {
    setSubmitError(null);
    const overrides = capabilityKeysToOverrides(values.role, values.capabilityKeys);
    const eventScopes = showEventScopes ? values.eventScopes : [];
    try {
      if (isEdit) {
        await apiClient.patch(
          `/users/${id}`,
          { role: values.role, permissionOverrides: overrides, eventScopes },
          { token: token! }
        );
        await queryClient.invalidateQueries({ queryKey: ["team"] });
        navigate("/equipo");
      } else {
        const result = await apiClient.post<{ user: User; inviteUrl: string }>(
          "/users/invite",
          { email: values.email, fullName: values.fullName, role: values.role, permissionOverrides: overrides, eventScopes },
          { token: token! }
        );
        await queryClient.invalidateQueries({ queryKey: ["team"] });
        setInviteUrl(result.inviteUrl);
      }
    } catch (e) {
      if (e instanceof AppError) setSubmitError(e.message);
    }
  }

  if (isEdit && !existingMember) return <p className="text-muted-foreground">Cargando…</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">{isEdit ? "Editar persona" : "Invitar persona"}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Correo electrónico
          </label>
          <input
            id="email"
            type="email"
            disabled={isEdit}
            className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm disabled:opacity-60"
            {...register("email")}
          />
          {errors.email && <span role="alert">{errors.email.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-sm font-medium">
            Nombre completo
          </label>
          <input
            id="fullName"
            disabled={isEdit}
            className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm disabled:opacity-60"
            {...register("fullName")}
          />
          {errors.fullName && <span role="alert">{errors.fullName.message}</span>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="role" className="text-sm font-medium">
            Rol
          </label>
          <select id="role" className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm" {...roleFieldProps}>
            {assignableRoles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </div>

        {configurableCapabilities.length > 0 && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Permisos adicionales</legend>
            {configurableCapabilities.map((capability) => (
              <label key={capability.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" value={capability.key} {...register("capabilityKeys")} />
                {capability.label}
              </label>
            ))}
          </fieldset>
        )}

        {showEventScopes && (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Alcance por evento (vacío = todos los tuyos)</legend>
            {events.map((event) => (
              <label key={event.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" value={event.id} {...register("eventScopes")} />
                {event.title}
              </label>
            ))}
          </fieldset>
        )}

        {submitError && <p role="alert">{submitError}</p>}

        <Button type="submit" disabled={isSubmitting} className="self-start">
          {isEdit ? "Guardar cambios" : "Invitar persona"}
        </Button>
      </form>

      {inviteUrl && (
        <div role="status" className="rounded-md border-2 border-foreground bg-surface-alt p-4 text-sm">
          <p className="font-semibold">Invitación creada. Comparte este enlace:</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="break-all">{inviteUrl}</code>
            <Button
              type="button"
              variant="outline"
              className="h-8 px-2 text-xs"
              onClick={() => navigator.clipboard?.writeText(inviteUrl)}
            >
              Copiar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter panel test -- src/features/team/form/TeamMemberFormPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/team/form
git commit -m "feat(panel): add TeamMemberFormPage for inviting and editing team members"
```

---

### Task 8: `InvitationAcceptPage` and `sessionStore.setSession`

**Files:**
- Modify: `apps/panel/src/shared/auth/sessionStore.ts`
- Modify: `apps/panel/src/shared/auth/sessionStore.test.ts`
- Create: `apps/panel/src/features/auth/invitationAcceptSchema.ts`
- Create: `apps/panel/src/features/auth/InvitationAcceptPage.tsx`
- Test: `apps/panel/src/features/auth/InvitationAcceptPage.test.tsx`

**Interfaces:**
- Consumes: `GET /invitations/:token`, `POST /invitations/:token/accept` (Task 5).
- Produces: `useSessionStore().setSession(session)` action (extracted from `login`, so `login` now delegates to it); `InvitationAcceptPage` component. Consumed by Task 9 (routing).

- [ ] **Step 1: Write the failing tests**

In `apps/panel/src/shared/auth/sessionStore.test.ts`, append this test inside the existing `describe("useSessionStore", ...)` block, right after the `"login populates the session..."` test:

```ts
  it("setSession directly authenticates from a session payload (used by the invitation-accept flow)", () => {
    useSessionStore.getState().setSession({
      accessToken: "tok-123",
      user: { id: "user-x", email: "x@example.com", fullName: "X", role: "user", organizationId: "org-1" },
      effectivePermissions: ["events:read"],
      eventScopes: []
    });
    const state = useSessionStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.token).toBe("tok-123");
    expect(localStorage.getItem(TOKEN_KEY)).toBe("tok-123");
  });
```

Create `apps/panel/src/features/auth/InvitationAcceptPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { InvitationAcceptPage } from "./InvitationAcceptPage";

async function createInvite() {
  const { accessToken } = await apiClient.post<{ accessToken: string }>("/auth/login", {
    email: "admin@entraditas.com",
    password: "demo1234"
  });
  const { inviteUrl } = await apiClient.post<{ inviteUrl: string }>(
    "/users/invite",
    { email: "nueva@example.com", fullName: "Nueva Persona", role: "user" },
    { token: accessToken }
  );
  return inviteUrl.split("/invitacion/")[1];
}

function renderPage(token: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/invitacion/${token}`]}>
        <Routes>
          <Route path="/invitacion/:token" element={<InvitationAcceptPage />} />
          <Route path="/eventos" element={<div>Listado de eventos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("InvitationAcceptPage", () => {
  afterEach(() => {
    resetDb();
    localStorage.clear();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows an error for an invalid token, without a form", async () => {
    renderPage("no-existe");
    await waitFor(() => expect(screen.getByText("Invitación no disponible")).toBeInTheDocument());
    expect(screen.queryByLabelText("Contraseña")).not.toBeInTheDocument();
  });

  it("accepting a valid invitation logs the person in and redirects to /eventos", async () => {
    const token = await createInvite();
    renderPage(token);
    await waitFor(() => expect(screen.getByLabelText("Contraseña")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "nueva1234" } });
    fireEvent.change(screen.getByLabelText("Confirma la contraseña"), { target: { value: "nueva1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Activar mi cuenta" }));

    await waitFor(() => expect(screen.getByText("Listado de eventos")).toBeInTheDocument());
    expect(useSessionStore.getState().status).toBe("authenticated");
  });

  it("shows a validation error when the passwords don't match", async () => {
    const token = await createInvite();
    renderPage(token);
    await waitFor(() => expect(screen.getByLabelText("Contraseña")).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "nueva1234" } });
    fireEvent.change(screen.getByLabelText("Confirma la contraseña"), { target: { value: "otra-cosa" } });
    fireEvent.click(screen.getByRole("button", { name: "Activar mi cuenta" }));

    await waitFor(() => expect(screen.getByText("Las contraseñas no coinciden")).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter panel test -- src/shared/auth/sessionStore.test.ts src/features/auth/InvitationAcceptPage.test.tsx`
Expected: FAIL — `setSession` doesn't exist, and `InvitationAcceptPage` doesn't exist yet.

- [ ] **Step 3: Implement `setSession` and `InvitationAcceptPage`**

Replace the full contents of `apps/panel/src/shared/auth/sessionStore.ts` with:

```ts
import { create } from "zustand";
import { apiClient } from "@/shared/lib/apiClient";
import type { RoleSlug } from "@entraditas/types";

const TOKEN_STORAGE_KEY = "entraditas.panel.devToken";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleSlug;
  organizationId: string | null;
}

interface SessionResponse {
  accessToken?: string;
  user: SessionUser;
  effectivePermissions: string[];
  eventScopes: string[];
}

interface SessionState {
  token: string | null;
  user: SessionUser | null;
  effectivePermissions: Set<string>;
  eventScopes: string[];
  status: "idle" | "authenticated" | "unauthenticated";
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  setSession: (session: SessionResponse) => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  effectivePermissions: new Set(),
  eventScopes: [],
  status: "idle",

  setSession(session) {
    localStorage.setItem(TOKEN_STORAGE_KEY, session.accessToken!);
    set({
      token: session.accessToken!,
      user: session.user,
      effectivePermissions: new Set(session.effectivePermissions),
      eventScopes: session.eventScopes,
      status: "authenticated"
    });
  },

  async login(email, password) {
    const result = await apiClient.post<SessionResponse>("/auth/login", { email, password });
    get().setSession(result);
  },

  async logout() {
    const token = get().token;
    if (token) {
      await apiClient.post("/auth/logout", undefined, { token }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated" });
  },

  async restore() {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }
    try {
      const result = await apiClient.get<SessionResponse>("/auth/me", { token });
      set({
        token,
        user: result.user,
        effectivePermissions: new Set(result.effectivePermissions),
        eventScopes: result.eventScopes,
        status: "authenticated"
      });
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ status: "unauthenticated" });
    }
  }
}));
```

Create `apps/panel/src/features/auth/invitationAcceptSchema.ts`:

```ts
import { z } from "zod";

export const invitationAcceptSchema = z
  .object({
    password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la contraseña")
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"]
  });

export type InvitationAcceptFormValues = z.infer<typeof invitationAcceptSchema>;
```

Create `apps/panel/src/features/auth/InvitationAcceptPage.tsx`:

```tsx
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { invitationAcceptSchema, type InvitationAcceptFormValues } from "./invitationAcceptSchema";

interface InvitationDetails {
  email: string;
  fullName: string;
  organizationName: string;
  role: string;
}

interface AcceptSessionResponse {
  accessToken: string;
  user: { id: string; email: string; fullName: string; role: "superadmin" | "admin" | "user" | "subuser"; organizationId: string | null };
  effectivePermissions: string[];
  eventScopes: string[];
}

export function InvitationAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const setSession = useSessionStore((s) => s.setSession);
  const [acceptError, setAcceptError] = useState<string | null>(null);

  const { data: details, error, isLoading } = useQuery({
    queryKey: ["invitation", token],
    queryFn: () => apiClient.get<InvitationDetails>(`/invitations/${token}`),
    retry: false
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<InvitationAcceptFormValues>({ resolver: zodResolver(invitationAcceptSchema) });

  async function onSubmit(values: InvitationAcceptFormValues) {
    setAcceptError(null);
    try {
      const result = await apiClient.post<AcceptSessionResponse>(`/invitations/${token}/accept`, {
        password: values.password
      });
      setSession(result);
      navigate("/eventos");
    } catch (e) {
      if (e instanceof AppError) setAcceptError(e.message);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;

  if (error instanceof AppError) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-surface p-8 shadow-flat text-center">
          <p className="font-display text-2xl font-semibold">Invitación no disponible</p>
          <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        </div>
      </div>
    );
  }

  if (!details) return null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-surface p-8 shadow-flat">
        <p className="font-display text-2xl font-semibold text-primary">entraditas</p>
        <h1 className="mt-1 text-sm text-muted-foreground">
          Te han invitado a unirte a {details.organizationName}, {details.fullName}
        </h1>

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-sm font-medium">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm"
              {...register("password")}
            />
            {errors.password && <span role="alert">{errors.password.message}</span>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="confirmPassword" className="text-sm font-medium">
              Confirma la contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm"
              {...register("confirmPassword")}
            />
            {errors.confirmPassword && <span role="alert">{errors.confirmPassword.message}</span>}
          </div>

          {acceptError && <p role="alert">{acceptError}</p>}

          <Button type="submit" disabled={isSubmitting} className="mt-2">
            Activar mi cuenta
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter panel test -- src/shared/auth/sessionStore.test.ts src/features/auth/InvitationAcceptPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/shared/auth/sessionStore.ts apps/panel/src/shared/auth/sessionStore.test.ts apps/panel/src/features/auth/InvitationAcceptPage.tsx apps/panel/src/features/auth/InvitationAcceptPage.test.tsx apps/panel/src/features/auth/invitationAcceptSchema.ts
git commit -m "feat(panel): add InvitationAcceptPage and sessionStore.setSession"
```

---

### Task 9: Router wiring

**Files:**
- Modify: `apps/panel/src/app/router.tsx`
- Modify: `apps/panel/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `TeamListPage` (Task 6), `TeamMemberFormPage` (Task 7), `InvitationAcceptPage` (Task 8), `RequirePermission`, `NAV_ITEMS` (all pre-existing).
- Produces: routes `/equipo`, `/equipo/invitar`, `/equipo/:id/editar` (guarded by `users:manage`), `/invitacion/:token` (public).

- [ ] **Step 1: Write the failing tests**

In `apps/panel/src/app/router.test.tsx`, append these tests inside the existing `describe("AppRoutes", ...)` block:

```ts
  it("requires users:manage to view /equipo, redirecting to /sin-acceso otherwise", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "user", organizationId: "org-1" },
      effectivePermissions: new Set(["events:read"]),
      eventScopes: []
    });
    renderApp(["/equipo"]);
    await waitFor(() => expect(screen.getByText("No tienes acceso a esta sección.")).toBeInTheDocument());
  });

  it("shows the team list to an admin at /equipo", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["events:read", "users:manage"]),
      eventScopes: []
    });
    renderApp(["/equipo"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Equipo" })).toBeInTheDocument());
  });

  it("renders the invitation-accept page for an unauthenticated visitor", async () => {
    renderApp(["/invitacion/some-token"]);
    await waitFor(() => expect(screen.getByText("Invitación no disponible")).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter panel test -- src/app/router.test.tsx`
Expected: FAIL — `/equipo` and `/invitacion/:token` currently render the generic `PlaceholderPage` (or nothing), not the real pages.

- [ ] **Step 3: Wire the routes**

Replace the full contents of `apps/panel/src/app/router.tsx` with:

```tsx
import { useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { InvitationAcceptPage } from "@/features/auth/InvitationAcceptPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { EventDetailPage } from "@/features/events/detail/EventDetailPage";
import { EventsListPage } from "@/features/events/list/EventsListPage";
import { EventWizardPage } from "@/features/events/wizard/EventWizardPage";
import { PlaceholderPage } from "@/features/placeholder/PlaceholderPage";
import { TeamMemberFormPage } from "@/features/team/form/TeamMemberFormPage";
import { TeamListPage } from "@/features/team/list/TeamListPage";
import { RequirePermission } from "@/shared/auth/RequirePermission";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AuthLayout } from "./layouts/AuthLayout";
import { PanelLayout } from "./layouts/PanelLayout";
import { NAV_ITEMS } from "./navItems";

const PLACEHOLDER_PATHS = new Set(["/eventos", "/equipo"]);

export function AppRoutes() {
  const status = useSessionStore((s) => s.status);
  const restore = useSessionStore((s) => s.restore);

  useEffect(() => {
    if (status === "idle") void restore();
  }, [status, restore]);

  if (status === "idle") return <div>Cargando…</div>;

  if (status !== "authenticated") {
    return (
      <Routes>
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/invitacion/:token" element={<InvitationAcceptPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Navigate to="/eventos" replace />} />
        <Route path="/invitacion/:token" element={<Navigate to="/eventos" replace />} />
      </Route>
      <Route element={<PanelLayout />}>
        {NAV_ITEMS.filter((item) => !PLACEHOLDER_PATHS.has(item.path)).map((item) => (
          <Route key={item.path} element={<RequirePermission permission={item.permission} />}>
            <Route path={`${item.path}/*`} element={<PlaceholderPage title={item.label} />} />
          </Route>
        ))}
        <Route element={<RequirePermission permission="events:read" />}>
          <Route path="/eventos" element={<EventsListPage />} />
        </Route>
        <Route element={<RequirePermission permission="events:create" />}>
          <Route path="/eventos/nuevo/editar" element={<EventWizardPage />} />
          <Route path="/eventos/:id/editar" element={<EventWizardPage />} />
        </Route>
        <Route element={<RequirePermission permission="events:read" />}>
          <Route path="/eventos/:id" element={<EventDetailPage />} />
        </Route>
        <Route element={<RequirePermission permission="users:manage" />}>
          <Route path="/equipo" element={<TeamListPage />} />
          <Route path="/equipo/invitar" element={<TeamMemberFormPage />} />
          <Route path="/equipo/:id/editar" element={<TeamMemberFormPage />} />
        </Route>
        <Route path="/sin-acceso" element={<div>No tienes acceso a esta sección.</div>} />
        <Route path="/" element={<Navigate to="/eventos" replace />} />
      </Route>
    </Routes>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter panel test -- src/app/router.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full panel test suite**

Run: `pnpm --filter panel test`
Expected: PASS (all suites, including every pre-existing test — the `NAV_ITEMS` filter change and the `subuser` base-permission change are the only edits touching shared code paths, and both are covered by the tests updated in Tasks 2, 3, and this task).

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/app/router.tsx apps/panel/src/app/router.test.tsx
git commit -m "feat(panel): wire up Equipo and invitation-accept routes"
```
