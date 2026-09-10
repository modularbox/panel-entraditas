import { http, HttpResponse } from "msw";
import type { Organization, OrganizationDetail, OrganizationEvent, OrganizationListItem, OrganizationOrganizer, OrganizationSubOrganizer } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db, sessions } from "../state";
import { serializeSession } from "./auth";

const BASE = "http://localhost:4000/api/v1";

function errorResponse(code: string, message: string, requestId: string, status: number) {
  return HttpResponse.json({ error: { code, message, requestId } }, { status });
}

// Only the superadmin manages organizations (cross-tenant); org organizers never see this section.
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

// The organizer account "Conectar" switches the session to: the first active owner (top-level)
// organizer of the organization, falling back to any active organizer when none is owner.
function organizationOrganizer(organization: Organization): OrganizationOrganizer | null {
  const activeOrganizers = db.users.filter((user) => user.organizationId === organization.id && user.role === "organizador" && user.status === "active");
  if (activeOrganizers.length === 0) return null;
  const primary = activeOrganizers.find((user) => user.parentUserId === null) ?? activeOrganizers[0]!;
  return { id: primary.id, fullName: primary.fullName, email: primary.email, bankAccount: primary.bankAccount ?? null };
}

function toListItem(organization: Organization): OrganizationListItem {
  return { id: organization.id, name: organization.name, slug: organization.slug, organizer: organizationOrganizer(organization) };
}

// Users of the organization with access to an event: every organizador (unscoped) plus the
// suborganizadores whose eventScopes include it.
function usersWithEventAccess(organizationId: string, eventId: string): OrganizationEvent["accessUsers"] {
  return db.users
    .filter(
      (user) =>
        user.organizationId === organizationId &&
        user.status === "active" &&
        (user.eventScopes.length === 0 || user.eventScopes.includes(eventId))
    )
    .sort((a, b) => (a.role === "organizador" ? -1 : 1))
    .map((user) => ({ id: user.id, fullName: user.fullName, email: user.email, role: user.role }));
}

function eventsFor(organization: Organization): OrganizationEvent[] {
  return db.events
    .filter((event) => event.organizationId === organization.id)
    .map((event) => ({ ...event, accessUsers: usersWithEventAccess(organization.id, event.id) }));
}

function toDetail(organization: Organization): OrganizationDetail {
  const organizer = organizationOrganizer(organization);
  const subOrganizers: OrganizationSubOrganizer[] = db.users
    .filter((user) => user.organizationId === organization.id && user.role === "suborganizador" && user.status === "active")
    .map((sub) => ({
      id: sub.id,
      fullName: sub.fullName,
      email: sub.email,
      bankAccount: sub.bankAccount ?? null,
      accessibleEvents: sub.eventScopes.map((eventId) => ({ id: eventId, title: db.events.find((event) => event.id === eventId)?.title ?? eventId }))
    }));
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    organizer,
    subOrganizers,
    events: eventsFor(organization)
  };
}

export const organizationsHandlers = [
  http.get(`${BASE}/organizations`, ({ request }) => {
    const result = requireOrganizationManager(request, "req_orgs_list");
    if ("error" in result) return result.error;
    const data = db.organizations.map(toListItem);
    return HttpResponse.json({ data, meta: { requestId: "req_orgs_list" } });
  }),

  http.get(`${BASE}/organizations/:id`, ({ request, params }) => {
    const result = requireOrganizationManager(request, "req_orgs_detail");
    if ("error" in result) return result.error;
    const organization = db.organizations.find((org) => org.id === params.id);
    if (!organization) return errorResponse("NOT_FOUND", "Organización no encontrada", "req_orgs_detail", 404);
    return HttpResponse.json({ data: toDetail(organization), meta: { requestId: "req_orgs_detail" } });
  }),

  http.post(`${BASE}/organizations/:id/connect`, ({ request, params }) => {
    const result = requireOrganizationManager(request, "req_orgs_connect");
    if ("error" in result) return result.error;
    const organization = db.organizations.find((org) => org.id === params.id);
    if (!organization) return errorResponse("NOT_FOUND", "Organización no encontrada", "req_orgs_connect", 404);
    const organizer = organizationOrganizer(organization);
    if (!organizer) return errorResponse("CONFLICT", "Esta organización no tiene organizador", "req_orgs_connect", 409);
    const token = `token_${organizer.id}_${sessions.size}`;
    sessions.set(token, organizer.id);
    return HttpResponse.json({ data: { accessToken: token, ...serializeSession(organizer.id) }, meta: { requestId: "req_orgs_connect" } });
  }),

  // "Conectar" como un miembro concreto de la organización (organizador o suborganizador): crea una
  // sesión para ese usuario. El superadmin puede volver con "Volver a superadmin" en el menú.
  http.post(`${BASE}/organizations/:id/users/:userId/connect`, ({ request, params }) => {
    const result = requireOrganizationManager(request, "req_orgs_connect_user");
    if ("error" in result) return result.error;
    const organization = db.organizations.find((org) => org.id === params.id);
    if (!organization) return errorResponse("NOT_FOUND", "Organización no encontrada", "req_orgs_connect_user", 404);
    const target = db.users.find(
      (user) => user.id === params.userId && user.organizationId === organization.id && user.status === "active"
    );
    if (!target) return errorResponse("NOT_FOUND", "Usuario de la organización no encontrado", "req_orgs_connect_user", 404);
    const token = `token_${target.id}_${sessions.size}`;
    sessions.set(token, target.id);
    return HttpResponse.json({ data: { accessToken: token, ...serializeSession(target.id) }, meta: { requestId: "req_orgs_connect_user" } });
  })
];