import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrderDetailPage } from "./OrderDetailPage";

function renderDetail(orderId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/ventas/pedidos/${orderId}`]}>
        <Routes>
          <Route path="/ventas/pedidos/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrderDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the order header, customer, and its line items with the total", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-5");
    expect(await screen.findByRole("heading", { name: "PED-2026-0005" })).toBeInTheDocument();
    expect(screen.getByText("Sara Gómez")).toBeInTheDocument();
    expect(screen.getByText("Pista")).toBeInTheDocument();
    expect(screen.getByText("Grada VIP")).toBeInTheDocument();
    expect(screen.getByText("220,00 €")).toBeInTheDocument();
  });

  it("shows a not-found message for a nonexistent order", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-999");
    expect(await screen.findByText("Pedido no encontrado.")).toBeInTheDocument();
  });

  it("shows the refund history for an already-refunded order", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-4");
    expect(await screen.findByText("Cliente no pudo asistir al evento.")).toBeInTheDocument();
  });

  it("hides the refund form for a user without orders:refund", async () => {
    await useSessionStore.getState().login("usuario@entraditas.com", "demo1234"); // role "user", scoped to event-1/event-2
    renderDetail("order-1");
    await screen.findByRole("heading", { name: "PED-2026-0001" });
    expect(screen.queryByLabelText("Importe a reembolsar (€)")).not.toBeInTheDocument();
  });

  it("submits a full refund and updates the order status shown on the page", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-6");
    const amountInput = await screen.findByLabelText("Importe a reembolsar (€)");
    fireEvent.change(amountInput, { target: { value: "60.00" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Duplicado" } });
    fireEvent.click(screen.getByRole("button", { name: "Reembolsar" }));
    expect(await screen.findByText(/Reembolsado/)).toBeInTheDocument();
  });
});
