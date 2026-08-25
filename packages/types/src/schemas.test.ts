import { describe, expect, it } from "vitest";
import { EventSchema, TicketTypeSchema, UserSchema } from "./schemas";

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
      kind: "pass",
      basePrice: 4500,
      currency: "EUR",
      quantityTotal: 200,
      quantitySold: 0,
      minPerOrder: 1,
      maxPerOrder: 4,
      visibility: "public",
      isTransferable: true,
      isRefundable: true,
      sortOrder: 0
    });
    expect(result.subEventId).toBeNull();
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
