import { describe, expect, it } from "vitest";
import { DiscountCodeSchema, EventSchema, TicketTypeSchema, UserSchema, ZoneSchema } from "./schemas";

const validEvent = {
  id: "11111111-1111-1111-1111-111111111111",
  organizationId: "org-1",
  venueId: null,
  slug: "concierto-de-prueba",
  title: "Concierto de prueba",
  description: "Descripción",
  category: "concierto",
  status: "draft",
  visibility: "public",
  startsAt: "2026-10-01T20:00:00.000Z",
  endsAt: "2026-10-01T23:00:00.000Z",
  salesStartAt: null,
  salesEndAt: null,
  hasSubEvents: false,
  isCompetition: false,
  createdAt: "2026-08-01T00:00:00.000Z"
};

describe("EventSchema", () => {
  it("accepts a valid draft event", () => {
    expect(() => EventSchema.parse(validEvent)).not.toThrow();
  });

  it("rejects an event with an invalid status", () => {
    expect(() => EventSchema.parse({ ...validEvent, status: "bogus" })).toThrow();
  });
});

describe("TicketTypeSchema", () => {
  it("accepts an event-scoped ticket type with subEventId null", () => {
    const result = TicketTypeSchema.parse({
      id: "tt-1",
      groupId: "tt-1",
      eventId: "11111111-1111-1111-1111-111111111111",
      subEventId: null,
      name: "Abono festival",
      kind: "abono",
      basePrice: 4500,
      currency: "EUR",
      quantityTotal: 200,
      quantitySold: 0,
      minPerOrder: 1,
      maxPerOrder: 4,
      visibility: "public",
      isTransferable: true,
      isRefundable: true,
      sortOrder: 0,
      color: null
    });
    expect(result.subEventId).toBeNull();
  });

  it("accepts a ticket type with a color and one without", () => {
    const base = {
      id: "tt-1",
      groupId: "tt-1",
      eventId: "11111111-1111-1111-1111-111111111111",
      subEventId: null,
      name: "Abono festival",
      kind: "abono" as const,
      basePrice: 4500,
      currency: "EUR",
      quantityTotal: 200,
      quantitySold: 0,
      minPerOrder: 1,
      maxPerOrder: 4,
      visibility: "public" as const,
      isTransferable: true,
      isRefundable: true,
      sortOrder: 0
    };
    expect(() => TicketTypeSchema.parse({ ...base, color: "#3b82f6" })).not.toThrow();
    expect(() => TicketTypeSchema.parse({ ...base, color: null })).not.toThrow();
  });
});

describe("ZoneSchema", () => {
  it("accepts a sellable zone with position and capacity", () => {
    const zone = ZoneSchema.parse({
      id: "zone-1", venueId: "venue-1", name: "Pista", kind: "standing",
      capacity: 500, x: 5, y: 20, width: 40, height: 30
    });
    expect(zone.kind).toBe("standing");
  });

  it("accepts a stage marker with zero capacity", () => {
    expect(() =>
      ZoneSchema.parse({
        id: "zone-2", venueId: "venue-1", name: "Escenario", kind: "stage",
        capacity: 0, x: 20, y: 2, width: 60, height: 12
      })
    ).not.toThrow();
  });

  it("rejects an unknown zone kind", () => {
    expect(() =>
      ZoneSchema.parse({
        id: "zone-3", venueId: "venue-1", name: "X", kind: "bogus",
        capacity: 0, x: 0, y: 0, width: 10, height: 10
      })
    ).toThrow();
  });
});

describe("UserSchema", () => {
  it("rejects an unknown role slug", () => {
    expect(() =>
      UserSchema.parse({
        id: "u-1",
        organizationId: "org-1",
        parentUserId: null,
        role: "owner",
        email: "x@example.com",
        fullName: "X",
        status: "active",
        permissionOverrides: [],
        eventScopes: []
      })
    ).toThrow();
  });
});

describe("DiscountCodeSchema", () => {
  it("accepts a valid discount code", () => {
    const result = DiscountCodeSchema.parse({
      id: "dc-1",
      eventId: "event-1",
      code: "VERANO10",
      type: "percent",
      value: 10,
      maxUses: 100,
      usedCount: 0,
      maxUsesPerCustomer: 1,
      appliesTo: null,
      validFrom: null,
      validTo: null,
      status: "active"
    });
    expect(result.code).toBe("VERANO10");
  });

  it("accepts appliesTo as a list of ticket-type group ids", () => {
    const result = DiscountCodeSchema.parse({
      id: "dc-2",
      eventId: "event-1",
      code: "VIPONLY",
      type: "fixed",
      value: 500,
      maxUses: null,
      usedCount: 0,
      maxUsesPerCustomer: null,
      appliesTo: ["tt-1", "tt-2"],
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-02-01T00:00:00.000Z",
      status: "inactive"
    });
    expect(result.appliesTo).toEqual(["tt-1", "tt-2"]);
  });

  it("rejects an unknown type", () => {
    expect(() =>
      DiscountCodeSchema.parse({
        id: "dc-3",
        eventId: "event-1",
        code: "BAD",
        type: "bogus",
        value: 10,
        maxUses: null,
        usedCount: 0,
        maxUsesPerCustomer: null,
        appliesTo: null,
        validFrom: null,
        validTo: null,
        status: "active"
      })
    ).toThrow();
  });
});
