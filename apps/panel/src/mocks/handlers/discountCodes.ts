import { http, HttpResponse } from "msw";
import type { DiscountCode } from "@entraditas/types";
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
  if (!userId) return { error: unauthenticated("req_dc") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_dc") };
  return { event };
}

function requireDiscountCode(request: Request, id: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_dc") };
  const user = db.users.find((u) => u.id === userId);
  const discountCode = db.discountCodes.find((c) => c.id === id);
  const event = discountCode ? db.events.find((e) => e.id === discountCode.eventId) : null;
  if (!user || !discountCode || !event || !canAccessEvent(event, user)) return { error: notFound("req_dc") };
  return { discountCode };
}

interface CreateDiscountCodeBody {
  code: string;
  type: DiscountCode["type"];
  value: number;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  appliesTo: string[] | null;
  validFrom: string | null;
  validTo: string | null;
}

export const discountCodesHandlers = [
  http.get(`${BASE}/events/:eventId/discount-codes`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const codes = db.discountCodes.filter((c) => c.eventId === result.event.id);
    return HttpResponse.json({ data: codes, meta: { page: 1, perPage: codes.length, total: codes.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/discount-codes`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as CreateDiscountCodeBody;
    const duplicate = db.discountCodes.some(
      (c) => c.eventId === result.event.id && c.code.toLowerCase() === body.code.toLowerCase()
    );
    if (duplicate) {
      return HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Ya existe un código de descuento con ese nombre en este evento",
            requestId: "req_dc_create"
          }
        },
        { status: 422 }
      );
    }
    const created: DiscountCode = {
      id: `dc-${db.discountCodes.length + 1}`,
      eventId: result.event.id,
      code: body.code,
      type: body.type,
      value: body.value,
      maxUses: body.maxUses,
      usedCount: 0,
      maxUsesPerCustomer: body.maxUsesPerCustomer,
      appliesTo: body.appliesTo,
      validFrom: body.validFrom,
      validTo: body.validTo,
      status: "active"
    };
    db.discountCodes.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_dc_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/discount-codes/:id`, async ({ request, params }) => {
    const result = requireDiscountCode(request, params.id as string);
    if ("error" in result) return result.error;
    Object.assign(result.discountCode, await request.json());
    return HttpResponse.json({ data: result.discountCode, meta: { requestId: "req_dc_patch" } });
  }),

  http.delete(`${BASE}/discount-codes/:id`, ({ request, params }) => {
    const result = requireDiscountCode(request, params.id as string);
    if ("error" in result) return result.error;
    db.discountCodes = db.discountCodes.filter((c) => c.id !== result.discountCode.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_dc_delete" } });
  })
];
