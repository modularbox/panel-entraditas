import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import * as api from "@/shared/lib/entraditasApi";
import { useCustomersQuery } from "./useCustomersQuery";

function envoltorio({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
}

describe("useCustomersQuery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  /**
   * El encargo de la tanda 8: quien se registra en entraditas.com es cliente aunque no haya
   * comprado nunca. El panel los derivaba de sus pedidos, asi que esas cuentas no existian.
   */
  it("trae de la API tambien a quien no ha comprado nunca", async () => {
    useSessionStore.setState({ token: "t" });
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiCustomers").mockResolvedValue([
      {
        id: "u1",
        name: "Nuria Sin Compras",
        email: "nuria@example.com",
        phone: "+34600000001",
        status: "active",
        ordersCount: 0,
        totalSpent: 0,
        lastPurchaseAt: null,
        createdAt: "2026-09-10T09:00:00.000Z"
      }
    ]);

    const { result } = renderHook(() => useCustomersQuery({}), { wrapper: envoltorio });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
    const cliente = result.current.data![0]!;
    expect(cliente.name).toBe("Nuria Sin Compras");
    expect(cliente.ordersCount).toBe(0);
    // Sin fecha de compra: la tabla lo pinta como "Sin compras" en vez de una fecha invalida.
    expect(cliente.lastPurchaseAt).toBe("");
  });

  it("la busqueda se le pasa a la API", async () => {
    useSessionStore.setState({ token: "t" });
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    const traer = vi.spyOn(api, "fetchApiCustomers").mockResolvedValue([]);

    const { result } = renderHook(() => useCustomersQuery({ q: "nuria" }), { wrapper: envoltorio });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(traer).toHaveBeenCalledWith("nuria");
  });

  // Sin API configurada (desarrollo y pruebas) se sigue leyendo de los mocks, como el resto del panel.
  it("sin sesion en la API lee de los mocks del panel", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(false);
    const traer = vi.spyOn(api, "fetchApiCustomers");
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");

    const { result } = renderHook(() => useCustomersQuery({}), { wrapper: envoltorio });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(traer).not.toHaveBeenCalled();
    expect(Array.isArray(result.current.data)).toBe(true);
  });
});
