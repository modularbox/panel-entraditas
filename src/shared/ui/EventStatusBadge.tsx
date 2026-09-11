import type { Event } from "@entraditas/types";
import { hasEventFinished } from "@/shared/lib/eventLifecycle";

export const EVENT_STATUS_LABEL: Record<Event["status"], string> = {
  draft: "Borrador",
  pending_review: "En revisión",
  published: "Publicado",
  rejected: "Rechazado",
  finished: "Finalizado"
};

const STATUS_STYLES: Record<Event["status"], string> = {
  draft: "border-status-draft bg-status-draft-bg text-status-draft",
  pending_review: "border-status-published bg-status-published-bg text-status-published",
  published: "border-status-published bg-status-published-bg text-status-published",
  rejected: "border-status-cancelled bg-status-cancelled-bg text-status-cancelled",
  finished: "border-status-finished bg-status-finished-bg text-status-finished"
};

interface EventStatusBadgeProps {
  status: Event["status"];
  /**
   * El evento, para poder avisar de que ya se ha celebrado. Opcional: sin el, la etiqueta se
   * comporta como siempre y solo muestra el estado.
   */
  event?: Pick<Event, "startsAt" | "endsAt" | "datePending">;
}

/**
 * Un evento que ya paso se marca como TERMINADO aunque su estado siga diciendo "publicado".
 *
 * "Terminado" no es un estado que nadie vaya a mantener a mano: se deduce de la fecha. Sin esto,
 * la lista mostraba como "A LA VENTA" un festival celebrado hace dos meses.
 */
export function EventStatusBadge({ status, event }: EventStatusBadgeProps) {
  const finished = event ? hasEventFinished(event) : false;
  const shown = finished ? "finished" : status;
  return (
    <span
      className={`inline-block rounded-pill border-2 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${STATUS_STYLES[shown]}`}
      title={finished && shown !== status ? `Estado en el panel: ${EVENT_STATUS_LABEL[status]}` : undefined}
    >
      {EVENT_STATUS_LABEL[shown]}
    </span>
  );
}
