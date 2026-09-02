import { http, HttpResponse } from "msw";
import { db } from "../state";
import { isPubliclyVisible, toPublicEvent } from "@/features/publish/toPublicEvent";

const BASE = "http://localhost:4000/api/v1";

/**
 * The buyer-site catalogue. Unlike every other handler these routes are deliberately
 * unauthenticated and cross-organisation: entraditas.com has no panel session, and a buyer
 * browses every organiser's events at once. Only events the organiser actually published are
 * exposed, and each one is flattened through toPublicEvent so no internal state leaks out.
 */

function buildPublicEvent(event: (typeof db.events)[number]) {
  const subEvents = db.subEvents.filter((subEvent) => subEvent.eventId === event.id);
  const subEventIds = new Set(subEvents.map((subEvent) => subEvent.id));
  return toPublicEvent({
    event,
    organization: db.organizations.find((org) => org.id === event.organizationId) ?? null,
    venue: db.venues.find((venue) => venue.id === event.venueId) ?? null,
    zones: db.zones.filter((zone) => zone.venueId === event.venueId),
    subEvents,
    ticketTypes: db.ticketTypes.filter((ticketType) => ticketType.eventId === event.id),
    pools: db.capacityPools.filter((pool) => subEventIds.has(pool.subEventId)),
    discountCodes: db.discountCodes.filter((code) => code.eventId === event.id)
  });
}

export const publicCatalogHandlers = [
  http.get(`${BASE}/public/events`, ({ request }) => {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const search = url.searchParams.get("q")?.toLowerCase().trim();

    let events = db.events.filter(isPubliclyVisible).map(buildPublicEvent);
    if (category) events = events.filter((event) => event.category === category);
    if (search) {
      events = events.filter(
        (event) =>
          event.title.toLowerCase().includes(search) ||
          event.description.toLowerCase().includes(search) ||
          event.venue?.city.toLowerCase().includes(search)
      );
    }

    return HttpResponse.json({
      data: events,
      meta: { page: 1, perPage: events.length, total: events.length, nextCursor: null }
    });
  }),

  http.get(`${BASE}/public/events/:slug`, ({ params }) => {
    const event = db.events.find((candidate) => candidate.slug === params.slug && isPubliclyVisible(candidate));
    if (!event) {
      return HttpResponse.json(
        { error: { code: "NOT_FOUND", message: "Evento no encontrado", requestId: "req_public" } },
        { status: 404 }
      );
    }
    return HttpResponse.json({ data: buildPublicEvent(event), meta: { requestId: "req_public" } });
  })
];
