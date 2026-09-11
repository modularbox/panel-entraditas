import { EVENT_RULE_DEFAULTS, type Event, type EventRules } from "@entraditas/types";

/**
 * Las reglas de un evento con cada campo resuelto: lo que el organizador eligio, o el valor por
 * defecto si no toco la pregunta.
 *
 * Es UNA sola funcion para dos sitios que tienen que coincidir: lo que se le ensena al
 * organizador en el asistente y lo que se publica en entraditas.com. Antes eran dos caminos
 * distintos -- el cuestionario escribia en campos sueltos del evento y la publicacion leia
 * `rules` --, asi que la web vendia siempre con los limites por defecto mientras el panel
 * ensenaba los que el organizador habia puesto.
 *
 * Los campos sueltos (`maxTicketsPerOrder`, `maxTicketsPerCustomer`, `allowSingleSeatGaps`) se
 * siguen leyendo como respaldo: son donde guardaron sus respuestas los eventos creados con el
 * cuestionario antiguo, y sin esto al abrirlos se verian los valores por defecto.
 */
export function resolvedRules(event: Pick<Event, "rules" | "maxTicketsPerOrder" | "maxTicketsPerCustomer" | "allowSingleSeatGaps"> | undefined): Required<EventRules> {
  const rules: EventRules = event?.rules ?? {};

  // Solo los campos con valor: un `undefined` explicito no puede tapar el valor por defecto.
  const respondidas = Object.fromEntries(
    Object.entries(rules).filter(([, valor]) => valor !== undefined && valor !== null)
  ) as EventRules;

  return {
    ...EVENT_RULE_DEFAULTS,
    ...respondidas,
    maxPerOrder: rules.maxPerOrder ?? event?.maxTicketsPerOrder ?? EVENT_RULE_DEFAULTS.maxPerOrder,
    maxPerCustomer: rules.maxPerCustomer ?? event?.maxTicketsPerCustomer ?? EVENT_RULE_DEFAULTS.maxPerCustomer,
    allowIsolatedSeats: rules.allowIsolatedSeats ?? event?.allowSingleSeatGaps ?? EVENT_RULE_DEFAULTS.allowIsolatedSeats
  };
}
