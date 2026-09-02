import { http, HttpResponse } from "msw";
import type { CapacityPool, SeatAssignment } from "@entraditas/types";
import { db } from "../state";
import { getSessionUserId } from "../authContext";
import { canAccessEvent } from "./events";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "SesiÃ³n no vÃ¡lida", requestId } }, { status: 401 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

function validation(message: string, requestId: string) {
  return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message, requestId } }, { status: 422 });
}

// Walks subEvent -> event so canAccessEvent can enforce org/scope permissions on a pool's parent event.

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

function ticketGroupLimit(groupId?: string | null): number | null {
  if (!groupId) return null;
  return db.ticketTypes.find((ticketType) => ticketType.groupId === groupId)?.quantityTotal ?? null;
}

type PoolAllocation = Pick<CapacityPool, "totalCapacity" | "ticketTypeGroupId" | "seatAssignments">;

/**
 * How much of a ticket type's stock a single pool consumes. A zone broken down seat by seat
 * only consumes one unit per assigned seat, so several ticket types can share one zone; a zone
 * without a seat breakdown still consumes its whole capacity for its zone-wide ticket type.
 */
function poolTakeForGroup(pool: PoolAllocation, groupId: string): number {
  if (pool.seatAssignments && pool.seatAssignments.length > 0) {
    return pool.seatAssignments.filter((seat) => seat.ticketTypeGroupId === groupId).length;
  }
  return pool.ticketTypeGroupId === groupId ? pool.totalCapacity : 0;
}

function assignedCapacity(groupId: string, subEventId: string, poolId: string | undefined, candidate: PoolAllocation) {
  const others = db.capacityPools
    .filter((pool) => pool.subEventId === subEventId && pool.id !== poolId)
    .reduce((sum, pool) => sum + poolTakeForGroup(pool, groupId), 0);
  return others + poolTakeForGroup(candidate, groupId);
}

/**
 * A ticket type can be spread over several zones, but never beyond the quantity it was created
 * with. Validates every ticket type the candidate pool touches, not just its zone-wide one,
 * since a seat breakdown can put several types in the same zone.
 */
function validateAllocation(subEventId: string, candidate: PoolAllocation, poolId?: string) {
  const touched = new Set<string>();
  if (candidate.ticketTypeGroupId) touched.add(candidate.ticketTypeGroupId);
  for (const seat of candidate.seatAssignments ?? []) touched.add(seat.ticketTypeGroupId);

  for (const groupId of touched) {
    const limit = ticketGroupLimit(groupId);
    if (limit === null) continue;
    const nextAssigned = assignedCapacity(groupId, subEventId, poolId, candidate);
    if (nextAssigned > limit) {
      return validation(`Este tipo de entrada tiene ${limit} entradas y ya hay ${nextAssigned}/${limit} asignadas`, "req_capacity");
    }
  }
  return null;
}

/** Seats can only be assigned within the zone's capacity, and only once each. */
function validateSeatAssignments(seatAssignments: SeatAssignment[] | undefined, totalCapacity: number) {
  if (!seatAssignments) return null;
  if (seatAssignments.length > totalCapacity) {
    return validation(`Esta zona tiene ${totalCapacity} plazas y se han asignado ${seatAssignments.length}`, "req_capacity");
  }
  const seen = new Set<string>();
  for (const seat of seatAssignments) {
    if (seen.has(seat.seatId)) return validation(`El asiento ${seat.seatId} esta asignado dos veces`, "req_capacity");
    seen.add(seat.seatId);
  }
  return null;
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
    const body = (await request.json()) as Pick<
      CapacityPool,
      "name" | "zoneId" | "totalCapacity" | "ticketTypeGroupId" | "seatAssignments"
    >;
    const allocationError = validateAllocation(result.subEvent.id, body);
    if (allocationError) return allocationError;
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
    const body = (await request.json()) as {
      totalCapacity?: number;
      ticketTypeGroupId?: string | null;
      seatAssignments?: SeatAssignment[];
    };
    // Every field is optional: the seat editor patches only the seat breakdown, while the zone
    // editor patches only the capacity. Anything absent keeps the value it already had.
    const totalCapacity = body.totalCapacity ?? result.pool.totalCapacity;
    const ticketTypeGroupId = "ticketTypeGroupId" in body ? body.ticketTypeGroupId : result.pool.ticketTypeGroupId;
    const seatAssignments = "seatAssignments" in body ? body.seatAssignments : result.pool.seatAssignments;

    // Can't shrink capacity below what's already sold.
    if (totalCapacity < result.pool.soldCount) {
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

    const seatError = validateSeatAssignments(seatAssignments, totalCapacity);
    if (seatError) return seatError;

    const candidate: PoolAllocation = { totalCapacity, ticketTypeGroupId, seatAssignments };
    const allocationError = validateAllocation(result.pool.subEventId, candidate, result.pool.id);
    if (allocationError) return allocationError;

    result.pool.totalCapacity = totalCapacity;
    if ("ticketTypeGroupId" in body) result.pool.ticketTypeGroupId = body.ticketTypeGroupId;
    if ("seatAssignments" in body) result.pool.seatAssignments = body.seatAssignments;
    return HttpResponse.json({ data: result.pool, meta: { requestId: "req_capacity" } });
  })
];
