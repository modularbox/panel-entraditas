import { describe, expect, it } from "vitest";
import { sumDefinedQuantities, zoneExceedsCapacity } from "./capacityWarnings";

describe("zoneExceedsCapacity", () => {
  it("returns false when the assigned quantity fits within the zone's capacity", () => {
    expect(zoneExceedsCapacity(100, [80])).toBe(false);
  });

  it("returns true when the assigned quantity exceeds the zone's capacity", () => {
    expect(zoneExceedsCapacity(80, [120])).toBe(true);
  });

  it("returns false when the assigned quantity is unlimited (null)", () => {
    expect(zoneExceedsCapacity(80, [null])).toBe(false);
  });

  it("sums multiple defined quantities, ignoring unlimited ones", () => {
    expect(zoneExceedsCapacity(100, [40, null, 70])).toBe(true);
    expect(zoneExceedsCapacity(100, [40, null, 50])).toBe(false);
  });

  it("returns false when there are no assigned quantities", () => {
    expect(zoneExceedsCapacity(100, [])).toBe(false);
  });
});

describe("sumDefinedQuantities", () => {
  it("sums the defined quantities", () => {
    expect(sumDefinedQuantities([40, 70])).toBe(110);
  });

  it("ignores unlimited (null) quantities when summing", () => {
    expect(sumDefinedQuantities([40, null, 70])).toBe(110);
  });

  it("returns null when every quantity is unlimited", () => {
    expect(sumDefinedQuantities([null, null])).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(sumDefinedQuantities([])).toBeNull();
  });

  it("returns 0 when the only defined quantity is 0", () => {
    expect(sumDefinedQuantities([0, null])).toBe(0);
  });
});
