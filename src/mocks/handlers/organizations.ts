import { http, HttpResponse } from "msw";
import type { Organization, OrganizationAdmin, OrganizationListItem } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db, sessions } from "../state";
import { serializeSession } from "./auth";

const BASE = "http://localhost:4000/api/v1";

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return HttpResponse.json({ error: { code, message, requestId } }, { status });
}

// Only the superadmin manages organizations (cross-tenant); org admins never see this section.
function requireOrganizationManager(request: Request, requestId: string) {
  const userId = getSessionUserId(request);
  const actor = db.users.find((user) => user.id === userId);
  if (!actor) {
    return { error: errorResponse("UNAUTHENTICATED", "Sesión no válida", requestId, 401) };
  }
  const effective = resolveEffectivePermissions(actor.role, actor.permissionOverrides);
  if (!effective.has("organizations:manage")) {
    return { error: errorResponse("FORBIDDEN", "No tienes permiso para gestionar organizaciones", requestId, 403) };
  }
  return { actor, effective };
}

// The admin account "Conectar" switches the session to: the first active owner (top-level) admin
// of the organization, falling back to any active admin when none is owner.
function organizationAdmin(organization: Organization): OrganizationAdmin | null {
  const activeAdmins = db.users.filter((user) => user.organizationId === organization.id && user.role === "admin" && user.status === "active");
  if (activeAdmins.length === 0) return null;
  const primary = activeAdmins.find((user) => user.parentUserId === null) ?? activeAdmins[0]!;
  return { id: primary.id, fullName: primary.fullName, email: primary.email };
}

function toListItem(organization: Organization): OrganizationListItem {
  return { id: organization.id, name: organization.name, slug: organization.slug, commissionRate: organization.commissionRate, admin: organizationAdmin(organization) };
}

export const organizationsHandlers = [
  http.get(`${BASE}/organizations`, ({ request }) => {
    const result = requireOrganizationManager(request, "req_orgs_list");
    if ("error" in result) return result.error;
    const data = db.organizations.map(toListItem);
    return HttpResponse.json({ data, meta: { requestId: "req_orgs_list" } });
  }),

  http.post(`${BASE}/organizations/:id/connect`, ({ request, params }) => {
    const result = requireOrganizationManager(request, "req_orgs_connect");
    if ("error" in result) return result.error;
    const organization = db.organizations.find((org) => org.id === params.id);
    if (!organization) return errorResponse("NOT_FOUND", "Organización no encontrada", "req_orgs_connect", 404);
    const admin = organizationAdmin(organization);
    if (!admin) return errorResponse("CONFLICT", "Esta organización no tiene administrador", "req_orgs_connect", 409);
    // Switches the current client to the admin's account: a fresh token pointing at the admin id,
    // exactly like a login. The actor's previous tokens stay in the sessions map but are inert.
    const token = `token_${admin.id}_${sessions.size}`;
    sessions.set(token, admin.id);
    return HttpResponse.json({ data: { accessToken: token, ...serializeSession(admin.id) }, meta: { requestId: "req_orgs_connect" } });
  })
];