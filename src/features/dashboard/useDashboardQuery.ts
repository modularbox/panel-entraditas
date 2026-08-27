import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import type { DashboardOverview } from "./dashboardTypes";

export function useDashboardQuery() {
  const token = useSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => apiClient.get<DashboardOverview>("/dashboard/overview", { token: token! }),
    enabled: Boolean(token),
    refetchInterval: 15_000
  });
}
