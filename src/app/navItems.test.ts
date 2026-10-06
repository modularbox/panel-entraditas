import { describe, expect, it } from "vitest";
import { getAccessibleNavItems, getDefaultSectionPath } from "./navItems";

describe("accessible navigation", () => {
  it("shows only sections allowed by the session and starts at the first one", () => {
    const permissions = new Set(["scan:validate", "reports:read"]);

    // "scan:validate" ya no tiene seccion: el control de accesos se quito del panel.
    expect(getAccessibleNavItems(permissions).map((item) => item.path)).toEqual(["/dashboard"]);
    expect(getDefaultSectionPath(permissions)).toBe("/dashboard");
  });

  it("returns no default section when the session has no navigable permissions", () => {
    expect(getAccessibleNavItems(new Set(["orders:create"]))).toEqual([]);
    expect(getDefaultSectionPath(new Set())).toBeNull();
  });

  it("cada seccion sale una vez y en el orden del menu", () => {
    const todas = new Set(["reports:read", "events:read", "orders:read", "organizations:manage", "users:manage", "trash:manage"]);

    expect(getAccessibleNavItems(todas).map((item) => item.path)).toEqual([
      "/dashboard",
      "/eventos",
      "/ventas",
      "/clientes",
      "/organizaciones",
      "/equipo",
      "/papelera"
    ]);
    expect(getDefaultSectionPath(todas)).toBe("/dashboard");
  });
});