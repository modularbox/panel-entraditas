import { describe, expect, it } from "vitest";
import type { ApiMetrics } from "@/shared/lib/entraditasApi";
import { dashboardDesdeLaApi } from "./desdeLaApi";

function metricas(parcial: Partial<ApiMetrics> = {}): ApiMetrics {
  return {
    disponible: true,
    ventas: {
      pedidos: 4,
      bruto: 19000,
      neto: 18000,
      devuelto: 4000,
      entradas: 9,
      ticketMedio: 2111,
      porCanal: [
        { channel: "web", orders: 3, net: 16000 },
        { channel: "box_office", orders: 1, net: 2000 }
      ],
      porTipoDeEntrada: [
        { name: "General", tickets: 7, amount: 15000 },
        { name: "VIP", tickets: 2, amount: 4000 }
      ],
      porDia: [
        { date: "2026-09-19", net: 2000, orders: 1, cumulative: 2000 },
        { date: "2026-09-21", net: 16000, orders: 3, cumulative: 18000 }
      ]
    },
    aforo: { capacidad: 750, vendidas: 80, ocupacion: 11 },
    asistencia: { emitidas: 5, usadas: 3, porcentaje: 60 },
    porEvento: [
      {
        id: "ev-jazz", title: "Noche de Jazz", status: "published", startsAt: null, organizationId: "org-norte",
        gross: 9000, net: 8000, refunded: 4000, orders: 2, tickets: 4,
        capacity: 100, soldSeats: 30, issued: 5, used: 3
      },
      {
        id: "ev-vacio", title: "Evento Sin Ventas", status: "draft", startsAt: null, organizationId: "org-norte",
        gross: 0, net: 0, refunded: 0, orders: 0, tickets: 0,
        capacity: 50, soldSeats: 0, issued: 0, used: 0
      }
    ],
    actualizado: "2026-09-21T10:00:00Z",
    ...parcial
  };
}

describe("dashboardDesdeLaApi", () => {
  it("marca los datos como reales", () => {
    expect(dashboardDesdeLaApi(metricas()).esReal).toBe(true);
  });

  /**
   * Lo que había: las variaciones de los KPI ("+12.4%", "+9.8%"…) estaban escritas a mano en el
   * código. Al lado de unos ingresos que sí son ciertos, no hay forma de saber de cuál fiarse.
   */
  it("no se inventa las variaciones de los KPI", () => {
    const d = dashboardDesdeLaApi(metricas());
    for (const kpi of Object.values(d.kpis)) expect(kpi.change).toBeNull();
  });

  it("lleva el dinero tal cual lo calcula la API", () => {
    const d = dashboardDesdeLaApi(metricas());
    expect(d.kpis.grossRevenue.value).toBe(19000);
    expect(d.kpis.netRevenue.value).toBe(18000);
    expect(d.kpis.refunds.value).toBe(4000);
    expect(d.kpis.ticketsSold.value).toBe(9);
  });

  // La asistencia SÍ se puede calcular: cada entrada sabe si se escaneó. Era de lo poco inventado
  // que tenía datos de verdad detrás.
  it("la asistencia sale de las entradas escaneadas, no de una fórmula", () => {
    expect(dashboardDesdeLaApi(metricas()).kpis.attendance.value).toBe(60);
    const jazz = dashboardDesdeLaApi(metricas()).eventMetrics[0]!;
    expect(jazz.attendance).toBe(60); // 3 de 5
  });

  it("la conversión se queda sin valor: no hay forma de medirla todavía", () => {
    const d = dashboardDesdeLaApi(metricas());
    expect(d.eventMetrics.every((evento) => evento.conversion === null)).toBe(true);
    expect(d.funnel).toEqual([]);
    expect(d.geoHeat).toEqual([]);
    expect(d.attendanceCurve).toEqual([]);
  });

  it("las ventas acumuladas van acumuladas de verdad", () => {
    const d = dashboardDesdeLaApi(metricas());
    expect(d.salesTimeline.map((punto) => punto.actual)).toEqual([2000, 18000]);
  });

  it("la mezcla por tipo de entrada reparte en porcentaje", () => {
    const d = dashboardDesdeLaApi(metricas());
    expect(d.ticketMix.map((tipo) => [tipo.label, tipo.value])).toEqual([["General", 78], ["VIP", 22]]);
  });

  it("los canales se reparten por lo neto de cada uno", () => {
    const d = dashboardDesdeLaApi(metricas());
    expect(d.channels.map((canal) => canal.label)).toEqual(["Web", "Taquilla"]);
    expect(d.channels.reduce((suma, canal) => suma + canal.value, 0)).toBe(100);
  });

  /** Un evento sin ventas tiene que seguir saliendo: existe y tiene aforo que nadie ha comprado. */
  it("un evento sin ventas sale con ceros y sin dividir por cero", () => {
    const d = dashboardDesdeLaApi(metricas());
    const vacio = d.eventMetrics.find((evento) => evento.id === "ev-vacio")!;
    expect(vacio.grossRevenue).toBe(0);
    expect(vacio.averageTicket).toBeNull();
    expect(vacio.attendance).toBeNull();
    expect(vacio.occupancy).toBe(0);
    // Y su aforo sigue apareciendo en el gráfico: 0 de 50 es un dato.
    expect(d.occupancy.find((item) => item.label === "Evento Sin Ventas")).toEqual({ label: "Evento Sin Ventas", sold: 0, capacity: 50 });
  });

  /**
   * El caso de hoy: la API de compras todavía no existe, así que no hay ni un pedido. Tiene que
   * quedarse en ceros sin reventar y sin inventarse una línea de ventas.
   */
  it("aguanta que no haya ninguna venta todavía", () => {
    const vacio = dashboardDesdeLaApi({
      disponible: true,
      ventas: { pedidos: 0, bruto: 0, neto: 0, devuelto: 0, entradas: 0, ticketMedio: 0, porCanal: [], porTipoDeEntrada: [], porDia: [] },
      aforo: { capacidad: 0, vendidas: 0, ocupacion: null },
      asistencia: { emitidas: 0, usadas: 0, porcentaje: null },
      porEvento: []
    });
    expect(vacio.kpis.grossRevenue.value).toBe(0);
    expect(vacio.kpis.occupancy.value).toBe(0);
    expect(vacio.kpis.attendance.value).toBe(0);
    expect(vacio.ticketMix).toEqual([]);
    expect(vacio.channels).toEqual([]);
    expect(vacio.eventMetrics).toEqual([]);
    // El gráfico necesita al menos dos puntos para dibujar una línea.
    expect(vacio.salesTimeline).toHaveLength(2);
  });

  it("un solo día de ventas también dibuja línea", () => {
    const d = dashboardDesdeLaApi(metricas({
      ventas: { ...metricas().ventas!, porDia: [{ date: "2026-09-21", net: 5000, orders: 1, cumulative: 5000 }] }
    }));
    expect(d.salesTimeline).toHaveLength(2);
    expect(d.salesTimeline[0]!.actual).toBe(5000);
    expect(d.salesTimeline[1]!.actual).toBe(5000);
  });

  it("trae el aviso de que la API recortó el filtro al propio", () => {
    const d = dashboardDesdeLaApi(metricas({
      filtros: { organizacion: "org-norte", evento: null, desde: null, hasta: null, recortadoAlPropio: true }
    }));
    expect(d.recortadoAlPropio).toBe(true);
  });
});
