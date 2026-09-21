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
 * El id es el CORREO, no el id de la fila: es lo que la ficha de dentro usa para volver a pedirlo
 * a la API, y lo unico que identifica igual a un comprador registrado y a uno que compro como
 * invitado.
 */
export function desdeLaApi(cliente: ApiCustomer): Customer {
  return {
    id: cliente.email,
    name: cliente.name || cliente.email,
    email: cliente.email,
    phone: cliente.phone || null,
    createdAt: cliente.createdAt ?? undefined,
    acceptsAdvertising: cliente.acceptsAdvertising === true,
    ordersCount: cliente.ordersCount,
    ticketsCount: cliente.ticketsCount ?? 0,
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
