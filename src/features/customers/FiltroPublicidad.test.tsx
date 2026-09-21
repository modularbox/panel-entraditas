import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import * as api from "@/shared/lib/entraditasApi";
import { CustomersListPage } from "./CustomersListPage";

function cliente(nombre: string, email: string, publicidad: boolean): api.ApiCustomer {
  return {
    id: email,
    name: nombre,
    email,
    phone: "",
    status: "active",
    acceptsAdvertising: publicidad,
    ordersCount: 0,
    ticketsCount: 0,
    totalSpent: 0,
    lastPurchaseAt: null,
    createdAt: null,
    events: []
  };
}

function pintar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <CustomersListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Filtro de publicidad en Clientes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("deja solo a quien ha aceptado recibir publicidad", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiCustomers").mockResolvedValue([
      cliente("Marta Sí", "marta@example.com", true),
      cliente("Javier No", "javi@example.com", false)
    ]);

    pintar();

    await waitFor(() => expect(screen.getByText("Marta Sí")).toBeInTheDocument());
    expect(screen.getByText("Javier No")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Solo los que aceptan publicidad"));

    await waitFor(() => expect(screen.queryByText("Javier No")).not.toBeInTheDocument());
    expect(screen.getByText("Marta Sí")).toBeInTheDocument();
  });

  it("se puede quitar el filtro y vuelven todos", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiCustomers").mockResolvedValue([
      cliente("Marta Sí", "marta@example.com", true),
      cliente("Javier No", "javi@example.com", false)
    ]);

    pintar();
    await waitFor(() => expect(screen.getByText("Javier No")).toBeInTheDocument());

    const casilla = screen.getByLabelText("Solo los que aceptan publicidad");
    fireEvent.click(casilla);
    await waitFor(() => expect(screen.queryByText("Javier No")).not.toBeInTheDocument());

    fireEvent.click(casilla);
    await waitFor(() => expect(screen.getByText("Javier No")).toBeInTheDocument());
  });

  /**
   * Con el filtro puesto y nadie que lo cumpla, "no hay clientes que coincidan con los filtros"
   * se lee como que no hay clientes. Lo que pasa es otra cosa y conviene decirla.
   */
  it("si nadie acepta lo dice en esos terminos, no como si no hubiera clientes", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiCustomers").mockResolvedValue([cliente("Javier No", "javi@example.com", false)]);

    pintar();
    await waitFor(() => expect(screen.getByText("Javier No")).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText("Solo los que aceptan publicidad"));

    await waitFor(() =>
      expect(screen.getByText("Ninguno de estos clientes ha aceptado recibir publicidad.")).toBeInTheDocument()
    );
  });

  it("la columna dice quien acepta y deja en blanco a quien no", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiCustomers").mockResolvedValue([
      cliente("Marta Sí", "marta@example.com", true),
      cliente("Javier No", "javi@example.com", false)
    ]);

    pintar();

    await waitFor(() => expect(screen.getByText("Marta Sí")).toBeInTheDocument());
    const filaMarta = screen.getByText("Marta Sí").closest("tr")!;
    const filaJavier = screen.getByText("Javier No").closest("tr")!;
    expect(filaMarta).toHaveTextContent("Sí");
    expect(filaJavier).not.toHaveTextContent("Sí");
  });
});
