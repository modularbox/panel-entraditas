import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { SubEvent } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

describe("sub-events handlers", () => {
  afterEach(() => resetDb());

  it("lists the 4 recurring sub-events already seeded for the theater event", async () => {
    const token = await loginAs("admin@entraditas.com");
    const subEvents = await apiClient.get<SubEvent[]>("/events/event-3/sub-events", { token });
    expect(subEvents).toHaveLength(4);
  });

  it("bulk-generates sub-events from a recurring pattern", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<SubEvent[]>(
      "/events/event-5/sub-events/bulk",
      { startDate: "2026-12-01", time: "20:00", durationMinutes: 90, occurrences: 3, intervalDays: 7, namePrefix: "Sesión" },
      { token }
    );
    expect(created).toHaveLength(3);
    expect(db.subEvents.filter((s) => s.eventId === "event-5")).toHaveLength(4); // 3 new + the seeded one
  });

  it("cancels a sub-event", async () => {
    const token = await loginAs("admin@entraditas.com");
    const cancelled = await apiClient.post<SubEvent>("/sub-events/sub-event-3-0/cancel", undefined, { token });
    expect(cancelled.status).toBe("cancelled");
  });

  it("returns NOT_FOUND for a sub-event belonging to an out-of-scope event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    await expect(
      apiClient.get("/events/event-3/sub-events", { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
