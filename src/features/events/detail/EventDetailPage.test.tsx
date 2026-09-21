import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { EventDetailPage } from "./EventDetailPage";

function renderDetail(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/eventos/${eventId}`]}>
        <Routes>
          <Route path="/eventos/:id" element={<EventDetailPage />} />
          <Route path="/eventos" element={<div>Listado de eventos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EventDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the event title and the pre-filled Información general tab by default", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("event-3");
    expect(await screen.findByRole("heading", { name: "La Casa de Bernarda Alba" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Título")).toHaveValue("La Casa de Bernarda Alba");
  });

  it("switches to the Sesiones tab and shows its 4 sessions", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("event-3");
    fireEvent.click(await screen.findByRole("button", { name: "Sesiones" }));

    const list = await screen.findByRole("list", { name: "Sesiones" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(4));
  });

  it("switches to the Códigos de descuento tab and shows its create form", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("event-2"); // seeded with the EARLYBIRD discount code
    fireEvent.click(await screen.findByRole("button", { name: "Códigos de descuento" }));

    expect(await screen.findByText("EARLYBIRD")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toBeInTheDocument();
  });

  it("switches to the Puertas tab and shows its already-created gate", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("event-2"); // seeded with the Puerta Norte gate
    fireEvent.click(await screen.findByRole("button", { name: "Puertas" }));

    expect(await screen.findByText("Puerta Norte — NORTE")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toBeInTheDocument();
  });

  it("disables out-of-scope sections with an explanatory tooltip", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("event-3");
    const pedidosButton = await screen.findByRole("button", { name: "Pedidos" });
    expect(pedidosButton).toBeDisabled();
    expect(pedidosButton).toHaveAttribute("title", "Disponible en una fase posterior");
  });

  it("shows a not-found message for an out-of-scope event", async () => {
    await useSessionStore.getState().login("javier.ortega@entraditas.com", "javier1234"); // scoped to event-1 only
    renderDetail("event-3");
    expect(await screen.findByText("Evento no encontrado.")).toBeInTheDocument();
  });

  it("lets a web-retired event (back to draft) be sent to review again from the detail view", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const token = useSessionStore.getState().token!;
    await apiClient.post("/events/event-2/unpublish", undefined, { token }); // retirar de la web -> draft
    const event = db.events.find((e) => e.id === "event-2")!;
    event.location = "Rock Arena";
    event.locality = "Madrid";

    renderDetail("event-2");
    fireEvent.click(await screen.findByRole("button", { name: "Publicar" }));

    const requestReview = await screen.findByRole("button", { name: "Enviar a revision" });
    await waitFor(() => expect(requestReview).toBeEnabled());
    fireEvent.click(requestReview);

    await waitFor(() => expect(db.events.find((e) => e.id === "event-2")!.status).toBe("in_review"));
  });

  it("does not show the Publicar tab for an event that is not back in draft or rejected", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("event-2"); // published, never retired
    expect(await screen.findByLabelText("Título")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publicar" })).not.toBeInTheDocument();
  });
});
