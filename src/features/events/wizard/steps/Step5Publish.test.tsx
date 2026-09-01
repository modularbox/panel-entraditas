import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
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
            element={<Step5Publish eventId={eventId} onSaved={() => {}} />}
          />
          <Route path="/eventos/:id" element={<div>Detalle del evento</div>} />
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

  it("disables Publicar with zero ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderStep("event-5");
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar evento" })).toBeDisabled());
  });

  it("publishes an event that already has a ticket type, then navigates to its detail page", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderStep("event-3"); // seeded with tt-3
    await waitFor(() => expect(screen.getByRole("button", { name: "Publicar evento" })).toBeEnabled());

    fireEvent.click(screen.getByRole("button", { name: "Publicar evento" }));

    await waitFor(() => expect(screen.getByText("Detalle del evento")).toBeInTheDocument());
    expect(db.events.find((e) => e.id === "event-3")!.status).toBe("published");
  });
});
