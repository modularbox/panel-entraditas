import type {
  CapacityPool,
  DiscountCode,
  Event,
  Organization,
  PublicDiscountCode,
  PublicEvent,
  PublicSeatZone,
  PublicSession,
  PublicTicketTier,
  SubEvent,
  TicketType,
  Venue,
  Zone
} from "@entraditas/types";
import {
  buildSeatGrid,
  fromSeatAssignmentList,
  rowOriginForStage,
  type SeatAssignments
} from "../events/wizard/steps/seatMap";

/**
 * Turns the panel's organiser-shaped model into the flat event the buyer site consumes.
 *
 * This is the single place where the two worlds meet, so every mismatch between them is
 * resolved here and nowhere else: ticket type *groups* collapse into tiers, capacity pools and
 * seat assignments collapse into a drawn plan, and internal review states never leak out.
 */

export interface PublishInput {
  event: Event;
  organization?: Organization | null;
  venue?: Venue | null;
  zones?: Zone[];
  subEvents?: SubEvent[];
  ticketTypes?: TicketType[];
  pools?: CapacityPool[];
  discountCodes?: DiscountCode[];
}

/** The states in which an event is visible to buyers at all. */
const PUBLIC_STATUSES = new Set<Event["status"]>(["published", "on_sale", "sold_out", "paused", "finished"]);

export function isPubliclyVisible(event: Event): boolean {
  return PUBLIC_STATUSES.has(event.status) && event.visibility === "public";
}

/**
 * Ticket types are stored one row per sub-event sharing a groupId; buyers see one product.
 * Availability is summed across the group's rows, and an unlimited row makes the whole tier
 * unlimited.
 */
export function toTiers(ticketTypes: TicketType[]): PublicTicketTier[] {
  const byGroup = new Map<string, TicketType[]>();
  for (const ticketType of ticketTypes) {
    byGroup.set(ticketType.groupId, [...(byGroup.get(ticketType.groupId) ?? []), ticketType]);
  }
  return [...byGroup.values()]
    .map((rows) => {
      const first = rows[0]!;
      const unlimited = rows.some((row) => row.quantityTotal === null);
      const available = unlimited
        ? null
        : rows.reduce((sum, row) => sum + Math.max(0, (row.quantityTotal ?? 0) - row.quantitySold), 0);
      return {
        id: first.groupId,
        name: first.name,
        description: null,
        price: first.basePrice,
        currency: first.currency,
        color: first.color ?? "#111111",
        available,
        minPerOrder: first.minPerOrder,
        maxPerOrder: first.maxPerOrder
      } satisfies PublicTicketTier;
    })
    .sort((a, b) => a.price - b.price);
}

/** Only public tiers reach the buyer site; hidden and code-only ones stay out of the catalogue. */
export function sellableTicketTypes(ticketTypes: TicketType[]): TicketType[] {
  return ticketTypes.filter((ticketType) => ticketType.visibility === "public");
}

const ZONE_KIND_TO_PUBLIC: Partial<Record<Zone["kind"], PublicSeatZone["kind"]>> = {
  numbered: "seats",
  standing: "ga",
  stage: "stage",
  accessible: "accessible"
};

/**
 * Draws the plan for buyers. Numbered zones ship their seats explicitly, already carrying the
 * label the organiser sees and the tier each one sells, so the buyer site never has to re-derive
 * the numbering and can never disagree with the panel about which chair is A7.
 */
export function toSeatZones(zones: Zone[], pools: CapacityPool[]): PublicSeatZone[] {
  const stage = zones.find((zone) => zone.kind === "stage") ?? null;
  const result: PublicSeatZone[] = [];
  for (const zone of zones) {
    const kind = ZONE_KIND_TO_PUBLIC[zone.kind];
    if (!kind) continue; // gates are operational, not part of the buyer's plan
    const pool = pools.find((candidate) => candidate.zoneId === zone.id);
    const base = {
      id: zone.id,
      name: zone.name,
      kind,
      x: zone.x,
      y: zone.y,
      width: zone.width,
      height: zone.height
    };

    if (kind === "seats") {
      const assignments: SeatAssignments = fromSeatAssignmentList(pool?.seatAssignments);
      const seats = buildSeatGrid({
        capacity: zone.capacity,
        width: zone.width,
        height: zone.height,
        rows: zone.rows,
        rowSeats: zone.rowSeats,
        rowAOrigin: rowOriginForStage(zone, stage)
      });
      result.push({
        ...base,
        seats: seats.map((seat) => ({
          id: seat.id,
          label: seat.label,
          row: seat.rowLabel,
          number: seat.number,
          // No assignment means the seat is not for sale, not that it is taken.
          tierId: assignments[seat.id] ?? pool?.ticketTypeGroupId ?? null,
          sold: false
        }))
      });
      continue;
    }

    if (kind === "ga") {
      result.push({ ...base, capacity: zone.capacity, tierId: pool?.ticketTypeGroupId ?? null });
      continue;
    }

    result.push(base);
  }
  return result;
}

/** Only codes a buyer could actually redeem are published; inactive and used-up ones are not. */
export function toDiscountCodes(discountCodes: DiscountCode[]): PublicDiscountCode[] {
  return discountCodes
    .filter((code) => code.status === "active")
    .filter((code) => code.maxUses === null || code.usedCount < code.maxUses)
    .map((code) => ({
      code: code.code,
      type: code.type,
      value: code.value,
      appliesToTierIds: code.appliesTo,
      validFrom: code.validFrom,
      validTo: code.validTo,
      maxUsesPerCustomer: code.maxUsesPerCustomer
    }));
}

export function toSessions(subEvents: SubEvent[]): PublicSession[] {
  return [...subEvents]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((subEvent) => ({
      id: subEvent.id,
      name: subEvent.name,
      startsAt: subEvent.startsAt,
      endsAt: subEvent.endsAt,
      doorsOpenAt: subEvent.doorsOpenAt,
      status: subEvent.status
    }));
}

export function toPublicEvent(input: PublishInput): PublicEvent {
  const { event, organization, venue, zones = [], subEvents = [], pools = [], discountCodes = [] } = input;
  const ticketTypes = sellableTicketTypes(input.ticketTypes ?? []);
  const tiers = toTiers(ticketTypes);
  const seatZones = toSeatZones(zones, pools);
  const prices = tiers.map((tier) => tier.price);

  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    category: event.category,
    description: event.description,
    // The organiser often only fills the short text; the event page must still have a body.
    longDescription: event.longDescription?.trim() ? event.longDescription : event.description,
    coverImageUrl: event.coverImageUrl ?? null,
    gallery: event.gallery ?? [],
    tags: event.tags ?? [],
    featured: event.featured ?? false,
    venue: venue
      ? {
          id: venue.id,
          name: venue.name,
          city: venue.city,
          province: venue.province ?? null,
          address: venue.address ?? null,
          coordinates: venue.coordinates ?? null
        }
      : null,
    // A pending date is the buyer site's cue to show "Fecha por confirmar" + the alert bell
    // and block general sale, so it wins over whatever startsAt happens to hold.
    dateStatus: event.datePending ? "to_be_announced" : "confirmed",
    startsAt: event.datePending ? null : event.startsAt,
    endsAt: event.datePending ? null : event.endsAt,
    durationMinutes: event.durationMinutes ?? null,
    salesStartAt: event.salesStartAt,
    salesEndAt: event.salesEndAt,
    sessions: toSessions(subEvents),
    tiers,
    priceFrom: prices.length > 0 ? Math.min(...prices) : null,
    serviceFee: { type: event.serviceFeeType ?? "none", value: event.serviceFeeValue ?? 0 },
    seatMap: seatZones.length > 0 ? { zones: seatZones } : null,
    discountCodes: toDiscountCodes(discountCodes),
    matchup: event.matchup
      ? {
          competition: event.matchup.competition,
          home: event.matchup.home,
          away: event.matchup.away,
          homeLogo: event.matchup.homeLogo ?? null,
          awayLogo: event.matchup.awayLogo ?? null
        }
      : null,
    organizerName: organization?.name ?? null,
    publishedAt: event.publishedAt ?? null
  };
}
