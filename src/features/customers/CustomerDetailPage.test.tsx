import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { CustomerDetailPage } from "./CustomerDetailPage";

function renderDetail(email: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/clientes/${encodeURIComponent(email)}`]}>
        <Routes>
          <Route path="/clientes/:email" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CustomerDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the customer's metrics and order history", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("diego.molina@example.com");
    expect(await screen.findByRole("heading", { name: "Diego Molina" })).toBeInTheDocument();
    expect(screen.getByText("0,00 €")).toBeInTheDocument(); // fully refunded, net spend 0
    expect(await screen.findByText("PED-2026-0004")).toBeInTheDocument();
  });

  it("shows a not-found message for an email with no qualifying orders", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("lucia.fernandez@example.com"); // only a pending order
    expect(await screen.findByText("Cliente no encontrado.")).toBeInTheDocument();
  });

  it("shows the customer profile to a superadmin, including the password", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderDetail("marta.ruiz@example.com");
    expect(await screen.findByRole("heading", { name: "Datos del cliente" })).toBeInTheDocument();
    expect(screen.getByText("Nombre y apellidos")).toBeInTheDocument();
    expect(screen.getAllByText("Marta Ruiz").length).toBeGreaterThan(0); // encabezado + perfil
    expect(screen.getByText("+34 611 010 101")).toBeInTheDocument();
    expect(screen.getByText("Contraseña")).toBeInTheDocument();
    expect(screen.getByText("marta1234")).toBeInTheDocument();
    expect(screen.getByText("Acepta publicidad")).toBeInTheDocument();
    expect(screen.getAllByText(/2026/).length).toBeGreaterThan(0); // fecha de alta + métricas
  });

  it("hides the password from the customer profile for a non-superadmin", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("marta.ruiz@example.com");
    expect(await screen.findByRole("heading", { name: "Datos del cliente" })).toBeInTheDocument();
    expect(screen.getByText("+34 611 010 101")).toBeInTheDocument();
    expect(screen.queryByText("Contraseña")).not.toBeInTheDocument();
    expect(screen.queryByText("marta1234")).not.toBeInTheDocument();
  });
});