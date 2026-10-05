import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { TicketTransfer } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useTransfersQuery } from "./useTransfersQuery";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { LIMITES } from "@/shared/lib/formLimits";
import { Cargando } from "@/shared/ui/Cargando";

/** Los mismos cinco estados que la oferta de cesión tiene en entraditas.com, en castellano. */
const STATUS_LABELS: Record<TicketTransfer["status"], string> = {
  pending: "Pendiente",
  accepted: "Aceptada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  expired: "Caducada"
};

const SIN_NOMBRE = "Sin nombre";
const columnHelper = createColumnHelper<TicketTransfer>();

/**
 * Las columnas de la cesión, con la organización solo si se le pasa quien la resuelve.
 *
 * La organización va entre el nº de pedido y el evento, y solo para el superadmin, que es el único
 * que ve cesiones de más de una organización. Para un organizador la columna repetiría el nombre de
 * su propia empresa en cada fila: el mismo criterio que la lista de pedidos.
 */
function columnasDeTransferencias(organizacionDe: ((fila: TicketTransfer) => string) | null) {
  return [
    columnHelper.accessor("orderNumber", {
      header: "Nº pedido",
      cell: (info) => (
        <Link to={`/ventas/pedidos/${info.row.original.orderId}`} className="font-semibold text-primary hover:underline">
          {info.getValue()}
        </Link>
      )
    }),
    ...(organizacionDe
      ? [columnHelper.accessor((fila) => organizacionDe(fila), { id: "organizacion", header: "Organización" })]
      : []),
    columnHelper.accessor((fila) => fila.eventTitle || "—", { id: "evento", header: "Evento" }),
    // El lado que se va. La cesión la ofrece quien tenía la entrada, que no siempre es quien
    // compró el pedido: por eso el nombre sale de la cuenta, no del pedido.
    columnHelper.accessor("fromName", {
      header: "Comprador original",
      cell: (info) => info.getValue() || SIN_NOMBRE
    }),
    columnHelper.accessor("fromEmail", { header: "Correo" }),
    // Y el lado que se queda. El nombre sale de la cuenta del receptor y puede venir vacío si la
    // oferta se hizo a alguien que aún no se había registrado: se dice, en vez de dejar la celda en
    // blanco y que parezca que no hay nadie.
    columnHelper.accessor("toName", {
      header: "Nuevo comprador",
      cell: (info) => info.getValue() || SIN_NOMBRE
    }),
    columnHelper.accessor("toEmail", { header: "Correo nuevo" }),
    columnHelper.accessor("status", { header: "Estado", cell: (info) => STATUS_LABELS[info.getValue()] }),
    columnHelper.accessor("createdAt", { header: "Fecha", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") })
  ];
}

export function TransfersListPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data: eventsData } = useEventsQuery();
  // Memorizado por lo mismo que `transfers`: de él salen las columnas de la tabla.
  const events = useMemo(() => eventsData ?? [], [eventsData]);
  // El nombre de la organización lo resuelve la propia API (no hay que pedir el listado de
  // organizaciones), pero la columna se esconde igual para quien solo ve la suya.
  const esSuperadmin = useSessionStore((s) => s.user?.role === "superadmin");
  const { data, isLoading } = useTransfersQuery({
    eventId: eventId || undefined,
    status: status || undefined,
    q: q || undefined
  });
  // useMemo, y no `data ?? []`: una lista nueva en cada render cambia la identidad de `data` para
  // la tabla y la deja redibujandose sin parar.
  const transfers = useMemo(() => data ?? [], [data]);
  const columns = useMemo(
    () => columnasDeTransferencias(esSuperadmin ? (fila) => fila.organizationName || "—" : null),
    [esSuperadmin]
  );
  const table = useReactTable({
    data: transfers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: false
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Transferencias</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cesiones de entradas: a quién se ofrecieron y a quién acabó yendo cada una.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="transfer-event-filter" className="sr-only">Evento</label>
        <select id="transfer-event-filter" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los eventos</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>

        <label htmlFor="transfer-status-filter" className="sr-only">Estado</label>
        <select id="transfer-status-filter" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <label htmlFor="transfer-search-filter" className="sr-only">Buscar</label>
        <input id="transfer-search-filter" type="search" maxLength={LIMITES.busqueda} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº pedido, origen o destinatario" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <Cargando />
      ) : transfers.length === 0 ? (
        <p className="text-muted-foreground">No hay transferencias que coincidan con los filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      aria-sort={header.column.getIsSorted() !== false ? (header.column.getIsSorted() === "asc" ? "ascending" : "descending") : undefined}
                      className="whitespace-nowrap px-4 py-3 font-medium text-muted-foreground"
                    >
                      <SortableHeader header={header} />
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} aria-label="Transferencia" className="border-t border-border">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="whitespace-nowrap px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}