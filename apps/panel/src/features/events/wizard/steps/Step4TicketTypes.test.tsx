import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step4TicketTypes } from "./Step4TicketTypes";

function renderStep(eventId: string, goNext = () => {}) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Step4TicketTypes eventId={eventId} onSaved={() => {}} goNext={goNext} />
    </QueryClientProvider>
  );
}

function fillTicketDraft(name: string, price: string, quantity = "120") {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText(/Precio/), { target: { value: price } });
  fireEvent.change(screen.getByLabelText("Cantidad total"), { target: { value: quantity } });
}

describe("Step4TicketTypes", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("lists the existing ticket types, one row per group", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-2");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  });

  it("creates an event-scoped ticket type with total quantity", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-5");
    await waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

    fillTicketDraft("General", "15.00", "120");
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(db.ticketTypes.filter((t) => t.eventId === "event-5")).toHaveLength(1);
    expect(db.ticketTypes.find((t) => t.eventId === "event-5")!.quantityTotal).toBe(120);
  });

  it("creates one row per selected sub-event but displays a single group", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-3");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));

    fillTicketDraft("VIP funciones seleccionadas", "30.00", "80");
    fireEvent.click(screen.getByLabelText("Subeventos concretos"));
    const sessionChecks = screen.getAllByRole("checkbox");
    fireEvent.click(sessionChecks[0]!);
    fireEvent.click(sessionChecks[1]!);
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    const newRows = db.ticketTypes.filter((t) => t.name === "VIP funciones seleccionadas");
    expect(newRows).toHaveLength(2);
    expect(newRows[0]!.groupId).toBe(newRows[1]!.groupId);
    expect(newRows[0]!.quantityTotal).toBe(80);
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
    renderStep("event-5");
    await waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

    fillTicketDraft("General", "15.00", "120");
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo crear el tipo de entrada"));
    expect(db.ticketTypes.filter((t) => t.eventId === "event-5")).toHaveLength(0);
    expect(screen.getByLabelText("Nombre")).toHaveValue("General");
    expect(screen.getByLabelText("Cantidad total")).toHaveValue(120);
  });

  it("blocks continuing when a ticket type draft is not saved yet", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const goNext = vi.fn();
    renderStep("event-5", goNext);
    await waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "General" } });
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("tipo de entrada sin guardar");
    expect(goNext).not.toHaveBeenCalled();
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
