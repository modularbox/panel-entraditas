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
  commissionRate: z.number().min(0).max(1)
});
export type Organization = z.infer<typeof OrganizationSchema>;

export const UserSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  parentUserId: z.string().nullable(),
  role: RoleSlugSchema,
  email: z.string().email(),
  fullName: z.string(),
  status: z.enum(["active", "invited", "disabled"]),
  permissionOverrides: z.array(PermissionOverrideSchema),
  eventScopes: z.array(z.string())
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
  capacity: z.number().int().positive()
});
export type Zone = z.infer<typeof ZoneSchema>;

export const EventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  venueId: z.string().nullable(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  status: z.enum(["draft", "published", "on_sale", "sold_out", "paused", "finished", "cancelled"]),
  visibility: z.enum(["public", "unlisted", "private"]),
  startsAt: z.string(),
  endsAt: z.string(),
  salesStartAt: z.string().nullable(),
  salesEndAt: z.string().nullable(),
  hasSubEvents: z.boolean(),
  createdAt: z.string(),
  publishedAt: z.string().nullable().optional()
});
export type Event = z.infer<typeof EventSchema>;

export const SubEventSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  name: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  doorsOpenAt: z.string().nullable(),
  status: z.enum(["scheduled", "on_sale", "sold_out", "cancelled", "finished"]),
  sortOrder: z.number().int()
});
export type SubEvent = z.infer<typeof SubEventSchema>;

export const CapacityPoolSchema = z.object({
  id: z.string(),
  subEventId: z.string(),
  zoneId: z.string().nullable(),
  name: z.string(),
  totalCapacity: z.number().int().nonnegative(),
  soldCount: z.number().int().nonnegative(),
  heldCount: z.number().int().nonnegative()
});
export type CapacityPool = z.infer<typeof CapacityPoolSchema>;

export const TicketTypeSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(),
  capacityPoolId: z.string().nullable().optional(),
  name: z.string(),
  kind: z.enum(["paid", "free", "courtesy", "promo", "pass"]),
  basePrice: z.number().int().nonnegative(),
  currency: z.string().length(3),
  quantityTotal: z.number().int().nonnegative().nullable(),
  quantitySold: z.number().int().nonnegative(),
  minPerOrder: z.number().int().positive(),
  maxPerOrder: z.number().int().positive(),
  visibility: z.enum(["public", "hidden", "code_only"]),
  isTransferable: z.boolean(),
  isRefundable: z.boolean(),
  sortOrder: z.number().int()
});
export type TicketType = z.infer<typeof TicketTypeSchema>;

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

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.record(z.unknown())).optional(),
    requestId: z.string()
  })
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
