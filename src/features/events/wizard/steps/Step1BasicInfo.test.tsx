import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step1BasicInfo, type Step1BasicInfoProps } from "./Step1BasicInfo";

function renderStep1(props: Step1BasicInfoProps) {
  const queryClient = new QueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Step1BasicInfo {...props} />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Concierto de prueba" } });
  fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Una descripción válida" } });
  fireEvent.change(screen.getByLabelText("Ciudad"), { target: { value: "Madrid" } });
  fireEvent.change(screen.getByLabelText("Recinto"), { target: { value: "Sala Apolo" } });
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-12-10" } });
  fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "21:00" } });
}

describe("Step1BasicInfo", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a validation error when the title is too short", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("al menos 3 caracteres"));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("creates a draft event on first submit", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.any(String)));
  });

  it("saves city, venue, date, time and the competition flag on the created event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.click(screen.getByLabelText(/Es una competición/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.any(String)));
    const created = db.events.find((e) => e.id === onSaved.mock.calls[0]![0])!;
    expect(created.venueId).toBe("venue-1"); // reutiliza "Sala Apolo" / Madrid ya sembrado
    expect(created.isCompetition).toBe(true);
    const firstSubEvent = db.subEvents.find((s) => s.eventId === created.id)!;
    expect(firstSubEvent.startsAt).toBe("2026-12-10T21:00:00.000Z");
  });

  it("patches the existing draft when eventId is already set", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    const onSaved = vi.fn();
    renderStep1({ eventId: "event-5", onSaved });

    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveValue("Evento sin configurar"));
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("event-5"));
  });

  it("pre-fills the form from the existing event, its venue and its first sub-event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderStep1({ eventId: "event-3", onSaved: vi.fn() });

    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveValue("La Casa de Bernarda Alba"));
    expect(screen.getByLabelText("Descripción")).toHaveValue("Obra de teatro con funciones semanales.");
    expect(screen.getByLabelText("Ciudad")).toHaveValue("Barcelona");
    expect(screen.getByLabelText("Recinto")).toHaveValue("Teatro Circo");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-09-05");
    expect(screen.getByLabelText("Hora")).toHaveValue("20:00");
  });

  it("keeps in-progress edits when the pre-fill fetch resolves after the user has started typing", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    const { queryClient } = renderStep1({ eventId: "event-3", onSaved: vi.fn() });

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Editado antes de que cargue" } });

    await waitFor(() => {
      expect(queryClient.getQueryState(["event", "event-3"])?.status).toBe("success");
    });

    expect(screen.getByLabelText("Título")).toHaveValue("Editado antes de que cargue");
  });

  it("shows an alert and does not call onSaved when saving fails", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    server.use(
      http.post("http://localhost:4000/api/v1/events", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudo guardar el evento", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar el evento"));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
