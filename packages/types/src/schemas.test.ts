import { describe, expect, it } from "vitest";
import { EventSchema, InvitationSchema, OrderItemSchema, OrderSchema, TicketTypeSchema, UserSchema } from "./schemas";

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
