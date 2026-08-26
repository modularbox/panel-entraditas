import type {
  CapacityPool, DiscountCode, Event, Invitation, Order, OrderItem, Organization, Refund, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
} from "@entraditas/types";

export interface Database {
  organizations: Organization[];
  users: User[];
  venues: Venue[];
  zones: Zone[];
  events: Event[];
  subEvents: SubEvent[];
  capacityPools: CapacityPool[];
  ticketTypes: TicketType[];
  ticketTypePrices: TicketTypePrice[];
  discountCodes: DiscountCode[];
  invitations: Invitation[];
  orders: Order[];
  orderItems: OrderItem[];
  refunds: Refund[];
}

export const DEMO_SUPERADMIN_ID = "user-superadmin";
export const DEMO_ADMIN_ID = "user-admin";
export const DEMO_USER_ID = "user-limited";
export const DEMO_SUBUSER_ID = "user-subuser";

export function createSeedDatabase(): Database {
  const org1: Organization = { id: "org-1", name: "Producciones Norte", slug: "producciones-norte", commissionRate: 0.08 };
  const org2: Organization = { id: "org-2", name: "Sur Live", slug: "sur-live", commissionRate: 0.1 };

  const venue1: Venue = { id: "venue-1", organizationId: "org-1", name: "Sala Apolo", city: "Madrid", totalCapacity: 1200 };
  const venue2: Venue = { id: "venue-2", organizationId: "org-1", name: "Teatro Circo", city: "Barcelona", totalCapacity: 400 };
  const venue3: Venue = { id: "venue-3", organizationId: "org-2", name: "Recinto Sur", city: "Sevilla", totalCapacity: 3000 };

  const zonePista: Zone = {
    id: "zone-pista", venueId: venue1.id, name: "Pista", kind: "standing", capacity: 800,
    x: 5, y: 20, width: 40, height: 60
  };
  const zoneGrada: Zone = {
    id: "zone-grada", venueId: venue1.id, name: "Grada", kind: "standing", capacity: 400,
    x: 55, y: 20, width: 40, height: 60
  };

  // Event 1: single date, no zones, published, has ticket types.
  const event1: Event = {
    id: "event-1", organizationId: org1.id, venueId: venue2.id, slug: "noche-de-jazz",
    title: "Noche de Jazz", description: "Una noche de jazz en el Teatro Circo.", category: "concierto",
    status: "published", visibility: "public", startsAt: "2026-10-10T21:00:00.000Z", endsAt: "2026-10-10T23:30:00.000Z",
    salesStartAt: "2026-08-01T00:00:00.000Z", salesEndAt: "2026-10-10T20:00:00.000Z",
    hasSubEvents: false, isCompetition: false,
    createdAt: "2026-07-01T00:00:00.000Z", publishedAt: "2026-07-05T00:00:00.000Z"
  };
  const event1SubEvent: SubEvent = {
    id: "sub-event-1", eventId: event1.id, name: "Función única", startsAt: event1.startsAt, endsAt: event1.endsAt,
    doorsOpenAt: "2026-10-10T20:30:00.000Z", status: "on_sale", sortOrder: 0
  };
  const event1Pool: CapacityPool = {
    id: "pool-1", subEventId: event1SubEvent.id, zoneId: null, name: "Aforo general",
    totalCapacity: 400, soldCount: 5, heldCount: 0
  };
  const event1TicketType: TicketType = {
    id: "tt-1", groupId: "tt-1", eventId: event1.id, subEventId: event1SubEvent.id, capacityPoolId: event1Pool.id,
    name: "General", kind: "pago", basePrice: 2500, currency: "EUR", quantityTotal: 400, quantitySold: 5,
    minPerOrder: 1, maxPerOrder: 6, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0,
    color: null
  };

  // Event 2: capacity split across zones (pista + grada).
  const event2: Event = {
    id: "event-2", organizationId: org1.id, venueId: venue1.id, slug: "rock-en-directo",
    title: "Rock en Directo", description: "Concierto con aforo dividido en pista y grada.", category: "concierto",
    status: "published", visibility: "public", startsAt: "2026-11-05T21:00:00.000Z", endsAt: "2026-11-05T23:59:00.000Z",
    salesStartAt: "2026-08-01T00:00:00.000Z", salesEndAt: "2026-11-05T20:00:00.000Z",
    hasSubEvents: false, isCompetition: false,
    createdAt: "2026-07-02T00:00:00.000Z", publishedAt: "2026-07-06T00:00:00.000Z"
  };
  const event2SubEvent: SubEvent = {
    id: "sub-event-2", eventId: event2.id, name: "Función única", startsAt: event2.startsAt, endsAt: event2.endsAt,
    doorsOpenAt: "2026-11-05T20:00:00.000Z", status: "on_sale", sortOrder: 0
  };
  const event2PoolPista: CapacityPool = {
    id: "pool-2-pista", subEventId: event2SubEvent.id, zoneId: zonePista.id, name: "Pista",
    totalCapacity: 800, soldCount: 6, heldCount: 0
  };
  const event2PoolGrada: CapacityPool = {
    id: "pool-2-grada", subEventId: event2SubEvent.id, zoneId: zoneGrada.id, name: "Grada",
    totalCapacity: 400, soldCount: 2, heldCount: 0
  };
  const event2TicketTypePista: TicketType = {
    id: "tt-2-pista", groupId: "tt-2-pista", eventId: event2.id, subEventId: event2SubEvent.id, capacityPoolId: event2PoolPista.id,
    name: "Pista", kind: "pago", basePrice: 3000, currency: "EUR", quantityTotal: 800, quantitySold: 6,
    minPerOrder: 1, maxPerOrder: 6, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0,
    color: null
  };
  const event2TicketTypeGrada: TicketType = {
    id: "tt-2-grada", groupId: "tt-2-grada", eventId: event2.id, subEventId: event2SubEvent.id, capacityPoolId: event2PoolGrada.id,
    name: "Grada VIP", kind: "pago", basePrice: 5000, currency: "EUR", quantityTotal: 400, quantitySold: 2,
    minPerOrder: 1, maxPerOrder: 4, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 1,
    color: null
  };
  const event2DiscountCode: DiscountCode = {
    id: "dc-2-earlybird", eventId: event2.id, code: "EARLYBIRD", type: "percent", value: 15,
    maxUses: 100, usedCount: 0, maxUsesPerCustomer: 1, appliesTo: null,
    validFrom: null, validTo: null, status: "active"
  };

  // Event 3: recurring theater-style event, 4 weekly functions, no ticket types yet -> draft.
  const event3: Event = {
    id: "event-3", organizationId: org1.id, venueId: venue2.id, slug: "la-casa-de-bernarda-alba",
    title: "La Casa de Bernarda Alba", description: "Obra de teatro con funciones semanales.", category: "teatro",
    status: "draft", visibility: "private", startsAt: "2026-09-05T20:00:00.000Z", endsAt: "2026-09-26T22:00:00.000Z",
    salesStartAt: null, salesEndAt: null, hasSubEvents: true, isCompetition: false,
    createdAt: "2026-07-10T00:00:00.000Z"
  };
  const event3SubEvents: SubEvent[] = [0, 1, 2, 3].map((week) => ({
    id: `sub-event-3-${week}`,
    eventId: event3.id,
    name: `Sábado ${week + 1}`,
    startsAt: new Date(Date.UTC(2026, 8, 5 + week * 7, 20, 0, 0)).toISOString(),
    endsAt: new Date(Date.UTC(2026, 8, 5 + week * 7, 22, 0, 0)).toISOString(),
    doorsOpenAt: null,
    status: "scheduled" as const,
    sortOrder: week
  }));

  // event3 gets a plain event-scoped ticket type (subEventId null, kind "pago" — not every
  // subEventId:null ticket type is an "abono"; README §2.2.2 only requires null to mean
  // "valid for every sub-event"). This keeps event3 out of the "draft with zero ticket types"
  // bucket, leaving event5 as the only one — required for the uniqueness assertion below.
  const event3TicketType: TicketType = {
    id: "tt-3", groupId: "tt-3", eventId: event3.id, subEventId: null, capacityPoolId: null,
    name: "Entrada general", kind: "pago", basePrice: 1800, currency: "EUR", quantityTotal: null, quantitySold: 0,
    minPerOrder: 1, maxPerOrder: 6, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0,
    color: null
  };

  // Event 4: festival with 3 days + an event-scoped pass ticket type (subEventId null).
  const event4: Event = {
    id: "event-4", organizationId: org2.id, venueId: venue3.id, slug: "festival-del-sur",
    title: "Festival del Sur", description: "Festival de tres días.", category: "festival",
    status: "on_sale", visibility: "public", startsAt: "2026-07-16T18:00:00.000Z", endsAt: "2026-07-18T02:00:00.000Z",
    salesStartAt: "2026-04-01T00:00:00.000Z", salesEndAt: "2026-07-16T17:00:00.000Z",
    hasSubEvents: true, isCompetition: false,
    createdAt: "2026-06-01T00:00:00.000Z", publishedAt: "2026-06-05T00:00:00.000Z"
  };
  const event4SubEvents: SubEvent[] = [0, 1, 2].map((day) => ({
    id: `sub-event-4-${day}`,
    eventId: event4.id,
    name: `Día ${day + 1}`,
    startsAt: new Date(Date.UTC(2026, 6, 16 + day, 18, 0, 0)).toISOString(),
    endsAt: new Date(Date.UTC(2026, 6, 17 + day, 2, 0, 0)).toISOString(),
    doorsOpenAt: new Date(Date.UTC(2026, 6, 16 + day, 17, 0, 0)).toISOString(),
    status: "on_sale" as const,
    sortOrder: day
  }));
  const event4PassTicketType: TicketType = {
    id: "tt-4-pass", groupId: "tt-4-pass", eventId: event4.id, subEventId: null, capacityPoolId: null,
    name: "Abono 3 días", kind: "abono", basePrice: 9000, currency: "EUR", quantityTotal: 1500, quantitySold: 5,
    minPerOrder: 1, maxPerOrder: 4, visibility: "public", isTransferable: true, isRefundable: false, sortOrder: 0,
    color: null
  };

  // Event 5: draft with zero ticket types (used to test the publish checklist).
  const event5: Event = {
    id: "event-5", organizationId: org1.id, venueId: null, slug: "evento-sin-configurar",
    title: "Evento sin configurar", description: "Todavía en borrador.", category: "conferencia",
    status: "draft", visibility: "private", startsAt: "2026-12-01T18:00:00.000Z", endsAt: "2026-12-01T21:00:00.000Z",
    salesStartAt: null, salesEndAt: null, hasSubEvents: false, isCompetition: false,
    createdAt: "2026-08-01T00:00:00.000Z"
  };
  const event5SubEvent: SubEvent = {
    id: "sub-event-5", eventId: event5.id, name: "Función única", startsAt: event5.startsAt, endsAt: event5.endsAt,
    doorsOpenAt: null, status: "scheduled", sortOrder: 0
  };

  const users: User[] = [
    {
      id: DEMO_SUPERADMIN_ID, organizationId: null, parentUserId: null, role: "superadmin",
      email: "superadmin@entraditas.com", fullName: "Super Admin", status: "active",
      permissionOverrides: [], eventScopes: []
    },
    {
      id: DEMO_ADMIN_ID, organizationId: org1.id, parentUserId: null, role: "admin",
      email: "admin@entraditas.com", fullName: "Admin de Producciones Norte", status: "active",
      permissionOverrides: [], eventScopes: []
    },
    {
      id: DEMO_USER_ID, organizationId: org1.id, parentUserId: DEMO_ADMIN_ID, role: "user",
      email: "usuario@entraditas.com", fullName: "Usuario con alcance limitado", status: "active",
      permissionOverrides: [], eventScopes: [event1.id, event2.id]
    },
    {
      id: DEMO_SUBUSER_ID, organizationId: org1.id, parentUserId: DEMO_ADMIN_ID, role: "subuser",
      email: "subusuario@entraditas.com", fullName: "Personal de puerta", status: "active",
      permissionOverrides: [],
      eventScopes: [event1.id]
    }
  ];

  const orders: Order[] = [
    { id: "order-1", orderNumber: "PED-2026-0001", eventId: event1.id, organizationId: org1.id, customerName: "Marta Ruiz", customerEmail: "marta.ruiz@example.com", status: "paid", total: 5000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-05T10:00:00.000Z" },
    { id: "order-2", orderNumber: "PED-2026-0002", eventId: event1.id, organizationId: org1.id, customerName: "Javier Soto", customerEmail: "javier.soto@example.com", status: "paid", total: 7500, refundedAmount: 0, currency: "EUR", channel: "panel", createdAt: "2026-08-07T11:30:00.000Z" },
    { id: "order-3", orderNumber: "PED-2026-0003", eventId: event1.id, organizationId: org1.id, customerName: "Lucía Fernández", customerEmail: "lucia.fernandez@example.com", status: "pending", total: 2500, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-10T09:15:00.000Z" },
    { id: "order-4", orderNumber: "PED-2026-0004", eventId: event1.id, organizationId: org1.id, customerName: "Diego Molina", customerEmail: "diego.molina@example.com", status: "refunded", total: 5000, refundedAmount: 5000, currency: "EUR", channel: "web", createdAt: "2026-08-02T16:45:00.000Z" },
    { id: "order-5", orderNumber: "PED-2026-0005", eventId: event2.id, organizationId: org1.id, customerName: "Sara Gómez", customerEmail: "sara.gomez@example.com", status: "paid", total: 22000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-11T18:20:00.000Z" },
    { id: "order-6", orderNumber: "PED-2026-0006", eventId: event2.id, organizationId: org1.id, customerName: "Pablo Ibáñez", customerEmail: "pablo.ibanez@example.com", status: "paid", total: 6000, refundedAmount: 0, currency: "EUR", channel: "box_office", createdAt: "2026-08-12T20:05:00.000Z" },
    { id: "order-7", orderNumber: "PED-2026-0007", eventId: event2.id, organizationId: org1.id, customerName: "Elena Castro", customerEmail: "elena.castro@example.com", status: "cancelled", total: 5000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-06T13:10:00.000Z" },
    { id: "order-8", orderNumber: "PED-2026-0008", eventId: event4.id, organizationId: org2.id, customerName: "Nuria Vidal", customerEmail: "nuria.vidal@example.com", status: "paid", total: 18000, refundedAmount: 0, currency: "EUR", channel: "box_office", createdAt: "2026-07-10T12:00:00.000Z" },
    { id: "order-9", orderNumber: "PED-2026-0009", eventId: event4.id, organizationId: org2.id, customerName: "Prensa Sur", customerEmail: "prensa@surlive.example", status: "paid", total: 0, refundedAmount: 0, currency: "EUR", channel: "courtesy", createdAt: "2026-07-08T09:00:00.000Z" },
    { id: "order-10", orderNumber: "PED-2026-0010", eventId: event4.id, organizationId: org2.id, customerName: "Hugo Serrano", customerEmail: "hugo.serrano@example.com", status: "partially_refunded", total: 18000, refundedAmount: 9000, currency: "EUR", channel: "web", createdAt: "2026-07-05T17:30:00.000Z" }
  ];

  const orderItems: OrderItem[] = [
    { id: "oi-1", orderId: "order-1", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 2, unitPrice: 2500, subtotal: 5000 },
    { id: "oi-2", orderId: "order-2", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 3, unitPrice: 2500, subtotal: 7500 },
    { id: "oi-3", orderId: "order-3", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 1, unitPrice: 2500, subtotal: 2500 },
    { id: "oi-4", orderId: "order-4", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 2, unitPrice: 2500, subtotal: 5000 },
    { id: "oi-5", orderId: "order-5", ticketTypeId: event2TicketTypePista.id, ticketTypeName: event2TicketTypePista.name, quantity: 4, unitPrice: 3000, subtotal: 12000 },
    { id: "oi-6", orderId: "order-5", ticketTypeId: event2TicketTypeGrada.id, ticketTypeName: event2TicketTypeGrada.name, quantity: 2, unitPrice: 5000, subtotal: 10000 },
    { id: "oi-7", orderId: "order-6", ticketTypeId: event2TicketTypePista.id, ticketTypeName: event2TicketTypePista.name, quantity: 2, unitPrice: 3000, subtotal: 6000 },
    { id: "oi-8", orderId: "order-7", ticketTypeId: event2TicketTypeGrada.id, ticketTypeName: event2TicketTypeGrada.name, quantity: 1, unitPrice: 5000, subtotal: 5000 },
    { id: "oi-9", orderId: "order-8", ticketTypeId: event4PassTicketType.id, ticketTypeName: event4PassTicketType.name, quantity: 2, unitPrice: 9000, subtotal: 18000 },
    { id: "oi-10", orderId: "order-9", ticketTypeId: event4PassTicketType.id, ticketTypeName: event4PassTicketType.name, quantity: 1, unitPrice: 0, subtotal: 0 },
    { id: "oi-11", orderId: "order-10", ticketTypeId: event4PassTicketType.id, ticketTypeName: event4PassTicketType.name, quantity: 2, unitPrice: 9000, subtotal: 18000 }
  ];

  const refunds: Refund[] = [
    { id: "refund-1", orderId: "order-4", orderNumber: "PED-2026-0004", customerName: "Diego Molina", amount: 5000, reason: "Cliente no pudo asistir al evento.", status: "processed", createdAt: "2026-08-03T09:00:00.000Z" },
    { id: "refund-2", orderId: "order-10", orderNumber: "PED-2026-0010", customerName: "Hugo Serrano", amount: 9000, reason: "Devolución parcial: 1 entrada no utilizada.", status: "processed", createdAt: "2026-07-06T10:00:00.000Z" }
  ];

  return {
    organizations: [org1, org2],
    users,
    venues: [venue1, venue2, venue3],
    zones: [zonePista, zoneGrada],
    events: [event1, event2, event3, event4, event5],
    subEvents: [event1SubEvent, event2SubEvent, ...event3SubEvents, ...event4SubEvents, event5SubEvent],
    capacityPools: [event1Pool, event2PoolPista, event2PoolGrada],
    ticketTypes: [event1TicketType, event2TicketTypePista, event2TicketTypeGrada, event3TicketType, event4PassTicketType],
    ticketTypePrices: [],
    discountCodes: [event2DiscountCode],
    invitations: [],
    orders,
    orderItems,
    refunds
  };
}
