import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { Event } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", {
    email,
    password: "demo1234"
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
      name: "General", kind: "paid", basePrice: 1000, currency: "EUR", quantityTotal: 100, quantitySold: 0,
      minPerOrder: 1, maxPerOrder: 4, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0
    });

    const published = await apiClient.post<Event>("/events/event-5/publish", undefined, { token });
    expect(published.status).toBe("published");
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
