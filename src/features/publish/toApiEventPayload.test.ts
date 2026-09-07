import { describe, expect, it } from "vitest";
import type { Event, TicketType, Venue } from "@entraditas/types";
import { toPublicEvent } from "./toPublicEvent";
import { missingForApi, splitStartsAt, toApiEventPayload } from "./toApiEventPayload";

const EVENT: Event = {
  id: "event-1",
  organizationId: "org-1",
  venueId: "venue-1",
  slug: "noche-de-jazz",
  title: "Noche de Jazz",
  description: "Corto",
  category: "concierto",
  status: "published",
  visibility: "public",
  startsAt: "2026-10-10T21:00:00.000Z",
  endsAt: null,
  salesStartAt: null,
  salesEndAt: null,
  hasSubEvents: false,
  createdAt: "2026-07-01T00:00:00.000Z"
};

const VENUE: Venue = {
  id: "venue-1",
  organizationId: "org-1",
  name: "Teatro Circo",
  city: "Badajoz",
  totalCapacity: 400
};

function ticketType(overrides: Partial<TicketType> = {}): TicketType {
  return {
    id: "tt-1",
    groupId: "general",
    eventId: "event-1",
    subEventId: null,
    name: "General",
    kind: "pago",
    basePrice: 2500,
    currency: "EUR",
    quantityTotal: 100,
    quantitySold: 0,
    minPerOrder: 1,
    maxPerOrder: 6,
    visibility: "public",
    isTransferable: true,
    isRefundable: true,
    sortOrder: 0,
    ...overrides
  };
}

const publicEvent = (event: Event = EVENT, ticketTypes: TicketType[] = [ticketType()]) =>
  toPublicEvent({ event, venue: VENUE, ticketTypes });

describe("splitStartsAt", () => {
  it("splits an ISO timestamp into the date and time the API stores", () => {
    // Local time: the API compares against what the organizer typed, not UTC.
    const parsed = new Date("2026-10-10T21:00:00.000Z");
    const pad = (n: number) => String(n).padStart(2, "0");
    expect(splitStartsAt("2026-10-10T21:00:00.000Z")).toEqual({
      date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
      time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
    });
  });

  it("has no date or time for an event still to be announced", () => {
    expect(splitStartsAt(null)).toEqual({ date: null, time: null });
  });
});

describe("toApiEventPayload", () => {
  it("adds the field names the API validates without dropping the contract", () => {
    const payload = toApiEventPayload(publicEvent());
    // What the API validates:
    expect(payload.ticketTiers).toHaveLength(1);
    expect(payload.status).toBe("published");
    expect(payload.date).not.toBeNull();
    // What the contract carries and must survive untouched:
    expect(payload.tiers[0]!.price).toBe(2500);
    expect(payload.rules).toBeDefined();
    expect(payload.sessions).toBeDefined();
  });

  it("converts the ticket price to euros for the field the buyer site reads", () => {
    const payload = toApiEventPayload(publicEvent());
    expect(payload.ticketTiers[0]!.price).toBe(25);
  });

  it("represents an unlimited tier as a high number instead of sold out", () => {
    const payload = toApiEventPayload(publicEvent(EVENT, [ticketType({ quantityTotal: null })]));
    expect(payload.ticketTiers[0]!.available).toBe(9999);
  });

  it("leaves date and time empty for an event with no confirmed date", () => {
    const payload = toApiEventPayload(publicEvent({ ...EVENT, datePending: true }));
    expect(payload.dateStatus).toBe("to_be_announced");
    expect(payload.date).toBeNull();
  });
});

describe("missingForApi", () => {
  it("accepts a complete event", () => {
    expect(missingForApi(toApiEventPayload(publicEvent()))).toEqual([]);
  });

  it("reports an event with no ticket types", () => {
    expect(missingForApi(toApiEventPayload(publicEvent(EVENT, [])))).toContain("al menos un tipo de entrada");
  });

  it("reports a confirmed event that somehow lost its date", () => {
    const payload = { ...toApiEventPayload(publicEvent()), date: null };
    expect(missingForApi(payload)).toContain("fecha y hora");
  });

  it("does not ask for a date when the event is still to be announced", () => {
    const payload = toApiEventPayload(publicEvent({ ...EVENT, datePending: true }));
    expect(missingForApi(payload)).not.toContain("fecha y hora");
  });

  it("reports a missing venue, which the API refuses", () => {
    const payload = toApiEventPayload(toPublicEvent({ event: EVENT, ticketTypes: [ticketType()] }));
    expect(missingForApi(payload)).toContain("nombre del recinto");
  });
});
