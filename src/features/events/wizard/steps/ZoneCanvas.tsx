import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Zone } from "@entraditas/types";
import { cn } from "@/shared/lib/cn";
import { computeDragPosition, computeResizeSize, type ZoneLayout } from "./zoneGeometry";
import { buildSeatGrid, rowOriginForStage, seatRows, type SeatAssignments } from "./seatMap";

export interface ZoneCanvasProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  onZoneCommitted: (id: string, layout: ZoneLayout) => void;
  /** Per-zone seat -> ticket type map, so the plan shows how each zone is broken down. */
  seatAssignmentsByZone?: Record<string, SeatAssignments>;
  /** Ticket type colours, keyed by group id, used to paint the assigned seats. */
  groupColors?: Record<string, string>;
}

interface DragState {
  zoneId: string;
  startX: number;
  startY: number;
  origin: ZoneLayout;
  mode: "move" | "resize";
}

export function ZoneCanvas({
  zones,
  selectedZoneId,
  onSelectZone,
  onZoneCommitted,
  seatAssignmentsByZone = {},
  groupColors = {}
}: ZoneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [liveLayouts, setLiveLayouts] = useState<Record<string, ZoneLayout>>({});
  const dragRef = useRef<DragState | null>(null);

  // Row A of every numbered zone is the row closest to the stage, so the plan's labels match
  // what an usher would read in the room.
  const stage = zones.find((zone) => zone.kind === "stage") ?? null;

  // Zones are positioned in percent (of the container), matching the API's stored layout.
  // While dragging/resizing we track an in-progress layout locally and only commit
  // (persist) it on pointer up, falling back to the zone's saved layout otherwise.
  function layoutFor(zone: Zone): ZoneLayout {
    return liveLayouts[zone.id] ?? zone;
  }

  function handlePointerDown(zone: Zone, mode: "move" | "resize", e: ReactPointerEvent) {
    e.stopPropagation();
    onSelectZone(mode === "move" && zone.id === selectedZoneId ? null : zone.id);
    dragRef.current = { zoneId: zone.id, startX: e.clientX, startY: e.clientY, origin: layoutFor(zone), mode };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    // Convert the pointer's raw pixel movement since drag start into a delta expressed
    // as a percentage of the container size, since zone layout is stored in percent.
    const deltaXPercent = ((e.clientX - drag.startX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - drag.startY) / rect.height) * 100;
    const next: ZoneLayout =
      drag.mode === "move"
        ? { ...drag.origin, ...computeDragPosition(drag.origin, deltaXPercent, deltaYPercent) }
        : { ...drag.origin, ...computeResizeSize(drag.origin, deltaXPercent, deltaYPercent) };
    setLiveLayouts((prev) => ({ ...prev, [drag.zoneId]: next }));
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const layout = liveLayouts[drag.zoneId];
    if (layout) onZoneCommitted(drag.zoneId, layout);
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative h-96 w-full overflow-hidden rounded-md border-2 border-foreground bg-[#f4ead9]"
    >
      {zones.map((zone) => {
        const layout = layoutFor(zone);
        const selected = zone.id === selectedZoneId;
        const sellable = zone.kind === "numbered" || zone.kind === "standing";
        const showSeats = zone.kind === "numbered" && zone.capacity > 0;
        const assignments = seatAssignmentsByZone[zone.id] ?? {};
        const rows = showSeats
          ? seatRows(
              buildSeatGrid({
                capacity: zone.capacity,
                width: layout.width,
                height: layout.height,
                rows: zone.rows,
                rowAOrigin: rowOriginForStage(layout, stage)
              })
            )
          : [];
        return (
          <button
            key={zone.id}
            type="button"
            aria-pressed={selected}
            aria-label={zone.name}
            onClick={() => onSelectZone(selected ? null : zone.id)}
            onPointerDown={(e) => handlePointerDown(zone, "move", e)}
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              width: `${layout.width}%`,
              height: `${layout.height}%`
            }}
            className={cn(
              "absolute flex flex-col items-center justify-center border-2 p-1 text-xs font-semibold",
              zone.kind === "stage" && "border-foreground bg-foreground text-background",
              zone.kind === "accessible" && "border-dashed border-success bg-success-bg text-success",
              zone.kind === "numbered" && "border-primary bg-primary text-primary-foreground",
              zone.kind === "standing" && "border-accent bg-accent text-accent-foreground",
              zone.kind === "gate" && "border-foreground bg-foreground text-background",
              selected && "ring-2 ring-primary"
            )}
          >
            {showSeats && (
              // A faithful mini-map of the real seats: one element per seat, laid out row by row
              // and painted with its ticket type, so the plan shows the breakdown at a glance.
              <span aria-hidden="true" className="absolute inset-1 flex flex-col justify-center gap-px">
                {rows.map((row) => (
                  <span key={row[0]!.rowLabel} className="flex flex-1 items-stretch justify-center gap-px">
                    {row.map((seat) => {
                      const groupId = assignments[seat.id];
                      const color = groupId ? groupColors[groupId] : undefined;
                      return (
                        <span
                          key={seat.id}
                          style={color ? { backgroundColor: color } : undefined}
                          className={cn(
                            "min-h-[3px] w-full max-w-[12px] flex-1 rounded-[1px] border border-black/20",
                            !color && "bg-background/45"
                          )}
                        />
                      );
                    })}
                  </span>
                ))}
              </span>
            )}
            <span className="relative z-10 rounded-sm bg-black/25 px-1">{zone.name}</span>
            {sellable && <span className="relative z-10 rounded-sm bg-black/25 px-1">{zone.capacity} plazas</span>}
            {selected && (
              <span
                role="presentation"
                onPointerDown={(e) => handlePointerDown(zone, "resize", e)}
                className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-foreground"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
