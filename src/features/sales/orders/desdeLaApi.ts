import type { Order, OrderItem } from "@entraditas/types";
import type { ApiPanelOrder } from "@/shared/lib/entraditasApi";
import type { OrdersFilters } from "./list/useOrdersQuery";

/**
 * Traduce un pedido de la base de ventas de entraditas.com a la forma que pinta el panel.
 *
 * La pantalla nació contra los datos de ejemplo y esa es la forma que sabe leer. En vez de
 * reescribirla, se adapta aquí: así la misma tabla sirve para las dos fuentes.
 *
 * Los importes no se tocan: en los dos sitios son céntimos enteros.
 */

const ESTADOS: Order["status"][] = ["pending", "reserved", "paid", "cancelled", "expired", "refunded", "partially_refunded"];
const CANALES: Order["channel"][] = ["web", "panel", "box_office", "courtesy"];

export function pedidoDesdeLaApi(pedido: ApiPanelOrder): Order & { items: OrderItem[] } {
  const creado = pedido.createdAt ?? new Date().toISOString();
  return {
    id: pedido.id,
    orderNumber: pedido.number,
    eventId: pedido.eventId,
    organizationId: pedido.organizationId ?? "",
    customerName: pedido.customerName,
    customerEmail: pedido.customerEmail,
    customerPhone: pedido.customerPhone,
    // Quién del panel tramitó la venta: nadie, viene de la web. No es el comprador.
    userId: null,
    status: (ESTADOS as string[]).includes(pedido.status) ? (pedido.status as Order["status"]) : "pending",
    channel: (CANALES as string[]).includes(pedido.channel) ? (pedido.channel as Order["channel"]) : "web",
    subtotal: pedido.subtotal,
    discountAmount: pedido.discount,
    serviceFee: pedido.serviceFee,
    total: pedido.total,
    refundedAmount: pedido.refunded,
    currency: pedido.currency || "EUR",
    paymentReference: null,
    paidAt: pedido.status === "paid" ? creado : null,
    expiresAt: null,
    createdAt: creado,
    updatedAt: creado,
    items: pedido.items.map((linea) => ({
      id: linea.id,
      orderId: pedido.id,
      // El tipo de entrada puede no existir como fila cuando el evento se publicó sin montarlo
      // entero en el panel. El nombre sí se copió en la compra, que es lo que se enseña.
      ticketTypeId: linea.ticketTypeId ?? "",
      ticketTypeName: linea.name,
      quantity: linea.quantity,
      unitPrice: linea.unitPrice,
      subtotal: linea.subtotal
    }))
  };
}

/**
 * Filtra por estado, canal y texto sobre una lista ya traída.
 *
 * La API recorta por organización, evento y fechas —que es donde importa, porque son muchos
 * pedidos y porque el alcance no puede decidirlo el navegador—, pero no por estado ni por texto.
 * Se hace aquí para que la pantalla se comporte igual con las dos fuentes.
 */
export function filtrarPedidos<T extends Order>(pedidos: T[], filtros: OrdersFilters): T[] {
  const texto = filtros.q?.trim().toLowerCase() ?? "";
  return pedidos.filter((pedido) => {
    if (filtros.status && pedido.status !== filtros.status) return false;
    if (filtros.channel && pedido.channel !== filtros.channel) return false;
    if (texto === "") return true;
    return [pedido.orderNumber, pedido.customerName, pedido.customerEmail].some((campo) =>
      campo.toLowerCase().includes(texto)
    );
  });
}
