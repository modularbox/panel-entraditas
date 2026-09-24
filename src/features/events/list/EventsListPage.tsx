import { useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { Link, useNavigate } from "react-router-dom";
import type { Event, EventRules } from "@entraditas/types";
import { Can } from "@/shared/auth/Can";
import { Button } from "@/shared/ui/button";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { EventStatusBadge, EVENT_STATUS_LABEL } from "@/shared/ui/EventStatusBadge";
import { AutoSincronizacionConLaWeb } from "@/features/publish/AutoSincronizacionConLaWeb";
import { useWizardStore } from "../wizard/wizardStore";
import { CreateEventDialog } from "../create/CreateEventDialog";
import { EventRowActions } from "./EventRowActions";
import { useEventsQuery } from "./useEventsQuery";

const STATUS_FILTERS: Array<{ value: "" | Event["status"]; label: string }> = [
  { value: "", label: "Todos" },
  { value: "draft", label: "Borrador" },
  { value: "in_review", label: "En revisión" },
  { value: "published", label: "Publicado" },
  { value: "rejected", label: "Rechazado" },
  { value: "finished", label: "Finalizado" }
];
const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

/**
 * Editar, en todos los eventos.
 *
 * Antes solo se llegaba al asistente por el titulo, que lleva a la ficha: la lista no ofrecia
 * editar en ningun sitio. Un evento en revision no se edita de primeras -lo esta mirando alguien-
 * y lo que se ofrece ahi es retirarlo de revision (EventRowActions), que lo devuelve a borrador;
 * al enviarlo otra vez, vuelve a revision.
 */
function EditarEvento({ event }: { event: Event }) {
  if (event.status === "in_review") {
    return (
      <Button
        type="button"
        variant="outline"
        disabled
        title="Está en revisión: retíralo de revisión para poder editarlo."
        className="h-8 px-3 text-xs"
      >
        Editar
      </Button>
    );
  }
  return (
    <Link to={`/eventos/${event.id}/editar`}>
      <Button type="button" variant="outline" className="h-8 px-3 text-xs">
        Editar
      </Button>
    </Link>
  );
}

const columnHelper = createColumnHelper<Event>();
const columns = [
  columnHelper.accessor("title", {
    header: "Título",
    cell: (info) => (
      // Una linea, con el titulo entero al pasar el raton: con titulos largos, la fila crecia al
      // doble de alto y la tabla quedaba con escalones.
      <Link
        to={`/eventos/${info.row.original.id}`}
        title={info.getValue()}
        className="block max-w-[22rem] truncate font-semibold text-primary hover:underline"
      >
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("status", {
    header: "Estado",
    // Se le pasa el evento entero para que pueda marcar como TERMINADO lo que ya se celebro,
    // aunque su estado guardado siga siendo "publicado".
    cell: (info) => <EventStatusBadge status={info.getValue()} event={info.row.original} />
  }),
  columnHelper.accessor("startsAt", {
    header: "Fecha",
    cell: (info) => (
      <span className="whitespace-nowrap">
        {info.getValue() ? dateFormatter.format(new Date(info.getValue()!)) : "Fecha por confirmar"}
      </span>
    )
  }),
  columnHelper.display({
    id: "acciones",
    header: "Acciones",
    cell: (info) => (
      <div className="flex flex-nowrap items-center gap-2">
        <EditarEvento event={info.row.original} />
        <EventRowActions event={info.row.original} />
      </div>
    )
  })
];

export function EventsListPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const setDraftRules = useWizardStore((s) => s.setDraftRules);
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

  function startWizard(rules: EventRules | null) {
    setDraftRules(rules);
    navigate("/eventos/nuevo/editar");
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Eventos</h1>
        <Can do="events:create">
          <Button onClick={() => setCreating(true)}>Crear evento</Button>
        </Can>
      </header>

      {creating && (
        <CreateEventDialog
          onClose={() => setCreating(false)}
          onContinue={(rules) => startWizard(rules)}
          onSkip={() => startWizard(null)}
        />
      )}

      <AutoSincronizacionConLaWeb eventos={events} />

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

      {/* Publicado ya es venta abierta: no hay estados de venta aparte. Lo unico que aclara el
          texto es como se deduce el terminado. */}
      <p className="max-w-3xl text-sm text-muted-foreground">
        <strong>Publicado</strong> es que el evento se ve en entraditas.com y ya se pueden
        comprar entradas. Los eventos cuya fecha ya ha pasado se marcan solos como{" "}
        <strong>Finalizado</strong> y dejan de salir en la web.
      </p>

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
                    <td key={cell.id} className="px-4 py-3 align-middle">
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

