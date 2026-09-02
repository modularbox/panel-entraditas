import { z } from "zod";

/**
 * The contract between the panel and the public buyer site.
 *
 * The panel's internal model is organiser-shaped (capacity pools, ticket type groups, sub
 * events, review states). The buyer site needs none of that: it needs a flat, already-resolved
 * event it can render and sell. This file is that shape, and it is deliberately the *only*
 * thing the two sides have to agree on.
 *
 * Two rules that are easy to get wrong and are therefore fixed here:
 *  - Money is always in minor units (cents), integers, never floats. The buyer site formats.
 *  - Categories are a closed set. The panel must not be able to publish a category the buyer
 *    site cannot render.
 */

/** The categories the buyer site can render. Adding one means shipping both sides. */
export const EVENT_CATEGORIES = [
  "concierto",
  "teatro",
  "cine",
  "festival",
  "deporte",
  "conferencia",
  "familiar"
] as const;

export const EventCategorySchema = z.enum(EVENT_CATEGORIES);
export type EventCategory = z.infer<typeof EventCategorySchema>;

export const PublicVenueSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  province: z.string().nullable(),
  address: z.string().nullable(),
  coordinates: z.object({ lat: z.number(), lng: z.number() }).nullable()
});
export type PublicVenue = z.infer<typeof PublicVenueSchema>;

/** A sellable ticket type, already resolved: no groups, no sub-event fan-out. */
export const PublicTicketTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Minor units (cents). */
  price: z.number().int().nonnegative(),
  currency: z.string().length(3),
  color: z.string(),
  /** How many are still buyable. null means unlimited. */
  available: z.number().int().nonnegative().nullable(),
  minPerOrder: z.number().int().positive(),
  maxPerOrder: z.number().int().positive()
});
export type PublicTicketTier = z.infer<typeof PublicTicketTierSchema>;

/**
 * One physical seat, with the exact label the panel and the venue use. `tierId` null means the
 * seat exists but is NOT for sale: the buyer site must render it as unavailable/greyed, never
 * as sold out, and never as buyable.
 */
export const PublicSeatSchema = z.object({
  id: z.string(),
  label: z.string(),
  row: z.string(),
  number: z.number().int().positive(),
  tierId: z.string().nullable(),
  sold: z.boolean()
});
export type PublicSeat = z.infer<typeof PublicSeatSchema>;

/**
 * A zone of the plan. Seats are sent explicitly rather than as `rows x seatsPerRow`, because a
 * numbered zone can mix several ticket types and can legitimately have gaps; the buyer site
 * must show exactly the same numbering the organiser sees.
 */
export const PublicSeatZoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["seats", "ga", "stage", "accessible"]),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  /** Numbered zones only. */
  seats: z.array(PublicSeatSchema).optional(),
  /** Standing zones only: free capacity sold as a single tier. */
  capacity: z.number().int().nonnegative().optional(),
  tierId: z.string().nullable().optional()
});
export type PublicSeatZone = z.infer<typeof PublicSeatZoneSchema>;

export const PublicSeatMapSchema = z.object({
  zones: z.array(PublicSeatZoneSchema)
});
export type PublicSeatMap = z.infer<typeof PublicSeatMapSchema>;

/**
 * A discount code as the buyer site needs it. `value` is a whole percent for `percent`, and
 * minor units for `fixed` — the same convention the panel stores.
 */
export const PublicDiscountCodeSchema = z.object({
  code: z.string(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().nonnegative(),
  /** null when the code is not restricted to specific tiers. */
  appliesToTierIds: z.array(z.string()).nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  maxUsesPerCustomer: z.number().int().positive().nullable()
});
export type PublicDiscountCode = z.infer<typeof PublicDiscountCodeSchema>;

/** One date/function of an event. Single-date events publish exactly one. */
export const PublicSessionSchema = z.object({
  id: z.string(),
  name: z.string(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  doorsOpenAt: z.string().nullable(),
  status: z.enum(["scheduled", "on_sale", "sold_out", "cancelled", "finished"])
});
export type PublicSession = z.infer<typeof PublicSessionSchema>;

export const PublicMatchupSchema = z.object({
  competition: z.string(),
  home: z.string(),
  away: z.string(),
  homeLogo: z.string().nullable(),
  awayLogo: z.string().nullable()
});
export type PublicMatchup = z.infer<typeof PublicMatchupSchema>;

export const PublicEventSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  category: EventCategorySchema,
  /** Short text for cards. */
  description: z.string(),
  /** Full body for the event page; falls back to `description` when the organiser left it empty. */
  longDescription: z.string(),
  coverImageUrl: z.string().nullable(),
  gallery: z.array(z.string()),
  tags: z.array(z.string()),
  featured: z.boolean(),
  venue: PublicVenueSchema.nullable(),
  /** "to_be_announced" means the buyer site shows "Fecha por confirmar" + the alert bell and blocks general sale. */
  dateStatus: z.enum(["confirmed", "to_be_announced"]),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  durationMinutes: z.number().int().positive().nullable(),
  salesStartAt: z.string().nullable(),
  salesEndAt: z.string().nullable(),
  sessions: z.array(PublicSessionSchema),
  tiers: z.array(PublicTicketTierSchema),
  /** Cheapest tier price in minor units; null when nothing is on sale. */
  priceFrom: z.number().int().nonnegative().nullable(),
  /**
   * Booking fee the organiser adds. Sent as type + value rather than a flat per-ticket amount,
   * because a percentage fee cannot be resolved to a single figure before the buyer picks a tier.
   * `fixed` is minor units per ticket; `percent` is a whole percent of the ticket price.
   */
  serviceFee: z.object({
    type: z.enum(["none", "percent", "fixed"]),
    value: z.number().nonnegative()
  }),
  seatMap: PublicSeatMapSchema.nullable(),
  discountCodes: z.array(PublicDiscountCodeSchema),
  matchup: PublicMatchupSchema.nullable(),
  organizerName: z.string().nullable(),
  publishedAt: z.string().nullable()
});
export type PublicEvent = z.infer<typeof PublicEventSchema>;
