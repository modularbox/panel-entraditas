import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useWizardStore } from "../wizard/wizardStore";
import { EventsListPage } from "./EventsListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/eventos"]}>
        <Routes>
          <Route path="/eventos" element={<EventsListPage />} />
          <Route path="/eventos/nuevo/editar" element={<p>wizard-stub</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EventsListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
    useWizardStore.setState({ eventId: null, draftRules: null });
  });

  it("shows all 13 events to a superadmin, with the create button visible", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(14)); // 1 header row + 13 data rows
    expect(screen.getByRole("button", { name: "Crear evento" })).toBeInTheDocument();
  });

  it("shows only the 1 scoped event to a suborganizador, with no create button", async () => {
    await useSessionStore.getState().login("javier.ortega@entraditas.com", "javier1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header row + 1 data row
    expect(screen.queryByRole("button", { name: "Crear evento" })).not.toBeInTheDocument();
  });

  it("sorts by Título ascending on the first header click and descending on the second", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(14));

    fireEvent.click(screen.getByRole("button", { name: "Título" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Carrera Solidaria"));

    fireEvent.click(screen.getByRole("button", { name: "Título" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Teatro en Familia"));
  });

  it("colors each event's status label with its state color", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(14));

    const jazzRow = screen.getByRole("row", { name: /Noche de Jazz/ });
    expect(within(jazzRow).getByText("Publicado")).toHaveClass("border-status-published");

    const theatreRow = screen.getByRole("row", { name: /Bernarda Alba/ });
    expect(within(theatreRow).getByText("Borrador")).toHaveClass("border-status-draft");

    // "Festival del Sur" sigue guardado como publicado, pero se celebro en julio: la lista
    // lo marca como terminado en vez de anunciar una venta que ya no existe.
    const festivalRow = screen.getByRole("row", { name: /Festival del Sur/ });
    expect(within(festivalRow).getByText("Finalizado")).toHaveClass("border-status-finished");
  });

  it("opens the questionnaire at Crear evento and carries the answers into the wizard", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(14));

    fireEvent.click(screen.getByRole("button", { name: "Crear evento" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Se permite dejar huecos de un asiento" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() => expect(screen.getByText("wizard-stub")).toBeInTheDocument());
    expect(useWizardStore.getState().draftRules).toEqual(expect.objectContaining({ allowIsolatedSeats: true }));
  });

  it("Empezar sin responder entra al asistente sin respuestas guardadas", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(14));

    fireEvent.click(screen.getByRole("button", { name: "Crear evento" }));
    fireEvent.click(screen.getByRole("button", { name: "Empezar sin responder" }));

    await waitFor(() => expect(screen.getByText("wizard-stub")).toBeInTheDocument());
    expect(useWizardStore.getState().draftRules).toBeNull();
  });
});