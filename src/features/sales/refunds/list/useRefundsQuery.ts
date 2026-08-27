import { useQuery } from "@tanstack/react-query";
import type { Refund } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface RefundsFilters {
  eventId?: string;
  q?: string;
}

export function useRefundsQuery(filters: RefundsFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return useQuery({
    queryKey: ["refunds", filters],
    queryFn: () => apiClient.get<Refund[]>(`/refunds${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}
