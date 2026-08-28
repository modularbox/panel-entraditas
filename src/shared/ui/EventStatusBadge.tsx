import type { Event } from "@entraditas/types";

export const EVENT_STATUS_LABEL: Record<Event["status"], string> = {
  draft: "Borrador",
  published: "Publicado",
  on_sale: "A la venta",
  sold_out: "Agotado",
  paused: "Pausado",
  finished: "Finalizado",
  cancelled: "Cancelado"
};

const STATUS_STYLES: Record<Event["status"], string> = {
  draft: "border-status-draft bg-status-draft-bg text-status-draft",
  published: "border-status-published bg-status-published-bg text-status-published",
  on_sale: "border-status-on-sale bg-status-on-sale-bg text-status-on-sale",
  sold_out: "border-status-sold-out bg-status-sold-out-bg text-status-sold-out",
  paused: "border-status-paused bg-status-paused-bg text-status-paused",
  finished: "border-status-finished bg-status-finished-bg text-status-finished",
  cancelled: "border-status-cancelled bg-status-cancelled-bg text-status-cancelled"
};

export function EventStatusBadge({ status }: { status: Event["status"] }) {
  return (
    <span
      className={`inline-block rounded-pill border-2 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide ${STATUS_STYLES[status]}`}
    >
      {EVENT_STATUS_LABEL[status]}
    </span>
  );
}