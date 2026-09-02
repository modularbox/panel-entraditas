import { http, HttpResponse } from "msw";
import type { TemplateZone, User, VenuePlanTemplate } from "@entraditas/types";
import { db } from "../state";
import { getSessionUserId } from "../authContext";

const BASE = "http://localhost:4000/api/v1";

/**
 * Reusable room layouts. An organiser draws a plan once ("Teatro Circo - patio y anfiteatro")
 * and applies it to any later event held in the same room, instead of redrawing it every time.
 *
 * A template stores zones without their venue or their ids: it is the *shape* of a room, not a
 * particular venue's zones, so the same template can be applied to several venues.
 */

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesion no valida", requestId } }, { status: 401 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

function validation(message: string, requestId: string) {
  return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message, requestId } }, { status: 422 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  return userId ? db.users.find((u) => u.id === userId) ?? null : null;
}

function canAccess(template: VenuePlanTemplate, user: User): boolean {
  return user.role === "superadmin" || template.organizationId === user.organizationId;
}

export const venuePlanTemplatesHandlers = [
  http.get(`${BASE}/venue-plan-templates`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_plan_templates");
    const templates = db.venuePlanTemplates.filter((template) => canAccess(template, user));
    return HttpResponse.json({
      data: templates,
      meta: { page: 1, perPage: templates.length, total: templates.length, nextCursor: null }
    });
  }),

  http.post(`${BASE}/venue-plan-templates`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_plan_templates_create");
    const body = (await request.json()) as { name?: string; zones?: TemplateZone[] };
    const name = body.name?.trim();
    if (!name) return validation("Ponle un nombre a la plantilla", "req_plan_templates_create");
    if (!body.zones || body.zones.length === 0) {
      return validation("No hay zonas que guardar en la plantilla", "req_plan_templates_create");
    }
    const template: VenuePlanTemplate = {
      id: `plan-template-${db.venuePlanTemplates.length + 1}`,
      // A superadmin acts on behalf of the organisation it is editing, so fall back to the
      // first one rather than storing a template nobody can see.
      organizationId: user.organizationId ?? db.organizations[0]!.id,
      name,
      zones: body.zones,
      updatedAt: new Date().toISOString()
    };
    db.venuePlanTemplates.push(template);
    return HttpResponse.json({ data: template, meta: { requestId: "req_plan_templates_create" } }, { status: 201 });
  }),

  http.delete(`${BASE}/venue-plan-templates/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_plan_templates_delete");
    const template = db.venuePlanTemplates.find((candidate) => candidate.id === params.id);
    if (!template || !canAccess(template, user)) return notFound("req_plan_templates_delete");
    db.venuePlanTemplates = db.venuePlanTemplates.filter((candidate) => candidate.id !== template.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_plan_templates_delete" } });
  })
];
