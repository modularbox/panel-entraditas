import type { Order, OrderItem, Refund } from "@entraditas/types";
import type { ApiPanelOrder, ApiRefund } from "@/shared/lib/entraditasApi";
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
const ESTADOS_DE_REEMBOLSO: Refund["status"][] = ["requested", "processed", "rejected"];

/** El pedido como lo pinta el panel, con el nombre del evento que ya trae la API. */
export type PedidoConEvento = Order & {
  items: OrderItem[];
  eventTitle?: string;
  /** "Función de noche · 14/11 21:00": que se sepa de que fecha es cada venta. */
  sessionLabel?: string;
};

/** La función de un pedido para las tablas: su nombre y su fecha, tal y como se tecleo. */
export function etiquetaDeSesion(nombre: string | null | undefined, inicio: string | null | undefined): string | undefined {
  if (!nombre && !inicio) return undefined;
  const fecha = inicio && inicio.length >= 16 ? `${inicio.slice(8, 10)}/${inicio.slice(5, 7)} ${inicio.slice(11, 16)}` : "";
  return [nombre, fecha].filter(Boolean).join(" · ");
}

export function pedidoDesdeLaApi(pedido: ApiPanelOrder): PedidoConEvento {
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
    paymentReference: pedido.paymentReference ?? null,
    eventTitle: pedido.eventTitle,
    ...(etiquetaDeSesion(pedido.sessionName, pedido.sessionStartsAt)
      ? { sessionLabel: etiquetaDeSesion(pedido.sessionName, pedido.sessionStartsAt) }
      : {}),
    paidAt: pedido.status === "paid" ? creado : null,
    expiresAt: null,
  createdAt: creado,
  updatedAt: creado,
  transferredCount: pedido.transferredCount ?? 0,
  nonTransferredCount: pedido.nonTransferredCount ?? 0,
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
 * Un reembolso de la base de ventas a la forma que pinta el panel. Importes en centimos, igual
 * que el pedido.
 */
export function refundDesdeLaApi(reembolso: ApiRefund): Refund {
  return {
    id: reembolso.id,
    orderId: reembolso.orderId,
    orderNumber: reembolso.orderNumber ?? reembolso.orderId,
    customerName: reembolso.customerName ?? "",
    amount: reembolso.amount,
    reason: reembolso.reason ?? "",
    status: ESTADOS_DE_REEMBOLSO.includes(reembolso.status) ? reembolso.status : "processed",
    refundedBy: reembolso.refundedBy ?? null,
    createdAt: reembolso.createdAt ?? new Date().toISOString()
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
