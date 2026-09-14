import { http, HttpResponse } from "msw";
import type { GuestList, GuestListEntry, User } from "@entraditas/types";
import { hasPermission, resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";
import { canAccessEvent } from "./events";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}
function forbidden(requestId: string, message = "No tienes permiso para consultar invitados") {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message, requestId } }, { status: 403 });
}
function notFound(requestId: string, message = "Lista de invitados no encontrada") {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message, requestId } }, { status: 404 });
}
function validationError(requestId: string, message: string) {
  return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message, requestId } }, { status: 422 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

function canRead(user: User, eventId: string): boolean {
  const event = db.events.find((e) => e.id === eventId);
  if (!event || !canAccessEvent(event, user)) return false;
  return hasPermission(resolveEffectivePermissions(user.role, user.permissionOverrides), "guestlist:read", {
    eventId,
    eventScopes: user.eventScopes
  });
}

function canManage(user: User, eventId: string): boolean {
  const event = db.events.find((e) => e.id === eventId);
  if (!event || !canAccessEvent(event, user)) return false;
  return hasPermission(resolveEffectivePermissions(user.role, user.permissionOverrides), "guestlist:manage", {
    eventId,
    eventScopes: user.eventScopes
  });
}

export const guestListsHandlers = [
  http.get(`${BASE}/events/:eventId/guest-lists`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_guestlists_list");
    if (!canRead(user, String(params.eventId))) return forbidden("req_guestlists_list");
    // Las columnas privadas (quiénes son los acompañantes y a qué lista pertenece cada lista)
    // solo las ve quien gestiona invitados; quien solo lee recibe la lista sin su conteo de
    // acompañantes y los invitados se humedecen en la ficha individual si no gestiona.
    const lists = db.guestLists
      .filter((list) => list.eventId === params.eventId)
      .map((list) => {
        const entries = db.guestListEntries.filter((entry) => entry.guestListId === list.id);
        return {
          ...list,
          hasPrivateColumns: hasPermission(resolveEffectivePermissions(user.role, user.permissionOverrides), "guestlist:manage", { eventId: list.eventId, eventScopes: user.eventScopes })
            ? list.hasPrivateColumns
            : undefined,
          entries: entries.map((entry) =>
            hasPermission(resolveEffectivePermissions(user.role, user.permissionOverrides), "guestlist:manage", { eventId: list.eventId, eventScopes: user.eventScopes })
              ? entry
              : { ...entry, plusOneName: undefined }
          )
        };
      });
    return HttpResponse.json({ data: lists, meta: { requestId: "req_guestlists_list" } });
  }),

  http.post(`${BASE}/events/:eventId/guest-lists`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_guestlists_create");
    if (!canManage(user, String(params.eventId))) return forbidden("req_guestlists_create", "No tienes permiso para gestionar invitados");
    const body = (await request.json()) as { name?: string; maxCapacity?: number; hasPrivateColumns?: boolean };
    const name = body.name?.trim();
    if (!name) return validationError("req_guestlists_create", "El nombre de la lista es obligatorio");
    const maxCapacity = body.maxCapacity ?? 0;
    if (!Number.isInteger(maxCapacity) || maxCapacity < 0) {
      return validationError("req_guestlists_create", "El aforo debe ser un número entero no negativo");
    }
    const list: GuestList = {
      id: `gl-${db.guestLists.length + 1}-${Date.now()}`,
      eventId: String(params.eventId),
      name,
      maxCapacity,
      hasPrivateColumns: body.hasPrivateColumns ?? false,
      createdAt: new Date().toISOString()
    };
    db.guestLists.push(list);
    return HttpResponse.json({ data: { ...list, entries: [] }, meta: { requestId: "req_guestlists_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/guest-lists/:id`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_guestlists_patch");
    const list = db.guestLists.find((candidate) => candidate.id === params.id);
    if (!list) return notFound("req_guestlists_patch");
    if (!canManage(user, list.eventId)) return forbidden("req_guestlists_patch", "No tienes permiso para gestionar invitados");
    const body = (await request.json()) as Partial<Pick<GuestList, "name" | "maxCapacity" | "hasPrivateColumns">>;
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) return validationError("req_guestlists_patch", "El nombre de la lista es obligatorio");
      list.name = name;
    }
    if (body.maxCapacity !== undefined) {
      if (!Number.isInteger(body.maxCapacity) || body.maxCapacity < 0) {
        return validationError("req_guestlists_patch", "El aforo debe ser un número entero no negativo");
      }
      if (db.guestListEntries.filter((entry) => entry.guestListId === list.id).length > body.maxCapacity) {
        return validationError("req_guestlists_patch", "No se puede bajar el aforo por debajo de los invitados ya añadidos");
      }
      list.maxCapacity = body.maxCapacity;
    }
    if (body.hasPrivateColumns !== undefined) list.hasPrivateColumns = body.hasPrivateColumns;
    return HttpResponse.json({ data: list, meta: { requestId: "req_guestlists_patch" } });
  }),

  http.delete(`${BASE}/guest-lists/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_guestlists_delete");
    const list = db.guestLists.find((candidate) => candidate.id === params.id);
    if (!list) return notFound("req_guestlists_delete");
    if (!canManage(user, list.eventId)) return forbidden("req_guestlists_delete", "No tienes permiso para gestionar invitados");
    db.guestLists = db.guestLists.filter((candidate) => candidate.id !== list.id);
    db.guestListEntries = db.guestListEntries.filter((entry) => entry.guestListId !== list.id);
    return HttpResponse.json({ data: { id: list.id }, meta: { requestId: "req_guestlists_delete" } });
  }),

  http.post(`${BASE}/guest-lists/:id/entries`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_guestlists_entries_create");
    const list = db.guestLists.find((candidate) => candidate.id === params.id);
    if (!list) return notFound("req_guestlists_entries_create");
    if (!canManage(user, list.eventId)) return forbidden("req_guestlists_entries_create", "No tienes permiso para gestionar invitados");

    const body = (await request.json()) as { fullName?: string; email?: string; plusOneName?: string };
    const fullName = body.fullName?.trim();
    if (!fullName) return validationError("req_guestlists_entries_create", "El nombre del invitado es obligatorio");
    if (body.email !== undefined && body.email !== null && body.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
      return validationError("req_guestlists_entries_create", "El email no tiene un formato válido");
    }

    const currentCount = db.guestListEntries.filter((entry) => entry.guestListId === list.id).length;
    if (currentCount >= list.maxCapacity) {
      return validationError("req_guestlists_entries_create", "La lista ya está completa: no se pueden añadir más invitados");
    }

    const entry: GuestListEntry = {
      id: `gle-${db.guestListEntries.length + 1}-${Date.now()}`,
      guestListId: list.id,
      fullName,
      email: body.email?.trim() || null,
      plusOneName: body.plusOneName?.trim() || null,
      status: "confirmed",
      createdAt: new Date().toISOString()
    };
    db.guestListEntries.push(entry);
    return HttpResponse.json({ data: entry, meta: { requestId: "req_guestlists_entries_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/guest-list-entries/:id`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_guestlists_entries_patch");
    const entry = db.guestListEntries.find((candidate) => candidate.id === params.id);
    if (!entry) return notFound("req_guestlists_entries_patch", "Invitado no encontrado");
    const list = db.guestLists.find((candidate) => candidate.id === entry.guestListId);
    if (!list) return notFound("req_guestlists_entries_patch", "Lista de invitados no encontrada");
    if (!canManage(user, list.eventId)) return forbidden("req_guestlists_entries_patch", "No tienes permiso para gestionar invitados");

    const body = (await request.json()) as Partial<Pick<GuestListEntry, "fullName" | "email" | "plusOneName" | "status">>;
    if (body.fullName !== undefined) {
      const fullName = body.fullName.trim();
      if (!fullName) return validationError("req_guestlists_entries_patch", "El nombre del invitado es obligatorio");
      entry.fullName = fullName;
    }
    if (body.email !== undefined) {
      const email = body.email?.trim() || null;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return validationError("req_guestlists_entries_patch", "El email no tiene un formato válido");
      }
      entry.email = email;
    }
    if (body.plusOneName !== undefined) entry.plusOneName = body.plusOneName?.trim() || null;
    if (body.status !== undefined) {
      if (!["confirmed", "pending", "declined", "cancelled"].includes(body.status)) {
        return validationError("req_guestlists_entries_patch", "Estado de invitación no válido");
      }
      entry.status = body.status;
    }
    return HttpResponse.json({ data: entry, meta: { requestId: "req_guestlists_entries_patch" } });
  }),

  http.delete(`${BASE}/guest-list-entries/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_guestlists_entries_delete");
    const entry = db.guestListEntries.find((candidate) => candidate.id === params.id);
    if (!entry) return notFound("req_guestlists_entries_delete", "Invitado no encontrado");
    const list = db.guestLists.find((candidate) => candidate.id === entry.guestListId);
    if (!list) return notFound("req_guestlists_entries_delete", "Lista de invitados no encontrada");
    if (!canManage(user, list.eventId)) return forbidden("req_guestlists_entries_delete", "No tienes permiso para gestionar invitados");
    db.guestListEntries = db.guestListEntries.filter((candidate) => candidate.id !== entry.id);
    return HttpResponse.json({ data: { id: entry.id }, meta: { requestId: "req_guestlists_entries_delete" } });
  })
];