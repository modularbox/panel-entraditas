import { http, HttpResponse } from "msw";
import type { DiscountCode } from "@entraditas/types";
import { db } from "../state";
import { getSessionUserId } from "../authContext";
import { canAccessEvent } from "./events";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesion no valida", requestId } }, { status: 401 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

function validation(message: string, requestId: string) {
  return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message, requestId } }, { status: 422 });
}

function requireEvent(request: Request, eventId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_discounts") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_discounts") };
  return { event };
}

function requireDiscount(request: Request, discountId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_discounts") };
  const user = db.users.find((u) => u.id === userId);
  const discount = db.discountCodes.find((item) => item.id === discountId);
  const event = discount ? db.events.find((item) => item.id === discount.eventId) : null;
  if (!user || !discount || !event || !canAccessEvent(event, user)) return { error: notFound("req_discounts") };
  return { discount };
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

function validateDiscount(body: Partial<DiscountCode>, eventId: string, currentId?: string) {
  const code = normalizeCode(body.code ?? "");
  const type = body.type ?? "percent";
  const value = Number(body.value ?? 0);
  if (code.length < 3) return { error: validation("El codigo debe tener al menos 3 caracteres", "req_discounts_save") };
  if (value <= 0) return { error: validation("El descuento debe ser mayor que cero", "req_discounts_save") };
  if (db.discountCodes.some((item) => item.eventId === eventId && item.id !== currentId && item.code === code)) {
    return { error: validation("Ya existe un codigo con ese nombre en este evento", "req_discounts_save") };
  }
  if (type === "percent" && value > 100) {
    return { error: validation("El porcentaje no puede superar el 100%", "req_discounts_save") };
  }
  return { code };
}

export const discountCodesHandlers = [
  http.get(`${BASE}/events/:eventId/discount-codes`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const codes = db.discountCodes.filter((item) => item.eventId === result.event.id);
    return HttpResponse.json({ data: codes, meta: { page: 1, perPage: codes.length, total: codes.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/discount-codes`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as Partial<DiscountCode>;
    const validated = validateDiscount(body, result.event.id);
    if ("error" in validated) return validated.error;
    const discount: DiscountCode = {
      id: `discount-${db.discountCodes.length + 1}`,
      eventId: result.event.id,
      code: validated.code,
      type: body.type ?? "percent",
      value: Number(body.value ?? 0),
      maxUses: body.maxUses ?? null,
      usedCount: 0,
      maxUsesPerCustomer: body.maxUsesPerCustomer ?? null,
      appliesTo: body.appliesTo ?? [],
      validFrom: body.validFrom ?? null,
      validTo: body.validTo ?? null,
      status: body.status ?? "active"
    };
    db.discountCodes.push(discount);
    return HttpResponse.json({ data: discount, meta: { requestId: "req_discounts_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/discount-codes/:id`, async ({ request, params }) => {
    const result = requireDiscount(request, params.id as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as Partial<DiscountCode>;
    const validated = validateDiscount({ ...result.discount, ...body }, result.discount.eventId, result.discount.id);
    if ("error" in validated) return validated.error;
    Object.assign(result.discount, body, { code: validated.code });
    return HttpResponse.json({ data: result.discount, meta: { requestId: "req_discounts_patch" } });
  }),

  http.delete(`${BASE}/discount-codes/:id`, ({ request, params }) => {
    const result = requireDiscount(request, params.id as string);
    if ("error" in result) return result.error;
    if (result.discount.usedCount > 0) {
      result.discount.status = "paused";
      return HttpResponse.json({ data: result.discount, meta: { requestId: "req_discounts_pause" } });
    }
    db.discountCodes = db.discountCodes.filter((item) => item.id !== result.discount.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_discounts_delete" } });
  })
];
