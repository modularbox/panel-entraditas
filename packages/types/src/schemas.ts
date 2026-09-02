import { z } from "zod";

export const RoleSlugSchema = z.enum(["superadmin", "admin", "user", "subuser"]);
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
  slug: z.string(),
  commissionRate: z.number().min(0).max(1) // fraction, not a percentage (0.08 = 8%)
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const UserSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(), // null for superadmin, who isn't scoped to one organization
  parentUserId: z.string().nullable(), // set for users/subusers created by an admin; null for top-level accounts
  role: RoleSlugSchema,
  email: z.string().email(),
  fullName: z.string(),
  status: z.enum(["active", "invited", "disabled"]),
  permissionOverrides: z.array(PermissionOverrideSchema),
  eventScopes: z.array(z.string()) // event ids this user is restricted to; empty means unrestricted (admin/superadmin)
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
  totalCapacity: z.number().int().positive()
});
export type Venue = z.infer<typeof VenueSchema>;

export const ZoneSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  kind: z.enum(["numbered", "standing", "stage", "accessible", "gate"]),
  capacity: z.number().int().nonnegative(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100)
});
export type Zone = z.infer<typeof ZoneSchema>;

export const EventStatusSchema = z.enum([
  "draft",
  "pending_review",
  "in_review",
  "published",
  "rejected",
  "on_sale",
  "sold_out",
  "paused",
  "finished",
  "cancelled"
]);
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
  category: z.string(),
  status: EventStatusSchema,
  visibility: z.enum(["public", "unlisted", "private"]),
  location: z.string().optional(),
  locality: z.string().optional(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  salesStartAt: z.string().nullable(), // null means no restriction on when sales open
  salesEndAt: z.string().nullable(), // null means no restriction on when sales close
  hasSubEvents: z.boolean(), // true for multi-date events (festivals, weekly runs) that use SubEvent
  isCompetition: z.boolean().optional(),
  datePending: z.boolean().optional(),
  notifyWhenDateConfirmed: z.boolean().optional(),
  serviceFeeType: z.enum(["none", "percent", "fixed"]).optional(),
  serviceFeeValue: z.number().nonnegative().optional(),
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

export const CapacityPoolSchema = z.object({
  id: z.string(),
  subEventId: z.string(),
  zoneId: z.string().nullable(), // null when the pool isn't tied to a seating zone (general admission)
  name: z.string(),
  totalCapacity: z.number().int().nonnegative(),
  soldCount: z.number().int().nonnegative(),
  heldCount: z.number().int().nonnegative(),
  ticketTypeGroupId: z.string().nullable().optional()
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

export const VenuePlanTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  elements: z.array(VenuePlanElementSchema),
  updatedAt: z.string()
});
export type VenuePlanTemplate = z.infer<typeof VenuePlanTemplateSchema>;
export const OrderSchema = z.object({
  id: z.string(), orderNumber: z.string(), eventId: z.string(), organizationId: z.string(), customerName: z.string(), customerEmail: z.string().email(),
  status: z.enum(["pending", "reserved", "paid", "cancelled", "expired", "refunded", "partially_refunded"]),
  total: z.number().int().nonnegative(), refundedAmount: z.number().int().nonnegative(), currency: z.string().length(3), channel: z.enum(["web", "panel", "box_office", "courtesy"]), createdAt: z.string()
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
// admin account that "Conectar" switches the current session to.
export const OrganizationAdminSchema = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string().email()
});
export type OrganizationAdmin = z.infer<typeof OrganizationAdminSchema>;

export const OrganizationListItemSchema = OrganizationSchema.extend({
  admin: OrganizationAdminSchema.nullable() // null when the organization has no admin account yet
});
export type OrganizationListItem = z.infer<typeof OrganizationListItemSchema>;

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

export const GuestListSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(),
  name: z.string(),
  quota: z.number().int().positive().nullable()
});
export type GuestList = z.infer<typeof GuestListSchema>;

export const GuestListEntrySchema = z.object({
  id: z.string(),
  guestListId: z.string(),
  fullName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  companions: z.number().int().nonnegative(),
  status: z.enum(["pending", "checked_in"]),
  notes: z.string().nullable()
});
export type GuestListEntry = z.infer<typeof GuestListEntrySchema>;
