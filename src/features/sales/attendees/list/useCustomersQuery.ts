import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface CustomersFilters {
  eventId?: string;
  q?: string;
}

export function useCustomersQuery(filters: CustomersFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return useQuery({
    queryKey: ["customers", filters],
    queryFn: () => apiClient.get<Customer[]>(`/customers${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}
