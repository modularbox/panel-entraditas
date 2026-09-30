import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Order, OrganizationListItem } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrdersListPage } from "./OrdersListPage";

function pedido(extra: Partial<Order> = {}): Order {
  return {
    id: "order-1",
    orderNumber: "PED-2026-0001",
    eventId: "event-1",
    organizationId: "org-1",
    customerName: "Marta Ruiz",
    customerEmail: "marta@correo.com",
    customerPhone: null,
    userId: null,
    status: "paid",
    subtotal: 5000,
    discountAmount: 0,
    serviceFee: 0,
    total: 5000,
    refundedAmount: 0,
    currency: "EUR",
    channel: "web",
    paymentReference: null,
    paidAt: "2026-09-20T10:00:00.000Z",
    expiresAt: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    updatedAt: "2026-09-20T10:00:00.000Z",
    ...extra
  };
}

const ORGANIZACIONES: OrganizationListItem[] = [
  { id: "org-1", name: "Sala Riviera", slug: "sala-riviera", taxId: "B12345678", commissionRate: 0.08, contactEmail: "hola@sala-riviera.es", contactPhone: null, status: "active", organizer: null },
  { id: "org-2", name: "Eventos Madrid", slug: "eventos-madrid", taxId: "B87654321", commissionRate: 0.065, contactEmail: "hola@eventos-madrid.es", contactPhone: null, status: "active", organizer: null }
];

function pintar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OrdersListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function sesionDe(rol: "superadmin" | "organizador") {
  useSessionStore.setState({
    token: "token-de-prueba",
    user: { id: "usr-1", email: "quien@entraditas.com", fullName: "Quien Mira", role: rol, organizationId: rol === "superadmin" ? null : "org-1" },
    effectivePermissions: new Set<string>(),
    eventScopes: []
  });
}

// La cabecera de cada columna es un botón de ordenación, así que su texto lleva la flecha detrás.
function cabeceras(): string[] {
  return screen.getAllByRole("columnheader").map((th) => (th.textContent ?? "").replace(/[▲▼↕]$/, ""));
}

describe("OrdersListPage", () => {
  afterEach(() => vi.restoreAllMocks());

  // El pedido solo trae el id de su organización, también en los datos de la API: el nombre se
  // resuelve con el listado, y por eso la columna no puede existir sin él.
  it("el superadmin ve la organización de cada pedido, entre el nº de pedido y el evento", async () => {
    sesionDe("superadmin");
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      if (String(path).startsWith("/organizations")) return ORGANIZACIONES;
      if (String(path).startsWith("/events")) return [];
      return [pedido(), pedido({ id: "order-2", orderNumber: "PED-2026-0002", organizationId: "org-2" })];
    });

    pintar();

    expect(await screen.findByText("PED-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Sala Riviera")).toBeInTheDocument();
    expect(screen.getByText("Eventos Madrid")).toBeInTheDocument();
    expect(cabeceras().slice(0, 3)).toEqual(["Nº pedido", "Organización", "Evento"]);
  });

  it("para un organizador la columna no aparece y no se piden las organizaciones", async () => {
    sesionDe("organizador");
    const traer = vi.spyOn(apiClient, "get").mockImplementation(async (path) => (String(path).startsWith("/events") ? [] : [pedido()]));

    pintar();

    expect(await screen.findByText("PED-2026-0001")).toBeInTheDocument();
    expect(cabeceras().slice(0, 2)).toEqual(["Nº pedido", "Evento"]);
    expect(screen.queryByText("Sala Riviera")).not.toBeInTheDocument();
    expect(traer.mock.calls.some(([path]) => String(path).startsWith("/organizations"))).toBe(false);
  });
});
