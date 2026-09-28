import type { DashboardOverview } from "./dashboardTypes";
import { textoDeMetodoDePago } from "@/features/sales/orders/metodoDePago";

/**
 * Exportación del dashboard: la general (lo que se ve con los filtros puestos) y la de un evento
 * (sus cifras y sus pedidos uno a uno).
 *
 * Se genera aquí, con los mismos datos que pinta la pantalla. Antes el botón pedía el informe a
 * los datos de ejemplo del panel, así que con ventas reales en pantalla se descargaban otras.
 *
 * CSV con `;` y marca de UTF-8 al principio: es lo que Excel en español abre bien a doble clic,
 * con las tildes y cada dato en su columna.
 */

type Celda = string | number | null | undefined;
type FilaDeEvento = DashboardOverview["eventMetrics"][number];

/** Lo mínimo de un pedido que hace falta para exportarlo. */
export interface PedidoExportable {
  orderNumber: string;
  createdAt: string;
  customerName: string;
  customerEmail: string;
  status: string;
  paymentReference?: string | null;
  total: number;
  items?: { quantity: number }[];
}

const SEPARADOR = ";";

function celda(valor: Celda): string {
  if (valor === null || valor === undefined) return "";
  const texto = String(valor);
  // Comillas si lleva separador, comillas o saltos; las comillas de dentro se duplican.
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(filas: Celda[][]): string {
  return "﻿" + filas.map((fila) => fila.map(celda).join(SEPARADOR)).join("\r\n") + "\r\n";
}

/** Euros con coma decimal, sin símbolo: así Excel los suma. Los datos vienen en céntimos. */
function euros(centimos: number | null): string {
  return centimos === null ? "" : (centimos / 100).toFixed(2).replace(".", ",");
}

function porcentaje(valor: number | null): string {
  return valor === null ? "" : `${valor}%`;
}

function fecha(valor: string | null): string {
  if (!valor) return "Por confirmar";
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? valor : d.toLocaleDateString("es-ES");
}

const CABECERA_EVENTO = ["Evento", "Estado", "Fecha", "Ingresos brutos (€)", "Ingresos netos (€)", "Entradas vendidas", "Ticket medio (€)", "Aforo", "Asistencia", "Reembolsos (€)"];

function filaDeEvento(evento: FilaDeEvento): Celda[] {
  return [
    evento.title,
    evento.status,
    fecha(evento.startsAt),
    euros(evento.grossRevenue),
    euros(evento.netRevenue),
    evento.ticketsSold,
    euros(evento.averageTicket),
    porcentaje(evento.occupancy),
    porcentaje(evento.attendance),
    euros(evento.refunds)
  ];
}

/** Todo el dashboard: cifras generales, detalle por evento (en el orden en que se ve) y mezclas. */
export function csvGeneral(datos: DashboardOverview, eventos: FilaDeEvento[], filtros: string): string {
  const k = datos.kpis;
  const filas: Celda[][] = [
    ["Dashboard de Entraditas"],
    ["Generado", new Date().toLocaleString("es-ES")],
    ["Filtros", filtros],
    ["Origen", datos.esReal ? "Base de ventas de entraditas.com" : "Datos de ejemplo del panel"],
    [],
    ["Cifras generales"],
    ["Ingresos brutos (€)", euros(k.grossRevenue.value)],
    ["Ingresos netos (€)", euros(k.netRevenue.value)],
    ["Entradas vendidas", k.ticketsSold.value],
    ["Ticket medio (€)", euros(k.averageTicket.value)],
    ["Aforo ocupado", porcentaje(k.occupancy.value)],
    ["Asistencia", porcentaje(k.attendance.value)],
    ["Reembolsos (€)", euros(k.refunds.value)],
    [],
    ["Detalle por evento"],
    CABECERA_EVENTO,
    ...eventos.map(filaDeEvento)
  ];
  if (datos.ticketMix.length > 0) {
    filas.push([], ["Ventas por tipo de entrada"], ["Tipo", "Valor"], ...datos.ticketMix.map((t) => [t.label, t.value]));
  }
  if (datos.channels.length > 0) {
    filas.push([], ["Canales de venta"], ["Canal", "Valor"], ...datos.channels.map((c) => [c.label, c.value]));
  }
  return aCsv(filas);
}

/** Un evento: sus cifras y, debajo, cada pedido. */
export function csvDeEvento(evento: FilaDeEvento, pedidos: PedidoExportable[]): string {
  const filas: Celda[][] = [
    [evento.title],
    ["Generado", new Date().toLocaleString("es-ES")],
    [],
    CABECERA_EVENTO,
    filaDeEvento(evento),
    [],
    ["Pedidos"],
    ["Nº pedido", "Fecha", "Comprador", "Correo", "Pago", "Entradas", "Total (€)", "Estado"],
    ...pedidos.map((p) => [
      p.orderNumber,
      fecha(p.createdAt),
      p.customerName,
      p.customerEmail,
      textoDeMetodoDePago(p.paymentReference),
      p.items ? p.items.reduce((total, linea) => total + linea.quantity, 0) : "",
      euros(p.total),
      p.status
    ])
  ];
  if (pedidos.length === 0) filas.push(["Sin pedidos en este evento."]);
  return aCsv(filas);
}

/** Un nombre de fichero sin tildes ni espacios. */
export function nombreDeFichero(base: string): string {
  const limpio = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${limpio || "exportacion"}-${new Date().toISOString().slice(0, 10)}.csv`;
}

export function descargar(nombre: string, contenido: string): void {
  if (typeof URL.createObjectURL !== "function") return;
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}
