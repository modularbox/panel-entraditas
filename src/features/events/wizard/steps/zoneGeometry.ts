import type { Zone } from "@entraditas/types";

export interface ZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STAGE_LAYOUT: ZoneLayout = { x: 20, y: 2, width: 60, height: 12 };
const ACCESSIBLE_LAYOUT: ZoneLayout = { x: 2, y: 86, width: 14, height: 12 };
const SELLABLE_GRID_COLUMNS = 3;
const SELLABLE_CELL_WIDTH = 26;
const SELLABLE_CELL_HEIGHT = 22;
const SELLABLE_GRID_START_Y = 20;
const SELLABLE_GRID_GAP = 4;

export function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultZoneLayout(kind: Zone["kind"], existingZones: Zone[]): ZoneLayout {
  if (kind === "stage") return STAGE_LAYOUT;
  if (kind === "accessible") return ACCESSIBLE_LAYOUT;
  const sellableCount = existingZones.filter((z) => z.kind === "numbered" || z.kind === "standing").length;
  const column = sellableCount % SELLABLE_GRID_COLUMNS;
  const row = Math.floor(sellableCount / SELLABLE_GRID_COLUMNS);
  return {
    x: 5 + column * SELLABLE_CELL_WIDTH,
    y: SELLABLE_GRID_START_Y + row * (SELLABLE_CELL_HEIGHT + SELLABLE_GRID_GAP),
    width: SELLABLE_CELL_WIDTH - 4,
    height: SELLABLE_CELL_HEIGHT - 4
  };
}

export function computeDragPosition(
  zone: ZoneLayout,
  deltaXPercent: number,
  deltaYPercent: number
): { x: number; y: number } {
  return {
    x: clampPercent(zone.x + deltaXPercent, 0, 100 - zone.width),
    y: clampPercent(zone.y + deltaYPercent, 0, 100 - zone.height)
  };
}

export function computeResizeSize(
  zone: ZoneLayout,
  deltaWidthPercent: number,
  deltaHeightPercent: number
): { width: number; height: number } {
  return {
    width: clampPercent(zone.width + deltaWidthPercent, 1, 100 - zone.x),
    height: clampPercent(zone.height + deltaHeightPercent, 1, 100 - zone.y)
  };
}
