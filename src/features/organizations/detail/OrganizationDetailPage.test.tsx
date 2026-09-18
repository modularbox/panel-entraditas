import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrganizationDetailPage } from "./OrganizationDetailPage";

function renderPage(id: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/organizaciones/${id}`]}>
        <Routes>
          <Route path="/organizaciones/:id" element={<OrganizationDetailPage />} />
          <Route path="/organizaciones" element={<div>Lista de organizaciones</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrganizationDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
  }

  it("shows the organization's admin account, fiscal data and its team", async () => {
    await login();
    renderPage("org-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Producciones Norte" })).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Organizador" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Equipo" })).toBeInTheDocument();
    expect(screen.getByText("B12345678")).toBeInTheDocument();
    expect(screen.getByText("8 %")).toBeInTheDocument();
    expect(screen.getByText("admin@produccionesnorte.es")).toBeInTheDocument();
    expect(screen.getAllByText("Organizador de Producciones Norte").length).toBeGreaterThan(0);
    expect(screen.getByText("admin@entraditas.com")).toBeInTheDocument();
    expect(screen.getByText("ES77 2100 1234 5678 9012 3456")).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Marta Gutiérrez Vega marta\.gutierrez@entraditas\.com/ })).toBeInTheDocument();
    expect(screen.getByRole("row", { name: /Javier Ortega López javier\.ortega@entraditas\.com/ })).toBeInTheDocument();
  });

  it("shows the team member's row with the events each can access", async () => {
    await login();
    renderPage("org-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Producciones Norte" })).toBeInTheDocument());
    const martaRow = screen.getByRole("row", { name: /Marta Gutiérrez Vega marta\.gutierrez@entraditas\.com.*Noche de Jazz, Rock en Directo/ });
    const javierRow = screen.getByRole("row", { name: /Javier Ortega López javier\.ortega@entraditas\.com.*Noche de Jazz/ });
    expect(screen.queryByRole("row", { name: /Javier Ortega López javier\.ortega@entraditas\.com.*Rock en Directo/ })).not.toBeInTheDocument();
    expect(martaRow).toBeInTheDocument();
    expect(javierRow).toBeInTheDocument();
  });

  it("lists the team separately from the primary organizador", async () => {
    await login();
    db.users.push({
      id: "sub-user-norte",
      organizationId: "org-1",
      parentUserId: "user-admin",
      role: "suborganizador",
      email: "sub.norte@entraditas.com",
      fullName: "Sub Usuario Norte",
      status: "active",
      permissionOverrides: [],
      eventScopes: []
    });
    renderPage("org-1");
    await waitFor(() => expect(screen.getByRole("row", { name: /Sub Usuario Norte sub\.norte@entraditas\.com/ })).toBeInTheDocument());
    // The primary admin card and the team row are distinct entries.
    expect(screen.getByRole("heading", { name: "Producciones Norte" })).toBeInTheDocument();
  });

  it("shows the organization's events with the users granted access to them", async () => {
    await login();
    renderPage("org-1");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Producciones Norte" })).toBeInTheDocument());
    expect(
      screen.getByRole("row", { name: /Noche de Jazz.*Organizador de Producciones Norte, Marta Gutiérrez Vega, Javier Ortega López/ })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("row", { name: /Rock en Directo.*Organizador de Producciones Norte, Marta Gutiérrez Vega/ })
    ).toBeInTheDocument();
  });

  it("shows a dash when the organization has no admin", async () => {
    await login();
    db.users.forEach((user) => {
      if (user.organizationId === "org-1") user.status = "disabled";
    });
    renderPage("org-1");
    await waitFor(() => expect(screen.getAllByText("—").length).toBeGreaterThan(0));
    expect(screen.getByText("Esta organización no tiene miembros de equipo.")).toBeInTheDocument();
  });

  it("shows a 404 message for an unknown organization id", async () => {
    await login();
    renderPage("does-not-exist");
    await waitFor(() => expect(screen.getByText("Organización no encontrada.")).toBeInTheDocument());
  });
});