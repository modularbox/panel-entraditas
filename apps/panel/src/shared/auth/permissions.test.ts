import { describe, expect, it } from "vitest";
import { hasPermission, resolveEffectivePermissions, ROLE_BASE_PERMISSIONS } from "./permissions";

describe("resolveEffectivePermissions", () => {
  it("returns exactly the role's base permissions with no overrides", () => {
    const effective = resolveEffectivePermissions("user", []);
    expect([...effective].sort()).toEqual([...ROLE_BASE_PERMISSIONS.user].sort());
  });

  it("adds a permission granted via an allow override", () => {
    const effective = resolveEffectivePermissions("user", [{ permission: "events:publish", effect: "allow" }]);
    expect(effective.has("events:publish")).toBe(true);
  });

  it("removes a base permission via a deny override", () => {
    const effective = resolveEffectivePermissions("admin", [{ permission: "orders:refund", effect: "deny" }]);
    expect(effective.has("orders:refund")).toBe(false);
  });

  it("deny always wins over allow for the same permission", () => {
    const effective = resolveEffectivePermissions("user", [
      { permission: "finance:read", effect: "allow" },
      { permission: "finance:read", effect: "deny" }
    ]);
    expect(effective.has("finance:read")).toBe(false);
  });

  it("subuser has a narrow default permission set", () => {
    const effective = resolveEffectivePermissions("subuser", []);
    expect(effective.has("events:read")).toBe(true);
    expect(effective.has("scan:validate")).toBe(true);
    expect(effective.has("finance:read")).toBe(false);
    expect(effective.has("events:publish")).toBe(false);
  });
});

describe("hasPermission", () => {
  const effective = resolveEffectivePermissions("user", []);

  it("returns false when the permission is not in the effective set", () => {
    expect(hasPermission(effective, "finance:read")).toBe(false);
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
