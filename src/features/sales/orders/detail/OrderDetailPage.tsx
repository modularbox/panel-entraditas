import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Order, OrderItem, Refund } from "@entraditas/types";
import { Can } from "@/shared/auth/Can";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";

type OrderDetail = Order & { items: OrderItem[]; refunds: Refund[] };

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

function RefundForm({
  orderId,
  remaining,
  token,
  onRefunded
}: {
  orderId: string;
  remaining: number;
  token: string;
  onRefunded: () => void;
}) {
  const [amountEuros, setAmountEuros] = useState((remaining / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post(
        `/orders/${orderId}/refund`,
        { amount: Math.round(Number(amountEuros) * 100), reason },
        { token }
      );
      setReason("");
      onRefunded();
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
      <div>
        <label htmlFor="refund-amount" className="block text-xs font-medium text-muted-foreground">Importe a reembolsar (€)</label>
        <input
          id="refund-amount"
          type="number"
          min="0.01"
          max={(remaining / 100).toFixed(2)}
          step="0.01"
          value={amountEuros}
          onChange={(e) => setAmountEuros(e.target.value)}
          className="mt-1 h-9 w-32 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
        />
      </div>
      <div className="flex-1">
        <label htmlFor="refund-reason" className="block text-xs font-medium text-muted-foreground">Motivo</label>
        <input
          id="refund-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border-2 border-foreground bg-surface px-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={submitting}>Reembolsar</Button>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id!;
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => apiClient.get<OrderDetail>(`/orders/${orderId}`, { token: token! }),
    enabled: Boolean(token),
    retry: false
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Pedido no encontrado.</p>
      </div>
    );
  }
  if (!order) return null;

  const remaining = order.total - order.refundedAmount;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{order.orderNumber}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {STATUS_LABELS[order.status]} · {CHANNEL_LABELS[order.channel]} · {new Date(order.createdAt).toLocaleDateString("es-ES")}
        </p>
      </header>

      <section className="rounded-lg border-2 border-foreground bg-surface p-5 shadow-flat">
        <h2 className="font-display text-lg font-semibold">Comprador</h2>
        <p className="mt-2 text-sm">{order.customerName}</p>
        <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
      </section>

      <section className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Tipo de entrada</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Cantidad</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Precio unitario</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3">{item.ticketTypeName}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{euro.format(item.unitPrice / 100)}</td>
                <td className="px-4 py-3">{euro.format(item.subtotal / 100)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground">
              <td colSpan={3} className="px-4 py-3 text-right font-semibold">Total</td>
              <td className="px-4 py-3 font-semibold">{euro.format(order.total / 100)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      <section className="rounded-lg border-2 border-foreground bg-surface p-5 shadow-flat">
        <h2 className="font-display text-lg font-semibold">Reembolsos</h2>
        {order.refunds.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Este pedido no tiene reembolsos.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {order.refunds.map((refund) => (
              <li key={refund.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span className="font-semibold">{euro.format(refund.amount / 100)}</span> · <span>{refund.reason}</span>
                <span className="block text-xs text-muted-foreground">{new Date(refund.createdAt).toLocaleDateString("es-ES")}</span>
              </li>
            ))}
          </ul>
        )}

        {remaining > 0 && (order.status === "paid" || order.status === "partially_refunded") && (
          <Can do="orders:refund">
            <RefundForm
              orderId={order.id}
              remaining={remaining}
              token={token!}
              onRefunded={() => queryClient.invalidateQueries({ queryKey: ["order", orderId] })}
            />
          </Can>
        )}
      </section>
    </div>
  );
}
