import { afterEach, describe, expect, it } from "vitest";
import { PublicEventSchema, type PublicEvent } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";

/**
 * These routes are what entraditas.com will call. They must work with no session at all and
 * must never expose an event the organiser has not published.
 */
describe("public catalogue handlers", () => {
  afterEach(() => resetDb());

  it("serves the catalogue without any authentication", async () => {
    const events = await apiClient.get<PublicEvent[]>("/public/events");
    expect(events.length).toBeGreaterThan(0);
  });

  it("returns events that satisfy the published contract", async () => {
    const events = await apiClient.get<PublicEvent[]>("/public/events");
    for (const event of events) {
      expect(() => PublicEventSchema.parse(event)).not.toThrow();
    }
  });

  it("lists events across organisations, since a buyer browses them all at once", async () => {
    const events = await apiClient.get<PublicEvent[]>("/public/events");
    const organizationIds = new Set(
      events.map((event) => db.events.find((candidate) => candidate.id === event.id)!.organizationId)
    );
    expect(organizationIds.size).toBeGreaterThan(1);
  });

  it("never exposes a draft event", async () => {
    const draft = db.events.find((event) => event.status === "published")!;
    draft.status = "draft";

    const events = await apiClient.get<PublicEvent[]>("/public/events");

    expect(events.some((event) => event.id === draft.id)).toBe(false);
  });

  it("never exposes an event that is only awaiting review", async () => {
    const event = db.events.find((candidate) => candidate.status === "published")!;
    event.status = "pending_review";

    const events = await apiClient.get<PublicEvent[]>("/public/events");

    expect(events.some((candidate) => candidate.id === event.id)).toBe(false);
  });

  it("filters by category", async () => {
    const all = await apiClient.get<PublicEvent[]>("/public/events");
    const category = all[0]!.category;

    const filtered = await apiClient.get<PublicEvent[]>(`/public/events?category=${category}`);

    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((event) => event.category === category)).toBe(true);
  });

  it("returns nothing for a category with no published events", async () => {
    const all = await apiClient.get<PublicEvent[]>("/public/events");
    const unused = (["cine", "familiar", "deporte"] as const).find(
      (category) => !all.some((event) => event.category === category)
    )!;

    expect(await apiClient.get<PublicEvent[]>(`/public/events?category=${unused}`)).toEqual([]);
  });

  it("searches by title", async () => {
    const all = await apiClient.get<PublicEvent[]>("/public/events");
    const target = all[0]!;

    const found = await apiClient.get<PublicEvent[]>(`/public/events?q=${encodeURIComponent(target.title)}`);

    expect(found.some((event) => event.id === target.id)).toBe(true);
  });

  it("serves a single event by its public slug", async () => {
    const all = await apiClient.get<PublicEvent[]>("/public/events");
    const target = all[0]!;

    const event = await apiClient.get<PublicEvent>(`/public/events/${target.slug}`);

    expect(event.id).toBe(target.id);
  });

  it("404s for an unpublished slug instead of leaking it", async () => {
    const event = db.events.find((candidate) => candidate.status === "published")!;
    event.status = "draft";

    await expect(apiClient.get<PublicEvent>(`/public/events/${event.slug}`)).rejects.toThrow();
  });

  it("publishes each event's discount codes so the buyer site can validate them", async () => {
    const withCodes = db.discountCodes[0];
    if (!withCodes) return;
    const parent = db.events.find((event) => event.id === withCodes.eventId)!;
    parent.status = "published";
    parent.visibility = "public";
    withCodes.status = "active";

    const event = await apiClient.get<PublicEvent>(`/public/events/${parent.slug}`);

    expect(event.discountCodes.some((code) => code.code === withCodes.code)).toBe(true);
  });
});
