import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb, demoPasswordFor } from "@/mocks/state";
import type { Event } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", {
    email,
    password: demoPasswordFor(email)
  });
  return result.accessToken;
}

describe("events handlers", () => {
  afterEach(() => resetDb());

  it("superadmin sees all 5 seeded events", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const events = await apiClient.get<Event[]>("/events", { token });
    expect(events).toHaveLength(5);
  });

  it("a user with limited eventScopes only sees their 2 scoped events", async () => {
    const token = await loginAs("usuario@entraditas.com");
    const events = await apiClient.get<Event[]>("/events", { token });
    expect(events.map((e) => e.id).sort()).toEqual(["event-1", "event-2"]);
  });

  it("returns NOT_FOUND (not FORBIDDEN) for an out-of-scope event, to avoid leaking existence", async () => {
    const token = await loginAs("usuario@entraditas.com");
    await expect(apiClient.get("/events/event-3", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates a draft event under the caller's organization", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<Event>(
      "/events",
      { title: "Evento nuevo", category: "concierto", hasSubEvents: false },
      { token }
    );
    expect(created.status).toBe("draft");
    expect(created.organizationId).toBe("org-1");
  });

  it("updates a field via PATCH", async () => {
    const token = await loginAs("admin@entraditas.com");
    const updated = await apiClient.patch<Event>("/events/event-1", { title: "Título actualizado" }, { token });
    expect(updated.title).toBe("Título actualizado");
  });

  it("reuses an existing venue when the name and city match, case-insensitively", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<Event>(
      "/events",
      { title: "Evento en Apolo", category: "concierto", venueName: "sala apolo", city: "MADRID" },
      { token }
    );
    expect(created.venueId).toBe("venue-1");
    expect(db.venues).toHaveLength(3); // no se crea un recinto nuevo
  });

  it("creates a new venue with an unbounded default capacity when no match exists", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<Event>(
      "/events",
      { title: "Evento nuevo recinto", category: "concierto", venueName: "Nuevo Recinto", city: "Bilbao" },
      { token }
    );
    const venue = db.venues.find((v) => v.id === created.venueId)!;
    expect(venue).toMatchObject({ name: "Nuevo Recinto", city: "Bilbao", totalCapacity: 999999 });
  });

  it("creates the first sub-event from date and time for a single-function event", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<Event>(
      "/events",
      { title: "Evento con fecha", category: "concierto", hasSubEvents: false, date: "2026-12-05", time: "21:00" },
      { token }
    );
    const subEvents = db.subEvents.filter((s) => s.eventId === created.id);
    expect(subEvents).toHaveLength(1);
    expect(subEvents[0]).toMatchObject({ startsAt: "2026-12-05T21:00:00.000Z", endsAt: "2026-12-06T00:00:00.000Z" });
  });

  it("does not auto-create a sub-event when the event has multiple functions", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<Event>(
      "/events",
      { title: "Evento multi-función", category: "concierto", hasSubEvents: true, date: "2026-12-05", time: "21:00" },
      { token }
    );
    expect(db.subEvents.filter((s) => s.eventId === created.id)).toHaveLength(0);
  });

  it("updates the first sub-event's date and time on PATCH", async () => {
    const token = await loginAs("admin@entraditas.com");
    await apiClient.patch<Event>("/events/event-1", { date: "2026-10-15", time: "22:00" }, { token });
    const updated = db.subEvents.find((s) => s.id === "sub-event-1")!;
    expect(updated.startsAt).toBe("2026-10-15T22:00:00.000Z");
    expect(updated.endsAt).toBe("2026-10-16T01:00:00.000Z");
  });

  it("blocks deleting a non-draft event and allows deleting a draft one", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(apiClient.delete("/events/event-1", { token })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    const draft = await apiClient.post<Event>("/events", { title: "Borrador", category: "otros" }, { token });
    await apiClient.delete(`/events/${draft.id}`, { token });
    expect(db.events.some((e) => e.id === draft.id)).toBe(false);
  });

  it("blocks publishing an event with zero ticket types, and succeeds once it has one", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(apiClient.post("/events/event-5/publish", undefined, { token })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });

    db.ticketTypes.push({
      id: "tt-5", groupId: "tt-5", eventId: "event-5", subEventId: null, capacityPoolId: null,
      name: "General", kind: "pago", basePrice: 1000, currency: "EUR", quantityTotal: 100, quantitySold: 0,
      minPerOrder: 1, maxPerOrder: 4, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0,
      color: null
    });

    const submitted = await apiClient.post<Event>("/events/event-5/publish", undefined, { token });
    expect(submitted.status).toBe("pending_review");
  });

  it("summary reports the total capacity across an event's pools", async () => {
    const token = await loginAs("admin@entraditas.com");
    const summary = await apiClient.get<{ totalCapacity: number; subEventsCount: number }>(
      "/events/event-2/summary",
      { token }
    );
    expect(summary.totalCapacity).toBe(1200);
    expect(summary.subEventsCount).toBe(1);
  });
});
