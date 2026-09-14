import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { ThemeManager } from "./theme";

describe("ThemeManager", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.theme;
    useSessionStore.setState({
      token: null,
      user: null,
      effectivePermissions: new Set(),
      eventScopes: [],
      status: "idle"
    });
  });

  it("applies the superadmin dark-blue theme when the logged-in user is superadmin", () => {
    useSessionStore.setState({
      user: {
        id: "user-superadmin",
        email: "superadmin@entraditas.com",
        fullName: "Super Admin",
        role: "superadmin",
        organizationId: null
      },
      status: "authenticated"
    });
    render(<ThemeManager />);
    expect(document.documentElement.dataset.theme).toBe("superadmin");
  });

  it("uses the default theme for admin users", () => {
    useSessionStore.setState({
      user: {
        id: "user-admin",
        email: "admin@entraditas.com",
        fullName: "Admin",
        role: "admin",
        organizationId: "org-1"
      },
      status: "authenticated"
    });
    render(<ThemeManager />);
    expect(document.documentElement.dataset.theme).toBe("default");
  });

  it("resets to the default theme when there is no session", () => {
    render(<ThemeManager />);
    expect(document.documentElement.dataset.theme).toBe("default");
  });
});