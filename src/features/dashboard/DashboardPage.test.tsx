import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { DashboardPage } from "./DashboardPage";

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><DashboardPage /></MemoryRouter></QueryClientProvider>);
}

describe("DashboardPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("renders KPIs and every specified visualization for an admin", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
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
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar informe" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Formato de informe"), { target: { value: "pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar informe" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PDF"));
  });

  it("generates an openable PDF containing the test data", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
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
    expect(result.content).toContain("1.027.600,00\\200");
  });
});
