import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { ROLE_BASE_PERMISSIONS, type Permission } from "@/shared/auth/permissions";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { PanelLayout } from "./PanelLayout";

function renderLayout() {
  return render(
    <MemoryRouter initialEntries={["/eventos"]}>
      <Routes>
        <Route element={<PanelLayout />}>
          <Route path="/eventos" element={<div>Contenido</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function setRole(role: keyof typeof ROLE_BASE_PERMISSIONS) {
  useSessionStore.setState({ effectivePermissions: new Set<Permission>(ROLE_BASE_PERMISSIONS[role]), eventScopes: [] });
}

describe("PanelLayout navigation", () => {
  afterEach(() => useSessionStore.setState({ user: null, effectivePermissions: new Set(), eventScopes: [] }));

  it("shows the logged-in user's fullName below the logo", () => {
    setRole("admin");
    useSessionStore.setState({
      user: { id: "user-admin", email: "admin@entraditas.com", fullName: "Admin de Producciones Norte", role: "admin", organizationId: "org-1" }
    });
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
});
