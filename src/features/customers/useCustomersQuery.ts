import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { canReadFromApi, fetchApiCustomers, type ApiCustomer } from "@/shared/lib/entraditasApi";

export interface CustomersFilters {
  eventId?: string;
  q?: string;
}

/**
 * Un comprador de entraditas.com, con el mismo aspecto que los clientes del panel.
 *
 * `ticketsCount` se queda a 0 porque la API no lo cuenta todavia; lo que si trae es lo gastado y
 * cuantos pedidos, que es de donde sale la cifra que importa. Antes que inventarlo aqui, se deja
 * en cero y se ensena tal cual.
 */
function desdeLaApi(cliente: ApiCustomer): Customer {
  return {
    id: cliente.email,
    name: cliente.name || cliente.email,
    email: cliente.email,
    ordersCount: cliente.ordersCount,
    ticketsCount: 0,
    totalSpent: cliente.totalSpent,
    lastPurchaseAt: cliente.lastPurchaseAt ?? ""
  };
}

/**
 * Los clientes del panel.
 *
 * Con la API configurada y sesion abierta en ella, se leen de entraditas.com: son las cuentas
 * reales, y salen TAMBIEN las de quien se registro y todavia no ha comprado nada. El panel los
 * derivaba de sus pedidos, asi que una cuenta sin compras no existia para nadie y no habia forma
 * de saber cuanta gente se habia registrado.
 *
 * Sin API (desarrollo y pruebas) se sigue leyendo de los mocks, igual que el resto del panel.
 */
export function useCustomersQuery(filters: CustomersFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  const desdeApi = canReadFromApi();

  return useQuery({
    queryKey: ["customers", filters, desdeApi],
    queryFn: async () => {
      if (desdeApi) {
        // El filtro por evento no se aplica aqui: la API devuelve a los compradores, no a los
        // asistentes de un evento. Filtrar por evento vive en "Ventas > Asistentes".
        const clientes = await fetchApiCustomers(filters.q);
        return clientes.map(desdeLaApi);
      }
      return apiClient.get<Customer[]>(`/customers${query ? `?${query}` : ""}`, { token: token! });
    },
    enabled: Boolean(token)
  });
}
