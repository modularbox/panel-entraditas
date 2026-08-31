import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapacityPool, Event, Venue, VenuePlanElement, VenuePlanTemplate } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { TICKET_COLOR_PALETTE, useTicketTypesQuery } from "./Step4TicketTypes";

export interface Step3CapacityProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  goNext: () => void;
}

type ResizeCorner = "nw" | "ne" | "sw" | "se";

const PLAN_TEMPLATE_KEY = "entraditas:venue-plan-templates";
const MIN_SIZE = 5;
const MAX_VISIBLE_SEATS = 220;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function newElement(type: VenuePlanElement["type"], index: number, ticketTypeGroupId?: string): VenuePlanElement {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const x = 8 + (index % 3) * 26;
  const y = 18 + Math.floor(index / 3) * 24;
  if (type === "stage") return { id, type, label: "Escenario / pantalla", x: 30, y: 4, width: 40, height: 10 };
  if (type === "accessible") return { id, type, x: 5, y: 5, width: 14, height: 10, accessibleSeats: 4 };
  return {
    id,
    type,
    name: "Nueva zona",
    capacity: 100,
    ticketTypeGroupId: ticketTypeGroupId ?? null,
    color: TICKET_COLOR_PALETTE[index % TICKET_COLOR_PALETTE.length],
    x,
    y,
    width: 26,
    height: 20
  };
}

export function eventPlanKey(eventId: string | null): string {
  return `entraditas:event-plan:${eventId ?? "new"}`;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window !== "undefined") window.localStorage.setItem(key, JSON.stringify(value));
}

function useCapacityPoolsQuery(subEventId: string | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["capacity-pools", subEventId],
    queryFn: () => apiClient.get<CapacityPool[]>(`/sub-events/${subEventId}/capacity`, { token: token! }),
    enabled: Boolean(subEventId && token)
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

function useVenuesQuery() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["venues"],
    queryFn: () => apiClient.get<Venue[]>("/venues", { token: token! }),
    enabled: Boolean(token)
  });
}

function resizeFromCorner(el: VenuePlanElement, corner: ResizeCorner, p: { x: number; y: number }) {
  const left = el.x;
  const top = el.y;
  const right = el.x + el.width;
  const bottom = el.y + el.height;
  const nextLeft = corner === "nw" || corner === "sw" ? clamp(p.x, 0, right - MIN_SIZE) : left;
  const nextRight = corner === "ne" || corner === "se" ? clamp(p.x, left + MIN_SIZE, 100) : right;
  const nextTop = corner === "nw" || corner === "ne" ? clamp(p.y, 0, bottom - MIN_SIZE) : top;
  const nextBottom = corner === "sw" || corner === "se" ? clamp(p.y, top + MIN_SIZE, 100) : bottom;
  return { x: nextLeft, y: nextTop, width: nextRight - nextLeft, height: nextBottom - nextTop };
}

function seatPositions(capacity: number, width: number, height: number) {
  const count = Math.min(Math.max(0, capacity), MAX_VISIBLE_SEATS);
  if (count === 0) return [];
  const aspect = Math.max(0.4, width / Math.max(height, 1));
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: ((index % columns) + 0.5) / columns,
    y: (Math.floor(index / columns) + 0.5) / rows
  }));
}

function SeatCloud({ zone }: { zone: VenuePlanElement }) {
  const capacity = zone.capacity ?? 0;
  const seats = seatPositions(capacity, zone.width, zone.height);
  if (seats.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-2" aria-hidden="true">
      {seats.map((seat) => (
        <span
          key={seat.id}
          className="absolute h-[clamp(3px,0.72vw,8px)] w-[clamp(3px,0.72vw,8px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground bg-background/80"
          style={{ left: `${seat.x * 100}%`, top: `${seat.y * 100}%` }}
        />
      ))}
      {capacity > MAX_VISIBLE_SEATS && (
        <span className="absolute bottom-0 right-0 rounded-sm border border-foreground bg-background px-1 text-[0.6rem] font-extrabold">
          +{capacity - MAX_VISIBLE_SEATS}
        </span>
      )}
    </div>
  );
}

export function Step3Capacity({ eventId, goNext }: Step3CapacityProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const { data: venues = [] } = useVenuesQuery();
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const firstSubEvent = subEvents[0];
  const { data: pools = [] } = useCapacityPoolsQuery(firstSubEvent?.id);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const ticketGroups = useMemo(() => {
    const map = new Map<string, { groupId: string; name: string; color: string; quantityTotal: number | null; quantitySold: number }>();
    for (const item of ticketTypes) {
      if (!map.has(item.groupId)) {
        map.set(item.groupId, {
          groupId: item.groupId,
          name: item.name,
          color: item.color ?? TICKET_COLOR_PALETTE[item.sortOrder % TICKET_COLOR_PALETTE.length]!,
          quantityTotal: item.quantityTotal,
          quantitySold: 0
        });
      }
      const group = map.get(item.groupId)!;
      group.quantitySold += item.quantitySold;
    }
    return [...map.values()];
  }, [ticketTypes]);

  const [elements, setElements] = useState<VenuePlanElement[]>(() => readJson(eventPlanKey(eventId), []));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<VenuePlanTemplate[]>(() => readJson(PLAN_TEMPLATE_KEY, []));
  const [templateName, setTemplateName] = useState("");
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolCapacity, setNewPoolCapacity] = useState(0);
  const [newPoolTicketTypeGroupId, setNewPoolTicketTypeGroupId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ id: string; corner: ResizeCorner } | null>(null);

  const selected = elements.find((item) => item.id === selectedId) ?? null;
  const saleZones = elements.filter((item) => item.type === "zone");
  const venue = venues.find((item) => item.id === event?.venueId);

  function ticketGroupLimit(groupId?: string | null): number | null {
    if (!groupId) return null;
    return ticketGroups.find((group) => group.groupId === groupId)?.quantityTotal ?? null;
  }

  function assignedCapacityForTicketGroup(groupId: string, zones = saleZones): number {
    return zones.filter((zone) => zone.ticketTypeGroupId === groupId).reduce((sum, zone) => sum + (zone.capacity ?? 0), 0);
  }

  function cumulativeCapacityForZone(zone: VenuePlanElement): number {
    if (!zone.ticketTypeGroupId) return zone.capacity ?? 0;
    let total = 0;
    for (const item of saleZones) {
      if (item.ticketTypeGroupId === zone.ticketTypeGroupId) total += item.capacity ?? 0;
      if (item.id === zone.id) break;
    }
    return total;
  }

  function allocationLabel(zone: VenuePlanElement): string {
    const limit = ticketGroupLimit(zone.ticketTypeGroupId);
    if (limit === null) return `${zone.capacity ?? 0} entradas para esta zona`;
    return `${cumulativeCapacityForZone(zone)}/${limit} entradas para esta zona`;
  }

  function overAllocatedGroup(zones = saleZones) {
    return ticketGroups.find((group) => group.quantityTotal !== null && assignedCapacityForTicketGroup(group.groupId, zones) > group.quantityTotal);
  }

  useEffect(() => {
    if (!newPoolTicketTypeGroupId && ticketGroups[0]) setNewPoolTicketTypeGroupId(ticketGroups[0].groupId);
  }, [newPoolTicketTypeGroupId, ticketGroups]);

  function updateElements(next: VenuePlanElement[]) {
    setElements(next);
    writeJson(eventPlanKey(eventId), next);
  }

  function add(type: VenuePlanElement["type"]) {
    if (type === "zone" && ticketGroups.length === 0) {
      setError("Crea al menos un tipo de entrada antes de anadir zonas vendibles.");
      return;
    }
    setError(null);
    const element = newElement(type, elements.length, type === "zone" ? ticketGroups[0]?.groupId : undefined);
    updateElements([...elements, element]);
    setSelectedId(element.id);
  }

  function updateSelected(patch: Partial<VenuePlanElement>) {
    if (!selectedId) return;
    updateElements(elements.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)));
  }

  function removeSelected() {
    if (!selectedId) return;
    updateElements(elements.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }

  function pointerPct(e: { clientX: number; clientY: number }) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * 100, y: ((e.clientY - rect.top) / rect.height) * 100 };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>, el: VenuePlanElement) {
    e.stopPropagation();
    setSelectedId(el.id);
    const p = pointerPct(e);
    dragRef.current = { id: el.id, dx: p.x - el.x, dy: p.y - el.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handleResizePointerDown(e: React.PointerEvent<HTMLSpanElement>, el: VenuePlanElement, corner: ResizeCorner) {
    e.stopPropagation();
    setSelectedId(el.id);
    resizeRef.current = { id: el.id, corner };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const resize = resizeRef.current;
    if (resize) {
      const el = elements.find((item) => item.id === resize.id);
      if (!el) return;
      updateElements(elements.map((item) => (item.id === el.id ? { ...item, ...resizeFromCorner(el, resize.corner, pointerPct(e)) } : item)));
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;
    const el = elements.find((item) => item.id === drag.id);
    if (!el) return;
    const p = pointerPct(e);
    updateElements(
      elements.map((item) =>
        item.id === el.id ? { ...item, x: clamp(p.x - drag.dx, 0, 100 - el.width), y: clamp(p.y - drag.dy, 0, 100 - el.height) } : item
      )
    );
  }

  function stopPointer() {
    dragRef.current = null;
    resizeRef.current = null;
  }

  function saveTemplate() {
    const name = templateName.trim();
    if (!name || elements.length === 0) return;
    const next: VenuePlanTemplate[] = [
      { id: `template-${Date.now()}`, name, elements, updatedAt: new Date().toISOString() },
      ...templates
    ];
    setTemplates(next);
    writeJson(PLAN_TEMPLATE_KEY, next);
    setTemplateName("");
  }

  function applyTemplate(template: VenuePlanTemplate) {
    updateElements(template.elements);
    setSelectedId(null);
  }

  function deleteTemplate(templateId: string) {
    const next = templates.filter((template) => template.id !== templateId);
    setTemplates(next);
    writeJson(PLAN_TEMPLATE_KEY, next);
  }

  async function updatePoolCapacity(poolId: string, totalCapacity: number) {
    setError(null);
    const pool = pools.find((item) => item.id === poolId);
    const groupId = pool?.ticketTypeGroupId;
    const limit = ticketGroupLimit(groupId);
    if (groupId && limit !== null) {
      const nextAssigned = pools
        .filter((item) => item.ticketTypeGroupId === groupId)
        .reduce((sum, item) => sum + (item.id === poolId ? totalCapacity : item.totalCapacity), 0);
      if (nextAssigned > limit) {
        setError(`El tipo de entrada "${ticketGroups.find((group) => group.groupId === groupId)?.name ?? "seleccionado"}" tiene ${limit} entradas como maximo.`);
        return;
      }
    }
    try {
      await apiClient.patch(`/capacity-pools/${poolId}`, { totalCapacity }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo actualizar el aforo");
    }
  }

  async function addPool() {
    if (!firstSubEvent) return;
    const ticketTypeGroupId = newPoolTicketTypeGroupId || ticketGroups[0]?.groupId || "";
    if (!ticketTypeGroupId) {
      setError("Asigna un tipo de entrada a la zona antes de guardarla.");
      return;
    }
    const currentSum = pools.reduce((sum, pool) => sum + pool.totalCapacity, 0);
    if (venue && currentSum + newPoolCapacity > venue.totalCapacity) {
      setError(`El aforo total superaría la capacidad del recinto (${venue.totalCapacity})`);
      return;
    }
    const limit = ticketGroupLimit(ticketTypeGroupId);
    const currentTicketSum = pools.filter((pool) => pool.ticketTypeGroupId === ticketTypeGroupId).reduce((sum, pool) => sum + pool.totalCapacity, 0);
    if (limit !== null && currentTicketSum + newPoolCapacity > limit) {
      setError(`Este tipo de entrada tiene ${limit} entradas. Ya hay ${currentTicketSum}/${limit} asignadas.`);
      return;
    }
    setError(null);
    try {
      await apiClient.post(
        `/sub-events/${firstSubEvent.id}/capacity-pools`,
        { name: newPoolName, zoneId: null, totalCapacity: newPoolCapacity, ticketTypeGroupId },
        { token: token! }
      );
      setNewPoolName("");
      setNewPoolCapacity(0);
      setNewPoolTicketTypeGroupId("");
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent.id] });
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo añadir la zona");
    }
  }

  async function savePlanAndPools() {
    if (!firstSubEvent) return;
    const zoneWithoutTicketType = saleZones.find((zone) => !zone.ticketTypeGroupId);
    if (zoneWithoutTicketType) {
      setError(`La zona "${zoneWithoutTicketType.name ?? "Zona"}" necesita un tipo de entrada asignado.`);
      return;
    }
    const exceeded = overAllocatedGroup();
    if (exceeded && exceeded.quantityTotal !== null) {
      setError(
        `El tipo de entrada "${exceeded.name}" tiene ${exceeded.quantityTotal} entradas y el plano asigna ${assignedCapacityForTicketGroup(exceeded.groupId)}.`
      );
      return;
    }
    setError(null);
    try {
      for (const zone of saleZones) {
        const existingPool = pools.find((pool) => pool.name === zone.name);
        const totalCapacity = zone.capacity ?? 0;
        if (existingPool) {
          await apiClient.patch(`/capacity-pools/${existingPool.id}`, { totalCapacity, ticketTypeGroupId: zone.ticketTypeGroupId }, { token: token! });
        } else {
          await apiClient.post(
            `/sub-events/${firstSubEvent.id}/capacity-pools`,
            { name: zone.name ?? "Zona", zoneId: null, totalCapacity, ticketTypeGroupId: zone.ticketTypeGroupId },
            { token: token! }
          );
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent.id] });
      goNext();
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo guardar el plano");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => add("zone")}>
          + Zona
        </Button>
        <Button type="button" variant="outline" onClick={() => add("stage")}>
          + Escenario / pantalla
        </Button>
        <Button type="button" variant="outline" onClick={() => add("accessible")}>
          + Zona accesible
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div
          ref={containerRef}
          className="relative aspect-[16/9] min-h-[320px] overflow-hidden rounded-lg border-2 border-foreground bg-background"
          onPointerMove={handlePointerMove}
          onPointerUp={stopPointer}
          onPointerCancel={stopPointer}
          onPointerLeave={stopPointer}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          {elements.length === 0 && (
            <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm font-semibold text-muted-foreground">
              El plano es opcional. Anade zonas si necesitas aforo separado o asientos visuales.
            </p>
          )}

          {elements.map((el) => {
            const group = ticketGroups.find((item) => item.groupId === el.ticketTypeGroupId);
            const color = el.type === "zone" ? group?.color ?? el.color ?? TICKET_COLOR_PALETTE[0] : undefined;
            return (
              <div
                key={el.id}
                className="absolute flex cursor-grab select-none items-center justify-center rounded-md border-2 border-foreground p-2 text-center text-xs font-extrabold shadow-flat"
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  backgroundColor: el.type === "stage" ? "#111111" : el.type === "accessible" ? "#dbeafe" : color,
                  color: el.type === "stage" ? "#ffffff" : "#111111",
                  touchAction: "none"
                }}
                onPointerDown={(e) => handlePointerDown(e, el)}
              >
                {el.type === "zone" && <SeatCloud zone={el} />}
                {el.type === "accessible" ? (
                  <span className="flex flex-col items-center gap-1">
                    <span className="text-lg">♿</span>
                    <span>Accesible</span>
                    <small>{el.accessibleSeats ?? 0} plazas</small>
                  </span>
                ) : (
                  <span className="relative z-[1] flex flex-col gap-1 rounded-sm bg-background/85 px-1.5 py-1">
                    <span>{el.type === "stage" ? el.label : el.name}</span>
                    {el.type === "zone" && (
                      <>
                        <small>{el.capacity ?? 0} plazas</small>
                        <small>{allocationLabel(el)}</small>
                      </>
                    )}
                  </span>
                )}

                {selectedId === el.id && (
                  <>
                    {(["nw", "ne", "sw", "se"] as ResizeCorner[]).map((corner) => (
                      <span
                        key={corner}
                        className={`absolute h-5 w-5 rounded-sm border-2 border-background bg-foreground ${
                          corner === "nw"
                            ? "-left-2.5 -top-2.5 cursor-nwse-resize"
                            : corner === "ne"
                              ? "-right-2.5 -top-2.5 cursor-nesw-resize"
                              : corner === "sw"
                                ? "-bottom-2.5 -left-2.5 cursor-nesw-resize"
                                : "-bottom-2.5 -right-2.5 cursor-nwse-resize"
                        }`}
                        onPointerDown={(e) => handleResizePointerDown(e, el, corner)}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}
        </div>

        <aside className="rounded-lg border-2 border-foreground bg-surface p-4">
          {!selected ? (
            <p className="text-sm font-medium text-muted-foreground">
              Selecciona una zona para editarla. Puedes moverla, cambiar su tamano desde las esquinas y guardarla como plantilla.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <h2>{selected.type === "zone" ? "Zona" : selected.type === "stage" ? "Escenario" : "Zona accesible"}</h2>
              {selected.type === "zone" && (
                <>
                  <label htmlFor="zone-name">Nombre</label>
                  <input id="zone-name" value={selected.name ?? ""} onChange={(e) => updateSelected({ name: e.target.value })} />
                  <label htmlFor="zone-capacity">Cantidad de asientos</label>
                  <input
                    id="zone-capacity"
                    type="number"
                    min={0}
                    value={selected.capacity ?? 0}
                    onChange={(e) => updateSelected({ capacity: Number(e.target.value) })}
                  />
                  <span className="text-sm font-bold">Tipo de entrada</span>
                  <div id="zone-ticket-type" className="flex flex-wrap gap-2">
                    {ticketGroups.map((group) => (
                      <button
                        key={group.groupId}
                        type="button"
                        aria-pressed={selected.ticketTypeGroupId === group.groupId}
                        onClick={() => updateSelected({ ticketTypeGroupId: group.groupId })}
                        className={`inline-flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-extrabold ${
                          selected.ticketTypeGroupId === group.groupId
                            ? "border-foreground bg-accent text-foreground shadow-flat"
                            : "border-border bg-surface text-foreground"
                        }`}
                      >
                        <span className="h-3 w-3 rounded-sm border border-foreground" style={{ backgroundColor: group.color }} />
                        {group.name}
                      </button>
                    ))}
                  </div>
                  <p className="m-0 rounded-md border-2 border-border bg-surface-alt px-3 py-2 text-sm font-bold">
                    {allocationLabel(selected)}
                  </p>
                  {selected.ticketTypeGroupId &&
                    ticketGroupLimit(selected.ticketTypeGroupId) !== null &&
                    assignedCapacityForTicketGroup(selected.ticketTypeGroupId) > ticketGroupLimit(selected.ticketTypeGroupId)! && (
                      <p role="alert" className="m-0 text-sm font-bold text-primary">
                        Esta asignacion supera el cupo del tipo de entrada.
                      </p>
                    )}
                </>
              )}
              {selected.type === "stage" && (
                <>
                  <label htmlFor="stage-label">Texto</label>
                  <input id="stage-label" value={selected.label ?? ""} onChange={(e) => updateSelected({ label: e.target.value })} />
                </>
              )}
              {selected.type === "accessible" && (
                <>
                  <label htmlFor="accessible-seats">Plazas marcadas</label>
                  <input
                    id="accessible-seats"
                    type="number"
                    min={0}
                    value={selected.accessibleSeats ?? 0}
                    onChange={(e) => updateSelected({ accessibleSeats: Number(e.target.value) })}
                  />
                </>
              )}
              <Button type="button" variant="outline" onClick={removeSelected}>
                Eliminar
              </Button>
            </div>
          )}
        </aside>
      </div>

      <fieldset>
        <legend>Plantillas de plano</legend>
        <label htmlFor="template-name">Guardar plantilla actual como</label>
        <div className="flex max-w-xl flex-wrap gap-2">
          <input id="template-name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
          <Button type="button" variant="outline" onClick={saveTemplate} disabled={!templateName.trim() || elements.length === 0}>
            Guardar plantilla
          </Button>
        </div>
        {templates.length > 0 && (
          <ul className="flex flex-col gap-2">
            {templates.map((template) => (
              <li key={template.id} className="flex items-center gap-2 rounded-md border-2 border-border bg-surface px-3 py-2">
                <span className="flex-1 text-sm font-semibold">{template.name}</span>
                <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => applyTemplate(template)}>
                  Usar
                </Button>
                <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => deleteTemplate(template.id)}>
                  Eliminar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </fieldset>

      {pools.length > 0 && (
        <div>
          <h2>Aforo guardado</h2>
          <ul aria-label="Aforos" className="flex flex-col gap-2">
            {pools.map((pool) => (
              <li key={pool.id} className="flex items-center gap-3 rounded-md border-2 border-border bg-surface px-3 py-2">
                <label htmlFor={`pool-${pool.id}`} className="flex-1 text-sm font-semibold">
                  {pool.name}
                </label>
                <input
                  id={`pool-${pool.id}`}
                  type="number"
                  defaultValue={pool.totalCapacity}
                  onBlur={(e) => updatePoolCapacity(pool.id, Number(e.target.value))}
                  className="h-9 w-28 rounded-md border-2 border-foreground bg-background px-2 text-sm"
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      <fieldset>
        <legend>Añadir zona sin plano</legend>
        <label htmlFor="new-pool-name">Nombre</label>
        <input id="new-pool-name" value={newPoolName} onChange={(e) => setNewPoolName(e.target.value)} />
        <label htmlFor="new-pool-capacity">Capacidad</label>
        <input
          id="new-pool-capacity"
          type="number"
          value={newPoolCapacity}
          onChange={(e) => setNewPoolCapacity(Number(e.target.value))}
        />
        <span className="text-sm font-bold">Tipo de entrada</span>
        <div id="new-pool-ticket-type" className="flex flex-wrap gap-2">
          {ticketGroups.map((group) => (
            <button
              key={group.groupId}
              type="button"
              aria-pressed={newPoolTicketTypeGroupId === group.groupId}
              onClick={() => setNewPoolTicketTypeGroupId(group.groupId)}
              className={`inline-flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-extrabold ${
                newPoolTicketTypeGroupId === group.groupId
                  ? "border-foreground bg-accent text-foreground shadow-flat"
                  : "border-border bg-surface text-foreground"
              }`}
            >
              <span className="h-3 w-3 rounded-sm border border-foreground" style={{ backgroundColor: group.color }} />
              {group.name}
            </button>
          ))}
        </div>
        {ticketGroups.length === 0 && (
          <p className="text-sm font-semibold text-muted-foreground">Primero crea un tipo de entrada para poder asignar la zona.</p>
        )}
        {newPoolTicketTypeGroupId && ticketGroupLimit(newPoolTicketTypeGroupId) !== null && (
          <p className="m-0 rounded-md border-2 border-border bg-surface-alt px-3 py-2 text-sm font-bold">
            {pools.filter((pool) => pool.ticketTypeGroupId === newPoolTicketTypeGroupId).reduce((sum, pool) => sum + pool.totalCapacity, 0)}/
            {ticketGroupLimit(newPoolTicketTypeGroupId)} entradas asignadas a este tipo
          </p>
        )}
        <Button type="button" onClick={addPool} className="mt-4">
          Añadir zona
        </Button>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={savePlanAndPools} className="self-start">
          Guardar plano y continuar
        </Button>
        <Button type="button" variant="outline" onClick={goNext} className="self-start">
          Continuar sin plano
        </Button>
      </div>
    </div>
  );
}
