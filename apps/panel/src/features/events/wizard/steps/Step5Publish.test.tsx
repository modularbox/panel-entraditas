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

  it("disables review submission and shows a failing checklist item with zero ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-5");
    await waitFor(() => expect(screen.getByText(/Al menos un tipo de entrada/)).toHaveTextContent("Pendiente"));
    expect(screen.getByRole("button", { name: "Enviar a revision" })).toBeDisabled();
  });

  it("sends an event that already has a ticket type to review, then navigates to the events panel", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-3");
    await waitFor(() => expect(screen.getByText(/Al menos un tipo de entrada/)).toHaveTextContent("OK"));

    fireEvent.click(screen.getByRole("button", { name: "Enviar a revision" }));

    await waitFor(() => expect(screen.getByText("Panel de eventos")).toBeInTheDocument());
    expect(db.events.find((e) => e.id === "event-3")!.status).toBe("pending_review");
  });
});
