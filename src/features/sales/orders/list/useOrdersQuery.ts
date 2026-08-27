import { useQuery } from "@tanstack/react-query";
import type { Order } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface OrdersFilters {
  eventId?: string;
  status?: string;
  channel?: string;
  q?: string;
}

export function useOrdersQuery(filters: OrdersFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.status) params.set("status", filters.status);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return useQuery({
    queryKey: ["orders", filters],
    queryFn: () => apiClient.get<Order[]>(`/orders${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}
