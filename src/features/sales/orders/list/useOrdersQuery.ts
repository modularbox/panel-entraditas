import { useQuery } from "@tanstack/react-query";
import type { Order } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { canReadFromApi, fetchApiOrders } from "@/shared/lib/entraditasApi";
import { filtrarPedidos, pedidoDesdeLaApi } from "../desdeLaApi";

export interface OrdersFilters {
  eventId?: string;
  status?: string;
  channel?: string;
  q?: string;
}

/**
 * Los pedidos.
 *
 * Con sesión en la API salen de la base de ventas de entraditas.com: son las compras de verdad,
 * las mismas que ve el comprador en "Mis entradas". Sin ella (desarrollo y pruebas) se siguen
 * leyendo de los datos de ejemplo del panel.
 *
 * `esReal` acompaña a la lista porque la pantalla tiene que poder decirlo: un pedido de verdad no
 * se puede reembolsar todavía desde aquí, y callarlo sería peor que avisarlo.
 */
export function useOrdersQuery(filters: OrdersFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.status) params.set("status", filters.status);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();
  const desdeApi = canReadFromApi();

  return useQuery({
    queryKey: ["orders", filters, desdeApi],
    queryFn: async (): Promise<{ items: Order[]; esReal: boolean }> => {
      if (desdeApi) {
        const pedidos = await fetchApiOrders({ eventId: filters.eventId });
        return { items: filtrarPedidos(pedidos.map(pedidoDesdeLaApi), filters), esReal: true };
      }
      const datos = await apiClient.get<Order[]>(`/orders${query ? `?${query}` : ""}`, { token: token! });
      return { items: datos, esReal: false };
    },
    enabled: Boolean(token)
  });
}
