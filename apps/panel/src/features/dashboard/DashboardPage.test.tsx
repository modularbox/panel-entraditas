import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
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
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getByText("Ingresos brutos")).toBeInTheDocument());
    expect(screen.getByText("Ventas acumuladas")).toBeInTheDocument();
    expect(screen.getByText("Aforo por evento")).toBeInTheDocument();
    expect(screen.getByText("Origen de compradores")).toBeInTheDocument();
    expect(screen.getByText("Embudo de conversión")).toBeInTheDocument();
  });

  it("queues the selected report format", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getByRole("button", { name: "Exportar informe" })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Formato de informe"), { target: { value: "pdf" } });
    fireEvent.click(screen.getByRole("button", { name: "Exportar informe" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("PDF"));
  });
});
