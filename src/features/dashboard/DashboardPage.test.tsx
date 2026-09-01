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
    expect(screen.getByText("Festival del Sur")).toBeInTheDocument();
    expect(screen.getByText("La Casa de Bernarda Alba")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(6);
  });

  it("scopes the general overview to an admin: only their organization's events", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByText("Ingresos brutos").length).toBeGreaterThan(1));
    expect(within(kpiArticle("Ingresos brutos")).getByText(/405,00/)).toBeInTheDocument();
    expect(within(kpiArticle("Entradas vendidas")).getByText("13")).toBeInTheDocument();
    expect(screen.getByText("La Casa de Bernarda Alba")).toBeInTheDocument();
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
      new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100).replace(/[\s\u00A0€â‚¬]/g, "");
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

  it("queues the selected report format", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar informe" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Formato de informe"), { target: { value: "pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar informe" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PDF"));
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
