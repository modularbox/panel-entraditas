import { describe, expect, it } from "vitest";
import {
  assignSeat,
  assignSeatCount,
  buildSeatGrid,
  capacityOfRowSeats,
  clearSeat,
  computeRowCount,
  countAssignedByGroup,
  countUnassigned,
  fromSeatAssignmentList,
  moveSeat,
  pruneAssignments,
  remainingForGroup,
  rowLabel,
  rowOriginForStage,
  seatRows,
  seatsForGroup,
  seatsPerRow,
  toSeatAssignmentList
} from "./seatMap";

describe("rowLabel", () => {
  it("labels the first rows A, B, C", () => {
    expect(rowLabel(0)).toBe("A");
    expect(rowLabel(1)).toBe("B");
    expect(rowLabel(25)).toBe("Z");
  });

  it("continues with AA, AB past the alphabet", () => {
    expect(rowLabel(26)).toBe("AA");
    expect(rowLabel(27)).toBe("AB");
  });
});

describe("computeRowCount", () => {
  it("uses the explicit row count when the organizer set one", () => {
    expect(computeRowCount(25, 20, 20, 5)).toBe(5);
  });

  it("never asks for more rows than there are seats", () => {
    expect(computeRowCount(3, 20, 20, 10)).toBe(3);
  });

  it("derives roughly square rows from the zone shape when no row count is set", () => {
    expect(computeRowCount(25, 20, 20)).toBe(5);
  });

  it("gives a wide, short zone fewer and longer rows", () => {
    expect(computeRowCount(24, 40, 10)).toBeLessThan(computeRowCount(24, 10, 40));
  });

  it("returns zero rows for an empty zone", () => {
    expect(computeRowCount(0, 20, 20)).toBe(0);
  });
});

describe("seatsPerRow", () => {
  it("spreads the remainder across the first rows", () => {
    expect(seatsPerRow(25, 4)).toEqual([7, 6, 6, 6]);
  });

  it("splits evenly when it divides exactly", () => {
    expect(seatsPerRow(25, 5)).toEqual([5, 5, 5, 5, 5]);
  });

  it("returns nothing when there is no capacity", () => {
    expect(seatsPerRow(0, 4)).toEqual([]);
  });
});

describe("buildSeatGrid", () => {
  it("numbers seats left to right within each row, starting at 1", () => {
    const seats = buildSeatGrid({ capacity: 6, width: 20, height: 10, rows: 2 });
    expect(seats.map((seat) => seat.label)).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);
  });

  it("creates exactly the requested capacity", () => {
    expect(buildSeatGrid({ capacity: 25, width: 20, height: 20, rows: 4 })).toHaveLength(25);
  });

  it("labels row A at the bottom when the stage is drawn below the zone", () => {
    const seats = buildSeatGrid({ capacity: 4, width: 20, height: 10, rows: 2, rowAOrigin: "bottom" });
    // The row drawn first (rowIndex 0) is the one furthest from the stage, so it is row B.
    expect(seats.filter((seat) => seat.rowIndex === 0).map((seat) => seat.label)).toEqual(["B1", "B2"]);
    expect(seats.filter((seat) => seat.rowIndex === 1).map((seat) => seat.label)).toEqual(["A1", "A2"]);
  });

  it("caps absurd capacities instead of materialising them", () => {
    expect(buildSeatGrid({ capacity: 100000, width: 20, height: 20 }).length).toBeLessThanOrEqual(2000);
  });

  it("returns no seats for an empty zone", () => {
    expect(buildSeatGrid({ capacity: 0, width: 20, height: 20 })).toEqual([]);
  });

  describe("custom row distribution", () => {
    it("follows the given seats per row instead of splitting evenly", () => {
      const seats = buildSeatGrid({ capacity: 43, width: 20, height: 20, rowSeats: [12, 11, 11, 9] });
      expect(seats).toHaveLength(43);
      expect(seats.filter((seat) => seat.rowLabel === "A")).toHaveLength(12);
      expect(seats.filter((seat) => seat.rowLabel === "D")).toHaveLength(9);
    });

    it("wins over an explicit row count", () => {
      const seats = buildSeatGrid({ capacity: 6, width: 20, height: 20, rows: 3, rowSeats: [4, 2] });
      expect(seatRows(seats).map((row) => row.length)).toEqual([4, 2]);
    });

    it("drops empty rows so a stray zero cannot create a phantom row", () => {
      expect(seatRows(buildSeatGrid({ capacity: 5, width: 20, height: 20, rowSeats: [3, 0, 2] })).map((r) => r.length)).toEqual([3, 2]);
    });

    it("falls back to the even split when the distribution is empty", () => {
      const seats = buildSeatGrid({ capacity: 6, width: 20, height: 20, rows: 2, rowSeats: [] });
      expect(seatRows(seats).map((row) => row.length)).toEqual([3, 3]);
    });
  });
});

describe("capacityOfRowSeats", () => {
  it("adds up a custom distribution", () => {
    expect(capacityOfRowSeats([12, 11, 11, 9])).toBe(43);
  });

  it("returns null when there is no custom distribution", () => {
    expect(capacityOfRowSeats(null)).toBeNull();
    expect(capacityOfRowSeats([])).toBeNull();
  });
});

describe("rowOriginForStage", () => {
  it("puts row A at the bottom when the stage is below the zone", () => {
    expect(rowOriginForStage({ y: 20, height: 40 }, { y: 80, height: 10 })).toBe("bottom");
  });

  it("puts row A at the top when the stage is above the zone", () => {
    expect(rowOriginForStage({ y: 30, height: 40 }, { y: 2, height: 12 })).toBe("top");
  });

  it("defaults to the top when the plan has no stage", () => {
    expect(rowOriginForStage({ y: 30, height: 40 }, null)).toBe("top");
  });
});

describe("seatRows", () => {
  it("groups the seats into one entry per drawn row", () => {
    const rows = seatRows(buildSeatGrid({ capacity: 5, width: 20, height: 10, rows: 2 }));
    expect(rows.map((row) => row.length)).toEqual([3, 2]);
  });
});

describe("assignSeatCount", () => {
  const seats = buildSeatGrid({ capacity: 25, width: 20, height: 20, rows: 5 });

  it("places the requested quantity on the first free seats", () => {
    const assignments = assignSeatCount(seats, {}, "gratis", 20);
    expect(Object.keys(assignments)).toHaveLength(20);
    expect(assignments["A-1"]).toBe("gratis");
    expect(countUnassigned(seats, assignments)).toBe(5);
  });

  it("is idempotent: asking for the same quantity twice changes nothing", () => {
    const once = assignSeatCount(seats, {}, "gratis", 20);
    expect(assignSeatCount(seats, once, "gratis", 20)).toEqual(once);
  });

  it("releases the last placed seats when the quantity is lowered", () => {
    const twenty = assignSeatCount(seats, {}, "gratis", 20);
    const twelve = assignSeatCount(seats, twenty, "gratis", 12);
    expect(seatsForGroup(seats, twelve, "gratis")).toHaveLength(12);
    expect(twelve["A-1"]).toBe("gratis");
  });

  it("never places more seats than the zone has", () => {
    const assignments = assignSeatCount(seats, {}, "gratis", 999);
    expect(seatsForGroup(seats, assignments, "gratis")).toHaveLength(25);
  });

  it("leaves other ticket types alone and only fills what is still free", () => {
    const withVip = assignSeat({}, "A-1", "vip");
    const assignments = assignSeatCount(seats, withVip, "gratis", 24);
    expect(assignments["A-1"]).toBe("vip");
    expect(seatsForGroup(seats, assignments, "gratis")).toHaveLength(24);
    expect(countUnassigned(seats, assignments)).toBe(0);
  });
});

describe("clearSeat / assignSeat", () => {
  it("removes a single seat's ticket type", () => {
    const assignments = assignSeat({}, "A-1", "gratis");
    expect(clearSeat(assignments, "A-1")).toEqual({});
  });

  it("changes a seat's ticket type in place", () => {
    const assignments = assignSeat(assignSeat({}, "A-1", "gratis"), "A-1", "vip");
    expect(assignments["A-1"]).toBe("vip");
  });
});

describe("moveSeat", () => {
  it("relocates an assignment onto a free seat", () => {
    const assignments = moveSeat({ "A-1": "gratis" }, "A-1", "B-3");
    expect(assignments).toEqual({ "B-3": "gratis" });
  });

  it("swaps the two ticket types when the destination is taken", () => {
    const assignments = moveSeat({ "A-1": "gratis", "B-3": "vip" }, "A-1", "B-3");
    expect(assignments).toEqual({ "A-1": "vip", "B-3": "gratis" });
  });

  it("does nothing when the seat being moved has no ticket type", () => {
    expect(moveSeat({ "B-3": "vip" }, "A-1", "B-3")).toEqual({ "B-3": "vip" });
  });

  it("does nothing when moving a seat onto itself", () => {
    expect(moveSeat({ "A-1": "gratis" }, "A-1", "A-1")).toEqual({ "A-1": "gratis" });
  });
});

describe("countAssignedByGroup", () => {
  it("counts the seats sold as each ticket type", () => {
    expect(countAssignedByGroup({ "A-1": "gratis", "A-2": "gratis", "B-1": "vip" })).toEqual({ gratis: 2, vip: 1 });
  });
});

describe("pruneAssignments", () => {
  it("drops assignments whose seat no longer exists after a resize", () => {
    const seats = buildSeatGrid({ capacity: 4, width: 20, height: 20, rows: 2 });
    expect(pruneAssignments({ "A-1": "gratis", "Z-9": "gratis" }, seats)).toEqual({ "A-1": "gratis" });
  });
});

describe("remainingForGroup", () => {
  it("reports what is left of a limited ticket type", () => {
    expect(remainingForGroup(50, 20)).toBe(30);
  });

  it("never goes negative", () => {
    expect(remainingForGroup(50, 80)).toBe(0);
  });

  it("returns null for an unlimited ticket type", () => {
    expect(remainingForGroup(null, 20)).toBeNull();
  });
});

describe("seat assignment serialisation", () => {
  it("round-trips through the API's list shape", () => {
    const assignments = { "A-1": "gratis", "B-2": "vip" };
    expect(fromSeatAssignmentList(toSeatAssignmentList(assignments))).toEqual(assignments);
  });

  it("reads a missing list as no assignments", () => {
    expect(fromSeatAssignmentList(null)).toEqual({});
  });
});
