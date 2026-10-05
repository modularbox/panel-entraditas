import { useQuery } from "@tanstack/react-query";
import type { TicketTransfer } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface TransfersFilters {
  eventId?: string;
  status?: string;
  /** Origin or destination: order number, name or email of either side of the transfer. */
  q?: string;
}

/**
 * Las cesiones de entradas de los pedidos que esta sesion puede ver.
 *
 * La cesion se ofrece desde entraditas.com por el comprador y el panel solo la lee. Por eso no hay
 * aqui una rama de "datos reales": la tabla `ticket_transfers` solo existe en la base de ventas, y
 * contra ella contesta el mismo endpoint del panel que sirve pedidos y reembolsos. El alcance lo
 * resuelve la API, nunca esta pantalla: un organizador solo ve lo que ha cedido su organizacion.
 */
export function useTransfersQuery(filters: TransfersFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.status) params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return useQuery({
    queryKey: ["transfers", filters],
    queryFn: () => apiClient.get<TicketTransfer[]>(`/transfers${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}