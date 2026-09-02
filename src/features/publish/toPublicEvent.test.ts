import { describe, expect, it } from "vitest";
import { PublicEventSchema, type CapacityPool, type DiscountCode, type Event, type SubEvent, type TicketType, type Venue, type Zone } from "@entraditas/types";
import { isPubliclyVisible, toDiscountCodes, toPublicEvent, toSeatZones, toTiers } from "./toPublicEvent";

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
  endsAt: "2026-10-10T23:30:00.000Z",
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
  province: "Badajoz",
  address: "Calle Mayor 1",
  coordinates: { lat: 38.8, lng: -6.97 },
  totalCapacity: 400
};

function ticketType(overrides: Partial<TicketType> & Pick<TicketType, "id" | "groupId" | "name">): TicketType {
  return {
    eventId: "event-1",
    subEventId: null,
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

describe("isPubliclyVisible", () => {
  it("publishes an event that is published and public", () => {
    expect(isPubliclyVisible(EVENT)).toBe(true);
  });

  it("keeps drafts and events awaiting review out of the catalogue", () => {
    expect(isPubliclyVisible({ ...EVENT, status: "draft" })).toBe(false);
    expect(isPubliclyVisible({ ...EVENT, status: "pending_review" })).toBe(false);
    expect(isPubliclyVisible({ ...EVENT, status: "in_review" })).toBe(false);
    expect(isPubliclyVisible({ ...EVENT, status: "rejected" })).toBe(false);
  });

  it("keeps private and unlisted events out of the catalogue", () => {
    expect(isPubliclyVisible({ ...EVENT, visibility: "private" })).toBe(false);
    expect(isPubliclyVisible({ ...EVENT, visibility: "unlisted" })).toBe(false);
  });
});

describe("toTiers", () => {
  it("collapses the rows of one ticket type group into a single buyer-facing tier", () => {
    const tiers = toTiers([
      ticketType({ id: "a1", groupId: "general", name: "General", subEventId: "s1", quantityTotal: 50 }),
      ticketType({ id: "a2", groupId: "general", name: "General", subEventId: "s2", quantityTotal: 50 })
    ]);
    expect(tiers).toHaveLength(1);
    expect(tiers[0]!.available).toBe(100);
  });

  it("discounts what is already sold from availability", () => {
    const tiers = toTiers([ticketType({ id: "a", groupId: "g", name: "General", quantityTotal: 100, quantitySold: 30 })]);
    expect(tiers[0]!.available).toBe(70);
  });

  it("reports an unlimited tier as unlimited", () => {
    const tiers = toTiers([ticketType({ id: "a", groupId: "g", name: "General", quantityTotal: null })]);
    expect(tiers[0]!.available).toBeNull();
  });

  it("orders tiers by price so priceFrom is easy to show", () => {
    const tiers = toTiers([
      ticketType({ id: "a", groupId: "vip", name: "VIP", basePrice: 5000 }),
      ticketType({ id: "b", groupId: "gen", name: "General", basePrice: 1500 })
    ]);
    expect(tiers.map((tier) => tier.name)).toEqual(["General", "VIP"]);
  });

  it("keeps prices in minor units so the buyer site never sees a float", () => {
    const tiers = toTiers([ticketType({ id: "a", groupId: "g", name: "General", basePrice: 2500 })]);
    expect(tiers[0]!.price).toBe(2500);
  });
});

describe("toSeatZones", () => {
  const numbered: Zone = {
    id: "zone-1",
    venueId: "venue-1",
    name: "Platea",
    kind: "numbered",
    capacity: 6,
    rows: 2,
    x: 10,
    y: 30,
    width: 20,
    height: 20
  };
  const stage: Zone = { id: "stage-1", venueId: "venue-1", name: "Escenario", kind: "stage", capacity: 0, x: 20, y: 2, width: 60, height: 12 };

  function pool(overrides: Partial<CapacityPool>): CapacityPool {
    return { id: "pool-1", subEventId: "sub-1", zoneId: "zone-1", name: "Platea", totalCapacity: 6, soldCount: 0, heldCount: 0, ...overrides };
  }

  it("ships the seats explicitly with the same labels the organiser sees", () => {
    const [zone] = toSeatZones([numbered], [pool({})]);
    expect(zone!.seats!.map((seat) => seat.label)).toEqual(["A1", "A2", "A3", "B1", "B2", "B3"]);
  });

  it("carries each seat's ticket type across", () => {
    const [zone] = toSeatZones([numbered], [pool({ seatAssignments: [{ seatId: "A-1", ticketTypeGroupId: "vip" }] })]);
    expect(zone!.seats!.find((seat) => seat.id === "A-1")!.tierId).toBe("vip");
  });

  it("marks unassigned seats as not for sale rather than sold", () => {
    const [zone] = toSeatZones([numbered], [pool({ seatAssignments: [{ seatId: "A-1", ticketTypeGroupId: "vip" }] })]);
    const seat = zone!.seats!.find((candidate) => candidate.id === "A-2")!;
    expect(seat.tierId).toBeNull();
    expect(seat.sold).toBe(false);
  });

  it("falls back to the whole-zone ticket type when the zone was never split seat by seat", () => {
    const [zone] = toSeatZones([numbered], [pool({ ticketTypeGroupId: "general" })]);
    expect(zone!.seats!.every((seat) => seat.tierId === "general")).toBe(true);
  });

  it("numbers row A closest to the stage", () => {
    // Stage sits below the zone, so the row drawn last is the one nearest it and becomes A.
    const below: Zone = { ...stage, y: 80, height: 10 };
    const [zone] = toSeatZones([numbered, below], [pool({})]);
    expect(zone!.seats!.slice(0, 3).map((seat) => seat.label)).toEqual(["B1", "B2", "B3"]);
  });

  it("publishes a standing zone as free capacity with its tier", () => {
    const standing: Zone = { ...numbered, id: "zone-2", name: "Pista", kind: "standing", capacity: 300 };
    const [zone] = toSeatZones([standing], [pool({ zoneId: "zone-2", ticketTypeGroupId: "general" })]);
    expect(zone!.kind).toBe("ga");
    expect(zone!.capacity).toBe(300);
    expect(zone!.tierId).toBe("general");
  });

  it("leaves gates out of the buyer's plan", () => {
    const gate: Zone = { ...numbered, id: "gate-1", name: "Puerta Norte", kind: "gate", capacity: 0 };
    expect(toSeatZones([gate], [])).toEqual([]);
  });
});

describe("toDiscountCodes", () => {
  function code(overrides: Partial<DiscountCode>): DiscountCode {
    return {
      id: "dc-1",
      eventId: "event-1",
      code: "BIENVENIDA10",
      type: "percent",
      value: 10,
      maxUses: null,
      usedCount: 0,
      maxUsesPerCustomer: null,
      appliesTo: null,
      validFrom: null,
      validTo: null,
      status: "active",
      ...overrides
    };
  }

  it("publishes an active code with its type and value untouched", () => {
    expect(toDiscountCodes([code({})])).toEqual([
      {
        code: "BIENVENIDA10",
        type: "percent",
        value: 10,
        appliesToTierIds: null,
        validFrom: null,
        validTo: null,
        maxUsesPerCustomer: null
      }
    ]);
  });

  it("keeps a fixed discount in minor units", () => {
    expect(toDiscountCodes([code({ type: "fixed", value: 500 })])[0]!.value).toBe(500);
  });

  it("hides inactive codes", () => {
    expect(toDiscountCodes([code({ status: "inactive" })])).toEqual([]);
  });

  it("hides a code that has run out of uses", () => {
    expect(toDiscountCodes([code({ maxUses: 5, usedCount: 5 })])).toEqual([]);
  });

  it("still publishes a code with uses left", () => {
    expect(toDiscountCodes([code({ maxUses: 5, usedCount: 4 })])).toHaveLength(1);
  });

  it("carries the tier restriction so the buyer site applies it to the right tickets", () => {
    expect(toDiscountCodes([code({ appliesTo: ["vip"] })])[0]!.appliesToTierIds).toEqual(["vip"]);
  });
});

describe("toPublicEvent", () => {
  const subEvent: SubEvent = {
    id: "sub-1",
    eventId: "event-1",
    name: "Unica",
    startsAt: "2026-10-10T21:00:00.000Z",
    endsAt: null,
    doorsOpenAt: null,
    status: "on_sale",
    sortOrder: 0
  };

  it("produces an event that satisfies the published contract", () => {
    const result = toPublicEvent({
      event: EVENT,
      venue: VENUE,
      subEvents: [subEvent],
      ticketTypes: [ticketType({ id: "a", groupId: "g", name: "General" })]
    });
    expect(() => PublicEventSchema.parse(result)).not.toThrow();
  });

  it("falls back to the short description when the organiser left the long one empty", () => {
    expect(toPublicEvent({ event: EVENT }).longDescription).toBe("Corto");
    expect(toPublicEvent({ event: { ...EVENT, longDescription: "  " } }).longDescription).toBe("Corto");
    expect(toPublicEvent({ event: { ...EVENT, longDescription: "Largo" } }).longDescription).toBe("Largo");
  });

  it("hides the date and flags it as pending when the organiser has not confirmed one", () => {
    const result = toPublicEvent({ event: { ...EVENT, datePending: true } });
    expect(result.dateStatus).toBe("to_be_announced");
    expect(result.startsAt).toBeNull();
  });

  it("reports the cheapest tier as priceFrom", () => {
    const result = toPublicEvent({
      event: EVENT,
      ticketTypes: [
        ticketType({ id: "a", groupId: "vip", name: "VIP", basePrice: 5000 }),
        ticketType({ id: "b", groupId: "gen", name: "General", basePrice: 1500 })
      ]
    });
    expect(result.priceFrom).toBe(1500);
  });

  it("has no priceFrom when nothing is on sale", () => {
    expect(toPublicEvent({ event: EVENT }).priceFrom).toBeNull();
  });

  it("keeps hidden and code-only ticket types out of the catalogue", () => {
    const result = toPublicEvent({
      event: EVENT,
      ticketTypes: [
        ticketType({ id: "a", groupId: "gen", name: "General" }),
        ticketType({ id: "b", groupId: "oculta", name: "Oculta", visibility: "hidden" }),
        ticketType({ id: "c", groupId: "codigo", name: "Con codigo", visibility: "code_only" })
      ]
    });
    expect(result.tiers.map((tier) => tier.name)).toEqual(["General"]);
  });

  it("sends the booking fee as type and value instead of a flat amount", () => {
    const result = toPublicEvent({ event: { ...EVENT, serviceFeeType: "percent", serviceFeeValue: 5 } });
    expect(result.serviceFee).toEqual({ type: "percent", value: 5 });
  });

  it("defaults to no booking fee when the organiser set none", () => {
    expect(toPublicEvent({ event: EVENT }).serviceFee).toEqual({ type: "none", value: 0 });
  });

  it("publishes the venue address the buyer site needs", () => {
    const result = toPublicEvent({ event: EVENT, venue: VENUE });
    expect(result.venue).toMatchObject({ city: "Badajoz", province: "Badajoz", address: "Calle Mayor 1" });
  });

  it("has no seat map when the organiser drew no plan", () => {
    expect(toPublicEvent({ event: EVENT }).seatMap).toBeNull();
  });

  it("publishes the teams of a versus event", () => {
    const result = toPublicEvent({
      event: { ...EVENT, isCompetition: true, matchup: { competition: "Liga", home: "A", away: "B" } }
    });
    expect(result.matchup).toEqual({ competition: "Liga", home: "A", away: "B", homeLogo: null, awayLogo: null });
  });

  it("does not leak internal review state", () => {
    const result = toPublicEvent({ event: EVENT }) as Record<string, unknown>;
    expect(result.status).toBeUndefined();
    expect(result.organizationId).toBeUndefined();
    expect(result.visibility).toBeUndefined();
  });
});
