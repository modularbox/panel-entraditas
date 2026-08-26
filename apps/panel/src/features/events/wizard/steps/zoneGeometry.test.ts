import { describe, expect, it } from "vitest";
import type { Zone } from "@entraditas/types";
import { clampPercent, computeDragPosition, computeResizeSize, defaultZoneLayout } from "./zoneGeometry";

describe("clampPercent", () => {
  it("clamps within the given range", () => {
    expect(clampPercent(150, 0, 100)).toBe(100);
    expect(clampPercent(-10, 0, 100)).toBe(0);
    expect(clampPercent(50, 0, 100)).toBe(50);
  });
});

describe("computeDragPosition", () => {
  it("moves by the given delta", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    expect(computeDragPosition(zone, 5, -5)).toEqual({ x: 15, y: 5 });
  });

  it("clamps so the zone never leaves the canvas", () => {
    const zone = { x: 90, y: 90, width: 20, height: 20 };
    expect(computeDragPosition(zone, 50, 50)).toEqual({ x: 80, y: 80 });
  });
});

describe("computeResizeSize", () => {
  it("resizes by the given delta", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    expect(computeResizeSize(zone, 10, -5)).toEqual({ width: 30, height: 15 });
  });

  it("never shrinks below 1% or grows past the canvas edge", () => {
    const zone = { x: 90, y: 90, width: 20, height: 20 };
    expect(computeResizeSize(zone, 50, 50)).toEqual({ width: 10, height: 10 });
    expect(computeResizeSize(zone, -50, -50)).toEqual({ width: 1, height: 1 });
  });
});

describe("defaultZoneLayout", () => {
  it("places a stage at a fixed top position", () => {
    expect(defaultZoneLayout("stage", [])).toEqual({ x: 20, y: 2, width: 60, height: 12 });
  });

  it("places an accessible marker at a fixed bottom-left position", () => {
    expect(defaultZoneLayout("accessible", [])).toEqual({ x: 2, y: 86, width: 14, height: 12 });
  });

  it("staggers sellable zones across a 3-column grid", () => {
    const existing: Zone[] = [
      { id: "z1", venueId: "v1", name: "A", kind: "standing", capacity: 0, x: 0, y: 0, width: 1, height: 1 },
      { id: "z2", venueId: "v1", name: "B", kind: "numbered", capacity: 0, x: 0, y: 0, width: 1, height: 1 },
      { id: "z3", venueId: "v1", name: "C", kind: "stage", capacity: 0, x: 0, y: 0, width: 1, height: 1 }
    ];
    // 2 sellable zones already placed (the stage doesn't count) -> next goes to column index 2
    expect(defaultZoneLayout("standing", existing)).toEqual({ x: 57, y: 20, width: 22, height: 18 });
  });
});
