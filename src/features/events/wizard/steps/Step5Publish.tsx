import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import type { CapacityPool, Event, TicketType, VenuePlanElement, Zone } from "@entraditas/types";
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

function useCapacityPoolsQuery(subEventId: string | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["capacity-pools", subEventId],
    queryFn: () => apiClient.get<CapacityPool[]>(`/sub-events/${subEventId}/capacity`, { token: token! }),
    enabled: Boolean(subEventId && token)
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

function plainText(value?: string | null): string {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const firstSubEvent = subEvents[0];
  const { data: pools = [] } = useCapacityPoolsQuery(firstSubEvent?.id);
  const { data: zones = [] } = useZonesQuery(event?.venueId);
  const [publishError, setPublishError] = useState<string | null>(null);
  const planElements = planElementsFromZones(zones);


  const hasTicketTypes = (summary?.ticketTypesCount ?? 0) > 0;
  const sellableZones = zones.filter((zone) => zone.kind === "numbered" || zone.kind === "standing");
  const missingBasicFields = [
    !event?.title?.trim() ? "titulo" : null,
    !event?.category?.trim() ? "categoria" : null,
    !plainText(event?.description) ? "descripcion" : null,
    !event?.location?.trim() ? "ubicacion" : null,
    !event?.locality?.trim() ? "localidad" : null
  ].filter(Boolean);
  const dateReady = Boolean(event?.datePending || event?.startsAt);
  const groupUsage = new Map<string, number>();
  const hasUnassignedZone = sellableZones.some((zone) => {
    const pool = pools.find((candidate) => candidate.zoneId === zone.id);
    const legacyGroupId = pool ? ticketTypes.find((ticketType) => ticketType.capacityPoolId === pool.id)?.groupId : null;
    const groupId = pool?.ticketTypeGroupId ?? legacyGroupId ?? null;
    if (groupId) groupUsage.set(groupId, (groupUsage.get(groupId) ?? 0) + (pool?.totalCapacity ?? zone.capacity));
    return !groupId;
  });
  const overCapacityGroups = [...groupUsage.entries()].filter(([groupId, used]) => {
    const ticket = ticketTypes.find((candidate) => candidate.groupId === groupId);
    return ticket?.quantityTotal !== null && ticket?.quantityTotal !== undefined && used > ticket.quantityTotal;
  });
  const checklist = [
    {
      label: "Datos principales de la plantilla",
      ok: missingBasicFields.length === 0,
      detail: missingBasicFields.length ? `Falta: ${missingBasicFields.join(", ")}` : "Titulo, categoria, descripcion y lugar listos"
    },
    {
      label: "Fecha o aviso",
      ok: dateReady,
      detail: dateReady ? "Tiene fecha confirmada o aviso de fecha por confirmar" : "Falta fecha o activar fecha por confirmar"
    },
    {
      label: "Tipos de entrada",
      ok: hasTicketTypes,
      detail: hasTicketTypes ? "Hay al menos un tipo de entrada" : "Falta crear al menos un tipo de entrada"
    },
    {
      label: "Plano y zonas",
      ok: sellableZones.length === 0 || (!hasUnassignedZone && overCapacityGroups.length === 0),
      detail:
        sellableZones.length === 0
          ? "Plano opcional sin zonas vendibles"
          : hasUnassignedZone
            ? "Hay zonas vendibles sin tipo de entrada asignado"
            : overCapacityGroups.length > 0
              ? "Una asignacion supera el limite de entradas disponibles"
              : "Zonas asignadas correctamente"
    }
  ];
  const canRequestReview = checklist.every((item) => item.ok);
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
          {checklist.map((item) => (
            <li
              key={item.label}
              className={`rounded-md border-2 px-3 py-2 text-sm font-medium ${
                item.ok ? "border-success bg-success-bg text-success" : "border-primary bg-primary/10 text-foreground"
              }`}
            >
              <strong>{item.ok ? "OK" : "Pendiente"} - {item.label}</strong>
              <span className="mt-1 block text-xs text-muted-foreground">{item.detail}</span>
            </li>
          ))}
        </ul>

        <p className="max-w-2xl text-sm font-medium text-muted-foreground">
          El evento quedara como pendiente de revision. Podra editarse mientras ningun admin lo haya tomado en revision;
          cuando este en revision quedara bloqueado hasta aprobarse o rechazarse.
        </p>

        {publishError && <p role="alert">{publishError}</p>}

        <Button type="button" onClick={requestReview} disabled={!canRequestReview} className="self-start">
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



