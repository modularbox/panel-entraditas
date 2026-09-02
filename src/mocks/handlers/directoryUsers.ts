import { http, HttpResponse } from "msw";
import type { DirectoryUser, DirectoryUserDetail, User } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db, sessions } from "../state";
import { serializeSession } from "./auth";

const BASE = "http://localhost:4000/api/v1";

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return HttpResponse.json({ error: { code, message, requestId } }, { status });
}

// Cross-tenant "Usuarios" directory: only a superadmin holds users:read (see
// ROLE_BASE_PERMISSIONS), so this is deliberately separate from GET /users (Equipo), which is
// org-scoped and gated by users:manage — connecting to this directory never touches that one.
function requireDirectoryReader(request: Request, requestId: string) {
  const userId = getSessionUserId(request);
  const actor = db.users.find((user) => user.id === userId);
  if (!actor) return { error: errorResponse("UNAUTHENTICATED", "Sesión no válida", requestId, 401) };
  const effective = resolveEffectivePermissions(actor.role, actor.permissionOverrides);
  if (!effective.has("users:read")) return { error: errorResponse("FORBIDDEN", "No tienes permiso para ver el directorio de usuarios", requestId, 403) };
  return { actor };
}

function organizationName(organizationId: string | null): string | null {
  if (!organizationId) return null;
  return db.organizations.find((organization) => organization.id === organizationId)?.name ?? null;
}

function toDirectoryUser(user: User): DirectoryUser {
  return { ...user, organizationName: organizationName(user.organizationId) };
}

export const directoryUsersHandlers = [
  http.get(`${BASE}/directory/users`, ({ request }) => {
    const result = requireDirectoryReader(request, "req_directory_users_list");
    if ("error" in result) return result.error;
    return HttpResponse.json({ data: db.users.map(toDirectoryUser), meta: { requestId: "req_directory_users_list" } });
  }),

  http.get(`${BASE}/directory/users/:id`, ({ request, params }) => {
    const result = requireDirectoryReader(request, "req_directory_users_detail");
    if ("error" in result) return result.error;
    const target = db.users.find((user) => user.id === params.id);
    if (!target) return errorResponse("NOT_FOUND", "Usuario no encontrado", "req_directory_users_detail", 404);
    const detail: DirectoryUserDetail = { ...toDirectoryUser(target), effectivePermissions: [...resolveEffectivePermissions(target.role, target.permissionOverrides)] };
    return HttpResponse.json({ data: detail, meta: { requestId: "req_directory_users_detail" } });
  }),

  // Same mechanism as POST /organizations/:id/connect (a fresh token pointing at the target,
  // exactly like a login), but targeting any eligible user directly instead of only an org's admin.
  http.post(`${BASE}/directory/users/:id/connect`, ({ request, params }) => {
    const result = requireDirectoryReader(request, "req_directory_users_connect");
    if ("error" in result) return result.error;
    const target = db.users.find((user) => user.id === params.id);
    if (!target) return errorResponse("NOT_FOUND", "Usuario no encontrado", "req_directory_users_connect", 404);
    if (target.role === "superadmin") return errorResponse("CONFLICT", "No puedes conectarte con una cuenta superadmin", "req_directory_users_connect", 409);
    if (target.status !== "active") return errorResponse("CONFLICT", "Solo puedes conectarte con cuentas activas", "req_directory_users_connect", 409);
    const token = `token_${target.id}_${sessions.size}`;
    sessions.set(token, target.id);
    return HttpResponse.json({ data: { accessToken: token, ...serializeSession(target.id) }, meta: { requestId: "req_directory_users_connect" } });
  })
];
