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

  it("shows the event title and the pre-filled Informacion general tab by default", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-3");
    expect(await screen.findByRole("heading", { name: "La Casa de Bernarda Alba" })).toBeInTheDocument();
    expect(await screen.findByDisplayValue("La Casa de Bernarda Alba")).toBeInTheDocument();
  });

  it("switches to the Subeventos tab and shows its 4 functions", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-3");
    fireEvent.click(await screen.findByRole("button", { name: "Subeventos" }));

    const list = await screen.findByRole("list", { name: "Funciones" });
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(4));
  });

  it("shows discount codes as an editable section and keeps the later modules visible", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-3");
    fireEvent.click(await screen.findByRole("button", { name: "Codigos de descuento" }));
    expect(await screen.findByRole("heading", { name: "Nuevo descuento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Puertas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invitados" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pedidos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Metricas" })).toBeInTheDocument();
  });

  it("shows a not-found message for an out-of-scope event", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "demo1234");
    renderDetail("event-3");
    expect(await screen.findByText("Evento no encontrado.")).toBeInTheDocument();
  });
});
