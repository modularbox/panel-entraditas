import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, demoPasswordFor, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { buildSeatGrid, type SeatRowSpec } from "./seatMap";
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
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    renderStep("event-5");
    await waitFor(() => expect(screen.getByText(/Tipos de entrada/)).toHaveTextContent("Pendiente"));
    expect(screen.getByText(/Falta crear al menos un tipo de entrada/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar a revision" })).toBeDisabled();
  });

  it("shows which basic template fields are missing before review", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    db.events.find((event) => event.id === "event-5")!.description = "";
    db.events.find((event) => event.id === "event-5")!.location = "";
    db.events.find((event) => event.id === "event-5")!.locality = "";

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
    expect(db.events.find((e) => e.id === "event-3")!.status).toBe("in_review");
  });

  it("accepts a numbered zone whose seats carry a per-seat ticket type", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    db.events.find((event) => event.id === "event-3")!.location = "Teatro Principal";
    db.events.find((event) => event.id === "event-3")!.locality = "Alicante";

    const seatRows: SeatRowSpec[] = Array.from({ length: 10 }, () => ({ slots: 10 }));
    const zone = {
      id: "zone-obra",
      venueId: "venue-2",
      name: "Butacas",
      kind: "numbered" as const,
      capacity: 100,
      seatRows,
      x: 10,
      y: 20,
      width: 40,
      height: 60
    };
    db.zones.push(zone);
    const seats = buildSeatGrid(zone);
    db.capacityPools.push({
      id: "pool-3-test",
      subEventId: "sub-event-3-0",
      zoneId: zone.id,
      name: "Butacas",
      totalCapacity: 100,
      soldCount: 0,
      heldCount: 0,
      seatAssignments: seats.map((seat) => ({ seatId: seat.id, ticketTypeGroupId: "tt-3" }))
    });

    renderStep("event-3");

    await waitFor(() => expect(screen.getByText(/Zonas asignadas correctamente/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Enviar a revision" })).toBeEnabled();
  });
});
