import { useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Refund } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useRefundsQuery } from "./useRefundsQuery";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const columnHelper = createColumnHelper<Refund>();
const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Nº pedido",
    cell: (info) => (
      <Link to={`/ventas/pedidos/${info.row.original.orderId}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("customerName", { header: "Comprador" }),
  columnHelper.accessor("amount", { header: "Importe", cell: (info) => euro.format(info.getValue() / 100) }),
  columnHelper.accessor("reason", { header: "Motivo" }),
  columnHelper.accessor("createdAt", { header: "Fecha", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") })
];

export function RefundsListPage() {
  const [eventId, setEventId] = useState("");
  const [q, setQ] = useState("");
  const { data: events = [] } = useEventsQuery();
  const { data: refunds = [], isLoading } = useRefundsQuery({ eventId: eventId || undefined, q: q || undefined });
  const table = useReactTable({ data: refunds, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Reembolsos</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="refund-event-filter" className="sr-only">Evento</label>
        <select id="refund-event-filter" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los eventos</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>

        <label htmlFor="refund-search-filter" className="sr-only">Buscar</label>
        <input id="refund-search-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº pedido o comprador" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : refunds.length === 0 ? (
        <p className="text-muted-foreground">No hay reembolsos que coincidan con los filtros.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium text-muted-foreground">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
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
