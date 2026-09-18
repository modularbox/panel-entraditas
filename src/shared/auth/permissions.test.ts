import { describe, expect, it } from "vitest";
import { CAPABILITIES, canAssignRole, getConfigurableCapabilities, hasPermission, resolveEffectivePermissions, ROLE_BASE_PERMISSIONS } from "./permissions";

describe("resolveEffectivePermissions", () => {
  it("returns exactly the role's base permissions with no overrides", () => {
    const effective = resolveEffectivePermissions("suborganizador", []);
    expect([...effective].sort()).toEqual([...ROLE_BASE_PERMISSIONS.suborganizador].sort());
  });

  it("gives a suborganizador no access until the organizador grants it", () => {
    const effective = resolveEffectivePermissions("suborganizador", []);
    expect(effective.size).toBe(0);
    expect(effective.has("events:read")).toBe(false);
    expect(effective.has("scan:validate")).toBe(false);
  });

  it("adds a permission granted via an allow override", () => {
    const effective = resolveEffectivePermissions("suborganizador", [{ permission: "users:manage", effect: "allow" }]);
    expect(effective.has("users:manage")).toBe(true);
  });

  it("removes a base permission via a deny override", () => {
    const effective = resolveEffectivePermissions("organizador", [{ permission: "orders:refund", effect: "deny" }]);
    expect(effective.has("orders:refund")).toBe(false);
  });

  it("deny always wins over allow for the same permission", () => {
    const effective = resolveEffectivePermissions("suborganizador", [
      { permission: "orders:refund", effect: "allow" },
      { permission: "orders:refund", effect: "deny" }
    ]);
    expect(effective.has("orders:refund")).toBe(false);
  });

  it("superadmin does not manage the team", () => {
    const effective = resolveEffectivePermissions("superadmin", []);
    expect(effective.has("users:manage")).toBe(false);
    expect(effective.has("organizations:manage")).toBe(true);
  });

  it("organizador sees everything of its own organization", () => {
    const effective = resolveEffectivePermissions("organizador", []);
    expect(effective.has("events:read")).toBe(true);
    expect(effective.has("orders:read")).toBe(true);
    expect(effective.has("reports:read")).toBe(true);
    expect(effective.has("users:manage")).toBe(true);
    // The one deliberately withheld permission: cross-tenant organization management.
    expect(effective.has("organizations:manage")).toBe(false);
  });

  it("a suborganizador starts empty and gains guestlist permissions only when granted", () => {
    const sub = resolveEffectivePermissions("suborganizador", []);
    expect(sub.has("guestlist:manage")).toBe(false);
    const withGrant = resolveEffectivePermissions("suborganizador", [{ permission: "guestlist:read", effect: "allow" }]);
    expect(withGrant.has("guestlist:read")).toBe(true);
    expect(withGrant.has("guestlist:manage")).toBe(false);
  });
});

describe("hasPermission", () => {
  const effective = resolveEffectivePermissions("suborganizador", [{ permission: "events:read", effect: "allow" }]);

  it("returns false when the permission is not in the effective set", () => {
    expect(hasPermission(effective, "users:manage")).toBe(false);
  });

  it("returns true with no eventScopes restriction (access to every event of the org)", () => {
    expect(hasPermission(effective, "events:read", { eventId: "evt-99", eventScopes: [] })).toBe(true);
  });

  it("returns false when eventScopes is non-empty and the event is not in it", () => {
    expect(
      hasPermission(effective, "events:read", { eventId: "evt-99", eventScopes: ["evt-1", "evt-2"] })
    ).toBe(false);
  });

  it("returns true when eventScopes is non-empty and the event is in it", () => {
    expect(
      hasPermission(effective, "events:read", { eventId: "evt-1", eventScopes: ["evt-1", "evt-2"] })
    ).toBe(true);
  });
});

describe("sell_tickets capability", () => {
  it("is fixed for organizador/superadmin and configurable for suborganizador", () => {
    const sellTickets = CAPABILITIES.find((c) => c.key === "sell_tickets")!;
    expect(sellTickets.accessByRole.superadmin).toBe("fixed_yes");
    expect(sellTickets.accessByRole.organizador).toBe("fixed_yes");
    expect(sellTickets.accessByRole.suborganizador).toBe("configurable");
  });

  it("organizador and superadmin have orders:create in their base permissions, a suborganizador does not", () => {
    expect(ROLE_BASE_PERMISSIONS.organizador.includes("orders:create")).toBe(true);
    expect(ROLE_BASE_PERMISSIONS.superadmin.includes("orders:create")).toBe(true);
    expect((ROLE_BASE_PERMISSIONS.suborganizador as readonly string[]).includes("orders:create")).toBe(false);
  });

  it("manage_team is never configurable for a suborganizador", () => {
    const manageTeam = CAPABILITIES.find((c) => c.key === "manage_team")!;
    expect(manageTeam.accessByRole.suborganizador).toBe("fixed_no");
    expect(manageTeam.accessByRole.organizador).toBe("fixed_yes");
  });

  /**
   * Los cuatro roles pasaron a tres juntando `user` y `subuser` en `suborganizador`. El antiguo
   * personal de puerta era un `subuser` cuya única casilla marcable era escanear, así que tiene
   * que seguir existiendo: un suborganizador con solo "Escanear entradas" concedido.
   */
  it("keeps the old door-staff shape: a suborganizador can be scan-only", () => {
    const configurables = getConfigurableCapabilities("suborganizador").map((capability) => capability.key);
    expect(configurables).toContain("scan_tickets");

    const puerta = resolveEffectivePermissions("suborganizador", [{ permission: "scan:validate", effect: "allow" }]);
    expect(puerta.has("scan:validate")).toBe(true);
    expect(puerta.has("orders:refund")).toBe(false);
    expect(puerta.has("users:manage")).toBe(false);
    expect(puerta.has("organizations:manage")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("lets an organizador assign suborganizador (never another organizador)", () => {
    expect(canAssignRole("organizador", "suborganizador")).toBe(true);
    expect(canAssignRole("organizador", "organizador")).toBe(false);
  });

  it("lets a suborganizador assign nothing above itself", () => {
    expect(canAssignRole("suborganizador", "superadmin")).toBe(false);
    expect(canAssignRole("suborganizador", "organizador")).toBe(false);
  });

  it("only the superadmin can name an organizador", () => {
    expect(canAssignRole("superadmin", "organizador")).toBe(true);
  });
});
