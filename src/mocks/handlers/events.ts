import { http, HttpResponse } from "msw";
import { EVENT_CATEGORIES, type Event, type SubEvent, type User, type Venue } from "@entraditas/types";
import { hasPermission, resolveEffectivePermissions } from "@/shared/auth/permissions";
import { db } from "../state";
import { getSessionUserId } from "../authContext";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "Sesion no valida", requestId } },
    { status: 401 }
  );
}

function notFound(requestId: string) {
  return HttpResponse.json(
    { error: { code: "NOT_FOUND", message: "Evento no encontrado", requestId } },
    { status: 404 }
  );
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

export function canAccessEvent(event: Event, user: User): boolean {
  if (user.role !== "superadmin" && event.organizationId !== user.organizationId) return false;
  const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
  return hasPermission(effective, "events:read", { eventId: event.id, eventScopes: user.eventScopes });
}

/**
 * Categories are a closed set shared with the buyer site, so the API refuses one it does not
 * know rather than storing an event entraditas.com could never render. TypeScript alone would
 * not catch this: request bodies arrive as raw JSON.
 */
function rejectUnknownCategory(category: string | undefined, requestId: string) {
  if (category === undefined) return null;
  if ((EVENT_CATEGORIES as readonly string[]).includes(category)) return null;
  return HttpResponse.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: `Categoria no valida: ${category}. Validas: ${EVENT_CATEGORIES.join(", ")}`,
        requestId
      }
    },
    { status: 422 }
  );
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function findOrCreateVenue(user: User, name: string, city: string): Venue {
  const trimmedName = name.trim();
  const trimmedCity = city.trim();
  const existing = db.venues.find(
    (v) =>
      v.organizationId === user.organizationId &&
      v.name.toLowerCase() === trimmedName.toLowerCase() &&
      v.city.toLowerCase() === trimmedCity.toLowerCase()
  );
  if (existing) return existing;
  const venue: Venue = {
    id: `venue-created-${db.venues.length + 1}`,
    organizationId: user.organizationId!,
    name: trimmedName,
    city: trimmedCity,
    totalCapacity: 999999
  };
  db.venues.push(venue);
  return venue;
}

function combineDateTime(date: string, time: string): string {
  return `${date}T${time}:00.000Z`;
}

function addMinutesToIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

type EventFieldsBody = Partial<Event> & {
  city?: string;
  venueName?: string;
  date?: string;
  time?: string;
};

function resolveVenueId(user: User, body: EventFieldsBody): string | null {
  if (body.venueId !== undefined) return body.venueId;
  if (body.venueName && body.city) return findOrCreateVenue(user, body.venueName, body.city).id;
  if (body.location && body.locality) return findOrCreateVenue(user, body.location, body.locality).id;
  return null;
}

function resolveStartsAt(body: EventFieldsBody): string | null {
  if (body.startsAt !== undefined) return body.startsAt;
  if (body.date && body.time) return combineDateTime(body.date, body.time);
  return null;
}

function upsertSingleSubEvent(event: Event, startsAt: string | null, endsAt?: string | null) {
  if (event.hasSubEvents || !startsAt) return;
  const firstSubEvent = db.subEvents
    .filter((s) => s.eventId === event.id)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  const nextEndsAt = endsAt ?? addMinutesToIso(startsAt, 180);
  if (firstSubEvent) {
    firstSubEvent.startsAt = startsAt;
    firstSubEvent.endsAt = nextEndsAt;
    return;
  }
  db.subEvents.push({
    id: `sub-event-${event.id}`,
    eventId: event.id,
    name: "Funcion unica",
    startsAt,
    endsAt: nextEndsAt,
    doorsOpenAt: null,
    status: "scheduled",
    sortOrder: 0
  });
}

export const eventsHandlers = [
  http.get(`${BASE}/events`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_list");
    const status = new URL(request.url).searchParams.get("status");
    let events = db.events.filter((e) => canAccessEvent(e, user));
    if (status) events = events.filter((e) => e.status === status);
    return HttpResponse.json({
      data: events,
      meta: { page: 1, perPage: events.length, total: events.length, nextCursor: null }
    });
  }),

  http.post(`${BASE}/events`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_create");
    const body = (await request.json()) as EventFieldsBody & { title: string };
    const categoryError = rejectUnknownCategory(body.category, "req_events_create");
    if (categoryError) return categoryError;
    const startsAt = resolveStartsAt(body);
    const event: Event = {
      id: `event-created-${db.events.length + 1}`,
      organizationId: user.organizationId ?? (body.organizationId as string),
      venueId: resolveVenueId(user, body),
      slug: slugify(body.title),
      coverImageUrl: body.coverImageUrl ?? null,
      gallery: body.gallery ?? [],
      title: body.title,
      description: body.description ?? "",
      // Categories are a closed set shared with the buyer site (see publicCatalog.ts). The old
      // "otros" default could produce an event entraditas.com had no way to render.
      category: body.category ?? "concierto",
      status: "draft",
      visibility: body.visibility ?? "private",
      location: body.location ?? body.venueName,
      locality: body.locality ?? body.city,
      startsAt,
      endsAt: body.endsAt ?? (startsAt ? addMinutesToIso(startsAt, 180) : null),
      salesStartAt: body.salesStartAt ?? null,
      salesEndAt: body.salesEndAt ?? null,
      hasSubEvents: body.hasSubEvents ?? false,
      isCompetition: body.isCompetition ?? false,
      datePending: body.datePending ?? !startsAt,
      notifyWhenDateConfirmed: body.notifyWhenDateConfirmed ?? !startsAt,
      serviceFeeType: body.serviceFeeType ?? "none",
      serviceFeeValue: body.serviceFeeValue ?? 0,
      createdAt: new Date().toISOString()
    };
    db.events.push(event);
    upsertSingleSubEvent(event, event.startsAt, event.endsAt);
    return HttpResponse.json({ data: event, meta: { requestId: "req_events_create" } }, { status: 201 });
  }),

  http.get(`${BASE}/events/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_get");
    const event = db.events.find((e) => e.id === params.id);
    if (!event || !canAccessEvent(event, user)) return notFound("req_events_get");
    return HttpResponse.json({ data: event, meta: { requestId: "req_events_get" } });
  }),

  http.patch(`${BASE}/events/:id`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_patch");
    const event = db.events.find((e) => e.id === params.id);
    if (!event || !canAccessEvent(event, user)) return notFound("req_events_patch");
    const body = (await request.json()) as EventFieldsBody;
    const categoryError = rejectUnknownCategory(body.category, "req_events_patch");
    if (categoryError) return categoryError;
    const { city, venueName, date, time, ...eventFields } = body;
    const nextVenueId = resolveVenueId(user, body);
    if (nextVenueId) eventFields.venueId = nextVenueId;
    if (body.startsAt === undefined && date && time) {
      eventFields.startsAt = combineDateTime(date, time);
      if (body.endsAt === undefined) eventFields.endsAt = addMinutesToIso(eventFields.startsAt, 180);
    }
    Object.assign(event, eventFields);
    upsertSingleSubEvent(event, event.startsAt, event.endsAt);
    return HttpResponse.json({ data: event, meta: { requestId: "req_events_patch" } });
  }),

  http.delete(`${BASE}/events/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_delete");
    const event = db.events.find((e) => e.id === params.id);
    if (!event || !canAccessEvent(event, user)) return notFound("req_events_delete");
    if (event.status !== "draft") {
      return HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Solo se puede eliminar un evento en borrador",
            requestId: "req_events_delete"
          }
        },
        { status: 409 }
      );
    }
    db.events = db.events.filter((e) => e.id !== event.id);
    db.subEvents = db.subEvents.filter((s) => s.eventId !== event.id);
    db.ticketTypes = db.ticketTypes.filter((t) => t.eventId !== event.id);
    db.discountCodes = db.discountCodes.filter((d) => d.eventId !== event.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_events_delete" } });
  }),

  http.post(`${BASE}/events/:id/publish`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_publish");
    const event = db.events.find((e) => e.id === params.id);
    if (!event || !canAccessEvent(event, user)) return notFound("req_events_publish");
    const hasTicketTypes = db.ticketTypes.some((t) => t.eventId === event.id);
    if (!hasTicketTypes) {
      return HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "El evento necesita al menos un tipo de entrada antes de publicarse",
            requestId: "req_events_publish"
          }
        },
        { status: 422 }
      );
    }
    event.status = "pending_review";
    event.publishedAt = null;
    return HttpResponse.json({ data: event, meta: { requestId: "req_events_publish" } });
  }),

  http.post(`${BASE}/events/:id/unpublish`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_unpublish");
    const event = db.events.find((e) => e.id === params.id);
    if (!event || !canAccessEvent(event, user)) return notFound("req_events_unpublish");
    event.status = "draft";
    event.publishedAt = null;
    return HttpResponse.json({ data: event, meta: { requestId: "req_events_unpublish" } });
  }),

  http.get(`${BASE}/events/:id/summary`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_events_summary");
    const event = db.events.find((e) => e.id === params.id);
    if (!event || !canAccessEvent(event, user)) return notFound("req_events_summary");
    const subEvents = db.subEvents.filter((subEvent) => subEvent.eventId === event.id);
    const pools = db.capacityPools.filter((pool) => subEvents.some((subEvent) => subEvent.id === pool.subEventId));
    return HttpResponse.json({
      data: {
        ticketTypesCount: db.ticketTypes.filter((ticketType) => ticketType.eventId === event.id).length,
        subEventsCount: subEvents.length,
        totalCapacity: pools.reduce((sum, pool) => sum + pool.totalCapacity, 0),
        soldCount: pools.reduce((sum, pool) => sum + pool.soldCount, 0)
      },
      meta: { requestId: "req_events_summary" }
    });
  })
];
