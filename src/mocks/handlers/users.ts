import { http, HttpResponse } from "msw";
import type { PermissionOverride, RoleSlug, User } from "@entraditas/types";
import { canAssignEventScopes, canAssignRole, canGrantPermission, resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db, revokeAllSessionsForUser } from "../state";

const BASE = "http://localhost:4000/api/v1";
const PANEL_URL = "http://localhost:5174";

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return HttpResponse.json({ error: { code, message, requestId } }, { status });
}
function requireManager(request: Request, requestId: string) {
  const userId = getSessionUserId(request);
  const actor = db.users.find((user) => user.id === userId);
  if (!actor) return { error: errorResponse("UNAUTHENTICATED", "Sesión no válida", requestId, 401) };
  const effective = resolveEffectivePermissions(actor.role, actor.permissionOverrides);
  if (!effective.has("users:manage")) return { error: errorResponse("FORBIDDEN", "No tienes permiso para gestionar el equipo", requestId, 403) };
  return { actor, effective };
}
function validateAssignment(actor: User, effective: Set<string>, role: RoleSlug, overrides: PermissionOverride[], scopes: string[]) {
  if (!canAssignRole(actor.role, role)) return "No puedes asignar un rol superior al tuyo";
  if (overrides.some((override) => override.effect === "allow" && !canGrantPermission(effective, override.permission))) {
    return "No puedes otorgar un permiso que tú mismo no tienes";
  }
  if (!canAssignEventScopes(actor.eventScopes, scopes)) return "No puedes dar acceso a eventos fuera de tu propio alcance";
  return null;
}
function invitationUrl(actorId: string, target: User) {
  db.invitations = db.invitations.filter((invitation) => invitation.userId !== target.id);
  const token = `invite-token-${db.invitations.length + 1}-${target.id}`;
  db.invitations.push({ id: `inv-${db.invitations.length + 1}`, token, userId: target.id, email: target.email, organizationId: target.organizationId!, invitedByUserId: actorId, status: "pending", createdAt: new Date().toISOString() });
  return `${PANEL_URL}/invitacion/${token}`;
}

interface InviteBody { email: string; fullName: string; role: RoleSlug; permissionOverrides?: PermissionOverride[]; eventScopes?: string[] }
interface UpdateBody { role?: RoleSlug; permissionOverrides?: PermissionOverride[]; eventScopes?: string[] }

export const usersHandlers = [
  http.get(`${BASE}/users`, ({ request }) => {
    const result = requireManager(request, "req_users_list");
    if ("error" in result) return result.error;
    const members = db.users.filter((user) => user.organizationId === result.actor.organizationId);
    return HttpResponse.json({ data: members, meta: { page: 1, perPage: members.length, total: members.length, nextCursor: null } });
  }),
  http.post(`${BASE}/users/invite`, async ({ request }) => {
    const result = requireManager(request, "req_users_invite");
    if ("error" in result) return result.error;
    const body = (await request.json()) as InviteBody;
    if (db.users.some((user) => user.email === body.email)) return errorResponse("VALIDATION_ERROR", "Ya existe una persona con ese correo", "req_users_invite", 409);
    const overrides = body.permissionOverrides ?? [];
    const eventScopes = body.eventScopes ?? [];
    const validationError = validateAssignment(result.actor, result.effective, body.role, overrides, eventScopes);
    if (validationError) return errorResponse("PRIVILEGE_ESCALATION", validationError, "req_users_invite", 403);
    const user: User = { id: `user-invited-${db.users.length + 1}`, organizationId: result.actor.organizationId, parentUserId: result.actor.id, role: body.role, email: body.email, fullName: body.fullName, status: "invited", permissionOverrides: overrides, eventScopes };
    db.users.push(user);
    return HttpResponse.json({ data: { user, inviteUrl: invitationUrl(result.actor.id, user) }, meta: { requestId: "req_users_invite" } }, { status: 201 });
  }),
  http.patch(`${BASE}/users/:id`, async ({ request, params }) => {
    const result = requireManager(request, "req_users_patch");
    if ("error" in result) return result.error;
    const target = db.users.find((user) => user.id === params.id && user.organizationId === result.actor.organizationId);
    if (!target) return errorResponse("NOT_FOUND", "Persona no encontrada", "req_users_patch", 404);
    const body = (await request.json()) as UpdateBody;
    const role = body.role ?? target.role;
    const overrides = body.permissionOverrides ?? target.permissionOverrides;
    const eventScopes = body.eventScopes ?? target.eventScopes;
    const validationError = validateAssignment(result.actor, result.effective, role, overrides, eventScopes);
    if (validationError) return errorResponse("PRIVILEGE_ESCALATION", validationError, "req_users_patch", 403);
    if (body.role !== undefined) target.role = body.role;
    if (body.permissionOverrides !== undefined) target.permissionOverrides = body.permissionOverrides;
    if (body.eventScopes !== undefined) target.eventScopes = body.eventScopes;
    return HttpResponse.json({ data: target, meta: { requestId: "req_users_patch" } });
  }),
  http.post(`${BASE}/users/:id/disable`, ({ request, params }) => {
    const result = requireManager(request, "req_users_disable");
    if ("error" in result) return result.error;
    const target = db.users.find((user) => user.id === params.id && user.organizationId === result.actor.organizationId);
    if (!target) return errorResponse("NOT_FOUND", "Persona no encontrada", "req_users_disable", 404);
    target.status = "disabled";
    revokeAllSessionsForUser(target.id);
    return HttpResponse.json({ data: target, meta: { requestId: "req_users_disable" } });
  }),
  http.post(`${BASE}/users/:id/enable`, ({ request, params }) => {
    const result = requireManager(request, "req_users_enable");
    if ("error" in result) return result.error;
    const target = db.users.find((user) => user.id === params.id && user.organizationId === result.actor.organizationId);
    if (!target) return errorResponse("NOT_FOUND", "Persona no encontrada", "req_users_enable", 404);
    target.status = "active";
    return HttpResponse.json({ data: target, meta: { requestId: "req_users_enable" } });
  }),
  http.post(`${BASE}/users/:id/resend-invite`, ({ request, params }) => {
    const result = requireManager(request, "req_users_resend_invite");
    if ("error" in result) return result.error;
    const target = db.users.find((user) => user.id === params.id && user.organizationId === result.actor.organizationId);
    if (!target) return errorResponse("NOT_FOUND", "Persona no encontrada", "req_users_resend_invite", 404);
    if (target.status !== "invited") return errorResponse("VALIDATION_ERROR", "Esta persona ya activó su cuenta", "req_users_resend_invite", 409);
    return HttpResponse.json({ data: { inviteUrl: invitationUrl(result.actor.id, target) }, meta: { requestId: "req_users_resend_invite" } });
  })
];
