import type { CapacityPool, TicketType } from "@entraditas/types";

/**
 * El tipo de entrada que vende una zona entera (su grupo), o null si no tiene.
 *
 * Esa relacion se ha guardado de dos maneras: los eventos nuevos la llevan en el aforo
 * (`pool.ticketTypeGroupId`), y los anteriores en el sentido contrario, en el propio tipo de
 * entrada (`ticketType.capacityPoolId`). El editor de asientos resolvia las dos, pero la
 * publicacion solo miraba la primera: todas las zonas asignadas a la antigua salian hacia
 * entraditas.com sin tipo de entrada, y la web no podia venderlas desde el plano aunque en el
 * panel se vieran perfectamente asignadas.
 *
 * Una sola funcion para los dos sitios, para que lo que se ve en el panel y lo que se publica no
 * puedan volver a separarse.
 */
export function zoneTicketTypeGroupId(pool: CapacityPool | undefined, ticketTypes: TicketType[]): string | null {
  if (!pool) return null;
  if (pool.ticketTypeGroupId) return pool.ticketTypeGroupId;
  return ticketTypes.find((ticketType) => ticketType.capacityPoolId === pool.id)?.groupId ?? null;
}
