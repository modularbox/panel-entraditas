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

/** Los pasos de un evento de una sola sesion, en orden. */
const PASOS_SESION_UNICA = [
  "Informacion del evento",
  "Tipos de entrada",
  "Asientos",
  "Codigos de descuento",
  "Puertas",
  "Invitados",
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
    expect(screen.getByText(/Paso 1 de 7/)).toBeInTheDocument();
  });

  it("recupera los pasos de descuentos, puertas e invitados, en su orden", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/nuevo/editar");

    const pasos = screen.getAllByRole("button").filter((b) => /^\d+\./.test(b.textContent ?? ""));
    expect(pasos.map((b) => b.textContent?.replace(/^\d+\.\s*/, ""))).toEqual(PASOS_SESION_UNICA);
  });

  it("el paso 1 termina con la pregunta de sesiones y ya no pregunta por plano, limites ni descuentos", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/nuevo/editar");

    const sesiones = screen.getByRole("group", { name: "¿Tendrá varias sesiones, pases o fechas?" });
    expect(sesiones).toBeInTheDocument();
    // Al final: despues de ella en el formulario solo queda el boton de guardar.
    const guardar = screen.getByRole("button", { name: "Guardar y continuar" });
    expect(sesiones.compareDocumentPosition(guardar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(screen.queryByRole("group", { name: "¿Necesita un plano de asientos?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "¿Cuántas entradas se pueden comprar?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "¿Se permiten asientos sueltos en una fila?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "¿Habrá códigos de descuento?" })).not.toBeInTheDocument();
  });

  it("los pasos siguientes estan bloqueados hasta guardar el evento", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/nuevo/editar");

    expect(screen.getByRole("button", { name: "2. Tipos de entrada" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "4. Codigos de descuento" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "7. Publicar evento" })).toBeDisabled();
  });

  it("el paso 2 empieza por los limites de compra", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    next();
    const region = screen.getByRole("region", { name: "Tipos de entrada" });
    const limites = await screen.findByRole("group", { name: "¿Cuántas entradas se pueden comprar?" });
    expect(region).toContainElement(limites);
    expect(screen.getByLabelText("Máximo por pedido")).toBeInTheDocument();
    expect(screen.getByLabelText("Máximo por cliente")).toBeInTheDocument();
  });

  it("los limites de compra se guardan en las reglas del evento, que es lo que se publica", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    next();
    const porPedido = await screen.findByLabelText("Máximo por pedido");
    fireEvent.change(porPedido, { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText("Máximo por cliente"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar límites" }));

    await waitFor(() => {
      const evento = db.events.find((e) => e.id === "event-5")!;
      expect(evento.rules?.maxPerOrder).toBe(4);
      expect(evento.rules?.maxPerCustomer).toBe(8);
    });
  });

  it("no deja guardar un tope por cliente menor que el de pedido", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    next();
    fireEvent.change(await screen.findByLabelText("Máximo por pedido"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("Máximo por cliente"), { target: { value: "2" } });

    expect(screen.getByText(/nadie podría hacer un pedido completo/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar límites" })).toBeDisabled();
  });

  it("el paso 3 (asientos) pregunta por los asientos sueltos y lo guarda en las reglas", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-2/editar"); // ya tiene tipos de entrada, asi que se puede avanzar
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    next(); // -> Tipos de entrada
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
    next(); // -> Asientos

    const region = screen.getByRole("region", { name: "Asientos" });
    const pregunta = await screen.findByRole("group", { name: "¿Se permiten asientos sueltos en una fila?" });
    expect(region).toContainElement(pregunta);

    fireEvent.click(screen.getByRole("button", { name: "Sí, se permiten" }));
    await waitFor(() => expect(db.events.find((e) => e.id === "event-2")!.rules?.allowIsolatedSeats).toBe(true));
  });

  it("los pasos 4, 5 y 6 son descuentos, puertas e invitados", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar");
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    fireEvent.click(screen.getByRole("button", { name: "4. Codigos de descuento" }));
    expect(screen.getByRole("region", { name: "Codigos de descuento" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "5. Puertas" }));
    expect(screen.getByRole("region", { name: "Puertas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "6. Invitados" }));
    expect(screen.getByRole("region", { name: "Invitados" })).toBeInTheDocument();
  });

  it("blocks advancing past the ticket-types step until at least one ticket type exists, but still allows going back", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-5/editar"); // seeded with zero ticket types
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

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
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 8"));

    next();
    expect(screen.getByRole("region", { name: "Varias funciones" })).toBeInTheDocument();
  });

  it("excludes the multiple-functions step for a single-function event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderAt("/eventos/event-1/editar"); // seeded with hasSubEvents: false
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    next();
    expect(screen.queryByRole("region", { name: "Varias funciones" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();
  });

  it("blocks advancing past the seating step while a zone is over capacity, but still allows going back", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = 700; // zone-pista assigns 800 from this ticket type
    renderAt("/eventos/event-2/editar"); // venue-1 (Sala Apolo), Pista already assigned to tt-2-pista
    await waitFor(() => expect(screen.getByText(/Paso 1 de \d/)).toHaveTextContent("Paso 1 de 7"));

    next(); // -> Tipos de entrada
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeEnabled());
    next(); // -> Asientos
    expect(screen.getByRole("region", { name: "Asientos" })).toBeInTheDocument();

    await screen.findByText(/supera|excede|capacidad/i);
    await waitFor(() => expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "Anterior" })).toBeEnabled();
  });
});
