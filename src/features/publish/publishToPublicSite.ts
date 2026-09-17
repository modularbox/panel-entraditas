import type { ApiEventPayload } from "./toApiEventPayload";
import type { CapacityPool, DiscountCode, Event, Organization, SubEvent, TicketType, Venue, Zone } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { canPublishToApi, isApiConfigured, publishEventToApi, removeEventFromApi } from "@/shared/lib/entraditasApi";
import { shouldAppearOnPublicSite } from "@/shared/lib/eventLifecycle";
import { toPublicEvent } from "./toPublicEvent";
import { missingForApi, toApiEventPayload } from "./toApiEventPayload";

export type PublishOutcome =
  | { status: "published" }
  | { status: "removed" }
  | { status: "skipped"; reason: string }
  | { status: "incomplete"; missing: string[] }
  | { status: "failed"; error: string };

/**
 * Firma de lo ultimo que se envio a la web por evento, guardada en el navegador.
 *
 * El auto-sincronizado necesita saber si un evento ya publicado tiene algo nuevo que mandar:
 * revisa la lista entera al entrar y despues de cada cambio, y sin esta firma volveria a hacer un
 * PUT de todo cada vez, aunque no hubiera movido nada. Se guarda por evento el cuerpo exacto del
 * ultimo envio que la API acepto; si el cuerpo de ahora es identico, no hay nada que hacer.
 */
const FIRMAS_KEY = "entraditas.panel.ultimasFirmas";

function leerFirmas(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FIRMAS_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

/** El cuerpo admite JSON.stringify como firma: se arma con claves en orden fijo desde los datos. */
function firmar(payload: ApiEventPayload): string {
  return JSON.stringify(payload);
}

function firmaRecordada(eventId: string): string | null {
  return leerFirmas()[eventId] ?? null;
}

function recordarFirma(eventId: string, firma: string): void {
  const firmas = leerFirmas();
  firmas[eventId] = firma;
  localStorage.setItem(FIRMAS_KEY, JSON.stringify(firmas));
}

function olvidarFirma(eventId: string): void {
  const firmas = leerFirmas();
  if (!(eventId in firmas)) return;
  delete firmas[eventId];
  localStorage.setItem(FIRMAS_KEY, JSON.stringify(firmas));
}

interface EventoReunido {
  event: Event;
  payload: ApiEventPayload;
}

/**
 * Junta todo lo que la web necesita del evento (datos, recinto, sesiones, tipos de entrada,
 * aforos, zonas y descuentos) y lo deja listo en el cuerpo de publicacion. Es el paso comun de
 * publicar a mano y de sincronizar cambios: se comparte para no mantener dos versiones de como se
 * arma el cuerpo, y para poder firmar el envio antes de mandarlo.
 *
 * No lanza: devuelve `null` si la lectura del panel falla a medias.
 */
async function reunirPayload(eventId: string, token: string): Promise<EventoReunido | null> {
  try {
    const event = await apiClient.get<Event>(`/events/${eventId}`, { token });
    const [subEvents, ticketTypes, discountCodes] = await Promise.all([
      apiClient.get<SubEvent[]>(`/events/${eventId}/sub-events`, { token }),
      apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token }),
      apiClient.get<DiscountCode[]>(`/events/${eventId}/discount-codes`, { token }).catch(() => [])
    ]);

    const venue = event.venueId
      ? await apiClient.get<Venue[]>("/venues", { token }).then((venues) => venues.find((v) => v.id === event.venueId) ?? null)
      : null;
    const zones = event.venueId ? await apiClient.get<Zone[]>(`/venues/${event.venueId}/zones`, { token }) : [];
    // Los aforos cuelgan de la sesion, asi que se piden por sesion y se juntan.
    const pools = (
      await Promise.all(
        subEvents.map((subEvent) =>
          apiClient.get<CapacityPool[]>(`/sub-events/${subEvent.id}/capacity`, { token }).catch(() => [])
        )
      )
    ).flat();
    const organization = await apiClient
      .get<Organization[]>("/organizations", { token })
      .then((orgs) => orgs.find((org) => org.id === event.organizationId) ?? null)
      .catch(() => null);

    // Solo llegan aqui eventos aprobados, que es lo unico que la web puede vender: "publicado".
    const payload = toApiEventPayload(
      toPublicEvent({ event, organization, venue, zones, subEvents, ticketTypes, pools, discountCodes })
    );
    return { event, payload };
  } catch {
    return null;
  }
}

/** Valida y manda el cuerpo a la API. Al aceptarlo, queda como la firma de lo enviado. */
async function enviarPayload(eventId: string, payload: ApiEventPayload): Promise<PublishOutcome> {
  // Se comprueba aqui lo mismo que valida la API, para poder decir que falta en vez de
  // devolver un 400 sin explicacion.
  const missing = missingForApi(payload);
  if (missing.length > 0) return { status: "incomplete", missing };

  try {
    await publishEventToApi(eventId, payload);
    recordarFirma(eventId, firmar(payload));
    return { status: "published" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "No se pudo publicar en la web." };
  }
}

/**
 * Manda un evento ya aprobado a la web publica.
 *
 * Reune todo lo que el evento necesita (recinto, sesiones, tipos de entrada, aforos, zonas y
 * descuentos), lo pasa por el contrato de publicacion y lo envia a la API. Es lo ultimo del
 * camino panel -> API -> web: hasta que esto no se ejecuta, el evento existe en el panel pero no
 * lo ve nadie fuera.
 *
 * No lanza: devuelve por que no se pudo, para que la pantalla lo cuente en vez de romperse. Un
 * fallo aqui no debe deshacer la aprobacion, que ya es valida dentro del panel.
 */
export async function publishToPublicSite(eventId: string, token: string): Promise<PublishOutcome> {
  if (!isApiConfigured()) {
    return { status: "skipped", reason: "La API publica no esta configurada en este entorno." };
  }
  if (!canPublishToApi()) {
    return {
      status: "skipped",
      reason: "No hay sesion abierta en la API publica. Vuelve a iniciar sesion para publicar hacia la web."
    };
  }

  const reunido = await reunirPayload(eventId, token);
  if (!reunido) {
    return { status: "failed", error: "No se pudo leer el evento para publicarlo en la web." };
  }
  return enviarPayload(eventId, reunido.payload);
}

/**
 * Retira un evento de la web publica: se ha despublicado o borrado en el panel.
 *
 * Es la otra mitad de `publishToPublicSite`. Sin ella, quitar un evento del panel lo dejaba
 * anunciandose en entraditas.com indefinidamente.
 */
export async function removeFromPublicSite(eventId: string): Promise<PublishOutcome> {
  if (!isApiConfigured()) {
    return { status: "skipped", reason: "La API publica no esta configurada en este entorno." };
  }
  if (!canPublishToApi()) {
    return {
      status: "skipped",
      reason: "No hay sesion abierta en la API publica. Vuelve a iniciar sesion para retirarlo de la web."
    };
  }
  try {
    await removeEventFromApi(eventId);
    olvidarFirma(eventId);
    return { status: "removed" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "No se pudo retirar de la web." };
  }
}

/**
 * Reenvia a la web un evento ya publicado despues de un cambio en el panel.
 *
 * La sincronizacion solo existia con el boton y al aprobar: a partir de ahi, editar el evento en
 * el asistente (anadir un tipo de entrada, cambiar una fecha, repartir asientos) no movia nada
 * fuera. Cuando cualquier pantalla guarda un cambio llama a esto, que vuelve a mandar el evento
 * si la web todavia deberia estar vendiendolo. Puede llamarse tranquila y seguido (al entrar en
 * la lista de eventos, tras cada guardado): si el cuerpo del evento es identico al del ultimo
 * envio aceptado, no se manda nada. Silencioso por diseno: si no debe aparecer (borrador, en
 * revision, caducado), no hay sesion con la API, o no hay cambios que mandar, no hace nada y no
 * lanza.
 */
export async function syncEventChangesToWeb(eventId: string, token: string): Promise<PublishOutcome | null> {
  if (!isApiConfigured() || !canPublishToApi()) return null;
  const reunido = await reunirPayload(eventId, token);
  if (!reunido) return null;
  if (!shouldAppearOnPublicSite(reunido.event)) return null;
  if (firmar(reunido.payload) === firmaRecordada(eventId)) return null;
  return enviarPayload(eventId, reunido.payload);
}

/** Mensaje para el organizador a partir del resultado, para no repetirlo en cada pantalla. */
export function describePublishOutcome(outcome: PublishOutcome): string {
  switch (outcome.status) {
    case "removed":
      return "Retirado: ya no aparece en entraditas.com.";
    case "published":
      return "Publicado: el evento ya aparece en entraditas.com.";
    case "skipped":
      return `Aprobado en el panel, pero no se envio a la web: ${outcome.reason}`;
    case "incomplete":
      return `Aprobado en el panel, pero le falta ${outcome.missing.join(", ")} para salir en la web.`;
    case "failed":
      return `Aprobado en el panel, pero fallo el envio a la web: ${outcome.error}`;
  }
}
