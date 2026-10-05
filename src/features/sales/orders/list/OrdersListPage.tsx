import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { Order } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useOrganizationsQuery } from "@/features/organizations/list/useOrganizationsQuery";
import { useOrdersQuery } from "./useOrdersQuery";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { LIMITES } from "@/shared/lib/formLimits";
import { textoDeMetodoDePago } from "../metodoDePago";
import { Cargando } from "@/shared/ui/Cargando";
import { EliminarVenta } from "@/features/papelera/BotonesDeGestion";

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "Pendiente",
  reserved: "Reservado",
  paid: "Pagado",
  cancelled: "Cancelado",
  expired: "Expirado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial"
};

// Un pedido reembolsado del todo no pinta en Ventas: vive en Reembolsos. El filtro de estado no
// puede ofrecerlo porque no hay filas que mostrar; el parcial sí se queda (con su diferencia).
const ESTADOS_FILTRABLES = Object.entries(STATUS_LABELS).filter(([value]) => value !== "refunded");

const CHANNEL_LABELS: Record<Order["channel"], string> = {
  web: "Web",
  panel: "Panel",
  box_office: "Taquilla",
  courtesy: "Cortesía"
};

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
type Fila = Order & { eventTitle?: string; sessionLabel?: string };
const columnHelper = createColumnHelper<Fila>();

/**
 * Las columnas dependen de los eventos: un pedido de ejemplo solo trae el id del suyo.
 *
 * La organización va entre el nº de pedido y el evento, y solo si se le pasa quien la resuelve
 * (el superadmin, que es el único que ve pedidos de más de una organización). Para el resto la
 * columna repetiría el nombre de su propia empresa en cada fila.
 */
function columnasDePedidos(tituloDe: (fila: Fila) => string, organizacionDe: ((fila: Fila) => string) | null) {
  return [
    columnHelper.accessor("orderNumber", {
      header: "Nº pedido",
      cell: (info) => (
        <Link to={`/ventas/pedidos/${info.row.original.id}`} className="font-semibold text-primary hover:underline">
          {info.getValue()}
        </Link>
      )
    }),
    ...(organizacionDe
      ? [columnHelper.accessor((fila) => organizacionDe(fila), { id: "organizacion", header: "Organización" })]
      : []),
    columnHelper.accessor((fila) => tituloDe(fila), { id: "evento", header: "Evento" }),
    columnHelper.accessor("customerName", { header: "Comprador" }),
    columnHelper.accessor("customerEmail", { header: "Correo" }),
    columnHelper.accessor((fila) => textoDeMetodoDePago(fila.paymentReference), { id: "pago", header: "Pago" }),
    columnHelper.accessor("channel", { header: "Canal", cell: (info) => CHANNEL_LABELS[info.getValue()] }),
    columnHelper.accessor("status", { header: "Estado", cell: (info) => STATUS_LABELS[info.getValue()] }),
    columnHelper.accessor("total", {
      header: "Total",
      // Lo que se reembolsó deja de ser venta: la fila enseña la diferencia que queda por cobrar
      // (total menos devuelto). Sin reembolso es el total.
      cell: (info) => (
        <span className="text-green-500">{euro.format((info.getValue() - info.row.original.refundedAmount) / 100)}</span>
      )
    }),
    columnHelper.accessor((fila) => fila.transferredCount ?? 0, { id: "transferidas", header: "Transferidas", cell: (info) => info.getValue() }),
    columnHelper.accessor("createdAt", { header: "Fecha", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") }),
    // Eliminar la venta la manda a la papelera (tanda 21). El boton solo sale a quien puede.
    columnHelper.display({
      id: "acciones",
      header: "",
      enableSorting: false,
      cell: ({ row }) => <EliminarVenta id={row.original.id} numero={row.original.orderNumber} />
    })
  ];
}

export function OrdersListPage() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const { data: eventsData } = useEventsQuery();
  // Memorizado por lo mismo que `orders`: de él salen las columnas de la tabla.
  const events = useMemo(() => eventsData ?? [], [eventsData]);
  // El pedido solo trae el id de su organización, también en los datos de la API: el nombre sale
  // del listado de organizaciones, que solo se pide si quien mira es el superadmin.
  const esSuperadmin = useSessionStore((s) => s.user?.role === "superadmin");
  const { data: organizaciones } = useOrganizationsQuery(esSuperadmin);
  const { data, isLoading } = useOrdersQuery({
    eventId: eventId || undefined,
    status: status || undefined,
    channel: channel || undefined,
    q: q || undefined
  });
  // useMemo, y no `data?.items ?? []`: una lista nueva en cada render cambia la identidad de
  // `data` para la tabla y la deja redibujandose sin parar.
  const orders = useMemo(() => data?.items ?? [], [data]);
  const esReal = data?.esReal ?? false;
  const columns = useMemo(() => {
    const titulos = new Map(events.map((event) => [event.id, event.title]));
    if (!esSuperadmin) return columnasDePedidos((fila) => fila.eventTitle || titulos.get(fila.eventId) || "—", null);
    const organizacionesPorId = new Map((organizaciones ?? []).map((organizacion) => [organizacion.id, organizacion.name]));
    return columnasDePedidos(
      (fila) => fila.eventTitle || titulos.get(fila.eventId) || "—",
      (fila) => organizacionesPorId.get(fila.organizationId) ?? "—"
    );
  }, [events, esSuperadmin, organizaciones]);
  const table = useReactTable({
    data: orders,
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
        <h1 className="font-display text-2xl font-semibold">Pedidos</h1>
        {esReal && (
          <p className="mt-1 text-sm text-muted-foreground">
            Compras reales de entraditas.com. El cobro todavía no pasa por una pasarela: el pedido se
            guarda como pagado, y un reembolso desde aquí es una simulación. Reembolsado del todo, el
            pedido sale de esta lista y se queda en Reembolsos; si solo se devuelve una parte, aquí
            queda la diferencia.
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="event-filter" className="sr-only">Evento</label>
        <select id="event-filter" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los eventos</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>

        <label htmlFor="status-filter" className="sr-only">Estado</label>
        <select id="status-filter" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los estados</option>
          {ESTADOS_FILTRABLES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <label htmlFor="channel-filter" className="sr-only">Canal</label>
        <select id="channel-filter" value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los canales</option>
          {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <label htmlFor="search-filter" className="sr-only">Buscar</label>
        <input id="search-filter" type="search" maxLength={LIMITES.busqueda} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº pedido, nombre o email" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <Cargando />
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground">No hay pedidos que coincidan con los filtros.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full min-w-full text-left text-sm">
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
                <tr key={row.id} className="border-t border-border">
                  {row.getVisibleCells().map((cell) => (
                    // Una línea por dato: en el móvil la tabla se desplaza de lado dentro de su caja
                    // en vez de partir "PED-2026-0006" en tres renglones.
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
