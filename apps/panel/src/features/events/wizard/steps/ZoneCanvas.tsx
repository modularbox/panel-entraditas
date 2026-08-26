import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Zone } from "@entraditas/types";
import { cn } from "@/shared/lib/cn";
import { computeDragPosition, computeResizeSize, type ZoneLayout } from "./zoneGeometry";

export interface ZoneCanvasProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
  onZoneCommitted: (id: string, layout: ZoneLayout) => void;
}

interface DragState {
  zoneId: string;
  startX: number;
  startY: number;
  origin: ZoneLayout;
  mode: "move" | "resize";
}

export function ZoneCanvas({ zones, selectedZoneId, onSelectZone, onZoneCommitted }: ZoneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [liveLayouts, setLiveLayouts] = useState<Record<string, ZoneLayout>>({});
  const dragRef = useRef<DragState | null>(null);

  function layoutFor(zone: Zone): ZoneLayout {
    return liveLayouts[zone.id] ?? zone;
  }

  function handlePointerDown(zone: Zone, mode: "move" | "resize", e: ReactPointerEvent) {
    e.stopPropagation();
    dragRef.current = { zoneId: zone.id, startX: e.clientX, startY: e.clientY, origin: layoutFor(zone), mode };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
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
        return (
          <button
            key={zone.id}
            type="button"
            aria-pressed={selected}
            aria-label={zone.name}
            onClick={() => onSelectZone(zone.id)}
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
              selected && "ring-2 ring-primary"
            )}
          >
            <span>{zone.name}</span>
            {sellable && <span>{zone.capacity} plazas</span>}
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
