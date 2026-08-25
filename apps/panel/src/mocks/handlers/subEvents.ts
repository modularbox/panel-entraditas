import { http, HttpResponse } from "msw";
import type { Event, SubEvent } from "@entraditas/types";
import { generateRecurringSubEvents, type RecurringPattern } from "@/shared/lib/recurringSubEvents";
import { db } from "../state";
import { getSessionUserId } from "../authContext";
import { canAccessEvent } from "./events";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

type HandlerError = ReturnType<typeof unauthenticated> | ReturnType<typeof notFound>;
type EventResult = { error: HandlerError } | { event: Event };
type SubEventResult = { error: HandlerError } | { subEvent: SubEvent };

function requireEvent(request: Request, eventId: string): EventResult {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_sub_events") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_sub_events") };
  return { event };
}

function requireSubEvent(request: Request, subEventId: string): SubEventResult {
  const subEvent = db.subEvents.find((s) => s.id === subEventId);
  if (!subEvent) return { error: notFound("req_sub_events") };
  const result = requireEvent(request, subEvent.eventId);
  if ("error" in result) return result;
  return { subEvent };
}

export const subEventsHandlers = [
  http.get(`${BASE}/events/:eventId/sub-events`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const subEvents = db.subEvents.filter((s) => s.eventId === result.event.id).sort((a, b) => a.sortOrder - b.sortOrder);
    return HttpResponse.json({ data: subEvents, meta: { page: 1, perPage: subEvents.length, total: subEvents.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/sub-events`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as Pick<SubEvent, "name" | "startsAt" | "endsAt" | "doorsOpenAt">;
    const subEvent: SubEvent = {
      id: `sub-event-created-${db.subEvents.length + 1}`,
      eventId: result.event.id,
      status: "scheduled",
      sortOrder: db.subEvents.filter((s) => s.eventId === result.event.id).length,
      ...body
    };
    db.subEvents.push(subEvent);
    return HttpResponse.json({ data: subEvent, meta: { requestId: "req_sub_events_create" } }, { status: 201 });
  }),

  http.post(`${BASE}/events/:eventId/sub-events/bulk`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const pattern = (await request.json()) as RecurringPattern;
    const baseSortOrder = db.subEvents.filter((s) => s.eventId === result.event.id).length;
    const generated = generateRecurringSubEvents(pattern).map((g, i) => ({
      ...g,
      id: `sub-event-bulk-${db.subEvents.length + i + 1}`,
      eventId: result.event.id,
      status: "scheduled" as const,
      sortOrder: baseSortOrder + i
    }));
    db.subEvents.push(...generated);
    return HttpResponse.json({ data: generated, meta: { requestId: "req_sub_events_bulk" } }, { status: 201 });
  }),

  http.patch(`${BASE}/sub-events/:id`, async ({ request, params }) => {
    const result = requireSubEvent(request, params.id as string);
    if ("error" in result) return result.error;
    Object.assign(result.subEvent, await request.json());
    return HttpResponse.json({ data: result.subEvent, meta: { requestId: "req_sub_events_patch" } });
  }),

  http.delete(`${BASE}/sub-events/:id`, ({ request, params }) => {
    const result = requireSubEvent(request, params.id as string);
    if ("error" in result) return result.error;
    const soldElsewhere = db.capacityPools.some((p) => p.subEventId === result.subEvent.id && p.soldCount > 0);
    if (soldElsewhere) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "No se puede eliminar una función con entradas vendidas", requestId: "req_sub_events_delete" } },
        { status: 409 }
      );
    }
    db.subEvents = db.subEvents.filter((s) => s.id !== result.subEvent.id);
    db.capacityPools = db.capacityPools.filter((p) => p.subEventId !== result.subEvent.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_sub_events_delete" } });
  }),

  http.post(`${BASE}/sub-events/:id/cancel`, ({ request, params }) => {
    const result = requireSubEvent(request, params.id as string);
    if ("error" in result) return result.error;
    result.subEvent.status = "cancelled";
    return HttpResponse.json({ data: result.subEvent, meta: { requestId: "req_sub_events_cancel" } });
  })
];
