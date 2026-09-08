import { http, HttpResponse } from "msw";
import type { User, Venue, Zone } from "@entraditas/types";
import { db } from "../state";
import { getSessionUserId } from "../authContext";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

function requireUser(request: Request) {
  const userId = getSessionUserId(request);
  return userId ? db.users.find((u) => u.id === userId) ?? null : null;
}

function canAccessVenue(venue: Venue, user: User): boolean {
  return user.role === "superadmin" || venue.organizationId === user.organizationId;
}

function requireZone(request: Request, zoneId: string) {
  const user = requireUser(request);
  if (!user) return { error: unauthenticated("req_zones") };
  const zone = db.zones.find((z) => z.id === zoneId);
  const venue = zone ? db.venues.find((v) => v.id === zone.venueId) : null;
  if (!zone || !venue || !canAccessVenue(venue, user)) return { error: notFound("req_zones") };
  return { zone };
}

export const venuesHandlers = [
  http.get(`${BASE}/venues`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_venues");
    const venues = user.role === "superadmin" ? db.venues : db.venues.filter((v) => v.organizationId === user.organizationId);
    return HttpResponse.json({ data: venues, meta: { page: 1, perPage: venues.length, total: venues.length, nextCursor: null } });
  }),

  http.post(`${BASE}/venues`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_venues_create");
    const body = (await request.json()) as Pick<Venue, "name" | "city" | "totalCapacity">;
    const venue: Venue = { id: `venue-${db.venues.length + 1}`, organizationId: user.organizationId!, ...body };
    db.venues.push(venue);
    return HttpResponse.json({ data: venue, meta: { requestId: "req_venues_create" } }, { status: 201 });
  }),

  http.get(`${BASE}/venues/:venueId/zones`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_zones");
    const venue = db.venues.find((v) => v.id === params.venueId);
    if (!venue || !canAccessVenue(venue, user)) return notFound("req_zones");
    const zones = db.zones.filter((z) => z.venueId === (params.venueId as string));
    return HttpResponse.json({ data: zones, meta: { page: 1, perPage: zones.length, total: zones.length, nextCursor: null } });
  }),

  http.post(`${BASE}/venues/:venueId/zones`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_zones_create");
    const venue = db.venues.find((v) => v.id === params.venueId);
    if (!venue || !canAccessVenue(venue, user)) return notFound("req_zones_create");
    const body = (await request.json()) as Partial<
      Pick<Zone, "kind" | "rows" | "rowSeats" | "x" | "y" | "width" | "height">
    > &
      Pick<Zone, "name" | "capacity">;
    const zone: Zone = {
      id: `zone-${db.zones.length + 1}`,
      venueId: params.venueId as string,
      name: body.name,
      capacity: body.capacity,
      kind: body.kind ?? "standing",
      rows: body.rows ?? null,
      rowSeats: body.rowSeats ?? null,
      x: body.x ?? 0,
      y: body.y ?? 0,
      width: body.width ?? 20,
      height: body.height ?? 20
    };
    db.zones.push(zone);
    return HttpResponse.json({ data: zone, meta: { requestId: "req_zones_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/zones/:id`, async ({ request, params }) => {
    const result = requireZone(request, params.id as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as Partial<
      Pick<Zone, "name" | "kind" | "capacity" | "rows" | "rowSeats" | "x" | "y" | "width" | "height">
    >;
    if (body.capacity !== undefined) {
      const oversold = db.capacityPools.find((p) => p.zoneId === result.zone.id && p.soldCount > body.capacity!);
      if (oversold) {
        return HttpResponse.json(
          {
            error: {
              code: "INSUFFICIENT_CAPACITY",
              message: `No se puede bajar el aforo por debajo de las ${oversold.soldCount} entradas ya vendidas`,
              requestId: "req_zones_patch"
            }
          },
          { status: 422 }
        );
      }
    }
    Object.assign(result.zone, body);
    return HttpResponse.json({ data: result.zone, meta: { requestId: "req_zones_patch" } });
  }),

  http.delete(`${BASE}/zones/:id`, ({ request, params }) => {
    const result = requireZone(request, params.id as string);
    if ("error" in result) return result.error;
    const pools = db.capacityPools.filter((p) => p.zoneId === result.zone.id);
    if (pools.some((p) => p.soldCount > 0)) {
      return HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "No se puede eliminar una zona con entradas vendidas",
            requestId: "req_zones_delete"
          }
        },
        { status: 409 }
      );
    }
    db.zones = db.zones.filter((z) => z.id !== result.zone.id);
    db.capacityPools = db.capacityPools.filter((p) => p.zoneId !== result.zone.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_zones_delete" } });
  })
];
