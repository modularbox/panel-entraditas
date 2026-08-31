import { describe, expect, it } from "vitest";
import {
  DiscountCodeSchema, EventSchema, GateSchema, GuestListEntrySchema, GuestListSchema, InvitationSchema, OrderItemSchema, OrderSchema, TicketTypeSchema, UserSchema, ZoneSchema
} from "./schemas";

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

describe("OrderItemSchema", () => {
  it("accepts a valid order item", () => {
    expect(() => OrderItemSchema.parse({
      id: "oi-1", orderId: "order-1", ticketTypeId: "tt-1", ticketTypeName: "General",
      quantity: 2, unitPrice: 2500, subtotal: 5000
    })).not.toThrow();
  });

  it("rejects a zero quantity", () => {
    expect(() => OrderItemSchema.parse({
      id: "oi-1", orderId: "order-1", ticketTypeId: "tt-1", ticketTypeName: "General",
      quantity: 0, unitPrice: 2500, subtotal: 0
    })).toThrow();
  });
});

describe("OrderSchema", () => {
  const validOrder = {
    id: "order-1", orderNumber: "PED-2026-0001", eventId: "event-1", organizationId: "org-1",
    customerName: "Marta Ruiz", customerEmail: "marta.ruiz@example.com", status: "paid",
    total: 5000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-05T10:00:00.000Z"
  };

  it("accepts a valid paid order with refundedAmount", () => {
    expect(() => OrderSchema.parse(validOrder)).not.toThrow();
  });

  it("rejects an order missing refundedAmount", () => {
    const { refundedAmount, ...withoutField } = validOrder;
    expect(() => OrderSchema.parse(withoutField)).toThrow();
  });
});

describe("GateSchema", () => {
  it("accepts a valid gate open to every sub-event and ticket type", () => {
    const result = GateSchema.parse({
      id: "gate-1",
      eventId: "event-2",
      subEventId: null,
      name: "Puerta Norte",
      code: "NORTE",
      zoneId: "zone-pista",
      direction: "in",
      allowReentry: false,
      maxScansPerTicket: 1,
      allowedTicketTypeGroupIds: null,
      opensAt: null,
      closesAt: null,
      operatorUserIds: ["user-subuser"],
      isActive: true
    });
    expect(result.code).toBe("NORTE");
  });

  it("accepts a gate scoped to a specific sub-event and ticket-type groups", () => {
    const result = GateSchema.parse({
      id: "gate-2",
      eventId: "event-2",
      subEventId: "sub-event-2",
      name: "Puerta Sur",
      code: "SUR",
      zoneId: null,
      direction: "both",
      allowReentry: true,
      maxScansPerTicket: 3,
      allowedTicketTypeGroupIds: ["tt-2-pista"],
      opensAt: "2026-11-05T19:00:00.000Z",
      closesAt: "2026-11-05T23:00:00.000Z",
      operatorUserIds: [],
      isActive: true
    });
    expect(result.allowedTicketTypeGroupIds).toEqual(["tt-2-pista"]);
  });

  it("rejects an unknown direction", () => {
    expect(() =>
      GateSchema.parse({
        id: "gate-3", eventId: "event-2", subEventId: null, name: "Puerta X", code: "X", zoneId: null,
        direction: "sideways", allowReentry: false, maxScansPerTicket: 1, allowedTicketTypeGroupIds: null,
        opensAt: null, closesAt: null, operatorUserIds: [], isActive: true
      })
    ).toThrow();
  });

  it("rejects a non-positive maxScansPerTicket", () => {
    expect(() =>
      GateSchema.parse({
        id: "gate-4", eventId: "event-2", subEventId: null, name: "Puerta X", code: "X", zoneId: null,
        direction: "in", allowReentry: false, maxScansPerTicket: 0, allowedTicketTypeGroupIds: null,
        opensAt: null, closesAt: null, operatorUserIds: [], isActive: true
      })
    ).toThrow();
  });
});

describe("GuestListSchema", () => {
  it("accepts a valid guest list with a quota", () => {
    const result = GuestListSchema.parse({
      id: "gl-1", eventId: "event-2", subEventId: null, name: "Prensa", quota: 5
    });
    expect(result.quota).toBe(5);
  });

  it("accepts a guest list without a quota (unlimited)", () => {
    const result = GuestListSchema.parse({
      id: "gl-2", eventId: "event-2", subEventId: "sub-event-2", name: "Patrocinadores", quota: null
    });
    expect(result.quota).toBeNull();
  });
});

describe("GuestListEntrySchema", () => {
  it("accepts a valid pending entry", () => {
    const result = GuestListEntrySchema.parse({
      id: "gle-1", guestListId: "gl-1", fullName: "Marta López", email: "marta@example.com",
      phone: null, companions: 0, status: "pending", notes: null
    });
    expect(result.status).toBe("pending");
  });

  it("accepts a checked-in entry with companions and notes", () => {
    const result = GuestListEntrySchema.parse({
      id: "gle-2", guestListId: "gl-1", fullName: "Carlos Ruiz", email: null,
      phone: "600111222", companions: 1, status: "checked_in", notes: "Fotógrafo acreditado"
    });
    expect(result.companions).toBe(1);
  });

  it("rejects an unknown status", () => {
    expect(() =>
      GuestListEntrySchema.parse({
        id: "gle-3", guestListId: "gl-1", fullName: "X", email: null, phone: null,
        companions: 0, status: "sent", notes: null
      })
    ).toThrow();
  });
});

describe("InvitationSchema", () => {
  it("accepts a valid pending invitation", () => {
    expect(() => InvitationSchema.parse({
      id: "inv-1", token: "tok-abc123", userId: "user-1", email: "nueva@example.com",
      organizationId: "org-1", invitedByUserId: "user-admin", status: "pending", createdAt: "2026-08-25T00:00:00.000Z"
    })).not.toThrow();
  });

  it("rejects an invalid status", () => {
    expect(() => InvitationSchema.parse({
      id: "inv-1", token: "tok-abc123", userId: "user-1", email: "nueva@example.com",
      organizationId: "org-1", invitedByUserId: "user-admin", status: "expired", createdAt: "2026-08-25T00:00:00.000Z"
    })).toThrow();
  });
});
