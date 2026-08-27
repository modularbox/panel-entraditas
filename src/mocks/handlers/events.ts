import { http, HttpResponse } from "msw";
import type { Event, SubEvent, User, Venue } from "@entraditas/types";
import { hasPermission, resolveEffectivePermissions } from "@/shared/auth/permissions";
import { db } from "../state";
import { getSessionUserId } from "../authContext";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } },
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

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
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
    const venueId =
      body.venueName && body.city ? findOrCreateVenue(user, body.venueName, body.city).id : body.venueId ?? null;
    const event: Event = {
      id: `event-created-${db.events.length + 1}`,
      organizationId: user.organizationId ?? (body.organizationId as string),
      venueId,
      slug: slugify(body.title),
      title: body.title,
      description: body.description ?? "",
      category: body.category ?? "otros",
      status: "draft",
      visibility: body.visibility ?? "private",
      startsAt: body.startsAt ?? new Date().toISOString(),
      endsAt: body.endsAt ?? new Date().toISOString(),
      salesStartAt: null,
      salesEndAt: null,
      hasSubEvents: body.hasSubEvents ?? false,
      isCompetition: body.isCompetition ?? false,
      createdAt: new Date().toISOString()
    };
    db.events.push(event);

    if (!event.hasSubEvents && body.date && body.time) {
      const startsAt = combineDateTime(body.date, body.time);
      const subEvent: SubEvent = {
        id: `sub-event-${event.id}`,
        eventId: event.id,
        name: "Función única",
        startsAt,
        endsAt: addMinutesToIso(startsAt, 180),
        doorsOpenAt: null,
        status: "scheduled",
        sortOrder: 0
      };
      db.subEvents.push(subEvent);
    }

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
    const { city, venueName, date, time, ...eventFields } = body;
    if (venueName && city) {
      eventFields.venueId = findOrCreateVenue(user, venueName, city).id;
    }
    Object.assign(event, eventFields);

    if (!event.hasSubEvents && date && time) {
      const firstSubEvent = db.subEvents
        .filter((s) => s.eventId === event.id)
        .sort((a, b) => a.sortOrder - b.sortOrder)[0];
      if (firstSubEvent) {
        const startsAt = combineDateTime(date, time);
        firstSubEvent.startsAt = startsAt;
        firstSubEvent.endsAt = addMinutesToIso(startsAt, 180);
      }
    }

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
    event.status = "published";
    event.publishedAt = new Date().toISOString();
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
    const subEvents = db.subEvents.filter((s) => s.eventId === event.id);
    const pools = db.capacityPools.filter((p) => subEvents.some((s) => s.id === p.subEventId));
    return HttpResponse.json({
      data: {
        ticketTypesCount: db.ticketTypes.filter((t) => t.eventId === event.id).length,
        subEventsCount: subEvents.length,
        totalCapacity: pools.reduce((sum, p) => sum + p.totalCapacity, 0),
        soldCount: pools.reduce((sum, p) => sum + p.soldCount, 0)
      },
      meta: { requestId: "req_events_summary" }
    });
  })
];
