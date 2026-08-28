import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLE_BASE_PERMISSIONS, type Permission } from "@/shared/auth/permissions";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { db, resetDb, sessions, STORAGE_KEY } from "@/mocks/state";
import type { SessionUser } from "@/shared/auth/sessionStore";
import { PanelLayout } from "./PanelLayout";

const superAdminUser: SessionUser = { id: "user-superadmin", email: "superadmin@entraditas.com", fullName: "Super Admin", role: "superadmin", organizationId: null };
const adminUser: SessionUser = { id: "user-admin", email: "admin@entraditas.com", fullName: "Admin de Producciones Norte", role: "admin", organizationId: "org-1" };

function renderLayout() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/eventos"]}>
        <Routes>
          <Route element={<PanelLayout />}>
            <Route path="/eventos" element={<div>Contenido</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setRole(role: keyof typeof ROLE_BASE_PERMISSIONS) {
  useSessionStore.setState({ effectivePermissions: new Set<Permission>(ROLE_BASE_PERMISSIONS[role]), eventScopes: [] });
}

describe("PanelLayout navigation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDb();
    useSessionStore.setState({ user: null, token: null, effectivePermissions: new Set(), eventScopes: [] });
  });

  it("shows the logged-in user's fullName below the logo", () => {
    setRole("admin");
    useSessionStore.setState({ user: adminUser });
    renderLayout();
    expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("Entraditas")).toBeInTheDocument();
  });

  it("shows 8 sections to a superadmin (no Equipo)", () => {
    setRole("superadmin");
    renderLayout();
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(screen.getByRole("link", { name: "Organizaciones" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Equipo" })).not.toBeInTheDocument();
  });

  it("shows 8 sections to an admin (no Organizaciones)", () => {
    setRole("admin");
    renderLayout();
    expect(screen.getAllByRole("link")).toHaveLength(8);
    expect(screen.queryByRole("link", { name: "Organizaciones" })).not.toBeInTheDocument();
  });

  it("shows 5 sections to a user", () => {
    setRole("user");
    renderLayout();
    const labels = screen.getAllByRole("link").map((el) => el.textContent).sort();
    expect(labels).toEqual(["Control de accesos", "Dashboard", "Eventos", "Informes", "Ventas"]);
  });

  it("shows only Eventos and Control de accesos to a subuser", () => {
    setRole("subuser");
    renderLayout();
    const labels = screen.getAllByRole("link").map((el) => el.textContent).sort();
    expect(labels).toEqual(["Control de accesos", "Eventos"]);
  });

  it("shows the reset data button only to a superadmin", () => {
    setRole("superadmin");
    useSessionStore.setState({ user: superAdminUser });
    renderLayout();
    expect(screen.getByRole("button", { name: "Restablecer datos" })).toBeInTheDocument();
  });

  it("hides the reset data button for non-superadmin roles", () => {
    setRole("admin");
    useSessionStore.setState({ user: adminUser });
    renderLayout();
    expect(screen.queryByRole("button", { name: "Restablecer datos" })).not.toBeInTheDocument();
  });

  it("resets the demo data from the button but keeps the superadmin logged in", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setRole("superadmin");
    useSessionStore.setState({ user: superAdminUser, token: "token-superadmin" });
    renderLayout();
    db.events[0]!.title = "Título editado";
    fireEvent.click(screen.getByRole("button", { name: "Restablecer datos" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(db.events[0]!.title).not.toBe("Título editado");
    expect(db.events).toHaveLength(5);
    expect(sessions.get("token-superadmin")).toBe("user-superadmin");
  });
});