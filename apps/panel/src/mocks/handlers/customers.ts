import { http, HttpResponse } from "msw";
import type { Customer, Order, User } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";
import { canAccessOrder } from "./orders";

const BASE = "http://localhost:4000/api/v1";
const QUALIFYING_STATUSES = new Set<Order["status"]>(["paid", "partially_refunded", "refunded"]);

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}
function forbidden(requestId: string) {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message: "No tienes permiso para consultar compradores", requestId } }, { status: 403 });
}
function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Asistente no encontrado", requestId } }, { status: 404 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

function buildCustomer(email: string, orders: Order[]): Customer {
  const qualifying = orders.filter((order) => QUALIFYING_STATUSES.has(order.status));
  if (qualifying.length === 0) {
    return { id: email, name: "", email, ordersCount: 0, ticketsCount: 0, totalSpent: 0, lastPurchaseAt: "" };
  }
  const sorted = [...qualifying].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0]!;
  const ticketsCount = qualifying.reduce(
    (sum, order) => sum + db.orderItems.filter((item) => item.orderId === order.id).reduce((s, item) => s + item.quantity, 0),
    0
  );
  const totalSpent = qualifying.reduce((sum, order) => sum + (order.total - order.refundedAmount), 0);
  return {
    id: email,
    name: latest.customerName,
    email,
    ordersCount: qualifying.length,
    ticketsCount,
    totalSpent,
    lastPurchaseAt: latest.createdAt
  };
}

export const customersHandlers = [
  http.get(`${BASE}/customers`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_customers_list");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_customers_list");

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    const q = url.searchParams.get("q")?.trim().toLowerCase();

    const visibleOrders = db.orders.filter((order) => canAccessOrder(order, user) && (!eventId || order.eventId === eventId));
    const byEmail = new Map<string, Order[]>();
    for (const order of visibleOrders) byEmail.set(order.customerEmail, [...(byEmail.get(order.customerEmail) ?? []), order]);

    let customers = [...byEmail.entries()]
      .map(([email, orders]) => buildCustomer(email, orders))
      .filter((customer) => customer.ordersCount > 0);

    if (q) {
      customers = customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    customers = customers.sort((a, b) => b.lastPurchaseAt.localeCompare(a.lastPurchaseAt));

    return HttpResponse.json({ data: customers, meta: { requestId: "req_customers_list" } });
  }),

  http.get(`${BASE}/customers/:email`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_customers_get");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_customers_get");

    const email = decodeURIComponent(params.email as string);
    const allOrders = db.orders.filter((order) => order.customerEmail === email && canAccessOrder(order, user));
    const customer = buildCustomer(email, allOrders);
    if (customer.ordersCount === 0) return notFound("req_customers_get");

    const orders = [...allOrders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => ({ ...order, eventTitle: db.events.find((e) => e.id === order.eventId)?.title ?? "" }));

    return HttpResponse.json({ data: { ...customer, orders }, meta: { requestId: "req_customers_get" } });
  })
];
