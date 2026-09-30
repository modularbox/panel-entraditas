import type { PublicEvent } from "@entraditas/types";

/**
 * Adapta el evento publicado al cuerpo que valida `PUT /v1/events/:id` de api.entraditas.com.
 *
 * La API guarda el cuerpo entero tal cual (`payload_json`) pero exige unos campos concretos con
 * SUS nombres, que no son los del contrato: `ticketTiers` en vez de `tiers`, y `date` + `time`
 * por separado en vez de un `startsAt` ISO. En vez de renombrar el contrato (y perder centimos,
 * sesiones, plano y reglas por el camino), se manda el contrato COMPLETO mas esos campos
 * derivados encima: la API valida lo que espera y la web recibe todo lo demas intacto.
 */
export interface ApiEventPayload extends PublicEvent {
  /**
   * Estado con el que queda en la web. El panel solo publica eventos ya aprobados, que es el
   * unico estado con venta abierta: siempre llegan como `published`.
   */
  status: "published";
  /** Nombre que la API valida para los tipos de entrada, con el precio en euros. */
  ticketTiers: { id: string; name: string; price: number; description: string; available: number }[];
  /** Fecha y hora separadas, obligatorias cuando `dateStatus` es "confirmed". */
  date: string | null;
  time: string | null;
  /**
   * De quién es el evento.
   *
   * Normalmente la API lo saca de la sesión que publica y esto le sobra. Hace falta cuando
   * publica un superadmin, que no tiene organización propia: sin esto el evento quedaría sin
   * dueño, y entonces su organizador no vería ni sus ventas ni sus clientes.
   */
  organizationId: string | null;
}

/** La web no sabe representar cupo ilimitado; se usa un tope alto en vez de fingir agotado. */
const UNLIMITED_AVAILABILITY = 9999;

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

/**
 * Parte un ISO en la fecha y la hora que tecleo el organizador.
 *
 * El asistente guarda lo tecleado tal cual con una "Z" detras ("21:00" -> "...T21:00:00.000Z",
 * ver Step1BasicInfo y Step2Schedule), asi que la hora del evento son las cifras UTC del ISO. Antes
 * se leia en la hora del navegador y un concierto de las 21:00 se publicaba a las 23:00 en verano
 * (tanda 19).
 */
export function splitStartsAt(startsAt: string | null): { date: string | null; time: string | null } {
  if (!startsAt) return { date: null, time: null };
  const parsed = new Date(startsAt);
  if (Number.isNaN(parsed.getTime())) return { date: null, time: null };
  const iso = parsed.toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

export function toApiEventPayload(
  event: PublicEvent,
  status: ApiEventPayload["status"] = "published",
  organizationId: string | null = null
): ApiEventPayload {
  const { date, time } = splitStartsAt(event.startsAt);
  return {
    ...event,
    status,
    date,
    time,
    organizationId,
    ticketTiers: event.tiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      price: centsToEuros(tier.price),
      description: tier.description ?? "",
      available: tier.available ?? UNLIMITED_AVAILABILITY
    }))
  };
}

/**
 * Comprueba, antes de mandar nada, lo mismo que valida la API. Devuelve la lista de lo que falta
 * para poder decirselo al organizador en el panel en vez de recibir un 400 opaco.
 */
export function missingForApi(payload: ApiEventPayload): string[] {
  const missing: string[] = [];
  if (!payload.slug) missing.push("identificador (slug)");
  if (!payload.title) missing.push("título");
  if (!payload.category) missing.push("categoría");
  if (!payload.venue?.name) missing.push("nombre del recinto");
  if (!payload.venue?.city) missing.push("ciudad del recinto");
  if (payload.ticketTiers.length === 0) missing.push("al menos un tipo de entrada");
  if (payload.dateStatus === "confirmed" && (!payload.date || !payload.time)) missing.push("fecha y hora");
  return missing;
}
