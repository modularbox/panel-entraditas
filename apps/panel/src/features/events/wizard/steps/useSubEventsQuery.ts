import { useQuery } from "@tanstack/react-query";
import type { SubEvent } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useSubEventsQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["sub-events", eventId],
    queryFn: () => apiClient.get<SubEvent[]>(`/events/${eventId}/sub-events`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}
