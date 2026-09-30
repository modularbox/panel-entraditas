import { describe, expect, it } from "vitest";
import { getAccessibleNavItems, getDefaultSectionPath } from "./navItems";

describe("accessible navigation", () => {
  it("shows only sections allowed by the session and starts at the first one", () => {
    const permissions = new Set(["scan:validate", "reports:read"]);

    expect(getAccessibleNavItems(permissions).map((item) => item.path)).toEqual(["/dashboard", "/accesos"]);
    expect(getDefaultSectionPath(permissions)).toBe("/dashboard");
  });

  it("returns no default section when the session has no navigable permissions", () => {
    expect(getAccessibleNavItems(new Set(["orders:create"]))).toEqual([]);
    expect(getDefaultSectionPath(new Set())).toBeNull();
  });
});