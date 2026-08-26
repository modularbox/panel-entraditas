import { http, HttpResponse } from "msw";
import type { Order, OrderItem, TicketType, User } from "@entraditas/types";
import { hasPermission, resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";
import { canAccessEvent } from "./events";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}
function forbidden(requestId: string, message = "No tienes permiso para consultar pedidos") {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message, requestId } }, { status: 403 });
}
function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Pedido no encontrado", requestId } }, { status: 404 });
}
function validationError(requestId: string, message: string, code = "VALIDATION_ERROR") {
  return HttpResponse.json({ error: { code, message, requestId } }, { status: 422 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

export function canAccessOrder(order: Order, user: User): boolean {
  if (user.role !== "superadmin" && order.organizationId !== user.organizationId) return false;
  const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
  return hasPermission(effective, "orders:read", { eventId: order.eventId, eventScopes: user.eventScopes });
}

export const ordersHandlers = [
  http.get(`${BASE}/orders`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_orders_list");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_orders_list");

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");
    const q = url.searchParams.get("q")?.trim().toLowerCase();

    let orders = db.orders.filter((order) => canAccessOrder(order, user));
    if (eventId) orders = orders.filter((order) => order.eventId === eventId);
    if (status) orders = orders.filter((order) => order.status === status);
    if (channel) orders = orders.filter((order) => order.channel === channel);
    if (q) {
      orders = orders.filter((order) =>
        order.orderNumber.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.customerEmail.toLowerCase().includes(q)
      );
    }
    orders = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return HttpResponse.json({ data: orders, meta: { requestId: "req_orders_list" } });
  }),

  http.get(`${BASE}/orders/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_orders_get");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_orders_get");

    const order = db.orders.find((o) => o.id === params.id);
    if (!order || !canAccessOrder(order, user)) return notFound("req_orders_get");

    const items = db.orderItems.filter((item) => item.orderId === order.id);
    const refunds = db.refunds.filter((r) => r.orderId === order.id);
    return HttpResponse.json({ data: { ...order, items, refunds }, meta: { requestId: "req_orders_get" } });
  }),

  http.post(`${BASE}/orders`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_orders_create");

    const body = (await request.json()) as {
      eventId?: string;
      customerName?: string;
      customerEmail?: string;
      items?: { ticketTypeId: string; quantity: number }[];
    };

    const event = body.eventId ? db.events.find((e) => e.id === body.eventId) : undefined;
    if (!event || !canAccessEvent(event, user)) return notFound("req_orders_create");

    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:create")) return forbidden("req_orders_create", "No tienes permiso para vender entradas");

    const items = body.items ?? [];
    if (items.length === 0) return validationError("req_orders_create", "Añade al menos una línea a la venta");
    if (!body.customerName?.trim() || !body.customerEmail?.trim()) {
      return validationError("req_orders_create", "El nombre y el email del comprador son obligatorios");
    }

    const lines: { ticketType: TicketType; quantity: number }[] = [];
    for (const line of items) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        return validationError("req_orders_create", "La cantidad debe ser un entero positivo");
      }
      const ticketType = db.ticketTypes.find((tt) => tt.id === line.ticketTypeId && tt.eventId === event.id);
      if (!ticketType) return validationError("req_orders_create", "Uno de los tipos de entrada no pertenece a este evento");
      lines.push({ ticketType, quantity: line.quantity });
    }

    for (const { ticketType, quantity } of lines) {
      if (ticketType.quantityTotal !== null && ticketType.quantityTotal - ticketType.quantitySold < quantity) {
        return validationError("req_orders_create", `No queda stock suficiente de "${ticketType.name}"`, "INSUFFICIENT_CAPACITY");
      }
    }

    const orderId = `order-${db.orders.length + 1}`;
    const orderNumber = `PED-2026-${String(db.orders.length + 1).padStart(4, "0")}`;
    const total = lines.reduce((sum, line) => sum + line.ticketType.basePrice * line.quantity, 0);

    const order: Order = {
      id: orderId,
      orderNumber,
      eventId: event.id,
      organizationId: event.organizationId,
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim(),
      status: "paid",
      total,
      refundedAmount: 0,
      currency: "EUR",
      channel: "box_office",
      createdAt: new Date().toISOString()
    };
    db.orders.push(order);

    const newItems: OrderItem[] = lines.map((line, index) => ({
      id: `oi-${db.orderItems.length + 1 + index}`,
      orderId,
      ticketTypeId: line.ticketType.id,
      ticketTypeName: line.ticketType.name,
      quantity: line.quantity,
      unitPrice: line.ticketType.basePrice,
      subtotal: line.ticketType.basePrice * line.quantity
    }));
    db.orderItems.push(...newItems);

    for (const line of lines) {
      line.ticketType.quantitySold += line.quantity;
      if (line.ticketType.capacityPoolId) {
        const pool = db.capacityPools.find((p) => p.id === line.ticketType.capacityPoolId);
        if (pool) pool.soldCount += line.quantity;
      }
    }

    return HttpResponse.json(
      { data: { ...order, items: newItems, refunds: [] }, meta: { requestId: "req_orders_create" } },
      { status: 201 }
    );
  })
];
