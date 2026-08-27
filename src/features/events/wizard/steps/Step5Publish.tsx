import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";

export interface Step5PublishProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}

interface EventSummary {
  ticketTypesCount: number;
  subEventsCount: number;
  totalCapacity: number;
  soldCount: number;
}

function useSummaryQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event-summary", eventId],
    queryFn: () => apiClient.get<EventSummary>(`/events/${eventId}/summary`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

export function Step5Publish({ eventId }: Step5PublishProps) {
  const token = useSessionStore((s) => s.token);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: summary } = useSummaryQuery(eventId);
  const [publishError, setPublishError] = useState<string | null>(null);

  const hasTicketTypes = (summary?.ticketTypesCount ?? 0) > 0;

  async function publish() {
    setPublishError(null);
    try {
      await apiClient.post(`/events/${eventId}/publish`, undefined, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate(`/eventos/${eventId}`);
    } catch (e) {
      if (e instanceof AppError) setPublishError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {publishError && <p role="alert">{publishError}</p>}

      <Button type="button" onClick={publish} disabled={!hasTicketTypes} className="self-start">
        Publicar evento
      </Button>
    </div>
  );
}
