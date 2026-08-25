import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useEventsQuery(status?: string) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["events", { status }],
    queryFn: () => apiClient.get<Event[]>(`/events${status ? `?status=${status}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}
