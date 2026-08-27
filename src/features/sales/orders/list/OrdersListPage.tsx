import { useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Order } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useOrdersQuery } from "./useOrdersQuery";

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "Pendiente",
  reserved: "Reservado",
  paid: "Pagado",
  cancelled: "Cancelado",
  expired: "Expirado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial"
};

const CHANNEL_LABELS: Record<Order["channel"], string> = {
  web: "Web",
  panel: "Panel",
  box_office: "Taquilla",
  courtesy: "Cortesía"
};

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const columnHelper = createColumnHelper<Order>();
const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Nº pedido",
    cell: (info) => (
      <Link to={`/ventas/pedidos/${info.row.original.id}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("customerName", { header: "Comprador" }),
  columnHelper.accessor("channel", { header: "Canal", cell: (info) => CHANNEL_LABELS[info.getValue()] }),
  columnHelper.accessor("status", { header: "Estado", cell: (info) => STATUS_LABELS[info.getValue()] }),
  columnHelper.accessor("total", { header: "Total", cell: (info) => euro.format(info.getValue() / 100) }),
  columnHelper.accessor("createdAt", { header: "Fecha", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") })
];

export function OrdersListPage() {
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const { data: events = [] } = useEventsQuery();
  const { data: orders = [], isLoading } = useOrdersQuery({
    eventId: eventId || undefined,
    status: status || undefined,
    channel: channel || undefined,
    q: q || undefined
  });
  const table = useReactTable({ data: orders, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Pedidos</h1>
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
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <label htmlFor="channel-filter" className="sr-only">Canal</label>
        <select id="channel-filter" value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los canales</option>
          {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <label htmlFor="search-filter" className="sr-only">Buscar</label>
        <input id="search-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº pedido, nombre o email" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground">No hay pedidos que coincidan con los filtros.</p>
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
