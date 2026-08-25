import { http, HttpResponse } from "msw";
import type { Venue, Zone } from "@entraditas/types";
import { db } from "../state";
import { getSessionUserId } from "../authContext";

const BASE = "http://localhost:4000/api/v1";

function requireUser(request: Request) {
  const userId = getSessionUserId(request);
  return userId ? db.users.find((u) => u.id === userId) ?? null : null;
}

export const venuesHandlers = [
  http.get(`${BASE}/venues`, ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_venues" } }, { status: 401 });
    }
    const venues = user.role === "superadmin" ? db.venues : db.venues.filter((v) => v.organizationId === user.organizationId);
    return HttpResponse.json({ data: venues, meta: { page: 1, perPage: venues.length, total: venues.length, nextCursor: null } });
  }),

  http.post(`${BASE}/venues`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) {
      return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_venues_create" } }, { status: 401 });
    }
    const body = (await request.json()) as Pick<Venue, "name" | "city" | "totalCapacity">;
    const venue: Venue = { id: `venue-${db.venues.length + 1}`, organizationId: user.organizationId!, ...body };
    db.venues.push(venue);
    return HttpResponse.json({ data: venue, meta: { requestId: "req_venues_create" } }, { status: 201 });
  }),

  http.get(`${BASE}/venues/:venueId/zones`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_zones" } }, { status: 401 });
    }
    const venue = db.venues.find((v) => v.id === params.venueId);
    if (!venue || (user.role !== "superadmin" && venue.organizationId !== user.organizationId)) {
      return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId: "req_zones" } }, { status: 404 });
    }
    const zones = db.zones.filter((z) => z.venueId === params.venueId as string);
    return HttpResponse.json({ data: zones, meta: { page: 1, perPage: zones.length, total: zones.length, nextCursor: null } });
  }),

  http.post(`${BASE}/venues/:venueId/zones`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) {
      return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_zones_create" } }, { status: 401 });
    }
    const venue = db.venues.find((v) => v.id === params.venueId);
    if (!venue || (user.role !== "superadmin" && venue.organizationId !== user.organizationId)) {
      return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId: "req_zones_create" } }, { status: 404 });
    }
    const body = (await request.json()) as Pick<Zone, "name" | "capacity">;
    const zone: Zone = { id: `zone-${db.zones.length + 1}`, venueId: params.venueId as string, ...body };
    db.zones.push(zone);
    return HttpResponse.json({ data: zone, meta: { requestId: "req_zones_create" } }, { status: 201 });
  })
];
