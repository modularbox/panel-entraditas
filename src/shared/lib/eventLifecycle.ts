import type { Event } from "@entraditas/types";

/**
 * Los dos estados en los que un evento se ve en entraditas.com.
 *
 * La diferencia entre ellos:
 *   - `published`: el evento esta anunciado y se puede consultar, pero la venta no esta abierta.
 *     Sirve para anunciar antes de poner entradas a la venta.
 *   - `on_sale`: ademas de verse, se pueden comprar entradas.
 *
 * Cualquier otro estado (borrador, en revision, pausado, agotado, cancelado, terminado) NO se
 * publica: o todavia no esta listo, o ya no debe ofrecerse.
 */
export const PUBLIC_STATUSES: readonly Event["status"][] = ["published", "on_sale"];

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
