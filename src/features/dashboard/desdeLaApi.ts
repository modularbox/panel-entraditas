import type { ApiMetrics } from "@/shared/lib/entraditasApi";
import type { DashboardOverview } from "./dashboardTypes";

/**
 * Traduce lo que calcula la API sobre la base de ventas a la forma que pinta el dashboard.
 *
 * El dashboard nació contra los datos de ejemplo del panel y esa forma es la que saben leer sus
 * gráficos. En vez de reescribir la pantalla entera, se adapta aquí: así la misma pantalla sirve
 * para las dos fuentes y no hay dos maneras de pintar lo mismo.
 *
 * Lo que NO se traduce es tan importante como lo que sí. Conversión, origen de compradores y
 * embudo necesitan medir visitas, y eso no existe: se devuelven vacíos y la pantalla los esconde,
 * en vez de rellenarlos con números puestos a mano al lado de unos ingresos que sí son ciertos.
 */

const TICKET_PALETTE = ["#e4572e", "#f2c14e", "#2a9d8f", "#52606d", "#9b5de5"];
const CHANNEL_LABELS: Record<string, string> = { web: "Web", box_office: "Taquilla", courtesy: "Cortesía", panel: "Panel" };
const CHANNEL_COLORS: Record<string, string> = { web: "#e4572e", box_office: "#2a9d8f", courtesy: "#f2c14e", panel: "#52606d" };
const diaCorto = new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short" });

/** Sin variación calculable: el número que acompaña al KPI se deja en null y no se pinta flecha. */
const sinVariacion = (value: number) => ({ value, change: null, trend: "up" as const });

function etiquetaDeDia(fecha: string): string {
  // La fecha viene como AAAA-MM-DD. Se le pone hora local a propósito: `new Date('2026-09-21')`
  // se interpreta como UTC y en España pintaría el día anterior a partir de las 22:00.
  const d = new Date(`${fecha}T00:00:00`);
  return Number.isNaN(d.getTime()) ? fecha : diaCorto.format(d);
}

export function dashboardDesdeLaApi(metricas: ApiMetrics): DashboardOverview {
  const ventas = metricas.ventas;
  const aforo = metricas.aforo;
  const asistencia = metricas.asistencia;
  const eventos = metricas.porEvento ?? [];

  const porDia = ventas?.porDia ?? [];
  const salesTimeline = porDia.length === 0
    ? [{ label: "Sin ventas", actual: 0 }, { label: "Actual", actual: 0 }]
    : porDia.map((punto) => ({ label: etiquetaDeDia(punto.date), actual: punto.cumulative }));
  // Un solo día no dibuja una línea: se repite el punto para que el gráfico tenga de dónde a dónde.
  if (salesTimeline.length === 1) salesTimeline.push({ ...salesTimeline[0]!, label: "Actual" });

  const tipos = ventas?.porTipoDeEntrada ?? [];
  const totalEntradasPorTipo = tipos.reduce((suma, tipo) => suma + tipo.tickets, 0);
  const ticketMix = totalEntradasPorTipo === 0
    ? []
    : tipos.map((tipo, indice) => ({
        label: tipo.name,
        value: Math.round((tipo.tickets / totalEntradasPorTipo) * 100),
        color: TICKET_PALETTE[indice % TICKET_PALETTE.length] ?? "#e4572e"
      }));

  const canales = ventas?.porCanal ?? [];
  const totalCanales = canales.reduce((suma, canal) => suma + canal.net, 0);
  const channels = totalCanales === 0
    ? []
    : canales
        .map((canal) => ({
          label: CHANNEL_LABELS[canal.channel] ?? canal.channel,
          value: Math.round((canal.net / totalCanales) * 100),
          color: CHANNEL_COLORS[canal.channel] ?? "#52606d"
        }))
        .filter((canal) => canal.value > 0);

  return {
    kpis: {
      grossRevenue: sinVariacion(ventas?.bruto ?? 0),
      netRevenue: sinVariacion(ventas?.neto ?? 0),
      ticketsSold: sinVariacion(ventas?.entradas ?? 0),
      averageTicket: sinVariacion(ventas?.ticketMedio ?? 0),
      occupancy: sinVariacion(aforo?.ocupacion ?? 0),
      // Estos dos existen en la pantalla desde siempre. La conversión se queda a cero y marcada
      // como no calculable; la asistencia SÍ es real, sale de las entradas escaneadas.
      conversion: sinVariacion(0),
      attendance: sinVariacion(asistencia?.porcentaje ?? 0),
      refunds: sinVariacion(ventas?.devuelto ?? 0)
    },
    salesTimeline,
    ticketMix,
    occupancy: eventos
      .filter((evento) => evento.capacity > 0)
      .map((evento) => ({ label: evento.title, sold: evento.soldSeats, capacity: evento.capacity })),
    // Vacías a propósito: hacen falta datos que hoy no se recogen.
    attendanceCurve: [],
    channels,
    geoHeat: [],
    funnel: [],
    eventMetrics: eventos.map((evento) => ({
      id: evento.id,
      title: evento.title,
      status: evento.status,
      startsAt: evento.startsAt,
      grossRevenue: evento.gross,
      netRevenue: evento.net,
      ticketsSold: evento.tickets,
      averageTicket: evento.tickets > 0 ? Math.round(evento.gross / evento.tickets) : null,
      occupancy: evento.capacity > 0 ? Math.round((evento.soldSeats / evento.capacity) * 100) : null,
      conversion: null,
      attendance: evento.issued > 0 ? Math.round((evento.used / evento.issued) * 100) : null,
      refunds: evento.refunded
    })),
    lastUpdated: metricas.actualizado ?? new Date().toISOString(),
    esReal: true,
    recortadoAlPropio: metricas.filtros?.recortadoAlPropio ?? false
  };
}
