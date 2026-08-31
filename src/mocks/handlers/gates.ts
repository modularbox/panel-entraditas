import { http, HttpResponse } from "msw";
import type { Gate } from "@entraditas/types";
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
  if (!userId) return { error: unauthenticated("req_gates") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_gates") };
  return { event };
}

function requireGate(request: Request, id: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_gates") };
  const user = db.users.find((u) => u.id === userId);
  const gate = db.gates.find((g) => g.id === id);
  const event = gate ? db.events.find((e) => e.id === gate.eventId) : null;
  if (!user || !gate || !event || !canAccessEvent(event, user)) return { error: notFound("req_gates") };
  return { gate };
}

interface CreateGateBody {
  name: string;
  code: string;
  subEventId: string | null;
  zoneId: string | null;
  direction: Gate["direction"];
  allowReentry: boolean;
  maxScansPerTicket: number;
  allowedTicketTypeGroupIds: string[] | null;
  opensAt: string | null;
  closesAt: string | null;
  operatorUserIds?: string[];
}

type GateWithEvent = Gate & {
  eventTitle: string;
  zoneName: string | null;
  operatorNames: string[];
};

function toGateWithEvent(gate: Gate): GateWithEvent {
  const event = db.events.find((e) => e.id === gate.eventId)!;
  const zone = gate.zoneId ? db.zones.find((z) => z.id === gate.zoneId) : null;
  return {
    ...gate,
    eventTitle: event.title,
    zoneName: zone?.name ?? null,
    operatorNames: gate.operatorUserIds
      .map((id) => db.users.find((u) => u.id === id)?.fullName)
      .filter((name): name is string => Boolean(name))
  };
}

export const gatesHandlers = [
  http.get(`${BASE}/events/:eventId/gates`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const gates = db.gates.filter((g) => g.eventId === result.event.id);
    return HttpResponse.json({ data: gates, meta: { page: 1, perPage: gates.length, total: gates.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/gates`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as CreateGateBody;
    const duplicate = db.gates.some(
      (g) => g.eventId === result.event.id && g.code.toLowerCase() === body.code.toLowerCase()
    );
    if (duplicate) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Ya existe una puerta con ese código en este evento", requestId: "req_gates_create" } },
        { status: 422 }
      );
    }
    const created: Gate = {
      id: `gate-${db.gates.length + 1}`,
      eventId: result.event.id,
      subEventId: body.subEventId,
      name: body.name,
      code: body.code,
      zoneId: body.zoneId,
      direction: body.direction,
      allowReentry: body.allowReentry,
      maxScansPerTicket: body.maxScansPerTicket,
      allowedTicketTypeGroupIds: body.allowedTicketTypeGroupIds,
      opensAt: body.opensAt,
      closesAt: body.closesAt,
      operatorUserIds: body.operatorUserIds ?? [],
      isActive: true
    };
    db.gates.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_gates_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/gates/:id`, async ({ request, params }) => {
    const result = requireGate(request, params.id as string);
    if ("error" in result) return result.error;
    Object.assign(result.gate, await request.json());
    return HttpResponse.json({ data: result.gate, meta: { requestId: "req_gates_patch" } });
  }),

  http.delete(`${BASE}/gates/:id`, ({ request, params }) => {
    const result = requireGate(request, params.id as string);
    if ("error" in result) return result.error;
    db.gates = db.gates.filter((g) => g.id !== result.gate.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_gates_delete" } });
  }),

  http.get(`${BASE}/events/:eventId/team`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const members = db.users.filter((u) => u.organizationId === result.event.organizationId && u.role === "subuser");
    return HttpResponse.json({ data: members, meta: { page: 1, perPage: members.length, total: members.length, nextCursor: null } });
  }),

  http.get(`${BASE}/gates`, ({ request }) => {
    const userId = getSessionUserId(request);
    if (!userId) return unauthenticated("req_gates_all");
    const user = db.users.find((u) => u.id === userId);
    if (!user) return unauthenticated("req_gates_all");
    const visibleEventIds = new Set(db.events.filter((e) => canAccessEvent(e, user)).map((e) => e.id));
    const gates = db.gates.filter((g) => visibleEventIds.has(g.eventId)).map(toGateWithEvent);
    return HttpResponse.json({ data: gates, meta: { page: 1, perPage: gates.length, total: gates.length, nextCursor: null } });
  })
];
