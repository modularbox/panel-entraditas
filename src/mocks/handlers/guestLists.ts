import { http, HttpResponse } from "msw";
import type { GuestList, GuestListEntry } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { db } from "../state";
import { getSessionUserId } from "../authContext";
import { canAccessEvent } from "./events";

const BASE = "http://localhost:4000/api/v1";

type GuestlistPermission = "guestlist:read" | "guestlist:manage";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}

function forbidden(requestId: string) {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message: "No tienes permiso para gestionar invitados", requestId } }, { status: 403 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

function requireEvent(request: Request, eventId: string, permission: GuestlistPermission) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_guestlists") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_guestlists") };
  if (!resolveEffectivePermissions(user.role, user.permissionOverrides).has(permission)) return { error: forbidden("req_guestlists") };
  return { event };
}

function requireGuestList(request: Request, id: string, permission: GuestlistPermission) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_guestlists") };
  const user = db.users.find((u) => u.id === userId);
  const guestList = db.guestLists.find((g) => g.id === id);
  const event = guestList ? db.events.find((e) => e.id === guestList.eventId) : null;
  if (!user || !guestList || !event || !canAccessEvent(event, user)) return { error: notFound("req_guestlists") };
  if (!resolveEffectivePermissions(user.role, user.permissionOverrides).has(permission)) return { error: forbidden("req_guestlists") };
  return { guestList };
}

function requireEntry(request: Request, id: string, permission: GuestlistPermission) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_guestlists") };
  const user = db.users.find((u) => u.id === userId);
  const entry = db.guestListEntries.find((e) => e.id === id);
  const guestList = entry ? db.guestLists.find((g) => g.id === entry.guestListId) : null;
  const event = guestList ? db.events.find((e) => e.id === guestList.eventId) : null;
  if (!user || !entry || !guestList || !event || !canAccessEvent(event, user)) return { error: notFound("req_guestlists") };
  if (!resolveEffectivePermissions(user.role, user.permissionOverrides).has(permission)) return { error: forbidden("req_guestlists") };
  return { entry };
}

interface CreateGuestListBody {
  name: string;
  subEventId: string | null;
  quota: number | null;
}

interface CreateEntryBody {
  fullName: string;
  email: string | null;
  phone: string | null;
  companions: number;
  notes: string | null;
}

export const guestListsHandlers = [
  http.get(`${BASE}/events/:eventId/guest-lists`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string, "guestlist:read");
    if ("error" in result) return result.error;
    const guestLists = db.guestLists.filter((g) => g.eventId === result.event.id);
    return HttpResponse.json({ data: guestLists, meta: { page: 1, perPage: guestLists.length, total: guestLists.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/guest-lists`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string, "guestlist:manage");
    if ("error" in result) return result.error;
    const body = (await request.json()) as CreateGuestListBody;
    const created: GuestList = {
      id: `gl-${db.guestLists.length + 1}`,
      eventId: result.event.id,
      subEventId: body.subEventId,
      name: body.name,
      quota: body.quota
    };
    db.guestLists.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_guestlists_create" } }, { status: 201 });
  }),

  http.delete(`${BASE}/guest-lists/:id`, ({ request, params }) => {
    const result = requireGuestList(request, params.id as string, "guestlist:manage");
    if ("error" in result) return result.error;
    db.guestListEntries = db.guestListEntries.filter((e) => e.guestListId !== result.guestList.id);
    db.guestLists = db.guestLists.filter((g) => g.id !== result.guestList.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_guestlists_delete" } });
  }),

  http.get(`${BASE}/guest-lists/:id/entries`, ({ request, params }) => {
    const result = requireGuestList(request, params.id as string, "guestlist:read");
    if ("error" in result) return result.error;
    const entries = db.guestListEntries.filter((e) => e.guestListId === result.guestList.id);
    return HttpResponse.json({ data: entries, meta: { page: 1, perPage: entries.length, total: entries.length, nextCursor: null } });
  }),

  http.post(`${BASE}/guest-lists/:id/entries`, async ({ request, params }) => {
    const result = requireGuestList(request, params.id as string, "guestlist:manage");
    if ("error" in result) return result.error;
    const existingCount = db.guestListEntries.filter((e) => e.guestListId === result.guestList.id).length;
    if (result.guestList.quota !== null && existingCount >= result.guestList.quota) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Esta lista ha alcanzado su cupo", requestId: "req_guestlists_entry_create" } },
        { status: 422 }
      );
    }
    const body = (await request.json()) as CreateEntryBody;
    const created: GuestListEntry = {
      id: `gle-${db.guestListEntries.length + 1}`,
      guestListId: result.guestList.id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      companions: body.companions,
      status: "pending",
      notes: body.notes
    };
    db.guestListEntries.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_guestlists_entry_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/guest-list-entries/:id`, async ({ request, params }) => {
    const result = requireEntry(request, params.id as string, "guestlist:manage");
    if ("error" in result) return result.error;
    Object.assign(result.entry, await request.json());
    return HttpResponse.json({ data: result.entry, meta: { requestId: "req_guestlists_entry_patch" } });
  }),

  http.delete(`${BASE}/guest-list-entries/:id`, ({ request, params }) => {
    const result = requireEntry(request, params.id as string, "guestlist:manage");
    if ("error" in result) return result.error;
    db.guestListEntries = db.guestListEntries.filter((e) => e.id !== result.entry.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_guestlists_entry_delete" } });
  })
];
