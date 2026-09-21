import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TicketDesign } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useTicketDesignQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-design", eventId],
    queryFn: () => apiClient.get<TicketDesign>(`/events/${eventId}/ticket-design`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

export function useSaveTicketDesign(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (design: TicketDesign) =>
      apiClient.put<TicketDesign>(`/events/${eventId}/ticket-design`, design, { token: token! }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ticket-design", eventId] });
      void queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    }
  });
}