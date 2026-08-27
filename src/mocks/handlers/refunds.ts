import { http, HttpResponse } from "msw";
import type { Refund, User } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";
import { canAccessOrder } from "./orders";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}
function forbidden(requestId: string, message: string) {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message, requestId } }, { status: 403 });
}
function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Pedido no encontrado", requestId } }, { status: 404 });
}
function validationError(requestId: string, message: string) {
  return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message, requestId } }, { status: 422 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

export const refundsHandlers = [
  http.post(`${BASE}/orders/:id/refund`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_refund_create");

    const order = db.orders.find((o) => o.id === params.id);
    if (!order || !canAccessOrder(order, user)) return notFound("req_refund_create");

    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:refund")) return forbidden("req_refund_create", "No tienes permiso para reembolsar pedidos");

    if (order.status !== "paid" && order.status !== "partially_refunded") {
      return validationError("req_refund_create", "Este pedido no admite reembolsos");
    }

    const body = (await request.json()) as { amount?: number; reason?: string };
    const reason = body.reason?.trim();
    if (!reason) return validationError("req_refund_create", "El motivo es obligatorio");

    const remaining = order.total - order.refundedAmount;
    const amount = body.amount;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > remaining) {
      return validationError("req_refund_create", "El importe supera lo pendiente de reembolso");
    }

    const refund: Refund = {
      id: `refund-${db.refunds.length + 1}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      amount,
      reason,
      status: "processed",
      createdAt: new Date().toISOString()
    };
    db.refunds.push(refund);

    order.refundedAmount += amount;
    order.status = order.refundedAmount >= order.total ? "refunded" : "partially_refunded";

    if (order.status === "refunded") {
      const items = db.orderItems.filter((item) => item.orderId === order.id);
      for (const item of items) {
        const ticketType = db.ticketTypes.find((tt) => tt.id === item.ticketTypeId);
        if (!ticketType) continue;
        ticketType.quantitySold = Math.max(0, ticketType.quantitySold - item.quantity);
        if (ticketType.capacityPoolId) {
          const pool = db.capacityPools.find((p) => p.id === ticketType.capacityPoolId);
          if (pool) pool.soldCount = Math.max(0, pool.soldCount - item.quantity);
        }
      }
    }

    const items = db.orderItems.filter((item) => item.orderId === order.id);
    const refunds = db.refunds.filter((r) => r.orderId === order.id);
    return HttpResponse.json({ data: { ...order, items, refunds }, meta: { requestId: "req_refund_create" } });
  }),

  http.get(`${BASE}/refunds`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_refunds_list");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_refunds_list", "No tienes permiso para consultar reembolsos");

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    const q = url.searchParams.get("q")?.trim().toLowerCase();

    let refunds = db.refunds.filter((refund) => {
      const order = db.orders.find((o) => o.id === refund.orderId);
      return order ? canAccessOrder(order, user) : false;
    });
    if (eventId) {
      refunds = refunds.filter((refund) => db.orders.find((o) => o.id === refund.orderId)?.eventId === eventId);
    }
    if (q) {
      refunds = refunds.filter((refund) =>
        refund.orderNumber.toLowerCase().includes(q) || refund.customerName.toLowerCase().includes(q)
      );
    }
    refunds = [...refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return HttpResponse.json({ data: refunds, meta: { requestId: "req_refunds_list" } });
  })
];
