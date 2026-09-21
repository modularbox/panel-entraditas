import { http, HttpResponse } from "msw";
import type { TicketDesign } from "@entraditas/types";
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

function validation(message: string, requestId: string) {
  return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message, requestId } }, { status: 422 });
}

function requireEvent(request: Request, eventId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_td") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_td") };
  return { event };
}

export const TICKET_DESIGN_COLOR_PRIMARIO = "#243B8F";

export const TICKET_DESIGN_TERMINOS_POR_DEFECTO = [
  "Esta entrada es válida únicamente para el evento y la sesión indicados en el documento.",
  "El titular deberá presentar este documento junto con el QR o PIN solicitado en el control de acceso.",
  "No se admiten cambios de fecha, devoluciones ni cesiones sin autorización, salvo suspensión o cancelación del evento.",
  "La organización se reserva el derecho de admisión y de modificar horarios, programas o espacios por causas justificadas.",
  "La reventa por cauces no autorizados puede suponer la anulación de las entradas sin derecho a reembolso."
];

export const TICKET_DESIGN_PIE_POR_DEFECTO = "Módulo de Gestión de Eventos · Verificación segura";

/**
 * Plantilla por defecto. Aqui solo vive la configuracion visual y los textos del disyador:
 * los datos de la entrada (titular, QR, PIN...) los genera el emisor al comprar y la
 * informacion del evento/sesion sale del propio evento, asi que no se guardan aqui.
 */
export function defaultTicketDesign(): TicketDesign {
  return {
    colorPrimario: TICKET_DESIGN_COLOR_PRIMARIO,
    fuente: "Inter",
    logo: null,
    marcaAgua: null,
    opacidadMarcaAgua: 0.06,
    mostrarInformacion: true,
    mostrarQR: true,
    mostrarPIN: true,
    mostrarSesion: true,
    mostrarTerminos: true,
    terminos: [...TICKET_DESIGN_TERMINOS_POR_DEFECTO],
    pie: TICKET_DESIGN_PIE_POR_DEFECTO
  };
}

export const ticketDesignHandlers = [
  http.get(`${BASE}/events/:eventId/ticket-design`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    if (result.event.ticketDesign) {
      return HttpResponse.json({ data: result.event.ticketDesign, meta: { requestId: "req_td_get" } });
    }
    return HttpResponse.json({ data: defaultTicketDesign(), meta: { requestId: "req_td_get" } });
  }),

  http.put(`${BASE}/events/:eventId/ticket-design`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as TicketDesign;
    if (typeof body.colorPrimario !== "string" || !/^#[0-9a-fA-F]{6}$/.test(body.colorPrimario)) {
      return validation("Indica un color primario con formato hexadecimal, p. ej. #243B8F", "req_td_put");
    }
    if (!Array.isArray(body.terminos) || body.terminos.every((line) => !line.trim())) {
      return validation("Los términos y condiciones no pueden quedar vacíos", "req_td_put");
    }
    result.event.ticketDesign = body;
    return HttpResponse.json({ data: body, meta: { requestId: "req_td_put" } });
  })
];