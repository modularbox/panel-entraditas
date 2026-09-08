import type { CapacityPool, DiscountCode, Event, Organization, SubEvent, TicketType, Venue, Zone } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { canPublishToApi, isApiConfigured, publishEventToApi, removeEventFromApi } from "@/shared/lib/entraditasApi";
import { toPublicEvent } from "./toPublicEvent";
import { missingForApi, toApiEventPayload } from "./toApiEventPayload";

export type PublishOutcome =
  | { status: "published" }
  | { status: "removed" }
  | { status: "skipped"; reason: string }
  | { status: "incomplete"; missing: string[] }
  | { status: "failed"; error: string };

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

    const payload = toApiEventPayload(
      toPublicEvent({ event, organization, venue, zones, subEvents, ticketTypes, pools, discountCodes })
    );

    // Se comprueba aqui lo mismo que valida la API, para poder decir que falta en vez de
    // devolver un 400 sin explicacion.
    const missing = missingForApi(payload);
    if (missing.length > 0) return { status: "incomplete", missing };

    await publishEventToApi(eventId, payload);
    return { status: "published" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "No se pudo publicar en la web." };
  }
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
    return { status: "removed" };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : "No se pudo retirar de la web." };
  }
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
