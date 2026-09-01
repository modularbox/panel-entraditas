import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { GatesOverviewPage } from "./GatesOverviewPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GatesOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("GatesOverviewPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows both gates, each with its event, zone, status and operators, to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3)); // header + 2 gates

    expect(screen.getByText("Puerta Norte — NORTE")).toBeInTheDocument();
    expect(screen.getByText("Rock en Directo")).toBeInTheDocument();
    expect(screen.getByText("Pista")).toBeInTheDocument();
    expect(screen.getByText("Personal de puerta")).toBeInTheDocument();

    expect(screen.getByText("Entrada Principal — ENTRADA")).toBeInTheDocument();
    expect(screen.getByText("Festival del Sur")).toBeInTheDocument();
    expect(screen.getByText("Sin zona")).toBeInTheDocument();
    expect(screen.getByText("Sin operadores asignados")).toBeInTheDocument();
  });

  it("shows only the admin's own organization's gate", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header + 1 gate

    expect(screen.getByText("Puerta Norte — NORTE")).toBeInTheDocument();
    expect(screen.queryByText("Entrada Principal — ENTRADA")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when no gate is visible", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "subusuario1234"); // scoped to event-1 only
    renderPage();
    expect(await screen.findByText("No hay puertas creadas todavía.")).toBeInTheDocument();
  });
});
