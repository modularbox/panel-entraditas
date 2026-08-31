import type {
  CapacityPool, DiscountCode, Event, Organization, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
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

  const zonePista: Zone = { id: "zone-pista", venueId: venue1.id, name: "Pista", capacity: 800 };
  const zoneGrada: Zone = { id: "zone-grada", venueId: venue1.id, name: "Grada", capacity: 400 };

  // Event 1: single date, no zones, published, has ticket types.
  const event1: Event = {
    id: "event-1", organizationId: org1.id, venueId: venue2.id, slug: "noche-de-jazz",
    title: "Noche de Jazz", description: "Una noche de jazz en el Teatro Circo.", category: "concierto",
    status: "published", visibility: "public", startsAt: "2026-10-10T21:00:00.000Z", endsAt: "2026-10-10T23:30:00.000Z",
    salesStartAt: "2026-08-01T00:00:00.000Z", salesEndAt: "2026-10-10T20:00:00.000Z",
    hasSubEvents: false, createdAt: "2026-07-01T00:00:00.000Z", publishedAt: "2026-07-05T00:00:00.000Z"
  };
  const event1SubEvent: SubEvent = {
    id: "sub-event-1", eventId: event1.id, name: "Función única", startsAt: event1.startsAt!, endsAt: event1.endsAt!,
    doorsOpenAt: "2026-10-10T20:30:00.000Z", status: "on_sale", sortOrder: 0
  };
  const event1Pool: CapacityPool = {
    id: "pool-1", subEventId: event1SubEvent.id, zoneId: null, name: "Aforo general",
    totalCapacity: 400, soldCount: 0, heldCount: 0
  };
  const event1TicketType: TicketType = {
    id: "tt-1", groupId: "tt-1", eventId: event1.id, subEventId: event1SubEvent.id, capacityPoolId: event1Pool.id,
    name: "General", kind: "paid", basePrice: 2500, currency: "EUR", quantityTotal: 400, quantitySold: 0,
    minPerOrder: 1, maxPerOrder: 6, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0
  };

  // Event 2: capacity split across zones (pista + grada).
  const event2: Event = {
    id: "event-2", organizationId: org1.id, venueId: venue1.id, slug: "rock-en-directo",
    title: "Rock en Directo", description: "Concierto con aforo dividido en pista y grada.", category: "concierto",
    status: "published", visibility: "public", startsAt: "2026-11-05T21:00:00.000Z", endsAt: "2026-11-05T23:59:00.000Z",
    salesStartAt: "2026-08-01T00:00:00.000Z", salesEndAt: "2026-11-05T20:00:00.000Z",
    hasSubEvents: false, createdAt: "2026-07-02T00:00:00.000Z", publishedAt: "2026-07-06T00:00:00.000Z"
  };
  const event2SubEvent: SubEvent = {
    id: "sub-event-2", eventId: event2.id, name: "Función única", startsAt: event2.startsAt!, endsAt: event2.endsAt!,
    doorsOpenAt: "2026-11-05T20:00:00.000Z", status: "on_sale", sortOrder: 0
  };
  const event2PoolPista: CapacityPool = {
    id: "pool-2-pista", subEventId: event2SubEvent.id, zoneId: zonePista.id, name: "Pista",
    totalCapacity: 800, soldCount: 0, heldCount: 0
  };
  const event2PoolGrada: CapacityPool = {
    id: "pool-2-grada", subEventId: event2SubEvent.id, zoneId: zoneGrada.id, name: "Grada",
    totalCapacity: 400, soldCount: 0, heldCount: 0
  };
  const event2TicketTypePista: TicketType = {
    id: "tt-2-pista", groupId: "tt-2-pista", eventId: event2.id, subEventId: event2SubEvent.id, capacityPoolId: event2PoolPista.id,
    name: "Pista", kind: "paid", basePrice: 3000, currency: "EUR", quantityTotal: 800, quantitySold: 0,
    minPerOrder: 1, maxPerOrder: 6, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0
  };
  const event2TicketTypeGrada: TicketType = {
    id: "tt-2-grada", groupId: "tt-2-grada", eventId: event2.id, subEventId: event2SubEvent.id, capacityPoolId: event2PoolGrada.id,
    name: "Grada VIP", kind: "paid", basePrice: 5000, currency: "EUR", quantityTotal: 400, quantitySold: 0,
    minPerOrder: 1, maxPerOrder: 4, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 1
  };

  // Event 3: recurring theater-style event, 4 weekly functions, no ticket types yet -> draft.
  const event3: Event = {
    id: "event-3", organizationId: org1.id, venueId: venue2.id, slug: "la-casa-de-bernarda-alba",
    title: "La Casa de Bernarda Alba", description: "Obra de teatro con funciones semanales.", category: "teatro",
    status: "draft", visibility: "private", startsAt: "2026-09-05T20:00:00.000Z", endsAt: "2026-09-26T22:00:00.000Z",
    salesStartAt: null, salesEndAt: null, hasSubEvents: true, createdAt: "2026-07-10T00:00:00.000Z"
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

  // event3 gets a plain event-scoped ticket type (subEventId null, kind "paid" — not every
  // subEventId:null ticket type is a "pass"; README §2.2.2 only requires null to mean
  // "valid for every sub-event"). This keeps event3 out of the "draft with zero ticket types"
  // bucket, leaving event5 as the only one — required for the uniqueness assertion below.
  const event3TicketType: TicketType = {
    id: "tt-3", groupId: "tt-3", eventId: event3.id, subEventId: null, capacityPoolId: null,
    name: "Entrada general", kind: "paid", basePrice: 1800, currency: "EUR", quantityTotal: null, quantitySold: 0,
    minPerOrder: 1, maxPerOrder: 6, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0
  };

  // Event 4: festival with 3 days + an event-scoped pass ticket type (subEventId null).
  const event4: Event = {
    id: "event-4", organizationId: org2.id, venueId: venue3.id, slug: "festival-del-sur",
    title: "Festival del Sur", description: "Festival de tres días.", category: "festival",
    status: "on_sale", visibility: "public", startsAt: "2026-07-16T18:00:00.000Z", endsAt: "2026-07-18T02:00:00.000Z",
    salesStartAt: "2026-04-01T00:00:00.000Z", salesEndAt: "2026-07-16T17:00:00.000Z",
    hasSubEvents: true, createdAt: "2026-06-01T00:00:00.000Z", publishedAt: "2026-06-05T00:00:00.000Z"
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
    name: "Abono 3 días", kind: "pass", basePrice: 9000, currency: "EUR", quantityTotal: 1500, quantitySold: 0,
    minPerOrder: 1, maxPerOrder: 4, visibility: "public", isTransferable: true, isRefundable: false, sortOrder: 0
  };

  // Event 5: draft with zero ticket types (used to test the publish checklist).
  const event5: Event = {
    id: "event-5", organizationId: org1.id, venueId: null, slug: "evento-sin-configurar",
    title: "Evento sin configurar", description: "Todavía en borrador.", category: "conferencia",
    status: "draft", visibility: "private", startsAt: "2026-12-01T18:00:00.000Z", endsAt: "2026-12-01T21:00:00.000Z",
    salesStartAt: null, salesEndAt: null, hasSubEvents: false, createdAt: "2026-08-01T00:00:00.000Z"
  };
  const event5SubEvent: SubEvent = {
    id: "sub-event-5", eventId: event5.id, name: "Función única", startsAt: event5.startsAt!, endsAt: event5.endsAt!,
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
      permissionOverrides: [{ permission: "guestlist:manage", effect: "allow" }],
      eventScopes: [event1.id]
    }
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
    discountCodes: [
      {
        id: "discount-1",
        eventId: event2.id,
        code: "ROCK10",
        type: "percent",
        value: 10,
        maxUses: 100,
        usedCount: 12,
        maxUsesPerCustomer: 1,
        appliesTo: [event2TicketTypePista.groupId],
        validFrom: "2026-08-01T00:00:00.000Z",
        validTo: "2026-11-05T20:00:00.000Z",
        status: "active"
      }
    ]
  };
}
