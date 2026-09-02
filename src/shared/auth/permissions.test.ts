import { describe, expect, it } from "vitest";
import { CAPABILITIES, hasPermission, resolveEffectivePermissions, ROLE_BASE_PERMISSIONS } from "./permissions";

describe("resolveEffectivePermissions", () => {
  it("returns exactly the role's base permissions with no overrides", () => {
    const effective = resolveEffectivePermissions("user", []);
    expect([...effective].sort()).toEqual([...ROLE_BASE_PERMISSIONS.user].sort());
  });

  it("adds a permission granted via an allow override", () => {
    const effective = resolveEffectivePermissions("user", [{ permission: "users:manage", effect: "allow" }]);
    expect(effective.has("users:manage")).toBe(true);
  });

  it("removes a base permission via a deny override", () => {
    const effective = resolveEffectivePermissions("admin", [{ permission: "orders:refund", effect: "deny" }]);
    expect(effective.has("orders:refund")).toBe(false);
  });

  it("deny always wins over allow for the same permission", () => {
    const effective = resolveEffectivePermissions("user", [
      { permission: "orders:refund", effect: "allow" },
      { permission: "orders:refund", effect: "deny" }
    ]);
    expect(effective.has("orders:refund")).toBe(false);
  });

  it("subuser has a narrow default permission set", () => {
    const effective = resolveEffectivePermissions("subuser", []);
    expect(effective.has("events:read")).toBe(true);
    expect(effective.has("scan:validate")).toBe(true);
    expect(effective.has("orders:refund")).toBe(false);
    expect(effective.has("users:manage")).toBe(false);
  });

  it("superadmin does not manage the team", () => {
    const effective = resolveEffectivePermissions("superadmin", []);
    expect(effective.has("users:manage")).toBe(false);
    expect(effective.has("users:read")).toBe(true);
  });
});

describe("hasPermission", () => {
  const effective = resolveEffectivePermissions("user", []);

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
  it("is fixed for admin/superadmin and configurable for user/subuser", () => {
    const sellTickets = CAPABILITIES.find((c) => c.key === "sell_tickets")!;
    expect(sellTickets.accessByRole.superadmin).toBe("fixed_yes");
    expect(sellTickets.accessByRole.admin).toBe("fixed_yes");
    expect(sellTickets.accessByRole.user).toBe("configurable");
    expect(sellTickets.accessByRole.subuser).toBe("configurable");
  });

  it("admin and superadmin have orders:create in their base permissions, user does not", () => {
    expect(ROLE_BASE_PERMISSIONS.admin.includes("orders:create")).toBe(true);
    expect(ROLE_BASE_PERMISSIONS.superadmin.includes("orders:create")).toBe(true);
    expect((ROLE_BASE_PERMISSIONS.user as readonly string[]).includes("orders:create")).toBe(false);
  });
});
