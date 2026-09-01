import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useWizardStore } from "./wizardStore";
import { EventWizardPage } from "./EventWizardPage";

function renderAt(path: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/eventos/:id/editar" element={<EventWizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
}

describe("EventWizardPage", () => {
  beforeEach(() => useWizardStore.setState({ eventId: null }));
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("resets to no eventId for a new event and shows the locked next steps", () => {
    renderAt("/eventos/nuevo/editar");
    expect(screen.getByTestId("wizard-event-id")).toHaveTextContent("sin-id");
    expect(screen.getByRole("region", { name: /Informaci.n del evento/ })).toBeInTheDocument();
    expect(screen.getByText(/Paso 1 de 5/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2. Varias funciones" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "3. Tipos de entrada" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "4. Plano de asientos" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "5. Publicar evento" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Plano de asientos" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("unlocks further steps and lets you navigate to them once the event is saved", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar"); // seeded with zero ticket types
    expect(screen.getByTestId("wizard-event-id")).toHaveTextContent("event-5");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 4"));

    next();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled());

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "General" } });
    fireEvent.change(screen.getByLabelText(/Precio/), { target: { value: "15.00" } });
    fireEvent.change(screen.getByLabelText("Cantidad total"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());

    next();
    expect(screen.getByRole("region", { name: "Plano de asientos" })).toBeInTheDocument();

    next();
    expect(screen.getByRole("region", { name: "Publicar evento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
  });

  it("blocks advancing past the ticket-types step until at least one ticket type exists, but still allows going back", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar"); // seeded with zero ticket types
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 4"));

    next();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByRole("region", { name: /Informaci.n del evento/ })).toBeInTheDocument();
  });

  it("includes the multiple-functions step for an event with hasSubEvents set", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-3/editar"); // seeded with hasSubEvents: true
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 5"));

    next();
    expect(screen.getByRole("region", { name: "Varias funciones" })).toBeInTheDocument();
  });

  it("excludes the multiple-functions step for a single-function event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-1/editar"); // seeded with hasSubEvents: false
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 4"));

    next();
    expect(screen.queryByRole("region", { name: "Varias funciones" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();
  });

  it("lets you go back to a previous step", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderAt("/eventos/event-5/editar");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 4"));

    next();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByRole("region", { name: /Informaci.n del evento/ })).toBeInTheDocument();
  });

  it("blocks advancing past the seating-plan step while a zone is over capacity, but still allows going back", async () => {
<<<<<<< HEAD
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = 900; // zone-pista capacity is 800
=======
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = 700; // zone-pista assigns 800 from this ticket type
>>>>>>> 1414b2fd0cecb65dc3686f8624ec85638b33e6e7
    renderAt("/eventos/event-2/editar"); // venue-1 (Sala Apolo), Pista already assigned to tt-2-pista
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 4"));

    next(); // -> Tipos de entrada
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
    next(); // -> Plano de asientos
    expect(screen.getByRole("region", { name: "Plano de asientos" })).toBeInTheDocument();

    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });
});
