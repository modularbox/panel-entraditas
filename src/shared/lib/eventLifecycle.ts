import type { Event } from "@entraditas/types";

/**
 * El estado en que un evento se ve en entraditas.com: `published`.
 *
 * Publicado es un evento anunciado y con la venta abierta: es lo que el organizador decide al
 * aprobarse la revision, y no hay estados aparte para "anunciar sin vender". Cualquier otro
 * estado (borrador, en revision, rechazado) NO se publica: todavia no esta listo. Los que ya se
 * celebraron se filtran por fecha, no por un estado guardado.
 */
export const PUBLIC_STATUSES: readonly Event["status"][] = ["published"];

export function isPubliclyVisible(status: Event["status"]): boolean {
  return PUBLIC_STATUSES.includes(status);
}

/**
 * Si el evento ya ha pasado.
 *
 * Se DEDUCE de la fecha en vez de guardarse como un estado aparte. Un estado "terminado" habria
 * que ponerlo a mano en cada evento, y en cuanto a alguien se le olvidara uno, ese evento seguiria
 * anunciandose despues de haberse celebrado.
 *
 * Se compara por dias enteros, no por horas: un concierto que empieza hoy a las 21:00 sigue
 * siendo un evento de hoy a las 10:00 de la mañana, y tiene que aparecer.
 *
 * Un evento con la fecha por confirmar nunca esta terminado: todavia no tiene fecha que pasar.
 */
export function hasEventFinished(
  event: Pick<Event, "startsAt" | "endsAt" | "datePending">,
  now: Date = new Date()
): boolean {
  if (event.datePending) return false;
  const reference = event.endsAt ?? event.startsAt;
  if (!reference) return false;
  const end = new Date(reference);
  if (Number.isNaN(end.getTime())) return false;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return end.getTime() < startOfToday.getTime();
}

/** Lo que de verdad decide si el comprador lo ve: estado publicable y sin haber pasado. */
export function shouldAppearOnPublicSite(
  event: Pick<Event, "status" | "startsAt" | "endsAt" | "datePending">,
  now: Date = new Date()
): boolean {
  return isPubliclyVisible(event.status) && !hasEventFinished(event, now);
}
