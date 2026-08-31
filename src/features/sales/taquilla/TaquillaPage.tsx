import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Order, OrderItem, TicketType } from "@entraditas/types";
import { Can } from "@/shared/auth/Can";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useEventTicketTypesQuery } from "./useEventTicketTypesQuery";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

function remainingStock(ticketType: TicketType): number | null {
  return ticketType.quantityTotal === null ? null : ticketType.quantityTotal - ticketType.quantitySold;
}

export function TaquillaPage() {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const [eventId, setEventId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: events = [] } = useEventsQuery();
  const { data: ticketTypes = [] } = useEventTicketTypesQuery(eventId || null);

  function setQuantity(ticketTypeId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [ticketTypeId]: quantity }));
  }

  const cartLines = ticketTypes
    .map((tt) => ({ ticketType: tt, quantity: quantities[tt.id] ?? 0 }))
    .filter((line) => line.quantity > 0);
  const total = cartLines.reduce((sum, line) => sum + line.ticketType.basePrice * line.quantity, 0);

  async function confirmSale() {
    setError(null);
    setConfirmation(null);
    setSubmitting(true);
    try {
      const order = await apiClient.post<Order & { items: OrderItem[] }>(
        "/orders",
        {
          eventId,
          customerName,
          customerEmail,
          items: cartLines.map((line) => ({ ticketTypeId: line.ticketType.id, quantity: line.quantity }))
        },
        { token: token! }
      );
      setConfirmation({ orderId: order.id, orderNumber: order.orderNumber });
      setQuantities({});
      setCustomerName("");
      setCustomerEmail("");
      queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Taquilla</h1>
      </header>

      <Can
        do="orders:create"
        fallback={
          <p className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-6 text-sm text-muted-foreground">
            No tienes permiso para vender entradas.
          </p>
        }
      >
        <div className="flex flex-col gap-6">
          <div>
            <label htmlFor="taquilla-event" className="block text-xs font-medium text-muted-foreground">Evento</label>
            <select
              id="taquilla-event"
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setQuantities({});
                setConfirmation(null);
                setError(null);
              }}
              className="mt-1 h-9 w-full max-w-md rounded-md border-2 border-foreground bg-surface px-2 text-sm"
            >
              <option value="">Selecciona un evento</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
            </select>
          </div>

          {eventId && (
            <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-alt">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Tipo de entrada</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Precio</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Disponibles</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketTypes.map((ticketType) => {
                    const remaining = remainingStock(ticketType);
                    const soldOut = remaining !== null && remaining <= 0;
                    const max = remaining === null ? ticketType.maxPerOrder : Math.min(remaining, ticketType.maxPerOrder);
                    return (
                      <tr key={ticketType.id} className="border-t border-border">
                        <td className="px-4 py-3">{ticketType.name}</td>
                        <td className="px-4 py-3">{euro.format(ticketType.basePrice / 100)}</td>
                        <td className="px-4 py-3">{soldOut ? "Agotado" : remaining === null ? "Ilimitado" : remaining}</td>
                        <td className="px-4 py-3">
                          <label htmlFor={`qty-${ticketType.id}`} className="sr-only">Cantidad de {ticketType.name}</label>
                          <input
                            id={`qty-${ticketType.id}`}
                            type="number"
                            min={0}
                            max={max}
                            disabled={soldOut}
                            value={quantities[ticketType.id] ?? 0}
                            onChange={(e) => setQuantity(ticketType.id, Math.max(0, Number(e.target.value)))}
                            className="h-9 w-20 rounded-md border-2 border-foreground bg-surface px-2 text-sm disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {cartLines.length > 0 && (
            <div className="rounded-lg border-2 border-foreground bg-surface p-5 shadow-flat">
              <h2 className="font-display text-lg font-semibold">Resumen de la venta</h2>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {cartLines.map((line) => (
                  <li key={line.ticketType.id} className="flex justify-between">
                    <span>{line.ticketType.name} × {line.quantity}</span>
                    <span>{euro.format((line.ticketType.basePrice * line.quantity) / 100)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total</span>
                <span>{euro.format(total / 100)}</span>
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <div>
                  <label htmlFor="taquilla-customer-name" className="block text-xs font-medium text-muted-foreground">Nombre del comprador</label>
                  <input
                    id="taquilla-customer-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 h-9 w-56 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="taquilla-customer-email" className="block text-xs font-medium text-muted-foreground">Email del comprador</label>
                  <input
                    id="taquilla-customer-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 h-9 w-56 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
                  />
                </div>
              </div>

              <Button
                type="button"
                className="mt-4"
                disabled={submitting || !customerName.trim() || !customerEmail.trim()}
                onClick={confirmSale}
              >
                Confirmar venta
              </Button>
            </div>
          )}

          {error && <p role="alert">{error}</p>}
          {confirmation && (
            <p role="status" className="border-2 border-success bg-success-bg px-4 py-3 text-sm font-semibold">
              Venta {confirmation.orderNumber} confirmada. <Link to={`/ventas/pedidos/${confirmation.orderId}`} className="underline">Ver pedido</Link>
            </p>
          )}
        </div>
      </Can>
    </div>
  );
}
