import { useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import type { Event } from "@entraditas/types";
import { Can } from "@/shared/auth/Can";
import { Button } from "@/shared/ui/button";
import { useEventsQuery } from "./useEventsQuery";

const STATUS_LABEL: Record<Event["status"], string> = {
  draft: "Borrador",
  published: "Publicado",
  on_sale: "A la venta",
  sold_out: "Agotado",
  paused: "Pausado",
  finished: "Finalizado",
  cancelled: "Cancelado"
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

const columnHelper = createColumnHelper<Event>();
const columns = [
  columnHelper.accessor("title", {
    header: "Título",
    cell: (info) => (
      <Link to={`/eventos/${info.row.original.id}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("status", {
    header: "Estado",
    cell: (info) => {
      const status = info.getValue();
      return (
        <span className="inline-block rounded-pill border-2 border-foreground bg-surface-alt px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
          {STATUS_LABEL[status]}
        </span>
      );
    }
  }),
  columnHelper.accessor("startsAt", {
    header: "Fecha",
    cell: (info) => dateFormatter.format(new Date(info.getValue()))
  })
];

export function EventsListPage() {
  const [status, setStatus] = useState("");
  // "" means "Todos" — coerce to undefined so the query hook omits the status filter entirely.
  const { data: events = [], isLoading } = useEventsQuery(status || undefined);
  const table = useReactTable({ data: events, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Eventos</h1>
        <Can do="events:create">
          <Link to="/eventos/nuevo/editar">
            <Button>Crear evento</Button>
          </Link>
        </Can>
      </header>

      <div className="flex items-center gap-2">
        <label htmlFor="status-filter" className="text-sm font-medium">
          Estado
        </label>
        <select
          id="status-filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
        >
          {/* Only the most common statuses are filterable here; sold_out/paused/finished/cancelled
              events still show up under "Todos". */}
          <option value="">Todos</option>
          <option value="draft">Borrador</option>
          <option value="published">Publicado</option>
          <option value="on_sale">A la venta</option>
        </select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
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
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
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
