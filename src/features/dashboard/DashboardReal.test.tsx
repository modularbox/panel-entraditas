import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import * as api from "@/shared/lib/entraditasApi";
import { DashboardPage } from "./DashboardPage";

function metricas(parcial: Partial<api.ApiMetrics> = {}): api.ApiMetrics {
  return {
    disponible: true,
    compradores: { total: 3, sinCompras: 1, ultimos7dias: 2, soloDelAlcance: false },
    eventos: { total: 4, porEstado: { published: 2, on_sale: 1, draft: 1 }, publicados: 3 },
    ventas: {
      pedidos: 4, bruto: 19000, neto: 18000, devuelto: 4000, entradas: 9, ticketMedio: 2111,
      porCanal: [{ channel: "web", orders: 4, net: 18000 }],
      porTipoDeEntrada: [{ name: "General", tickets: 9, amount: 19000 }],
      porDia: [{ date: "2026-09-21", net: 18000, orders: 4, cumulative: 18000 }]
    },
    aforo: { capacidad: 750, vendidas: 80, ocupacion: 11 },
    asistencia: { emitidas: 5, usadas: 3, porcentaje: 60 },
    organizadores: { organizaciones: 2, solicitudesPendientes: 0 },
    porEvento: [{
      id: "ev-jazz", title: "Noche de Jazz", status: "published", startsAt: null, organizationId: "org-norte",
      gross: 9000, net: 8000, refunded: 4000, orders: 2, tickets: 4,
      capacity: 100, soldSeats: 30, issued: 5, used: 3
    }],
    actualizado: "2026-09-21T10:00:00Z",
    ...parcial
  };
}

function pintar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard contra la base de ventas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function conApi(datos: api.ApiMetrics) {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiMetrics").mockResolvedValue(datos);
    pintar();
  }

  it("enseña las cifras de la base y no las de ejemplo", async () => {
    await conApi(metricas());
    // 19000 centimos = 190,00 EUR. Antes esta pantalla enseñaba los datos de ejemplo del panel.
    await waitFor(() => expect(screen.getByText("190,00 €")).toBeInTheDocument());
    // Sale en la tabla por evento y en el gráfico de aforo: con que esté en las dos basta.
    expect(screen.getAllByText("Noche de Jazz").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Noche de Jazz" })).toBeInTheDocument();
  });

  /**
   * Lo que se pidió mirar: que no se cuelen cifras inventadas al lado de las buenas. Conversión,
   * origen de compradores y embudo necesitan medir visitas, y eso no se recoge.
   */
  it("con datos reales no pinta lo que no se puede calcular", async () => {
    await conApi(metricas());
    await waitFor(() => expect(screen.getByText("190,00 €")).toBeInTheDocument());

    expect(screen.queryByText("Origen de compradores")).not.toBeInTheDocument();
    expect(screen.queryByText("Embudo de conversión")).not.toBeInTheDocument();
    expect(screen.queryByText("Curva de entrada")).not.toBeInTheDocument();
    expect(screen.queryByText(/vs periodo anterior/)).not.toBeInTheDocument();
  });

  it("y lo explica en vez de dejar huecos sin más", async () => {
    await conApi(metricas());
    await waitFor(() => expect(screen.getByText(/no aparecen con datos reales/)).toBeInTheDocument());
  });

  it("la asistencia sale de los escaneos, sin marca de dato de ejemplo", async () => {
    await conApi(metricas());
    // 3 de 5 entradas escaneadas. Aparece en el KPI y en la fila del evento.
    await waitFor(() => expect(screen.getAllByText("60%").length).toBeGreaterThan(0));
    // "Asistencia" también es una columna de la tabla; el KPI es el que va en un <p>.
    const kpi = screen.getByText("Asistencia", { selector: "p" }).closest("article")!;
    expect(kpi).toHaveTextContent("60%");
    // Y sin la etiqueta de "datos de ejemplo", que antes llevaba siempre.
    expect(kpi).not.toHaveTextContent(/ejemplo/i);
  });

  /** El caso de hoy: no hay API de compras, así que no hay ni un pedido. */
  it("sin ventas todavía lo dice, en vez de parecer que está roto", async () => {
    await conApi(metricas({
      ventas: { pedidos: 0, bruto: 0, neto: 0, devuelto: 0, entradas: 0, ticketMedio: 0, porCanal: [], porTipoDeEntrada: [], porDia: [] },
      aforo: { capacidad: 0, vendidas: 0, ocupacion: null },
      asistencia: { emitidas: 0, usadas: 0, porcentaje: null },
      porEvento: []
    }));
    await waitFor(() => expect(screen.getByText(/Todavía no hay ventas en entraditas.com/)).toBeInTheDocument());
  });

  it("avisa cuando la API le recorta el filtro a su propia organización", async () => {
    await conApi(metricas({
      filtros: { organizacion: "org-norte", evento: null, desde: null, hasta: null, recortadoAlPropio: true }
    }));
    await waitFor(() => expect(screen.getByText(/solo lo usa el superadmin/)).toBeInTheDocument());
  });

  it("sin sesión en la API sigue con los datos de ejemplo, y lo dice", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(false);
    pintar();

    await waitFor(() => expect(screen.getByText(/salen de los datos de ejemplo del panel/)).toBeInTheDocument());
    // Y ahí sí se pintan las secciones de ejemplo, que para eso están marcadas.
    expect(screen.getByText("Embudo de conversión")).toBeInTheDocument();
  });

  it("si la API está sirviendo desde ficheros, cae a los datos de ejemplo", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiMetrics").mockResolvedValue({ disponible: false, motivo: "sin base de datos" });
    pintar();

    await waitFor(() => expect(screen.getByText(/salen de los datos de ejemplo del panel/)).toBeInTheDocument());
  });
});
