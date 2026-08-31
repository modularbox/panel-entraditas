import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
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

describe("EventWizardPage", () => {
  beforeEach(() => useWizardStore.setState({ eventId: null, currentStep: 1 }));

  it("resets to step 1 with no eventId for a new event", () => {
    renderAt("/eventos/nuevo/editar");
    expect(screen.getByTestId("wizard-event-id")).toHaveTextContent("sin-id");
    expect(screen.getByRole("region", { name: "Datos básicos" })).toBeInTheDocument();
  });

  it("sets the eventId from the URL when resuming an existing draft", () => {
    renderAt("/eventos/event-5/editar");
    expect(screen.getByTestId("wizard-event-id")).toHaveTextContent("event-5");
  });

  it("navigates with the new ticket-types-before-plan order", () => {
    renderAt("/eventos/nuevo/editar");
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "3. Tipos de entrada" }));
    expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(screen.getByRole("region", { name: "Plano y zonas" })).toBeInTheDocument();
  });
});
