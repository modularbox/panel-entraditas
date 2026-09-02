import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapacityPool, Event, TemplateZone, TicketType, Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";
import { defaultZoneLayout, type ZoneLayout } from "./zoneGeometry";
import { ZoneCanvas } from "./ZoneCanvas";
import { ZoneEditorPanel } from "./ZoneEditorPanel";
import { ZoneListEditor } from "./ZoneListEditor";
import { ZoneSeatEditor } from "./ZoneSeatEditor";
import { PlanTemplates } from "./PlanTemplates";
import { SeatingModeChooser } from "./SeatingModeChooser";
import { TicketTypeAssignment, type ZoneAssignment } from "./TicketTypeAssignment";
import { groupTicketTypes } from "./Step4TicketTypes";
import {
  buildSeatGrid,
  countAssignedByGroup,
  countUnassigned,
  fromSeatAssignmentList,
  pruneAssignments,
  rowOriginForStage,
  toSeatAssignmentList,
  type Seat,
  type SeatAssignments
} from "./seatMap";

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
  // Drawing surface size. A local preference for working comfortably on a big room, not part of
  // the event's data: the zones' percent coordinates stay valid at any canvas size.
  const [canvasHeight, setCanvasHeight] = useState(384);
  const [canvasWidth, setCanvasWidth] = useState(100);

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
    patch: Partial<Pick<Zone, "name" | "capacity" | "rows" | "x" | "y" | "width" | "height">>
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

  async function assignTicketType(zoneId: string, groupId: string | null) {
    setError(null);
    const zone = zones.find((z) => z.id === zoneId);
    const pool = pools.find((p) => p.zoneId === zoneId);
    if (!zone || !pool) return;
    try {
      await apiClient.patch(
        `/capacity-pools/${pool.id}`,
        { totalCapacity: zone.capacity, ticketTypeGroupId: groupId },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function patchPool(zoneId: string, patch: Record<string, unknown>) {
    setError(null);
    const pool = pools.find((p) => p.zoneId === zoneId);
    if (!pool) return;
    try {
      await apiClient.patch(`/capacity-pools/${pool.id}`, patch, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function saveSeatAssignments(zoneId: string, next: SeatAssignments) {
    await patchPool(zoneId, { seatAssignments: toSeatAssignmentList(next) });
  }

  async function saveAccessibleSeats(zoneId: string, next: string[]) {
    await patchPool(zoneId, { accessibleSeatIds: next });
  }

  async function setSeatingMode(mode: Event["seatingMode"]) {
    setError(null);
    try {
      await apiClient.patch(`/events/${eventId}`, { seatingMode: mode }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  /** Recreates a saved layout's zones in this venue. Additive: it never deletes what is there. */
  async function applyTemplate(templateZones: TemplateZone[]) {
    if (!venueId) return;
    for (const zone of templateZones) {
      await apiClient.post(`/venues/${venueId}/zones`, zone, { token: token! });
    }
    await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
  }

  const groups = useMemo(() => groupTicketTypes(ticketTypes), [ticketTypes]);
  const sellableZones = useMemo(() => zones.filter((z) => SELLABLE_KINDS.includes(z.kind)), [zones]);
  const stage = useMemo(() => zones.find((zone) => zone.kind === "stage") ?? null, [zones]);

  // Seats are derived from each numbered zone's shape, and their ticket types come from the
  // pool's sparse breakdown. Assignments pointing at seats that no longer exist (after a
  // resize or a row-count change) are dropped so they stop consuming a ticket type's stock.
  const seatGrids = useMemo(() => {
    const grids: Record<string, Seat[]> = {};
    for (const zone of sellableZones) {
      if (zone.kind !== "numbered") continue;
      grids[zone.id] = buildSeatGrid({
        capacity: zone.capacity,
        width: zone.width,
        height: zone.height,
        rows: zone.rows,
        rowAOrigin: rowOriginForStage(zone, stage)
      });
    }
    return grids;
  }, [sellableZones, stage]);

  const seatAssignmentsByZone = useMemo(() => {
    const byZone: Record<string, SeatAssignments> = {};
    for (const zone of sellableZones) {
      const grid = seatGrids[zone.id];
      if (!grid) continue;
      const pool = pools.find((p) => p.zoneId === zone.id);
      byZone[zone.id] = pruneAssignments(fromSeatAssignmentList(pool?.seatAssignments), grid);
    }
    return byZone;
  }, [sellableZones, seatGrids, pools]);

  const accessibleSeatsByZone = useMemo(() => {
    const byZone: Record<string, string[]> = {};
    for (const pool of pools) {
      if (pool.zoneId && pool.accessibleSeatIds?.length) byZone[pool.zoneId] = pool.accessibleSeatIds;
    }
    return byZone;
  }, [pools]);

  const groupColors = useMemo(
    () => Object.fromEntries(groups.map((group) => [group.groupId, group.color])),
    [groups]
  );

  // A zone's whole-zone ticket type. Older events stored that link the other way round (on the
  // ticket type's capacityPoolId), so both are resolved here and everywhere else reads this.
  const resolveZoneGroupId = useMemo(() => {
    return (pool: CapacityPool | undefined): string | null => {
      if (!pool) return null;
      if (pool.ticketTypeGroupId) return pool.ticketTypeGroupId;
      return ticketTypes.find((t) => t.capacityPoolId === pool.id)?.groupId ?? null;
    };
  }, [ticketTypes]);

  /** What each ticket type has taken across every zone: seats for numbered, whole capacity for standing. */
  const takenByGroup = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const zone of sellableZones) {
      const seatAssignments = seatAssignmentsByZone[zone.id];
      if (seatAssignments) {
        for (const [groupId, count] of Object.entries(countAssignedByGroup(seatAssignments))) {
          totals[groupId] = (totals[groupId] ?? 0) + count;
        }
        continue;
      }
      const pool = pools.find((p) => p.zoneId === zone.id);
      const groupId = resolveZoneGroupId(pool);
      if (groupId) totals[groupId] = (totals[groupId] ?? 0) + (pool?.totalCapacity ?? zone.capacity);
    }
    return totals;
  }, [sellableZones, seatAssignmentsByZone, pools, resolveZoneGroupId]);

  // Standing zones keep the whole-zone assignment; numbered zones are driven by their seats.
  const standingZones = sellableZones.filter((zone) => zone.kind === "standing");
  const numberedZones = sellableZones.filter((zone) => zone.kind === "numbered");

  const assignments: ZoneAssignment[] = standingZones.map((zone) => {
    const pool = pools.find((p) => p.zoneId === zone.id);
    const assignedGroupId = resolveZoneGroupId(pool);
    const assignedGroup = groups.find((group) => group.groupId === assignedGroupId);
    const assignedTotalForGroup = assignedGroupId ? takenByGroup[assignedGroupId] ?? 0 : 0;
    return {
      zone,
      assignedGroupId,
      assignedCapacity: pool?.totalCapacity ?? zone.capacity,
      groupLimit: assignedGroup?.quantityTotal ?? null,
      assignedTotalForGroup,
      isOverCapacity:
        assignedGroup?.quantityTotal !== null &&
        assignedGroup?.quantityTotal !== undefined &&
        assignedTotalForGroup > assignedGroup.quantityTotal
    };
  });

  const numberedStatuses = numberedZones.map((zone) => {
    const seats = seatGrids[zone.id] ?? [];
    const zoneAssignments = seatAssignmentsByZone[zone.id] ?? {};
    const unassigned = countUnassigned(seats, zoneAssignments);
    return { zone, seatCount: seats.length, unassigned, assigned: seats.length - unassigned };
  });

  // This step runs *before* ticket types exist in the wizard, so it can only require that every
  // sellable zone has capacity. Tying a seat to a ticket type is done once those exist, and an
  // over-allocation is still blocking because it means the numbers no longer add up.
  const isValid =
    !assignments.some((a) => a.isOverCapacity) && !numberedStatuses.some((status) => status.seatCount === 0);

  useEffect(() => {
    onValidationChange?.(isValid);
  }, [isValid, onValidationChange]);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? null;
  const selectedSeats = selectedZone ? seatGrids[selectedZone.id] : undefined;

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la informaci�n del evento para poder dibujar el plano de asientos.
      </p>
    );
  }
  if (!event) return null;
  if (!venueId) {
    return <p role="alert">Este evento no tiene un recinto asociado todav�a.</p>;
  }

  // An event drawn before this choice existed already has zones on a plan, so it keeps the plan
  // instead of being asked again. Only a genuinely empty event gets the chooser.
  const mode = event.seatingMode ?? (zones.length > 0 ? "plan" : null);

  if (mode === null) {
    return (
      <div className="flex flex-col gap-4">
        {error && <p role="alert">{error}</p>}
        <SeatingModeChooser mode={null} onChoose={(next) => void setSeatingMode(next)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}

      <SeatingModeChooser mode={mode} onChoose={(next) => void setSeatingMode(next)} />

      {mode === "plan" ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold">Tamano del plano</span>
            <label htmlFor="canvas-height" className="text-xs text-muted-foreground">
              Alto
            </label>
            <input
              id="canvas-height"
              type="range"
              min="280"
              max="900"
              step="20"
              value={canvasHeight}
              onChange={(e) => setCanvasHeight(Number(e.target.value))}
            />
            <label htmlFor="canvas-width" className="text-xs text-muted-foreground">
              Ancho
            </label>
            <input
              id="canvas-width"
              type="range"
              min="40"
              max="100"
              step="5"
              value={canvasWidth}
              onChange={(e) => setCanvasWidth(Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">
              {canvasHeight} px de alto - {canvasWidth}% de ancho
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_260px]">
            <div style={{ width: `${canvasWidth}%` }}>
              <ZoneCanvas
                zones={zones}
                selectedZoneId={selectedZoneId}
                onSelectZone={setSelectedZoneId}
                onZoneCommitted={(id, layout) => updateZone(id, layout)}
                seatAssignmentsByZone={seatAssignmentsByZone}
                groupColors={groupColors}
                accessibleSeatsByZone={accessibleSeatsByZone}
                heightPx={canvasHeight}
              />
            </div>
            <ZoneEditorPanel
              zones={zones}
              selectedZoneId={selectedZoneId}
              onAddZone={addZone}
              onUpdateZone={updateZone}
              onDeleteZone={deleteZone}
            />
          </div>
        </>
      ) : (
        <ZoneListEditor
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          onAddZone={addZone}
          onUpdateZone={updateZone}
          onDeleteZone={deleteZone}
        />
      )}

      {/* Templates work for both modes: a set of zones is reusable whether or not it is drawn. */}
      <PlanTemplates zones={zones} mode={mode} onApply={applyTemplate} />

      {selectedZone && selectedZone.kind === "numbered" && (selectedSeats?.length ?? 0) === 0 && (
        <p className="rounded-md border-2 border-border bg-surface p-3 text-sm text-muted-foreground">
          Indica cuantos asientos tiene "{selectedZone.name}" para dibujar sus butacas y poder
          repartirlas por tipo de entrada.
        </p>
      )}

      {selectedZone && selectedZone.kind === "numbered" && selectedSeats && selectedSeats.length > 0 && (
        <ZoneSeatEditor
          zone={selectedZone}
          seats={selectedSeats}
          assignments={seatAssignmentsByZone[selectedZone.id] ?? {}}
          groups={groups}
          // The stock a ticket type has left is shared with every other zone, so this zone's
          // own seats are excluded from the "already taken" figure it is capped against.
          assignedElsewhereByGroup={Object.fromEntries(
            groups.map((group) => {
              const here = countAssignedByGroup(seatAssignmentsByZone[selectedZone.id] ?? {})[group.groupId] ?? 0;
              return [group.groupId, (takenByGroup[group.groupId] ?? 0) - here];
            })
          )}
          onChange={(next) => void saveSeatAssignments(selectedZone.id, next)}
          accessibleSeatIds={pools.find((p) => p.zoneId === selectedZone.id)?.accessibleSeatIds ?? []}
          onAccessibleChange={(next) => void saveAccessibleSeats(selectedZone.id, next)}
        />
      )}

      {numberedStatuses.length > 0 && (
        <ul aria-label="Resumen de zonas numeradas" className="flex flex-col gap-1">
          {numberedStatuses.map(({ zone, seatCount, assigned, unassigned }) => (
            <li key={zone.id} className="text-sm">
              <span className="font-semibold">{zone.name}:</span>{" "}
              {seatCount === 0 ? (
                <span role="alert" className="font-semibold text-destructive">
                  indica cuantas plazas tiene esta zona.
                </span>
              ) : assigned === 0 ? (
                <span role="alert" className="font-semibold text-destructive">
                  {seatCount} asientos sin ningun tipo de entrada asignado.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  {assigned}/{seatCount} asientos asignados
                  {unassigned > 0 && ` - ${unassigned} sin asignar (se pueden dejar sin vender)`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {standingZones.length > 0 && (
        <TicketTypeAssignment assignments={assignments} groups={groups} onAssign={assignTicketType} />
      )}
    </div>
  );
}
