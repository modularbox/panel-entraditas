import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { EventDetailPage } from "./EventDetailPage";

function renderDetail(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/eventos/${eventId}`]}>
        <Routes>
          <Route path="/eventos/:id" element={<EventDetailPage />} />
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
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-3");
    expect(await screen.findByRole("heading", { name: "La Casa de Bernarda Alba" })).toBeInTheDocument();
    expect(await screen.findByLabelText("Título")).toHaveValue("La Casa de Bernarda Alba");
  });

  it("switches to the Subeventos tab and shows its 4 functions", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-3");
    fireEvent.click(await screen.findByRole("button", { name: "Subeventos" }));

    const list = await screen.findByRole("list", { name: "Funciones" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(4));
  });

  it("switches to the Códigos de descuento tab and shows its create form", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-2"); // seeded with the EARLYBIRD discount code
    fireEvent.click(await screen.findByRole("button", { name: "Códigos de descuento" }));

    expect(await screen.findByText("EARLYBIRD")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toBeInTheDocument();
  });

  it("disables out-of-scope sections with an explanatory tooltip", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-3");
    const gatesButton = await screen.findByRole("button", { name: "Puertas" });
    expect(gatesButton).toBeDisabled();
    expect(gatesButton).toHaveAttribute("title", "Disponible en una fase posterior");
  });

  it("shows a not-found message for an out-of-scope event", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "demo1234"); // scoped to event-1 only
    renderDetail("event-3");
    expect(await screen.findByText("Evento no encontrado.")).toBeInTheDocument();
  });
});
