import { z } from "zod";
import { EventCategorySchema } from "./publicCatalog";

export const RoleSlugSchema = z.enum(["superadmin", "organizador", "suborganizador"]);
export type RoleSlug = z.infer<typeof RoleSlugSchema>;

export const PermissionEffectSchema = z.enum(["allow", "deny"]);

export const PermissionOverrideSchema = z.object({
  permission: z.string(),
  effect: PermissionEffectSchema
});
export type PermissionOverride = z.infer<typeof PermissionOverrideSchema>;

export const OrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string()
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const UserSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(), // null for superadmin, who isn't scoped to one organization
  parentUserId: z.string().nullable(), // set for suborganizadores created by an organizador; null for top-level accounts
  role: RoleSlugSchema,
  email: z.string().email(),
  fullName: z.string(),
  status: z.enum(["active", "invited", "disabled"]),
  permissionOverrides: z.array(PermissionOverrideSchema),
  eventScopes: z.array(z.string()), // event ids this user is restricted to; empty means unrestricted (organizador/superadmin)
        bankAccount: z.string().nullable().optional() // cuenta bancaria de cobro del organizador
});
export type User = z.infer<typeof UserSchema>;

export const InvitationSchema = z.object({
  id: z.string(),
  token: z.string(),
  userId: z.string(),
  email: z.string().email(),
  organizationId: z.string(),
  invitedByUserId: z.string(),
  status: z.enum(["pending", "accepted"]),
  createdAt: z.string()
});
export type Invitation = z.infer<typeof InvitationSchema>;

export const VenueSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  city: z.string(),
  // The buyer site shows the full address and locates the venue on a map, so the panel has to
  // be able to capture them. Optional because venues created before this existed have neither.
  province: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable().optional(),
  totalCapacity: z.number().int().positive()
});
export type Venue = z.infer<typeof VenueSchema>;

export const ZoneSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  kind: z.enum(["numbered", "standing", "stage", "accessible", "gate"]),
  capacity: z.number().int().nonnegative(),
  // Physical row count of a numbered zone. The individual seats (and their A1/B7 labels) are
  // derived from capacity + rows rather than stored, so the venue's zone stays a small record.
  // null means "work it out from the zone's shape".
  rows: z.number().int().positive().nullable().optional(),
  // Seats in each row, when the room is not a neat rectangle: [12, 11, 11, 9] for a stalls block
  // that narrows at the back. Overrides both `rows` and the even split, and its sum becomes the
  // zone's real capacity. null/absent means "spread `capacity` evenly over `rows`".
  //
  // Superseded by `seatRows`, which says the same thing and more; kept because zones drawn before
  // that existed still carry it and must keep producing the same seats.
  rowSeats: z.array(z.number().int().nonnegative()).nullable().optional(),
  // The room row by row: how many positions each row has, which of them are aisles rather than
  // seats, how far the row is shifted sideways (in half seats, for staggered or curved stands),
  // and how it is numbered. This is what lets a plan describe the actual venue instead of only a
  // rectangle. Wins over `rowSeats` and `rows`, and its seat count becomes the zone's capacity.
  seatRows: z
    .array(
      z.object({
        label: z.string().nullable().optional(),
        slots: z.number().int().nonnegative(),
        gaps: z.array(z.number().int().positive()).optional(),
        offset: z.number().optional(),
        startNumber: z.number().int().positive().optional(),
        reversed: z.boolean().optional()
      })
    )
    .nullable()
    .optional(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100)
});
export type Zone = z.infer<typeof ZoneSchema>;

/**
 * Reglas de venta y acceso que el organizador fija antes de publicar.
 *
 * Todas son de respuesta cerrada a proposito -- si/no o una cantidad -- para que ni el
 * organizador tenga que redactar nada ni el sistema tenga que interpretar texto libre. Cada una
 * se traduce despues en una comprobacion concreta (en la venta, en la puerta o en la web).
 *
 * Todo el bloque es opcional: los eventos creados antes de que existiera siguen validando, y
 * cada campo cae a su valor por defecto documentado en EVENT_RULE_DEFAULTS.
 */
export const EventRulesSchema = z.object({
  // --- Venta ---
  /** Minimo de entradas que se pueden comprar de una vez. */
  minPerOrder: z.number().int().positive().optional(),
  /** Maximo de entradas por pedido. */
  maxPerOrder: z.number().int().positive().optional(),
  /** Tope de entradas por comprador en todo el evento. 0 = sin tope. */
  maxPerCustomer: z.number().int().nonnegative().optional(),
  /** Permitir comprar sin crear cuenta. */
  allowGuestCheckout: z.boolean().optional(),

  // --- Asientos (solo aplica a zonas numeradas) ---
  /**
   * Permitir que una compra deje un asiento suelto entre dos ocupados. Con false, la venta
   * rechaza la seleccion que dejaria huecos de un solo asiento, que luego no se venden.
   */
  allowIsolatedSeats: z.boolean().optional(),
  /** Dejar que el comprador elija butaca concreta; con false se asigna la mejor disponible. */
  allowSeatSelection: z.boolean().optional(),
  /** Maximo de asientos seguidos en un mismo pedido. 0 = sin tope. */
  maxContiguousSeats: z.number().int().nonnegative().optional(),

  // --- Titular de la entrada ---
  /** Pedir nombre y apellidos de cada asistente, no solo del comprador. */
  requiresAttendeeName: z.boolean().optional(),
  /** Pedir documento de identidad de cada asistente. */
  requiresAttendeeDocument: z.boolean().optional(),
  /** Permitir ceder la entrada a otra persona (genera un QR nuevo e invalida el anterior). */
  isTransferable: z.boolean().optional(),

  // --- Acceso / puerta ---
  /** Permitir salir y volver a entrar con la misma entrada. */
  allowReentry: z.boolean().optional(),
  /** Cuantas veces se puede escanear una entrada valida. */
  maxScansPerTicket: z.number().int().positive().optional(),

  // --- Reembolsos ---
  isRefundable: z.boolean().optional(),
  /** Dias antes del evento hasta los que se admite reembolso. 0 = hasta el mismo dia. */
  refundDeadlineDays: z.number().int().nonnegative().optional(),

  // --- Publico ---
  /** Edad minima para entrar. 0 = sin restriccion. */
  minimumAge: z.number().int().nonnegative().optional(),
  /** Mostrar al comprador cuantas entradas quedan. */
  showRemainingTickets: z.boolean().optional(),
  /** A partir de cuantas entradas restantes se avisa de "ultimas entradas". 0 = no avisar. */
  lowStockThreshold: z.number().int().nonnegative().optional(),
  /** El recinto tiene acceso y plazas para movilidad reducida. */
  wheelchairAccessible: z.boolean().optional()
});
export type EventRules = z.infer<typeof EventRulesSchema>;

/** Valor que se aplica cuando el organizador no ha tocado la regla. */
export const EVENT_RULE_DEFAULTS: Required<EventRules> = {
  minPerOrder: 1,
  maxPerOrder: 6,
  maxPerCustomer: 0,
  allowGuestCheckout: true,
  allowIsolatedSeats: false,
  allowSeatSelection: true,
  maxContiguousSeats: 0,
  requiresAttendeeName: false,
  requiresAttendeeDocument: false,
  isTransferable: true,
  allowReentry: false,
  maxScansPerTicket: 1,
  isRefundable: true,
  refundDeadlineDays: 7,
  minimumAge: 0,
  showRemainingTickets: true,
  lowStockThreshold: 20,
  wheelchairAccessible: false
};

export const EventStatusSchema = z.enum(["draft", "pending_review", "published", "rejected", "finished"]);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const EventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  venueId: z.string().nullable(), // null until a venue is assigned (still draftable without one)
  slug: z.string(),
  coverImageUrl: z.string().nullable().optional(),
  gallery: z.array(z.string()).optional(),
  title: z.string(),
  description: z.string(),
  // Long body shown on the buyer site's event page. Falls back to `description` when empty.
  longDescription: z.string().optional(),
  // Closed set shared with the buyer site: the panel must not be able to publish a category
  // the buyer site cannot render. See publicCatalog.ts.
  category: EventCategorySchema,
  tags: z.array(z.string()).optional(),
  // Surfaces the event in the buyer site's "destacados". Organiser-set, admin-overridable.
  featured: z.boolean().optional(),
  durationMinutes: z.number().int().positive().nullable().optional(),
  status: EventStatusSchema,
  visibility: z.enum(["public", "unlisted", "private"]),
  location: z.string().optional(),
  locality: z.string().optional(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  salesStartAt: z.string().nullable(), // null means no restriction on when sales open
  salesEndAt: z.string().nullable(), // null means no restriction on when sales close
  hasSubEvents: z.boolean(), // true for multi-date events (festivals, weekly runs) that use SubEvent
  // How the event's capacity is laid out. "plan" draws zones on a canvas; "zones" is the same
  // model without any geometry, for rooms where a map adds nothing. They are exclusive: picking
  // one hides the other. null means the organiser hasn't chosen yet.
  seatingMode: z.enum(["plan", "zones"]).nullable().optional(),
  isCompetition: z.boolean().optional(),
  // Teams of a versus event. The buyer site renders these as a match ticker, so without them
  // an organiser could flag a competition it could never actually display.
  matchup: z
    .object({
      competition: z.string(),
      home: z.string(),
      away: z.string(),
      homeLogo: z.string().nullable().optional(),
      awayLogo: z.string().nullable().optional()
    })
    .nullable()
    .optional(),
  datePending: z.boolean().optional(),
  notifyWhenDateConfirmed: z.boolean().optional(),
  // Reglas de venta y acceso que responde el organizador antes de publicar.
  rules: EventRulesSchema.optional(),
  serviceFeeType: z.enum(["none", "percent", "fixed"]).optional(),
  serviceFeeValue: z.number().nonnegative().optional(),
  // Límites de venta y política de asientos decididos antes de crear el evento.
  maxTicketsPerOrder: z.number().int().positive().nullable().optional(),
  maxTicketsPerCustomer: z.number().int().positive().nullable().optional(),
  // false = no se permite dejar un hueco de exactamente 1 asiento libre entre grupos
  // (ej: en una fila de 14, no se permite grupo de 6 + hueco 1 + grupo de 7).
  allowSingleSeatGaps: z.boolean().optional(),
  createdAt: z.string(),
  publishedAt: z.string().nullable().optional() // set once the event leaves draft status
});
export type Event = z.infer<typeof EventSchema>;

export const SubEventSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  doorsOpenAt: z.string().nullable(), // null when a doors-open time hasn't been announced
  status: z.enum(["scheduled", "on_sale", "sold_out", "cancelled", "finished"]),
  sortOrder: z.number().int()
});
export type SubEvent = z.infer<typeof SubEventSchema>;

// Which ticket type an individual seat of a numbered zone is sold as. Seats are identified by
// the label derived from the zone's layout ("A-1"), not by a stored row.
export const SeatAssignmentSchema = z.object({
  seatId: z.string(),
  ticketTypeGroupId: z.string()
});
export type SeatAssignment = z.infer<typeof SeatAssignmentSchema>;

export const CapacityPoolSchema = z.object({
  id: z.string(),
  subEventId: z.string(),
  zoneId: z.string().nullable(), // null when the pool isn't tied to a seating zone (general admission)
  name: z.string(),
  totalCapacity: z.number().int().nonnegative(),
  soldCount: z.number().int().nonnegative(),
  heldCount: z.number().int().nonnegative(),
  // Zone-wide ticket type: the whole zone sells as this one. Used by standing zones, and as the
  // fallback for numbered zones that haven't been broken down seat by seat.
  ticketTypeGroupId: z.string().nullable().optional(),
  // Per-seat breakdown for numbered zones. Sparse: only assigned seats appear, so a zone can
  // legitimately have seats left with no ticket type on them.
  seatAssignments: z.array(SeatAssignmentSchema).optional(),
  // Seats reserved for reduced mobility. A flag on the individual seat rather than a separate
  // zone, because accessible places sit inside the normal seating, not in a block of their own.
  accessibleSeatIds: z.array(z.string()).optional()
});
export type CapacityPool = z.infer<typeof CapacityPoolSchema>;

export const TicketTypeSchema = z.object({
  id: z.string(),
  // Shared by every row created for the same ticket "product". When a ticket type is scoped to
  // specific sub-events, one row is created per sub-event, all sharing a groupId, so they can be
  // edited/reordered together (see ticketTypes.ts reorder handler).
  groupId: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(), // null means the ticket type is valid for every sub-event of the event
  capacityPoolId: z.string().nullable().optional(), // null when not tied to a shared capacity pool
  name: z.string(),
  kind: z.enum(["pago", "gratis", "cortesia", "promocional", "abono"]),
  basePrice: z.number().int().nonnegative(), // minor currency units (cents)
  currency: z.string().length(3),
  quantityTotal: z.number().int().nonnegative().nullable(), // null means unlimited
  quantitySold: z.number().int().nonnegative(),
  minPerOrder: z.number().int().positive(),
  maxPerOrder: z.number().int().positive(),
  visibility: z.enum(["public", "hidden", "code_only"]),
  isTransferable: z.boolean(),
  isRefundable: z.boolean(),
  sortOrder: z.number().int(),
  color: z.string().nullable().optional()
});
export type TicketType = z.infer<typeof TicketTypeSchema>;

export const DiscountCodeSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  code: z.string(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().nonnegative(),
  maxUses: z.number().int().positive().nullable(),
  usedCount: z.number().int().nonnegative(),
  maxUsesPerCustomer: z.number().int().positive().nullable(),
  appliesTo: z.array(z.string()).nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: z.enum(["active", "inactive"])
});
export type DiscountCode = z.infer<typeof DiscountCodeSchema>;

export const TicketTypePriceSchema = z.object({
  id: z.string(),
  ticketTypeId: z.string(),
  name: z.string(),
  price: z.number().int().nonnegative(),
  startsAt: z.string(),
  endsAt: z.string(),
  isActive: z.boolean()
});
export type TicketTypePrice = z.infer<typeof TicketTypePriceSchema>;

export const VenuePlanElementSchema = z.object({
  id: z.string(),
  type: z.enum(["zone", "stage", "accessible"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  name: z.string().optional(),
  capacity: z.number().int().nonnegative().optional(),
  ticketTypeGroupId: z.string().nullable().optional(),
  color: z.string().optional(),
  label: z.string().optional(),
  accessibleSeats: z.number().int().nonnegative().optional()
});
export type VenuePlanElement = z.infer<typeof VenuePlanElementSchema>;

/**
 * A zone as stored inside a reusable plan template: the shape of the room without anything tied
 * to one venue or one event. Applying a template creates real zones from these.
 */
export const TemplateZoneSchema = ZoneSchema.omit({ id: true, venueId: true });
export type TemplateZone = z.infer<typeof TemplateZoneSchema>;

export const VenuePlanTemplateSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  name: z.string(),
  // Which layout mode the template was saved from. A drawn plan and a plain list of zones are
  // not interchangeable, so each mode only offers its own templates.
  mode: z.enum(["plan", "zones"]),
  zones: z.array(TemplateZoneSchema),
  updatedAt: z.string()
});
export type VenuePlanTemplate = z.infer<typeof VenuePlanTemplateSchema>;
export const OrderSchema = z.object({
  id: z.string(), orderNumber: z.string(), eventId: z.string(), organizationId: z.string(), customerName: z.string(), customerEmail: z.string().email(),
  status: z.enum(["pending", "reserved", "paid", "cancelled", "expired", "refunded", "partially_refunded"]),
  total: z.number().int().nonnegative(), refundedAmount: z.number().int().nonnegative(), currency: z.string().length(3), channel: z.enum(["web", "panel", "box_office", "courtesy"]),
  // Método de pago de la venta. Siempre presente: taquilla elige tarjeta/efectivo y las
  // compras online/web se pagan con tarjeta.
  paymentMethod: z.enum(["card", "cash"]), createdAt: z.string()
});
export type Order = z.infer<typeof OrderSchema>;

export const OrderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  ticketTypeId: z.string(),
  ticketTypeName: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative()
});
export type OrderItem = z.infer<typeof OrderItemSchema>;

export const RefundSchema = z.object({
  id: z.string(), orderId: z.string(), orderNumber: z.string(), customerName: z.string(), amount: z.number().int().nonnegative(), reason: z.string(), status: z.enum(["requested", "processed", "rejected"]), createdAt: z.string()
});
export type Refund = z.infer<typeof RefundSchema>;

export const CustomerSchema = z.object({
  id: z.string(), name: z.string(), email: z.string().email(), ordersCount: z.number().int().nonnegative(), ticketsCount: z.number().int().nonnegative(), totalSpent: z.number().int().nonnegative(), lastPurchaseAt: z.string()
});
export type Customer = z.infer<typeof CustomerSchema>;

// An organization as shown in the superadmin's cross-tenant listing, carrying the
// organizer account that "Conectar" switches the current session to.
export const OrganizationOrganizerSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email(),
  bankAccount: z.string().nullable().optional() // cuenta bancaria de cobro del organizador, si se conoce
});
export type OrganizationOrganizer = z.infer<typeof OrganizationOrganizerSchema>;

export const OrganizationListItemSchema = OrganizationSchema.extend({
  organizer: OrganizationOrganizerSchema.nullable() // null when the organization has no organizer account yet
});
export type OrganizationListItem = z.infer<typeof OrganizationListItemSchema>;

// A los eventos a los que un suborganizador tiene acceso, para la columna "Eventos" de la ficha.
export const OrganizationAccessibleEventSchema = z.object({
  id: z.string(),
  title: z.string()
});
export type OrganizationAccessibleEvent = z.infer<typeof OrganizationAccessibleEventSchema>;

// Un suborganizador de la organización, con los eventos a los que tiene acceso.
export const OrganizationSubOrganizerSchema = OrganizationOrganizerSchema.extend({
  accessibleEvents: z.array(OrganizationAccessibleEventSchema)
});
export type OrganizationSubOrganizer = z.infer<typeof OrganizationSubOrganizerSchema>;

// Persona (organizador o suborganizador) con acceso a un evento, para la columna "Usuarios".
export const OrganizationEventUserSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email(),
  role: RoleSlugSchema
});
export type OrganizationEventUser = z.infer<typeof OrganizationEventUserSchema>;

// Un evento de la organización tal como aparece en la "Tabla de eventos" de la ficha: el mismo
// evento que en el listado, con los usuarios que tienen acceso.
export const OrganizationEventSchema = EventSchema.extend({
  accessUsers: z.array(OrganizationEventUserSchema)
});
export type OrganizationEvent = z.infer<typeof OrganizationEventSchema>;

// An organization's detail "ficha": its primary organizer (the account "Conectar" switches to), its
// suborganizadores (with the events each can access) and the organization's events with the users
// granted access to them.
export const OrganizationDetailSchema = OrganizationSchema.extend({
  organizer: OrganizationOrganizerSchema.nullable(), // null when the organization has no organizer account yet
  subOrganizers: z.array(OrganizationSubOrganizerSchema), // suborganizadores of the organization
  events: z.array(OrganizationEventSchema)
});
export type OrganizationDetail = z.infer<typeof OrganizationDetailSchema>;

// A user as shown in the superadmin's cross-tenant "Usuarios" directory (GET /directory/users),
// carrying its organization's name for display since the raw record only has organizationId.
export const DirectoryUserSchema = UserSchema.extend({
  organizationName: z.string().nullable() // null for a superadmin, who isn't scoped to one organization
});
export type DirectoryUser = z.infer<typeof DirectoryUserSchema>;

// The directory's single-user "ficha" (GET /directory/users/:id) additionally carries the
// permissions actually in effect (role defaults plus overrides), not just the raw overrides.
export const DirectoryUserDetailSchema = DirectoryUserSchema.extend({
  effectivePermissions: z.array(z.string())
});
export type DirectoryUserDetail = z.infer<typeof DirectoryUserDetailSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.record(z.unknown())).optional(),
    requestId: z.string()
  })
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const GateSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(),
  name: z.string(),
  code: z.string(),
  zoneId: z.string().nullable(),
  direction: z.enum(["in", "out", "both"]),
  allowReentry: z.boolean(),
  maxScansPerTicket: z.number().int().positive(),
  allowedTicketTypeGroupIds: z.array(z.string()).nullable(),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  operatorUserIds: z.array(z.string()),
  isActive: z.boolean()
});
export type Gate = z.infer<typeof GateSchema>;
