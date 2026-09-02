import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb, db } from "@/mocks/state";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { DashboardPage } from "./DashboardPage";

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);
}

function kpiArticle(label: string): HTMLElement {
  const article = screen.getAllByText(label).map((el) => el.closest("article")).find((node): node is HTMLElement => node !== null);
  if (!article) throw new Error(`KPI "${label}" no encontrado`);
  return article;
}

function sectionByTitle(title: string): HTMLElement {
  const section = screen.getAllByText(title).map((el) => el.closest("section")).find((node): node is HTMLElement => node !== null);
  if (!section) throw new Error(`Sección "${title}" no encontrada`);
  return section;
}

describe("DashboardPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("scopes the general overview to each user's access: superadmin sees everything", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(within(kpiArticle("Ingresos brutos")).getByText(/765,00/)).toBeInTheDocument();
    expect(within(kpiArticle("Entradas vendidas")).getByText("18")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Festival del Sur")).toBeInTheDocument();
    expect(within(table).getByText("La Casa de Bernarda Alba")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("scopes the general overview to an admin: only their organization's events", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(within(kpiArticle("Ingresos brutos")).getByText(/405,00/)).toBeInTheDocument();
    expect(within(kpiArticle("Entradas vendidas")).getByText("13")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("La Casa de Bernarda Alba")).toBeInTheDocument();
    expect(screen.queryByText("Festival del Sur")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(5);
  });

  it("scopes the general overview to a scoped user: only their assigned events", async () => {
    await useSessionStore.getState().login("usuario@entraditas.com", "usuario1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(within(kpiArticle("Ingresos brutos")).getByText(/405,00/)).toBeInTheDocument();
    expect(screen.getAllByText("Noche de Jazz").length).toBeGreaterThan(0);
    expect(screen.queryByText("La Casa de Bernarda Alba")).not.toBeInTheDocument();
    expect(screen.queryByText("Festival del Sur")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("matches the saved counters and refunds in the database for a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    const number = new Intl.NumberFormat("es-ES");
    const currencyDigits = (cents: number) =>
      new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/[\s\u00A0€]/g, "");
    const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const savedTickets = db.ticketTypes.reduce((sum, ticketType) => sum + ticketType.quantitySold, 0);
    const savedRefunds = db.orders.reduce((sum, order) => sum + order.refundedAmount, 0);
    const savedGross = db.orders.filter((order) => order.status === "paid" || order.status === "partially_refunded").reduce((sum, order) => sum + order.total, 0);
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(within(kpiArticle("Entradas vendidas")).getByText(number.format(savedTickets))).toBeInTheDocument();
    expect(within(kpiArticle("Reembolsos")).getByText(new RegExp(escapeRegex(currencyDigits(savedRefunds))))).toBeInTheDocument();
    expect(within(kpiArticle("Ingresos brutos")).getByText(new RegExp(escapeRegex(currencyDigits(savedGross))))).toBeInTheDocument();
  });

  it("renders KPIs and every specified visualization for an admin", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(screen.getByText("Ventas acumuladas")).toBeInTheDocument();
    expect(screen.getByText("Aforo por evento")).toBeInTheDocument();
    expect(screen.getByText("Detalle por evento")).toBeInTheDocument();
    expect(screen.getAllByText("Noche de Jazz").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Ingresos netos").length).toBeGreaterThan(1);
    expect(screen.getByText("Origen de compradores")).toBeInTheDocument();
    expect(screen.getByText("Embudo de conversión")).toBeInTheDocument();
  });

  it("marks conversion, attendance, buyer-origin and funnel as sample data (no real analytics/scan data exists)", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(within(kpiArticle("Conversión")).getByText("Datos de ejemplo")).toBeInTheDocument();
    expect(within(kpiArticle("Asistencia")).getByText("Datos de ejemplo")).toBeInTheDocument();
    expect(within(sectionByTitle("Origen de compradores")).getByText("Datos de ejemplo")).toBeInTheDocument();
    expect(within(sectionByTitle("Embudo de conversión")).getByText("Datos de ejemplo")).toBeInTheDocument();
    // Real, derived-from-orders metrics must never carry the disclaimer.
    expect(within(kpiArticle("Ingresos brutos")).queryByText("Datos de ejemplo")).not.toBeInTheDocument();
    expect(within(sectionByTitle("Aforo por evento")).queryByText("Datos de ejemplo")).not.toBeInTheDocument();
  });

  it("links each row of the event-detail table to that event's page", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    const link = within(screen.getByRole("table")).getByRole("link", { name: /Noche de Jazz/ });
    expect(link).toHaveAttribute("href", "/eventos/event-1");
  });

  it("shows an empty-state message where an event has no orders or capacity pools, instead of a blank chart", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Evento"), { target: { value: "event-5" } }); // "Evento sin configurar": no orders, no capacity pools
    // "Evento sin configurar" is in the table either way (filtered or not) — wait on another event
    // disappearing instead, which only happens once the event-5-only fetch has actually landed.
    await waitFor(() => expect(within(screen.getByRole("table")).queryByText("Noche de Jazz")).not.toBeInTheDocument());

    expect(within(sectionByTitle("Ventas por tipo")).getByText("No hay datos para estos filtros.")).toBeInTheDocument();
    expect(within(sectionByTitle("Canales de venta")).getByText("No hay datos para estos filtros.")).toBeInTheDocument();
    expect(within(sectionByTitle("Aforo por evento")).getByText("No hay datos para estos filtros.")).toBeInTheDocument();
  });

  it("queues the selected report format", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar informe" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Formato de informe"), { target: { value: "pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar informe" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PDF"));
  });

  it("shows the organization filter only to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(screen.getByLabelText("Organización")).toBeInTheDocument();
  });

  it("hides the organization filter from a non-superadmin", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(screen.queryByLabelText("Organización")).not.toBeInTheDocument();
  });

  it("narrows the dashboard to the selected organization", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Organización"), { target: { value: "org-2" } });
    // Wait on Rock en Directo disappearing (org-1) rather than Festival del Sur appearing (org-2):
    // the latter is already visible in the superadmin's unfiltered view, so it wouldn't prove the
    // filtered fetch — kept on screen via placeholderData while it loads — has actually landed.
    await waitFor(() => expect(within(screen.getByRole("table")).queryByText("Rock en Directo")).not.toBeInTheDocument());
    expect(within(screen.getByRole("table")).getByText("Festival del Sur")).toBeInTheDocument();
    expect(within(kpiArticle("Ingresos brutos")).getByText(/360,00/)).toBeInTheDocument();
  });

  it("limits the event filter options to the selected organization", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Organización"), { target: { value: "org-2" } });
    await waitFor(() => expect(within(screen.getByRole("table")).queryByText("Rock en Directo")).not.toBeInTheDocument());
    const eventSelect = screen.getByLabelText("Evento") as HTMLSelectElement;
    expect(Array.from(eventSelect.options).map((option) => option.textContent)).toEqual(["Todos los eventos", "Festival del Sur"]);
  });

  it("narrows the dashboard to the selected event", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Evento"), { target: { value: "event-2" } });
    await waitFor(() => expect(within(kpiArticle("Ingresos brutos")).getByText(/280,00/)).toBeInTheDocument());
    expect(within(screen.getByRole("table")).queryByText("Festival del Sur")).not.toBeInTheDocument();
  });

  it("narrows the dashboard to a custom date range", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-08-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-08-06" } });
    await waitFor(() => expect(within(kpiArticle("Ingresos brutos")).getByText(/50,00/)).toBeInTheDocument());
  });

  it("clears every filter with the reset button", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Organización"), { target: { value: "org-2" } });
    await waitFor(() => expect(screen.queryByText("Rock en Directo")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Limpiar filtros" }));
    await waitFor(() => expect(within(screen.getByRole("table")).getByText("Rock en Directo")).toBeInTheDocument());
    expect(screen.getByLabelText("Organización")).toHaveValue("");
  });

  it("marks the 'Todo' date-range preset as active by default", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(screen.getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "30 días" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps the clicked date-range preset marked as active", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.click(screen.getByRole("button", { name: "30 días" }));
    expect(screen.getByRole("button", { name: "30 días" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "false");
  });

  it("clears the active preset once a date is entered manually", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-08-01" } });
    expect(screen.getByRole("button", { name: "Todo" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "30 días" })).toHaveAttribute("aria-pressed", "false");
  });

  it("generates an openable PDF containing the test data", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const result = await apiClient.post<{ content: string; mimeType: string; filename: string }>(
      "/reports/export", { report: "dashboard", format: "pdf" }, { token: useSessionStore.getState().token! }
    );
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filename).toBe("entraditas-dashboard.pdf");
    expect(result.content).toContain("%PDF-1.4");
    expect(result.content).toContain("%%EOF");
    expect(result.content).toContain("ENTRADITAS / INFORME DASHBOARD");
    expect(result.content).toContain("Datos de prueba");
    expect(result.content).toContain("Detalle de eventos");
    expect(result.content).toContain("Noche de Jazz");
    expect(result.content).toContain("Publicado");
    expect(result.content).toContain("10/10/2026");
    expect(result.content).toContain("405,00");
  });
});
