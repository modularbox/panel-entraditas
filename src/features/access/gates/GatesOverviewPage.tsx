import { useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import type { Gate } from "@entraditas/types";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { useGatesOverviewQuery, type GateOverviewItem } from "./useGatesOverviewQuery";

const DIRECTION_LABEL: Record<Gate["direction"], string> = { in: "Entrada", out: "Salida", both: "Ambas" };

const columnHelper = createColumnHelper<GateOverviewItem>();
const columns = [
  columnHelper.display({
    id: "gate",
    header: "Puerta",
    cell: (info) => <span className="font-semibold">{info.row.original.name} — {info.row.original.code}</span>
  }),
  columnHelper.accessor("eventTitle", {
    header: "Evento",
    cell: (info) => (
      <Link to={`/eventos/${info.row.original.eventId}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("zoneName", {
    header: "Zona",
    cell: (info) => info.getValue() ?? "Sin zona"
  }),
  columnHelper.accessor("direction", {
    header: "Dirección",
    cell: (info) => DIRECTION_LABEL[info.getValue()]
  }),
  columnHelper.accessor("isActive", {
    header: "Estado",
    cell: (info) => (info.getValue() ? "Activo" : "Inactivo")
  }),
  columnHelper.accessor("operatorNames", {
    header: "Operadores",
    cell: (info) => (info.getValue().length > 0 ? info.getValue().join(", ") : "Sin operadores asignados")
  })
];

export function GatesOverviewPage() {
  const { data: gates = [], isLoading } = useGatesOverviewQuery();
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: gates,
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
        <h1 className="font-display text-2xl font-semibold">Puertas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Puertas de todos los eventos a los que tienes acceso.</p>
      </header>
      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : gates.length === 0 ? (
        <p className="text-muted-foreground">No hay puertas creadas todavía.</p>
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
                      {header.column.getCanSort()
                        ? <SortableHeader header={header} />
                        : flexRender(header.column.columnDef.header, header.getContext())}
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
