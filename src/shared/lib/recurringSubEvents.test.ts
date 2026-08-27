import { describe, expect, it } from "vitest";
import { generateRecurringSubEvents } from "./recurringSubEvents";

describe("generateRecurringSubEvents", () => {
  it("generates the requested number of occurrences, spaced by intervalDays", () => {
    const result = generateRecurringSubEvents({
      startDate: "2026-09-05",
      time: "21:00",
      durationMinutes: 120,
      occurrences: 6,
      intervalDays: 7,
      namePrefix: "Sábado"
    });
    expect(result).toHaveLength(6);
    expect(result[0]).toMatchObject({ name: "Sábado 1", startsAt: "2026-09-05T21:00:00.000Z", endsAt: "2026-09-05T23:00:00.000Z" });
    expect(result[5]!.startsAt).toBe("2026-10-10T21:00:00.000Z");
  });

  it("assigns an incrementing sortOrder starting at 0", () => {
    const result = generateRecurringSubEvents({
      startDate: "2026-09-05", time: "21:00", durationMinutes: 60, occurrences: 3, intervalDays: 7, namePrefix: "Función"
    });
    expect(result.map((r) => r.sortOrder)).toEqual([0, 1, 2]);
  });
});
