import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import * as api from "@/shared/lib/entraditasApi";
import { CustomerDetailPage } from "./CustomerDetailPage";

function pintar(email: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/clientes/${encodeURIComponent(email)}`]}>
        <Routes>
          <Route path="/clientes/:email" element={<CustomerDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const FICHA: api.ApiCustomerDetail = {
  id: "u-1",
  name: "Axel Fassio",
  email: "fassioaxelleonel@gmail.com",
  phone: "+34 600 000 000",
  status: "active",
  acceptsAdvertising: true,
  ordersCount: 1,
  ticketsCount: 2,
  totalSpent: 4500,
  lastPurchaseAt: "2026-09-12T10:00:00.000Z",
  createdAt: "2026-08-01T10:00:00.000Z",
  orders: [
    {
      id: "o-1",
      orderNumber: "ENT-0001",
      status: "paid",
      channel: "web",
      total: 4500,
      refundedAmount: 0,
      ticketsCount: 2,
      eventId: "e-1",
      eventTitle: "Noche de Jazz",
      eventStartsAt: "2026-10-10T21:00:00.000Z",
      createdAt: "2026-09-12T10:00:00.000Z"
    }
  ]
};

describe("CustomerDetailPage contra la API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  /**
   * El fallo que reportó Axel: la LISTA de clientes se leía de la API y la ficha se pedía a los
   * mocks del panel. Son dos poblaciones distintas, así que entrar en cualquier comprador real de
   * entraditas.com daba siempre "Error 404. Cliente no encontrado", con la sesión recién abierta.
   */
  it("lee la ficha de donde salió la lista, no de los mocks", async () => {
    useSessionStore.setState({ token: "t" });
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    const traer = vi.spyOn(api, "fetchApiCustomer").mockResolvedValue(FICHA);

    pintar("fassioaxelleonel@gmail.com");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Axel Fassio" })).toBeInTheDocument());
    expect(traer).toHaveBeenCalledWith("fassioaxelleonel@gmail.com");
    expect(screen.queryByText("Error 404")).not.toBeInTheDocument();
    // Y el historial de compras sale, que es lo que la ficha tiene que contar.
    expect(screen.getByText("ENT-0001")).toBeInTheDocument();
    expect(screen.getByText("Noche de Jazz")).toBeInTheDocument();
  });

  it("sin compras no pinta una fecha inválida", async () => {
    useSessionStore.setState({ token: "t" });
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiCustomer").mockResolvedValue({
      ...FICHA,
      ordersCount: 0,
      ticketsCount: 0,
      totalSpent: 0,
      lastPurchaseAt: null,
      orders: []
    });

    pintar("fassioaxelleonel@gmail.com");

    await waitFor(() => expect(screen.getByText("Sin compras")).toBeInTheDocument());
    expect(screen.queryByText("Invalid Date")).not.toBeInTheDocument();
    expect(screen.getByText("Todavía no ha comprado nada.")).toBeInTheDocument();
  });

  // Para un organizador, un comprador que nunca le ha comprado nada no es cliente suyo, y la API
  // responde lo mismo que si no existiera. Esa respuesta sí tiene que salir como 404.
  it("un cliente que la API no reconoce sigue saliendo como no encontrado", async () => {
    useSessionStore.setState({ token: "t" });
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiCustomer").mockResolvedValue(null);

    pintar("otro@example.com");

    await waitFor(() => expect(screen.getByText("Error 404")).toBeInTheDocument());
  });

  it("sin API configurada sigue leyendo de los mocks del panel", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(false);
    const traer = vi.spyOn(api, "fetchApiCustomer");
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");

    pintar("nadie@example.com");

    await waitFor(() => expect(screen.getByText("Error 404")).toBeInTheDocument());
    expect(traer).not.toHaveBeenCalled();
  });
});
