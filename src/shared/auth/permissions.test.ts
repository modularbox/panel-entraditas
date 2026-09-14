import { describe, expect, it } from "vitest";
import { CAPABILITIES, canAssignRole, hasPermission, resolveEffectivePermissions, ROLE_BASE_PERMISSIONS } from "./permissions";

describe("resolveEffectivePermissions", () => {
  it("returns exactly the role's base permissions with no overrides", () => {
    const effective = resolveEffectivePermissions("subuser", []);
    expect([...effective].sort()).toEqual([...ROLE_BASE_PERMISSIONS.subuser].sort());
  });

  it("gives a subuser no access until the admin grants it", () => {
    const effective = resolveEffectivePermissions("subuser", []);
    expect(effective.size).toBe(0);
    expect(effective.has("events:read")).toBe(false);
    expect(effective.has("scan:validate")).toBe(false);
  });

  it("adds a permission granted via an allow override", () => {
    const effective = resolveEffectivePermissions("subuser", [{ permission: "users:manage", effect: "allow" }]);
    expect(effective.has("users:manage")).toBe(true);
  });

  it("removes a base permission via a deny override", () => {
    const effective = resolveEffectivePermissions("admin", [{ permission: "orders:refund", effect: "deny" }]);
    expect(effective.has("orders:refund")).toBe(false);
  });

  it("deny always wins over allow for the same permission", () => {
    const effective = resolveEffectivePermissions("subuser", [
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

  it("admin sees everything of its own organization", () => {
    const effective = resolveEffectivePermissions("admin", []);
    expect(effective.has("events:read")).toBe(true);
    expect(effective.has("orders:read")).toBe(true);
    expect(effective.has("reports:read")).toBe(true);
    expect(effective.has("users:manage")).toBe(true);
    // The one deliberately withheld permission: cross-tenant organization management.
    expect(effective.has("organizations:manage")).toBe(false);
  });

  it("user and subuser start empty and gain guestlist permissions only when granted", () => {
    const user = resolveEffectivePermissions("user", []);
    expect(user.has("guestlist:manage")).toBe(false);
    const subuserWithGrant = resolveEffectivePermissions("subuser", [{ permission: "guestlist:read", effect: "allow" }]);
    expect(subuserWithGrant.has("guestlist:read")).toBe(true);
    expect(subuserWithGrant.has("guestlist:manage")).toBe(false);
  });
});

describe("hasPermission", () => {
  const effective = resolveEffectivePermissions("user", [{ permission: "events:read", effect: "allow" }]);

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
  it("is fixed for admin/superadmin and configurable for user, fixed_no for subuser", () => {
    const sellTickets = CAPABILITIES.find((c) => c.key === "sell_tickets")!;
    expect(sellTickets.accessByRole.superadmin).toBe("fixed_yes");
    expect(sellTickets.accessByRole.admin).toBe("fixed_yes");
    expect(sellTickets.accessByRole.user).toBe("configurable");
    expect(sellTickets.accessByRole.subuser).toBe("fixed_no");
  });

  it("admin and superadmin have orders:create in their base permissions, user and subuser do not", () => {
    expect(ROLE_BASE_PERMISSIONS.admin.includes("orders:create")).toBe(true);
    expect(ROLE_BASE_PERMISSIONS.superadmin.includes("orders:create")).toBe(true);
    expect((ROLE_BASE_PERMISSIONS.user as readonly string[]).includes("orders:create")).toBe(false);
    expect((ROLE_BASE_PERMISSIONS.subuser as readonly string[]).includes("orders:create")).toBe(false);
  });

  it("manage_team is never configurable for user or subuser", () => {
    const manageTeam = CAPABILITIES.find((c) => c.key === "manage_team")!;
    expect(manageTeam.accessByRole.user).toBe("fixed_no");
    expect(manageTeam.accessByRole.subuser).toBe("fixed_no");
    expect(manageTeam.accessByRole.admin).toBe("fixed_yes");
  });
});

describe("canAssignRole", () => {
  it("lets an admin assign user and subuser (never another admin)", () => {
    expect(canAssignRole("admin", "user")).toBe(true);
    expect(canAssignRole("admin", "subuser")).toBe(true);
    expect(canAssignRole("admin", "admin")).toBe(false);
  });

  it("lets a user or subuser assign nothing above itself", () => {
    expect(canAssignRole("user", "superadmin")).toBe(false);
    expect(canAssignRole("user", "admin")).toBe(false);
    expect(canAssignRole("subuser", "superadmin")).toBe(false);
    expect(canAssignRole("subuser", "admin")).toBe(false);
  });
});
