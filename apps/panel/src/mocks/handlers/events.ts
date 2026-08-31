import { http, HttpResponse } from "msw";
import type { Event, User } from "@entraditas/types";
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
    const body = (await request.json()) as Partial<Event> & { title: string };
    const startsAt = body.startsAt ?? null;
    const event: Event = {
      id: `event-created-${db.events.length + 1}`,
      organizationId: user.organizationId ?? (body.organizationId as string),
      venueId: body.venueId ?? null,
      slug: slugify(body.title),
      coverImageUrl: body.coverImageUrl ?? null,
      gallery: body.gallery ?? [],
      title: body.title,
      description: body.description ?? "",
      category: body.category ?? "otros",
      status: "draft",
      visibility: body.visibility ?? "private",
      location: body.location,
      locality: body.locality,
      startsAt,
      endsAt: body.endsAt ?? null,
      salesStartAt: null,
      salesEndAt: null,
      hasSubEvents: body.hasSubEvents ?? false,
      datePending: body.datePending ?? !startsAt,
      notifyWhenDateConfirmed: body.notifyWhenDateConfirmed ?? !startsAt,
      serviceFeeType: body.serviceFeeType ?? "none",
      serviceFeeValue: body.serviceFeeValue ?? 0,
      createdAt: new Date().toISOString()
    };
    db.events.push(event);
    if (startsAt) {
      db.subEvents.push({
        id: `sub-event-created-${db.subEvents.length + 1}`,
        eventId: event.id,
        name: "Sesión única",
        startsAt,
        endsAt: body.endsAt ?? new Date(new Date(startsAt).getTime() + 2 * 60 * 60 * 1000).toISOString(),
        doorsOpenAt: null,
        status: "scheduled",
        sortOrder: 0
      });
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
    Object.assign(event, await request.json());
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
