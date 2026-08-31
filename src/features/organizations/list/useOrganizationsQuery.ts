import { useQuery } from "@tanstack/react-query";
import type { OrganizationListItem } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useOrganizationsQuery() {
  const token = useSessionStore((state) => state.token);
  return useQuery({ queryKey: ["organizations"], queryFn: () => apiClient.get<OrganizationListItem[]>("/organizations", { token: token! }), enabled: Boolean(token) });
}