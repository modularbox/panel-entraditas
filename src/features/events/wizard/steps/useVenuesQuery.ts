import { useQuery } from "@tanstack/react-query";
import type { Venue } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useVenuesQuery() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["venues"],
    queryFn: () => apiClient.get<Venue[]>("/venues", { token: token! }),
    enabled: Boolean(token)
  });
}
