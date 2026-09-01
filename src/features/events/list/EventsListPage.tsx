import { useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import type { Event } from "@entraditas/types";
import { Can } from "@/shared/auth/Can";
import { Button } from "@/shared/ui/button";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { EventStatusBadge, EVENT_STATUS_LABEL } from "@/shared/ui/EventStatusBadge";
import { useEventsQuery } from "./useEventsQuery";

const STATUS_FILTERS: Array<{ value: "" | Event["status"]; label: string }> = [
  { value: "", label: "Todos" },
  { value: "draft", label: "Borrador" },
  { value: "pending_review", label: "Pendiente" },
  { value: "in_review", label: "En revisión" },
  { value: "published", label: "Publicado" },
  { value: "rejected", label: "Rechazado" },
  { value: "on_sale", label: "A la venta" }
];
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
    cell: (info) => <EventStatusBadge status={info.getValue()} />
  }),
  columnHelper.accessor("startsAt", {
    header: "Fecha",
    cell: (info) => (info.getValue() ? dateFormatter.format(new Date(info.getValue()!)) : "Fecha por confirmar")
  })
];

export function EventsListPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [status, setStatus] = useState("");
  // "" means "Todos" - coerce to undefined so the query hook omits the status filter entirely.
  const { data: events = [], isLoading } = useEventsQuery(status || undefined);
  const table = useReactTable({
    data: events,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: false
  });

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

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-sm font-bold">Estado</span>
        {STATUS_FILTERS.map((filter) => {
          const active = status === filter.value;
          return (
            <button
              key={filter.value || "all"}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(filter.value)}
              className={`rounded-md border-2 px-3 py-2 text-xs font-extrabold uppercase ${
                active ? "border-foreground bg-primary text-primary-foreground shadow-flat" : "border-border bg-surface text-foreground"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando...</p>
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

