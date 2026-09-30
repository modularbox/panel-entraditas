import { useQuery } from "@tanstack/react-query";
import type { OrganizationListItem } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useOrganizationsQuery(habilitado = true) {
  const token = useSessionStore((state) => state.token);
  // El listado de organizaciones es de superadmin: quien no lo es no lo pide, para no gastar una
  // llamada que solo le va a dar un 403.
  return useQuery({ queryKey: ["organizations"], queryFn: () => apiClient.get<OrganizationListItem[]>("/organizations", { token: token! }), enabled: Boolean(token) && habilitado });
}