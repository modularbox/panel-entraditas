import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { Event, TicketType, VenuePlanElement, Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { PREVIEW_CATEGORIES, PublicEventPreview, type PreviewTicketTier } from "./publicEventPreview";

import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";
import { TICKET_COLOR_PALETTE, useTicketTypesQuery } from "./Step4TicketTypes";

export interface Step5PublishProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  goNext?: () => void;
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

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function dateParts(startsAt?: string | null) {
  if (!startsAt) return { startDate: "", startTime: "" };
  const date = new Date(startsAt);
  return {
    startDate: date.toISOString().slice(0, 10),
    startTime: date.toISOString().slice(11, 16)
  };
}

function groupTickets(ticketTypes: TicketType[]): PreviewTicketTier[] {
  const byGroup = new Map<string, TicketType[]>();
  for (const ticketType of ticketTypes) byGroup.set(ticketType.groupId, [...(byGroup.get(ticketType.groupId) ?? []), ticketType]);

  return [...byGroup.values()]
    .map((rows) => {
      const first = rows[0]!;
      return {
        id: first.groupId,
        name: first.name,
        priceCents: first.basePrice,
        color: first.color ?? TICKET_COLOR_PALETTE[first.sortOrder % TICKET_COLOR_PALETTE.length]!
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}

function planElementsFromZones(zones: Zone[]): VenuePlanElement[] {
  return zones
    .filter((zone) => zone.kind !== "gate")
    .map((zone) => ({
      id: zone.id,
      type: zone.kind === "stage" ? "stage" : zone.kind === "accessible" ? "accessible" : "zone",
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height,
      name: zone.name,
      capacity: zone.capacity
    }));
}

export function Step5Publish({ eventId }: Step5PublishProps) {
  const token = useSessionStore((s) => s.token);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: summary } = useSummaryQuery(eventId);
  const { data: event } = useEventQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const { data: zones = [] } = useZonesQuery(event?.venueId);
  const [publishError, setPublishError] = useState<string | null>(null);
  const planElements = planElementsFromZones(zones);


  const hasTicketTypes = (summary?.ticketTypesCount ?? 0) > 0;
  const activeCategory = PREVIEW_CATEGORIES.find((category) => category.id === event?.category) ?? PREVIEW_CATEGORIES[0]!;
  const eventDate = dateParts(event?.startsAt);
  const previewEvent = {
    category: activeCategory,
    title: event?.title,
    coverImageUrl: event?.coverImageUrl,
    gallery: event?.gallery ?? [],
    datePending: event?.datePending ?? !event?.startsAt,
    startDate: eventDate.startDate,
    startTime: eventDate.startTime,
    location: event?.location,
    locality: event?.locality,
    description: event?.description,
    durationMinutes: event?.startsAt && event?.endsAt ? Math.round((new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) / 60_000) : undefined,
    serviceFeeType: event?.serviceFeeType,
    serviceFeeValue: event?.serviceFeeValue,
    ticketTiers: groupTickets(ticketTypes),
    planElements,
    subEvents,
    tags: event ? [activeCategory.label, event.locality ?? ""].filter(Boolean) : []
  };

  async function requestReview() {
    setPublishError(null);
    try {
      await apiClient.post(`/events/${eventId}/publish`, undefined, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["events"] });
      navigate("/eventos");
    } catch (e) {
      if (e instanceof AppError) setPublishError(e.message);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(340px,0.72fr)_minmax(520px,1.28fr)]">
      <section className="flex min-w-0 flex-col gap-4">
        <h2>Checklist de revision</h2>
        <ul className="flex flex-col gap-2">
          <li className="rounded-md border-2 border-border bg-surface px-3 py-2 text-sm font-medium">
            {hasTicketTypes ? "OK" : "Pendiente"} - Al menos un tipo de entrada
          </li>
        </ul>

        <p className="max-w-2xl text-sm font-medium text-muted-foreground">
          El evento quedara como pendiente de revision. Podra editarse mientras ningun admin lo haya tomado en revision;
          cuando este en revision quedara bloqueado hasta aprobarse o rechazarse.
        </p>

        {publishError && <p role="alert">{publishError}</p>}

        <Button type="button" onClick={requestReview} disabled={!hasTicketTypes} className="self-start">
          Enviar a revision
        </Button>
      </section>

      <section className="min-w-0">
        <h2 className="mb-3">Previsualizacion publica</h2>
        <PublicEventPreview event={previewEvent} defaultMode="detail" />
      </section>
    </div>
  );
}



