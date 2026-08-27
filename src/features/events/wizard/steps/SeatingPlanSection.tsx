import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapacityPool, Event, TicketType, Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";
import { defaultZoneLayout, type ZoneLayout } from "./zoneGeometry";
import { ZoneCanvas } from "./ZoneCanvas";
import { ZoneEditorPanel } from "./ZoneEditorPanel";
import { TicketTypeAssignment, type ZoneAssignment } from "./TicketTypeAssignment";
import { groupTicketTypes } from "./Step4TicketTypes";
import { sumDefinedQuantities, zoneExceedsCapacity } from "./capacityWarnings";

export interface SeatingPlanSectionProps {
  eventId: string | null;
  onValidationChange?: (valid: boolean) => void;
}

const SELLABLE_KINDS: Zone["kind"][] = ["numbered", "standing"];
const ZONE_KIND_NAMES: Record<Zone["kind"], string> = {
  numbered: "Nueva zona numerada",
  standing: "Nueva zona de pie",
  stage: "Escenario",
  accessible: "Movilidad reducida",
  gate: "Puerta"
};

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

function useTicketTypesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: () => apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

export function SeatingPlanSection({ eventId, onValidationChange }: SeatingPlanSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const venueId = event?.venueId ?? null;
  const { data: zones = [] } = useZonesQuery(venueId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const firstSubEvent = subEvents[0];
  const { data: pools = [] } = useCapacityPoolsQuery(firstSubEvent?.id);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The drawn plan is the source of truth: any sellable zone without a
  // matching capacity pool for this event's first function gets one
  // created automatically, with no manual "activate" step.
  useEffect(() => {
    if (!firstSubEvent) return;
    const missing = zones.filter((z) => SELLABLE_KINDS.includes(z.kind) && !pools.some((p) => p.zoneId === z.id));
    if (missing.length === 0) return;
    (async () => {
      for (const zone of missing) {
        await apiClient.post(
          `/sub-events/${firstSubEvent.id}/capacity-pools`,
          { name: zone.name, zoneId: zone.id, totalCapacity: zone.capacity },
          { token: token! }
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent.id] });
    })();
  }, [zones, pools, firstSubEvent, token, queryClient]);

  async function addZone(kind: Zone["kind"]) {
    if (!venueId) return;
    setError(null);
    const layout: ZoneLayout = defaultZoneLayout(kind, zones);
    try {
      const created = await apiClient.post<Zone>(
        `/venues/${venueId}/zones`,
        { name: ZONE_KIND_NAMES[kind], kind, capacity: 0, ...layout },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      setSelectedZoneId(created.id);
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function updateZone(
    id: string,
    patch: Partial<Pick<Zone, "name" | "capacity" | "x" | "y" | "width" | "height">>
  ) {
    setError(null);
    try {
      await apiClient.patch(`/zones/${id}`, patch, { token: token! });
      // Zone capacity and its capacity pool's totalCapacity are two separate records
      // that must be kept in lockstep whenever the zone's capacity changes.
      if (patch.capacity !== undefined) {
        const pool = pools.find((p) => p.zoneId === id);
        if (pool) {
          await apiClient.patch(`/capacity-pools/${pool.id}`, { totalCapacity: patch.capacity }, { token: token! });
          await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteZone(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/zones/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      if (selectedZoneId === id) setSelectedZoneId(null);
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function assignTicketType(zoneId: string, groupId: string) {
    setError(null);
    const zone = zones.find((z) => z.id === zoneId);
    const pool = pools.find((p) => p.zoneId === zoneId);
    if (!zone || !pool) return;
    try {
      const rows = ticketTypes.filter((t) => t.groupId === groupId);
      await Promise.all(
        rows.map((t) => apiClient.patch(`/ticket-types/${t.id}`, { capacityPoolId: pool.id }, { token: token! }))
      );
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
      // Keep the zone capacity in sync with the sum of the linked ticket types' quantities,
      // unless none of them have a defined quantity (sumDefinedQuantities returns null then).
      const matchingCapacity = sumDefinedQuantities(rows.map((t) => t.quantityTotal));
      if (matchingCapacity !== null) await updateZone(zoneId, { capacity: matchingCapacity });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  const sellableZones = zones.filter((z) => SELLABLE_KINDS.includes(z.kind));
  const groups = groupTicketTypes(ticketTypes);
  const assignments: ZoneAssignment[] = sellableZones.map((zone) => {
    const pool = pools.find((p) => p.zoneId === zone.id);
    const assignedGroup = pool
      ? groups.find((g) => ticketTypes.some((t) => t.groupId === g.groupId && t.capacityPoolId === pool.id))
      : undefined;
    const linkedQuantities = pool
      ? ticketTypes.filter((t) => t.capacityPoolId === pool.id).map((t) => t.quantityTotal)
      : [];
    return {
      zone,
      assignedGroupId: assignedGroup?.groupId ?? null,
      isOverCapacity: zoneExceedsCapacity(zone.capacity, linkedQuantities)
    };
  });
  const isValid = !assignments.some((a) => a.isOverCapacity);

  useEffect(() => {
    onValidationChange?.(isValid);
  }, [isValid, onValidationChange]);

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la información del evento para poder dibujar el plano de asientos.
      </p>
    );
  }
  if (!event) return null;
  if (!venueId) {
    return <p role="alert">Este evento no tiene un recinto asociado todavía.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <ZoneCanvas
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          onZoneCommitted={(id, layout) => updateZone(id, layout)}
        />
        <ZoneEditorPanel
          zones={zones}
          selectedZoneId={selectedZoneId}
          onAddZone={addZone}
          onUpdateZone={updateZone}
          onDeleteZone={deleteZone}
        />
      </div>
      {sellableZones.length > 0 && (
        <TicketTypeAssignment assignments={assignments} groups={groups} onAssign={assignTicketType} />
      )}
    </div>
  );
}
