import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Customer, Order } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";

type AttendeeDetail = Customer & { orders: (Order & { eventTitle: string })[] };

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
const number = new Intl.NumberFormat("es-ES");

export function AttendeeDetailPage() {
  const { email } = useParams<{ email: string }>();
  const token = useSessionStore((s) => s.token);

  const { data: attendee, isLoading, error } = useQuery({
    queryKey: ["customer", email],
    queryFn: () => apiClient.get<AttendeeDetail>(`/customers/${encodeURIComponent(email!)}`, { token: token! }),
    enabled: Boolean(email && token),
    retry: false // a 404 here is a valid "not found" outcome, not a transient failure to retry
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Asistente no encontrado.</p>
      </div>
    );
  }
  if (!attendee) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{attendee.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{attendee.email}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pedidos</p>
          <p className="mt-2 font-display text-2xl font-semibold">{number.format(attendee.ordersCount)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Entradas</p>
          <p className="mt-2 font-display text-2xl font-semibold">{number.format(attendee.ticketsCount)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Gastado</p>
          <p className="mt-2 font-display text-2xl font-semibold">{euro.format(attendee.totalSpent / 100)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Última compra</p>
          <p className="mt-2 font-display text-2xl font-semibold">{new Date(attendee.lastPurchaseAt).toLocaleDateString("es-ES")}</p>
        </article>
      </div>

      <section className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Nº pedido</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Evento</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Canal</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {attendee.orders.map((order) => (
              <tr key={order.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link to={`/ventas/pedidos/${order.id}`} className="font-semibold text-primary hover:underline">{order.orderNumber}</Link>
                </td>
                <td className="px-4 py-3">{order.eventTitle}</td>
                <td className="px-4 py-3">{STATUS_LABELS[order.status]}</td>
                <td className="px-4 py-3">{CHANNEL_LABELS[order.channel]}</td>
                <td className="px-4 py-3">{euro.format(order.total / 100)}</td>
                <td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
