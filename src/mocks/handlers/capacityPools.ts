import { http, HttpResponse } from "msw";
import type { CapacityPool } from "@entraditas/types";
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

function requireSubEvent(request: Request, subEventId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_capacity") };
  const user = db.users.find((u) => u.id === userId);
  const subEvent = db.subEvents.find((s) => s.id === subEventId);
  const event = subEvent ? db.events.find((e) => e.id === subEvent.eventId) : null;
  if (!user || !subEvent || !event || !canAccessEvent(event, user)) return { error: notFound("req_capacity") };
  return { subEvent };
}

function requirePool(request: Request, poolId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_capacity") };
  const user = db.users.find((u) => u.id === userId);
  const pool = db.capacityPools.find((p) => p.id === poolId);
  const subEvent = pool ? db.subEvents.find((s) => s.id === pool.subEventId) : null;
  const event = subEvent ? db.events.find((e) => e.id === subEvent.eventId) : null;
  if (!user || !pool || !subEvent || !event || !canAccessEvent(event, user)) return { error: notFound("req_capacity") };
  return { pool };
}

export const capacityPoolsHandlers = [
  http.get(`${BASE}/sub-events/:id/capacity`, ({ request, params }) => {
    const result = requireSubEvent(request, params.id as string);
    if ("error" in result) return result.error;
    const pools = db.capacityPools.filter((p) => p.subEventId === result.subEvent.id);
    return HttpResponse.json({ data: pools, meta: { page: 1, perPage: pools.length, total: pools.length, nextCursor: null } });
  }),

  http.post(`${BASE}/sub-events/:id/capacity-pools`, async ({ request, params }) => {
    const result = requireSubEvent(request, params.id as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as Pick<CapacityPool, "name" | "zoneId" | "totalCapacity">;
    const pool: CapacityPool = {
      id: `pool-${db.capacityPools.length + 1}`,
      subEventId: result.subEvent.id,
      soldCount: 0,
      heldCount: 0,
      ...body
    };
    db.capacityPools.push(pool);
    return HttpResponse.json({ data: pool, meta: { requestId: "req_capacity" } }, { status: 201 });
  }),

  http.patch(`${BASE}/capacity-pools/:id`, async ({ request, params }) => {
    const result = requirePool(request, params.id as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as { totalCapacity: number };
    if (body.totalCapacity < result.pool.soldCount) {
      return HttpResponse.json(
        {
          error: {
            code: "INSUFFICIENT_CAPACITY",
            message: `No se puede bajar el aforo por debajo de las ${result.pool.soldCount} entradas ya vendidas`,
            requestId: "req_capacity"
          }
        },
        { status: 422 }
      );
    }
    result.pool.totalCapacity = body.totalCapacity;
    return HttpResponse.json({ data: result.pool, meta: { requestId: "req_capacity" } });
  })
];
