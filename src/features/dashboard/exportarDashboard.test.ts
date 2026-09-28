import { describe, expect, it } from "vitest";
import { aCsv, csvDeEvento, csvGeneral, nombreDeFichero } from "./exportarDashboard";
import type { DashboardOverview } from "./dashboardTypes";

const metrica = (value: number) => ({ value, change: null, trend: "up" as const });

const evento = {
  id: "e1",
  title: "Noche de Jazz; edición \"especial\"",
  status: "published",
  startsAt: "2026-12-01T20:00:00Z",
  grossRevenue: 6300,
  netRevenue: 6300,
  ticketsSold: 2,
  averageTicket: 3150,
  occupancy: 40,
  conversion: null,
  attendance: null,
  refunds: 0
};

const datos: DashboardOverview = {
  kpis: {
    grossRevenue: metrica(6300),
    netRevenue: metrica(6300),
    ticketsSold: metrica(2),
    averageTicket: metrica(3150),
    occupancy: metrica(40),
    conversion: metrica(0),
    attendance: metrica(0),
    refunds: metrica(0)
  },
  salesTimeline: [],
  ticketMix: [{ label: "General", value: 2, color: "#000" }],
  occupancy: [],
  attendanceCurve: [],
  channels: [],
  geoHeat: [],
  funnel: [],
  eventMetrics: [evento],
  lastUpdated: "2026-09-28T10:00:00Z",
  esReal: true
};

describe("exportar el dashboard", () => {
  it("abre bien en Excel en español: marca UTF-8, punto y coma y coma decimal", () => {
    const csv = csvGeneral(datos, [evento], "Todos los eventos");
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("Ingresos brutos (€);63,00");
    expect(csv).toContain("Ventas por tipo de entrada");
  });

  it("un texto con punto y coma o comillas no rompe las columnas", () => {
    expect(aCsv([['a;b', 'dijo "hola"']])).toBe('﻿"a;b";"dijo ""hola"""\r\n');
    expect(csvGeneral(datos, [evento], "")).toContain('"Noche de Jazz; edición ""especial"""');
  });

  it("la de un evento lleva sus cifras y cada pedido con su forma de pago", () => {
    const csv = csvDeEvento(evento, [
      {
        orderNumber: "ENTRADITAS-ABC123",
        createdAt: "2026-09-28T10:00:00Z",
        customerName: "Ana",
        customerEmail: "ana@ejemplo.com",
        status: "paid",
        paymentReference: "sin-pasarela:bizum",
        total: 6300,
        items: [{ quantity: 2 }]
      }
    ]);
    expect(csv).toContain("ENTRADITAS-ABC123");
    expect(csv).toContain("Bizum (prueba);2;63,00;paid");
  });

  it("un evento sin pedidos lo dice en vez de dejar la tabla vacía", () => {
    expect(csvDeEvento(evento, [])).toContain("Sin pedidos en este evento.");
  });

  it("el nombre del fichero no lleva tildes ni espacios", () => {
    expect(nombreDeFichero("Festival Flamenco del Norte · Cádiz")).toMatch(/^festival-flamenco-del-norte-cadiz-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
