import { http, HttpResponse } from "msw";
import type { TicketType, TicketTypePrice } from "@entraditas/types";
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

function requireEvent(request: Request, eventId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_tt") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_tt") };
  return { event };
}

function requireTicketType(request: Request, ticketTypeId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_tt") };
  const user = db.users.find((u) => u.id === userId);
  const ticketType = db.ticketTypes.find((t) => t.id === ticketTypeId);
  const event = ticketType ? db.events.find((e) => e.id === ticketType.eventId) : null;
  if (!user || !ticketType || !event || !canAccessEvent(event, user)) return { error: notFound("req_tt") };
  return { ticketType };
}

interface CreateTicketTypeBody {
  name: string;
  kind: TicketType["kind"];
  basePrice: number;
  currency: string;
  quantityTotal: number | null;
  minPerOrder: number;
  maxPerOrder: number;
  visibility: TicketType["visibility"];
  isTransferable: boolean;
  isRefundable: boolean;
  scope: "event" | { subEventIds: string[] };
}

export const ticketTypesHandlers = [
  http.get(`${BASE}/events/:eventId/ticket-types`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const ticketTypes = db.ticketTypes.filter((t) => t.eventId === result.event.id).sort((a, b) => a.sortOrder - b.sortOrder);
    return HttpResponse.json({ data: ticketTypes, meta: { page: 1, perPage: ticketTypes.length, total: ticketTypes.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/ticket-types`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as CreateTicketTypeBody;
    const groupId = `ttgroup-${db.ticketTypes.length + 1}`;
    const sortOrder = db.ticketTypes.filter((t) => t.eventId === result.event.id).length;
    const shared = {
      groupId,
      eventId: result.event.id,
      capacityPoolId: null,
      name: body.name,
      kind: body.kind,
      basePrice: body.basePrice,
      currency: body.currency,
      quantityTotal: body.quantityTotal,
      quantitySold: 0,
      minPerOrder: body.minPerOrder,
      maxPerOrder: body.maxPerOrder,
      visibility: body.visibility,
      isTransferable: body.isTransferable,
      isRefundable: body.isRefundable,
      sortOrder
    };
    const created: TicketType[] =
      body.scope === "event"
        ? [{ id: groupId, subEventId: null, ...shared }]
        : body.scope.subEventIds.map((subEventId, i) => ({ id: `${groupId}-${i}`, subEventId, ...shared }));
    db.ticketTypes.push(...created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_tt_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/ticket-types/:id`, async ({ request, params }) => {
    const result = requireTicketType(request, params.id as string);
    if ("error" in result) return result.error;
    Object.assign(result.ticketType, await request.json());
    return HttpResponse.json({ data: result.ticketType, meta: { requestId: "req_tt_patch" } });
  }),

  http.delete(`${BASE}/ticket-types/:id`, ({ request, params }) => {
    const result = requireTicketType(request, params.id as string);
    if ("error" in result) return result.error;
    if (result.ticketType.quantitySold > 0) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "No se puede eliminar un tipo de entrada con ventas", requestId: "req_tt_delete" } },
        { status: 409 }
      );
    }
    db.ticketTypes = db.ticketTypes.filter((t) => t.id !== result.ticketType.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_tt_delete" } });
  }),

  http.post(`${BASE}/ticket-types/reorder`, async ({ request }) => {
    const userId = getSessionUserId(request);
    if (!userId) return unauthenticated("req_tt_reorder");
    const user = db.users.find((u) => u.id === userId);
    const body = (await request.json()) as { items: { groupId: string; sortOrder: number }[] };
    for (const item of body.items) {
      const ticketType = db.ticketTypes.find((t) => t.groupId === item.groupId);
      const event = ticketType ? db.events.find((e) => e.id === ticketType.eventId) : null;
      if (!user || !ticketType || !event || !canAccessEvent(event, user)) return notFound("req_tt_reorder");
    }
    for (const item of body.items) {
      for (const tt of db.ticketTypes.filter((t) => t.groupId === item.groupId)) {
        tt.sortOrder = item.sortOrder;
      }
    }
    return HttpResponse.json({ data: {}, meta: { requestId: "req_tt_reorder" } });
  }),

  http.post(`${BASE}/ticket-types/:id/prices`, async ({ request, params }) => {
    const result = requireTicketType(request, params.id as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as Pick<TicketTypePrice, "name" | "price" | "startsAt" | "endsAt">;
    const price: TicketTypePrice = {
      id: `ttprice-${db.ticketTypePrices.length + 1}`,
      ticketTypeId: result.ticketType.id,
      isActive: true,
      ...body
    };
    db.ticketTypePrices.push(price);
    return HttpResponse.json({ data: price, meta: { requestId: "req_tt_prices" } }, { status: 201 });
  })
];
