import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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
  /** Seats reserved for reduced mobility, per zone. Drawn in blue. */
  accessibleSeatsByZone?: Record<string, string[]>;
  /** Drawing height in pixels, so a big room can be given more space to work in. */
  heightPx?: number;
}

interface DragState {
  zoneId: string;
  pointerId: number;
  startX: number;
  startY: number;
  origin: ZoneLayout;
  mode: "move" | "resize";
  moved: boolean;
}

/** Movement under this many pixels counts as a tap, not a drag. Fingers are never still. */
const DRAG_THRESHOLD_PX = 6;
const ACCESSIBLE_COLOR = "#2563eb";

// Seat miniature geometry, in the SVG's own units: a seat plus the gap after it.
const SEAT_SIZE = 0.82;
const SEAT_STEP = 1;

/** Widest row of the grid, which sets the miniature's horizontal extent. */
function seatGridColumns(rows: { length: number }[]): number {
  return rows.reduce((widest, row) => Math.max(widest, row.length), 1);
}

export function ZoneCanvas({
  zones,
  selectedZoneId,
  onSelectZone,
  onZoneCommitted,
  seatAssignmentsByZone = {},
  groupColors = {},
  accessibleSeatsByZone = {},
  heightPx = 384
}: ZoneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [liveLayouts, setLiveLayouts] = useState<Record<string, ZoneLayout>>({});
  const dragRef = useRef<DragState | null>(null);
  const draggedRef = useRef(false);
  // Committing from the window listener needs the latest layout without re-subscribing on every
  // pointer move, so the in-progress layout is mirrored in a ref.
  const liveRef = useRef<Record<string, ZoneLayout>>({});
  liveRef.current = liveLayouts;

  const stage = zones.find((zone) => zone.kind === "stage") ?? null;

  function layoutFor(zone: Zone): ZoneLayout {
    return liveLayouts[zone.id] ?? zone;
  }

  /**
   * The drag runs on window listeners rather than on the canvas element.
   *
   * On a touchscreen the browser retargets and cancels pointer events freely once a gesture
   * starts, so listening on the element meant moves and ups went missing and a tap could end up
   * selecting and then immediately deselecting. Window listeners plus pointer capture keep the
   * whole gesture in one place no matter what the browser does with the original target.
   */
  useEffect(() => {
    function handleMove(e: PointerEvent) {
      const drag = dragRef.current;
      const container = containerRef.current;
      if (!drag || drag.pointerId !== e.pointerId || !container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < DRAG_THRESHOLD_PX) {
        return;
      }
      drag.moved = true;
      e.preventDefault();
      const deltaXPercent = ((e.clientX - drag.startX) / rect.width) * 100;
      const deltaYPercent = ((e.clientY - drag.startY) / rect.height) * 100;
      const next: ZoneLayout =
        drag.mode === "move"
          ? { ...drag.origin, ...computeDragPosition(drag.origin, deltaXPercent, deltaYPercent) }
          : { ...drag.origin, ...computeResizeSize(drag.origin, deltaXPercent, deltaYPercent) };
      setLiveLayouts((prev) => ({ ...prev, [drag.zoneId]: next }));
    }

    function handleUp(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      // A real drag must swallow the click the browser fires afterwards, or letting go would be
      // read as a fresh tap. A tap that never moved leaves the selection made on pointer down.
      draggedRef.current = drag.moved;
      if (!drag.moved) return;
      const layout = liveRef.current[drag.zoneId];
      if (layout) onZoneCommitted(drag.zoneId, layout);
    }

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [onZoneCommitted]);

  function handlePointerDown(zone: Zone, mode: "move" | "resize", e: ReactPointerEvent) {
    e.stopPropagation();
    // Selecting here (never toggling) is what makes a touch tap reliable: the selection is done
    // by the time any synthesized click arrives.
    onSelectZone(zone.id);
    draggedRef.current = false;
    dragRef.current = {
      zoneId: zone.id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origin: layoutFor(zone),
      mode,
      moved: false
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function handleZoneClick(zone: Zone, e: ReactPointerEvent | React.MouseEvent) {
    e.stopPropagation();
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onSelectZone(zone.id);
  }

  return (
    <div
      ref={containerRef}
      style={{ height: `${heightPx}px` }}
      // touch-none on the canvas AND on every zone: without it the browser claims the gesture as
      // a scroll and cancels the drag halfway through.
      className="relative w-full touch-none select-none overflow-hidden rounded-md border-2 border-foreground bg-[#f4ead9]"
    >
      {zones.map((zone) => {
        const layout = layoutFor(zone);
        const selected = zone.id === selectedZoneId;
        const sellable = zone.kind === "numbered" || zone.kind === "standing";
        const showSeats = zone.kind === "numbered" && zone.capacity > 0;
        const assignments = seatAssignmentsByZone[zone.id] ?? {};
        const accessible = new Set(accessibleSeatsByZone[zone.id] ?? []);
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
            onClick={(e) => handleZoneClick(zone, e)}
            onPointerDown={(e) => handlePointerDown(zone, "move", e)}
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              width: `${layout.width}%`,
              height: `${layout.height}%`
            }}
            className={cn(
              "absolute flex touch-none select-none flex-col items-center justify-center border-2 p-1 text-xs font-semibold",
              zone.kind === "stage" && "border-foreground bg-foreground text-background",
              zone.kind === "accessible" && "border-dashed border-success bg-success-bg text-success",
              zone.kind === "numbered" && "border-primary bg-primary text-primary-foreground",
              zone.kind === "standing" && "border-accent bg-accent text-accent-foreground",
              zone.kind === "gate" && "border-foreground bg-foreground text-background",
              selected && "ring-2 ring-primary"
            )}
          >
            {showSeats && (
              // Drawn as SVG rather than flexed boxes: a viewBox keeps every seat square and the
              // whole block centred whatever the zone's proportions, which is what made the
              // miniature look distorted when a zone was wide and short (or tall and narrow).
              <svg
                aria-hidden="true"
                viewBox={`0 0 ${seatGridColumns(rows) * SEAT_STEP} ${rows.length * SEAT_STEP}`}
                preserveAspectRatio="xMidYMid meet"
                className="absolute inset-1"
              >
                {rows.map((row, rowIndex) => {
                  // Short rows (the remainder of an uneven split) sit centred under the long ones.
                  const offset = (seatGridColumns(rows) - row.length) / 2;
                  return row.map((seat, colIndex) => {
                    const groupId = assignments[seat.id];
                    const color = accessible.has(seat.id)
                      ? ACCESSIBLE_COLOR
                      : groupId
                        ? groupColors[groupId]
                        : undefined;
                    return (
                      <rect
                        key={seat.id}
                        x={(offset + colIndex) * SEAT_STEP}
                        y={rowIndex * SEAT_STEP}
                        width={SEAT_SIZE}
                        height={SEAT_SIZE}
                        rx={SEAT_SIZE / 5}
                        fill={color ?? "rgba(255,255,255,0.45)"}
                        stroke="rgba(0,0,0,0.2)"
                        strokeWidth={0.1}
                      />
                    );
                  });
                })}
              </svg>
            )}
            <span className="relative z-10 rounded-sm bg-black/25 px-1">{zone.name}</span>
            {sellable && <span className="relative z-10 rounded-sm bg-black/25 px-1">{zone.capacity} plazas</span>}
            {selected && (
              <span
                role="presentation"
                onPointerDown={(e) => handlePointerDown(zone, "resize", e)}
                className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize touch-none bg-foreground"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
