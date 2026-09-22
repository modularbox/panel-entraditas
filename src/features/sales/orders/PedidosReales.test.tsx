import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import * as api from "@/shared/lib/entraditasApi";
import { OrdersListPage } from "./list/OrdersListPage";
import { OrderDetailPage } from "./detail/OrderDetailPage";

/**
 * Que Ventas enseñe las compras de verdad, no las de ejemplo.
 *
 * Es el otro extremo de la comprobación: la API ya se prueba contra MySQL de verdad (el pedido, sus
 * líneas y sus entradas), y aquí se comprueba que lo que llega se pinta, con su número, su
 * comprador y su importe, y que se dice lo que todavía no se puede hacer con él.
 */

function pedidoApi(extra: Partial<api.ApiPanelOrder> = {}): api.ApiPanelOrder {
  return {
    id: "ped-1",
    number: "ENT-ACF52E",
    eventId: "evt-jazz",
    organizationId: "org-norte",
    eventTitle: "Noche de Jazz",
    eventStartsAt: "2026-12-01T20:00:00+00:00",
    status: "paid",
    channel: "web",
    customerName: "Axel Comprador",
    customerEmail: "comprador@entraditas.com",
    customerPhone: null,
    subtotal: 6000,
    discount: 0,
    serviceFee: 300,
    total: 6300,
    refunded: 0,
    currency: "EUR",
    createdAt: "2026-09-22T09:55:00+00:00",
    items: [{ id: "li-1", ticketTypeId: "tier-general", name: "General", quantity: 2, unitPrice: 3000, subtotal: 6000 }],
    tickets: [
      { id: "t-1", orderItemId: "li-1", reference: "ENT-ACF52E-1", seat: null, status: "valid" },
      { id: "t-2", orderItemId: "li-1", reference: "ENT-ACF52E-2", seat: null, status: "valid" }
    ],
    ...extra
  };
}

function cliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function conApi(pedidos: api.ApiPanelOrder[]) {
  await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
  vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
  vi.spyOn(api, "fetchApiOrders").mockResolvedValue(pedidos);
}

describe("Ventas contra la base de compras", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("enseña el pedido de verdad, con su número, su comprador y su total", async () => {
    await conApi([pedidoApi()]);
    render(
      <QueryClientProvider client={cliente()}>
        <MemoryRouter>
          <OrdersListPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole("link", { name: "ENT-ACF52E" })).toBeInTheDocument();
    expect(screen.getByText("comprador@entraditas.com")).toBeInTheDocument();
    // 6300 centimos. Si alguien convirtiera dos veces, aqui saldria 63,00 € mal puesto.
    expect(screen.getByText("63,00 €")).toBeInTheDocument();
    // En la tabla, no en el desplegable de filtros: "Pagado" está en los dos sitios.
    expect(within(screen.getByRole("table")).getByText("Pagado")).toBeInTheDocument();
  });

  it("avisa de que el cobro todavía no pasa por una pasarela", async () => {
    await conApi([pedidoApi()]);
    render(
      <QueryClientProvider client={cliente()}>
        <MemoryRouter>
          <OrdersListPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText(/todavía no pasa por una pasarela/i)).toBeInTheDocument();
  });

  it("no avisa de nada cuando lo que se ve son los datos de ejemplo", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(false);
    render(
      <QueryClientProvider client={cliente()}>
        <MemoryRouter>
          <OrdersListPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.queryByText("Cargando…")).not.toBeInTheDocument());
    expect(screen.queryByText(/todavía no pasa por una pasarela/i)).not.toBeInTheDocument();
  });

  it("la ficha del pedido trae sus líneas y explica que aún no se puede reembolsar", async () => {
    await conApi([pedidoApi()]);
    render(
      <QueryClientProvider client={cliente()}>
        <MemoryRouter initialEntries={["/ventas/pedidos/ped-1"]}>
          <Routes>
            <Route path="/ventas/pedidos/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByRole("heading", { name: "ENT-ACF52E" })).toBeInTheDocument();
    expect(screen.getByText("General")).toBeInTheDocument();
    expect(screen.getByText(/no se puede reembolsar desde aquí/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reembolsar/i })).not.toBeInTheDocument();
  });

  it("un pedido que no es de esta organización se ve como un 404, no como una pantalla en blanco", async () => {
    await conApi([]);
    render(
      <QueryClientProvider client={cliente()}>
        <MemoryRouter initialEntries={["/ventas/pedidos/de-otro"]}>
          <Routes>
            <Route path="/ventas/pedidos/:id" element={<OrderDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Pedido no encontrado.")).toBeInTheDocument();
  });
});
