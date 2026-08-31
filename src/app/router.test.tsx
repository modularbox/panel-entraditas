import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AppRoutes } from "./router";

function renderApp(initialEntries: string[]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AppRoutes", () => {
  afterEach(() => {
    resetDb();
    localStorage.clear();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("redirects an unauthenticated visitor to /login", async () => {
    renderApp(["/eventos"]);
    await waitFor(() => expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument());
  });

  it("shows the Eventos placeholder to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["events:read"]),
      eventScopes: []
    });
    renderApp(["/eventos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());
  });

  it("shows the team list to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["users:manage"]),
      eventScopes: []
    });
    renderApp(["/equipo"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Equipo" })).toBeInTheDocument());
  });

  it("shows the organizations list to an authenticated superadmin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "s@e.com", fullName: "S", role: "superadmin", organizationId: null },
      effectivePermissions: new Set(["organizations:manage"]),
      eventScopes: []
    });
    renderApp(["/organizaciones"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Organizaciones" })).toBeInTheDocument());
  });

  it("shows the orders list under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument());
  });

  it("shows the refunds list under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas/reembolsos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Reembolsos" })).toBeInTheDocument());
  });

  it("shows the taquilla page under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas/taquilla"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Taquilla" })).toBeInTheDocument());
  });

  it("shows the attendees list under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas/asistentes"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Asistentes" })).toBeInTheDocument());
  });

  it("shows the gates overview under Control de accesos to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["scan:validate"]),
      eventScopes: []
    });
    renderApp(["/accesos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Puertas" })).toBeInTheDocument());
  });

  it("opens an invitation link without an authenticated session", async () => {
    renderApp(["/invitacion/unknown"]);
    await waitFor(() => expect(screen.getByText("Invitación no disponible")).toBeInTheDocument());
  });
});
