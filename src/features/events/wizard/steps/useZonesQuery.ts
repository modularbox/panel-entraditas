import { useQuery } from "@tanstack/react-query";
import type { Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useZonesQuery(venueId: string | null | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["zones", venueId],
    queryFn: () => apiClient.get<Zone[]>(`/venues/${venueId}/zones`, { token: token! }),
    enabled: Boolean(venueId && token)
  });
}
