import { useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { Customer } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useCustomersQuery } from "./useCustomersQuery";
import { SortableHeader } from "@/shared/ui/SortableHeader";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const columnHelper = createColumnHelper<Customer>();
const columns = [
  columnHelper.accessor("name", {
    header: "Nombre",
    cell: (info) => (
      <Link to={`/ventas/asistentes/${encodeURIComponent(info.row.original.email)}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("email", { header: "Email" }),
  columnHelper.accessor("ordersCount", { header: "Pedidos" }),
  columnHelper.accessor("ticketsCount", { header: "Entradas" }),
  columnHelper.accessor("totalSpent", { header: "Gastado", cell: (info) => euro.format(info.getValue() / 100) }),
  columnHelper.accessor("lastPurchaseAt", { header: "Última compra", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") })
];

export function AttendeesListPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [eventId, setEventId] = useState("");
  const [q, setQ] = useState("");
  const { data: events = [] } = useEventsQuery();
  const { data: customers = [], isLoading } = useCustomersQuery({ eventId: eventId || undefined, q: q || undefined });
  const table = useReactTable({
    data: customers,
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
        <h1 className="font-display text-2xl font-semibold">Asistentes</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="attendee-event-filter" className="sr-only">Evento</label>
        <select id="attendee-event-filter" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los eventos</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>

        <label htmlFor="attendee-search-filter" className="sr-only">Buscar</label>
        <input id="attendee-search-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o email" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : customers.length === 0 ? (
        <p className="text-muted-foreground">No hay asistentes que coincidan con los filtros.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      aria-sort={header.column.getIsSorted() !== false ? (header.column.getIsSorted() === "asc" ? "ascending" : "descending") : undefined}
                      className="px-4 py-3 font-medium text-muted-foreground"
                    >
                      <SortableHeader header={header} />
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
