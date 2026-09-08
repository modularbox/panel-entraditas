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
   * Estado con el que queda en la web. Solo estos dos salen publicados:
   *   `published` esta anunciado pero sin venta abierta;
   *   `on_sale` ademas se puede comprar.
   * Antes iba fijo a "published" y un evento a la venta perdia ese estado al publicarse.
   */
  status: "published" | "on_sale";
  /** Nombre que la API valida para los tipos de entrada, con el precio en euros. */
  ticketTiers: { id: string; name: string; price: number; description: string; available: number }[];
  /** Fecha y hora separadas, obligatorias cuando `dateStatus` es "confirmed". */
  date: string | null;
  time: string | null;
}

/** La web no sabe representar cupo ilimitado; se usa un tope alto en vez de fingir agotado. */
const UNLIMITED_AVAILABILITY = 9999;

function centsToEuros(cents: number): number {
  return Math.round(cents) / 100;
}

/** Parte un ISO en fecha y hora locales, que es como las valida y guarda la API. */
export function splitStartsAt(startsAt: string | null): { date: string | null; time: string | null } {
  if (!startsAt) return { date: null, time: null };
  const parsed = new Date(startsAt);
  if (Number.isNaN(parsed.getTime())) return { date: null, time: null };
  const pad = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`
  };
}

export function toApiEventPayload(
  event: PublicEvent,
  status: ApiEventPayload["status"] = "published"
): ApiEventPayload {
  const { date, time } = splitStartsAt(event.startsAt);
  return {
    ...event,
    status,
    date,
    time,
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
  if (!payload.title) missing.push("titulo");
  if (!payload.category) missing.push("categoria");
  if (!payload.venue?.name) missing.push("nombre del recinto");
  if (!payload.venue?.city) missing.push("ciudad del recinto");
  if (payload.ticketTiers.length === 0) missing.push("al menos un tipo de entrada");
  if (payload.dateStatus === "confirmed" && (!payload.date || !payload.time)) missing.push("fecha y hora");
  return missing;
}
