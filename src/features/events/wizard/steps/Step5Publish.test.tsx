import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, demoPasswordFor, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step5Publish } from "./Step5Publish";

function renderStep(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/eventos/${eventId}/editar`]}>
        <Routes>
          <Route
            path="/eventos/:id/editar"
            element={<Step5Publish eventId={eventId} onSaved={() => {}} goNext={() => {}} />}
          />
          <Route path="/eventos" element={<div>Panel de eventos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Step5Publish", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

<<<<<<< HEAD
  it("disables Publicar with zero ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
=======
  it("disables review submission and shows a failing checklist item with zero ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
>>>>>>> 1414b2fd0cecb65dc3686f8624ec85638b33e6e7
    renderStep("event-5");
    await waitFor(() => expect(screen.getByText(/Tipos de entrada/)).toHaveTextContent("Pendiente"));
    expect(screen.getByText(/Falta crear al menos un tipo de entrada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar a revision" })).toBeDisabled();
  });

<<<<<<< HEAD
  it("publishes an event that already has a ticket type, then navigates to its detail page", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderStep("event-3"); // seeded with tt-3
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar evento" })).toBeEnabled());
=======
  it("shows which basic template fields are missing before review", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    db.events.find((event) => event.id === "event-5")!.description = "";
    db.events.find((event) => event.id === "event-5")!.location = "";
    db.events.find((event) => event.id === "event-5")!.locality = "";
>>>>>>> 1414b2fd0cecb65dc3686f8624ec85638b33e6e7

    renderStep("event-5");

    await waitFor(() => expect(screen.getByText(/Datos principales de la plantilla/)).toHaveTextContent("Pendiente"));
    await waitFor(() => expect(screen.getByText(/Falta: descripcion, ubicacion, localidad/)).toBeInTheDocument());
  });

  it("sends an event that already has a ticket type to review, then navigates to the events panel", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    db.events.find((event) => event.id === "event-3")!.location = "Teatro Principal";
    db.events.find((event) => event.id === "event-3")!.locality = "Alicante";
    renderStep("event-3");
    await waitFor(() => expect(screen.getByText(/Tipos de entrada/)).toHaveTextContent("OK"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar a revision" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Enviar a revision" }));

    await waitFor(() => expect(screen.getByText("Panel de eventos")).toBeInTheDocument());
    expect(db.events.find((e) => e.id === "event-3")!.status).toBe("pending_review");
  });
});
