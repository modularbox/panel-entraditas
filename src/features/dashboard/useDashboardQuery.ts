import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import type { DashboardOverview } from "./dashboardTypes";
import type { DashboardFilters } from "./dashboardFilters";

export function useDashboardQuery(filters: DashboardFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.organizationId) params.set("organizationId", filters.organizationId);
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  return useQuery({
    queryKey: ["dashboard", "overview", filters],
    queryFn: () => apiClient.get<DashboardOverview>(`/dashboard/overview${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token),
    refetchInterval: 15_000,
    // Keep showing the previous filter's data (and the filter bar itself) while a new combination
    // loads, instead of dropping back to the full-page loading state on every change.
    placeholderData: keepPreviousData
  });
}
