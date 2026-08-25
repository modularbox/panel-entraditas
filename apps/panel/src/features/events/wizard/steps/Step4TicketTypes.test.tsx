import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step4TicketTypes } from "./Step4TicketTypes";

function renderStep(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Step4TicketTypes eventId={eventId} onSaved={() => {}} goNext={() => {}} />
    </QueryClientProvider>
  );
}

describe("Step4TicketTypes", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("lists the existing ticket types, one row per group", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-2"); // seeded with 2 groups: tt-2-pista, tt-2-grada
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  });

  it("creates an event-scoped ticket type", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-5"); // seeded with zero ticket types
    await waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "General" } });
    fireEvent.change(screen.getByLabelText("Precio (€)"), { target: { value: "15.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(db.ticketTypes.filter((t) => t.eventId === "event-5")).toHaveLength(1);
  });

  it("creates one row per selected sub-event but displays a single group", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-3"); // has sub-event-3-0..3 and one pre-existing event-scoped ticket type (tt-3)
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "VIP funciones seleccionadas" } });
    fireEvent.change(screen.getByLabelText("Precio (€)"), { target: { value: "30.00" } });
    fireEvent.click(screen.getByLabelText("Subeventos concretos"));
    fireEvent.click(screen.getByLabelText("Sábado 1"));
    fireEvent.click(screen.getByLabelText("Sábado 2"));
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2)); // tt-3 + the new group
    const newRows = db.ticketTypes.filter((t) => t.name === "VIP funciones seleccionadas");
    expect(newRows).toHaveLength(2);
    expect(newRows[0]!.groupId).toBe(newRows[1]!.groupId);
  });

  it("reorders groups using the Subir/Bajar buttons", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-2");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));

    fireEvent.click(screen.getAllByRole("button", { name: "Bajar" })[0]!);

    await waitFor(() => {
      const pista = db.ticketTypes.find((t) => t.id === "tt-2-pista")!;
      const grada = db.ticketTypes.find((t) => t.id === "tt-2-grada")!;
      expect(pista.sortOrder).toBe(1);
      expect(grada.sortOrder).toBe(0);
    });
  });

  it("shows an error and keeps the form filled when the server rejects creating a ticket type", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    server.use(
      http.post("http://localhost:4000/api/v1/events/:eventId/ticket-types", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudo crear el tipo de entrada", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    renderStep("event-5"); // seeded with zero ticket types
    await waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "General" } });
    fireEvent.change(screen.getByLabelText("Precio (€)"), { target: { value: "15.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo crear el tipo de entrada"));
    expect(db.ticketTypes.filter((t) => t.eventId === "event-5")).toHaveLength(0);
    expect(screen.getByLabelText("Nombre")).toHaveValue("General");
  });

  it("shows an error and leaves sortOrder unchanged when the server rejects reordering", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    server.use(
      http.post("http://localhost:4000/api/v1/ticket-types/reorder", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudo reordenar", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    renderStep("event-2");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));

    fireEvent.click(screen.getAllByRole("button", { name: "Bajar" })[0]!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo reordenar"));
    const pista = db.ticketTypes.find((t) => t.id === "tt-2-pista")!;
    const grada = db.ticketTypes.find((t) => t.id === "tt-2-grada")!;
    expect(pista.sortOrder).toBe(0);
    expect(grada.sortOrder).toBe(1);
  });
});
