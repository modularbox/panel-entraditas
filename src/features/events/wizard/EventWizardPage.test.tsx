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

/**
 * Los pasos de un evento de una sola sesion, en orden.
 *
 * Sin "Invitados": Jorge retiro esa funcion entera del panel el 11/09 y Axel la dio por retirada
 * el 12/09. Si vuelve, vuelve entre "Puertas" y "Publicar evento".
 */
const PASOS_SESION_UNICA = [
  "Informacion del evento",
  "Tipos de entrada",
  "Asientos",
  "Codigos de descuento",
  "Puertas",
  "Publicar evento"
];

describe("EventWizardPage", () => {
  beforeEach(() => {
    useWizardStore.setState({ eventId: null });
  });
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("crear un evento entra directo al paso 1, sin cuestionario previo", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/nuevo/editar");

    expect(screen.getByTestId("wizard-event-id")).toHaveTextContent("sin-id");
    expect(screen.queryByRole("heading", { name: "Antes de crear el evento" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Informaci.n del evento/ })).toBeInTheDocument();
    expect(screen.getByText(/Paso 1 de 6/)).toBeInTheDocument();
  });

  it("recupera los pasos de descuentos y puertas, en su orden", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/nuevo/editar");

    const pasos = screen.getAllByRole("button").filter((b) => /^\d+\./.test(b.textContent ?? ""));
    expect(pasos.map((b) => b.textContent?.replace(/^\d+\.\s*/, ""))).toEqual(PASOS_SESION_UNICA);
  });

  // Dentro del asistente ya no se pregunta nada: las preguntas se hacen antes, al crear el evento
  // (CreateEventDialog). Lo que queda en los pasos son ajustes con su nombre, no preguntas.
  it("el paso 1 termina con el ajuste de sesiones, y ningun ajuste esta escrito como pregunta", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/nuevo/editar");

    const sesiones = screen.getByRole("group", { name: "Sesiones" });
    expect(sesiones).toBeInTheDocument();
    // Al final: despues de el en el formulario solo queda el boton de guardar.
    const guardar = screen.getByRole("button", { name: "Guardar y continuar" });
    expect(sesiones.compareDocumentPosition(guardar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.queryByRole("group", { name: /^¿/ })).not.toBeInTheDocument();
  });

  it("los pasos siguientes estan bloqueados hasta guardar el evento", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/nuevo/editar");

    expect(screen.getByRole("button", { name: "2. Tipos de entrada" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "4. Codigos de descuento" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "6. Publicar evento" })).toBeDisabled();
  });

  // Los limites de compra y los asientos sueltos ya no se ajustan dentro de los pasos: los
  // pregunta el cuestionario previo, que tiene sus propias pruebas en CreateEventDialog.test.tsx.
  it("el paso de tipos de entrada no repite los ajustes del cuestionario previo", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 6"));

    next();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Máximo por pedido")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Máximo por cliente")).not.toBeInTheDocument();
  });

it("los pasos 4, 5 y 6 son descuentos, puertas y publicar", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 6"));

    fireEvent.click(screen.getByRole("button", { name: "4. Codigos de descuento" }));
    expect(screen.getByRole("region", { name: "Codigos de descuento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5. Puertas" }));
    expect(screen.getByRole("region", { name: "Puertas" })).toBeInTheDocument();
fireEvent.click(screen.getByRole("button", { name: "6. Publicar evento" }));
    expect(screen.getByRole("region", { name: "Publicar evento" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Invitados/ })).not.toBeInTheDocument();
  });

  it("blocks advancing past the ticket-types step until at least one ticket type exists, but still allows going back", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar"); // seeded with zero ticket types
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 6"));

    next();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    expect(screen.getByRole("region", { name: /Informaci.n del evento/ })).toBeInTheDocument();
  });

  it("includes the multiple-sessions step for an event with hasSubEvents set", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-3/editar"); // seeded with hasSubEvents: true
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    next();
    expect(screen.getByRole("region", { name: "Sesiones" })).toBeInTheDocument();
  });

  it("excludes the multiple-sessions step for a single-session event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-1/editar"); // seeded with hasSubEvents: false
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 6"));

    next();
    expect(screen.queryByRole("region", { name: "Sesiones" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();
  });

  it("blocks advancing past the seating step while a zone is over capacity, but still allows going back", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = 700; // zone-pista assigns 800 from this ticket type
    renderAt("/eventos/event-2/editar"); // venue-1 (Sala Apolo), Pista already assigned to tt-2-pista
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 6"));

    next(); // -> Tipos de entrada
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
    next(); // -> Asientos
    expect(screen.getByRole("region", { name: "Asientos" })).toBeInTheDocument();

    await screen.findByText(/supera|excede|capacidad/i);
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });
});
