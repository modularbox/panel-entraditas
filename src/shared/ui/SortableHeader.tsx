import { flexRender, type Header } from "@tanstack/react-table";

interface SortableHeaderProps<TData> {
  header: Header<TData, unknown>;
}

export function SortableHeader<TData>({ header }: SortableHeaderProps<TData>) {
  const sorted = header.column.getIsSorted();
  return (
    <button
      type="button"
      onClick={header.column.getToggleSortingHandler()}
      className="inline-flex items-center gap-1.5 hover:text-foreground"
      title={sorted === false ? "Ordenar ascendentemente" : "Cambiar dirección de ordenación"}
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      <span aria-hidden="true" className="text-xs leading-none text-muted-foreground">
        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
      </span>
    </button>
  );
}