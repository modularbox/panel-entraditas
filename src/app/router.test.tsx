import { act, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { demoPasswordFor, resetDb } from "@/mocks/state";
import { olvidarCierre } from "@/shared/auth/sessionExpiry";
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

/**
 * Una sesion de verdad, recortada a los permisos que cada prueba quiere comprobar.
 *
 * Antes se inventaba un token ("t") y se ponia el estado a mano. Ya no vale: un 401 cierra la
 * sesion y manda al login, asi que una pagina que pida datos con un token falso sacaria a la
 * prueba de donde esta a mitad de camino. Se entra de verdad y solo se recortan los permisos.
 */
async function sesionCon(permisos: string[]) {
  await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
  useSessionStore.setState({ effectivePermissions: new Set(permisos), eventScopes: [] });
}

describe("AppRoutes", () => {
  afterEach(() => {
    resetDb();
    localStorage.clear();
    olvidarCierre();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("redirects an unauthenticated visitor to /login", async () => {
    renderApp(["/eventos"]);
    await waitFor(() => expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument());
  });

  it("shows the Eventos placeholder to an authenticated admin", async () => {
    await sesionCon(["events:read"]);
    renderApp(["/eventos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());
  });

  it("shows the team list to an authenticated admin", async () => {
    await sesionCon(["users:manage"]);
    renderApp(["/equipo"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Equipo" })).toBeInTheDocument());
  });

  it("shows the orders list under Ventas to an authenticated admin", async () => {
    await sesionCon(["orders:read"]);
    renderApp(["/ventas"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument());
  });

  it("shows the refunds list under Ventas to an authenticated admin", async () => {
    await sesionCon(["orders:read"]);
    renderApp(["/ventas/reembolsos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Reembolsos" })).toBeInTheDocument());
  });

  it("shows the taquilla page under Ventas to an authenticated admin", async () => {
    await sesionCon(["orders:read"]);
    renderApp(["/ventas/taquilla"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Taquilla" })).toBeInTheDocument());
  });

  it("shows the attendees list under Ventas to an authenticated admin", async () => {
    await sesionCon(["orders:read"]);
    renderApp(["/ventas/asistentes"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Asistentes" })).toBeInTheDocument());
  });

  it("shows the customers list under /clientes to an authenticated admin", async () => {
    await sesionCon(["orders:read"]);
    renderApp(["/clientes"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Clientes" })).toBeInTheDocument());
  });

  it("shows the gates overview under Control de accesos to an authenticated admin", async () => {
    await sesionCon(["scan:validate"]);
    renderApp(["/accesos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Puertas" })).toBeInTheDocument());
  });

  /**
   * Lo que pasa cuando la sesion se cae sola estando dentro: no basta con dejar de estar
   * autenticado, hay que sacar a la persona de donde este y contarle por que.
   */
  it("manda al login, contando el motivo, cuando la sesion se cierra por inactividad estando dentro", async () => {
    await sesionCon(["events:read"]);
    renderApp(["/eventos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());

    act(() => useSessionStore.getState().expire("inactividad", 40 * 60_000));

    await waitFor(() => expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument());
    expect(screen.getByRole("status")).toHaveTextContent(/llevabas 40 minutos sin tocar nada/i);
  });

  it("opens an invitation link without an authenticated session", async () => {
    renderApp(["/invitacion/unknown"]);
    await waitFor(() => expect(screen.getByText("Invitación no disponible")).toBeInTheDocument());
  });

  it("opens the terms and conditions page without an authenticated session", async () => {
    renderApp(["/terminos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Términos y condiciones" })).toBeInTheDocument());
  });
});
