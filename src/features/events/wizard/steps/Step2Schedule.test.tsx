import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step2Schedule } from "./Step2Schedule";

function renderStep(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Step2Schedule eventId={eventId} onSaved={() => {}} />
    </QueryClientProvider>
  );
}

describe("Step2Schedule", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("lists the already-seeded sub-events for the theater event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderStep("event-3");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
  });

  it("generates recurring sub-events and adds them to the list", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderStep("event-5");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Varias sesiones" }));
    fireEvent.change(screen.getByLabelText("Fecha inicio"), { target: { value: "2026-12-05" } });
    fireEvent.change(screen.getByLabelText("Sesiones"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar sesiones" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));
  });

  it("duplicates the doors-open time from the first sub-event to the rest", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    db.subEvents.find((s) => s.id === "sub-event-3-0")!.doorsOpenAt = "2026-09-05T19:30:00.000Z";
    renderStep("event-3");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Copiar hora de apertura de puertas a todas" }));

    await waitFor(() => {
      const subEvents = db.subEvents.filter((s) => s.eventId === "event-3");
      expect(subEvents.every((s) => s.doorsOpenAt === "2026-09-05T19:30:00.000Z")).toBe(true);
    });
  });

  it("shows an alert and does not add sub-events when generating fails", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    server.use(
      http.post("http://localhost:4000/api/v1/events/:eventId/sub-events/bulk", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudieron generar las funciones", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    renderStep("event-5");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));

    fireEvent.click(screen.getByRole("button", { name: "Varias sesiones" }));
    fireEvent.change(screen.getByLabelText("Fecha inicio"), { target: { value: "2026-12-05" } });
    fireEvent.change(screen.getByLabelText("Sesiones"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar sesiones" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudieron generar las funciones"));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("shows an alert when duplicating the doors-open time fails", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    db.subEvents.find((s) => s.id === "sub-event-3-0")!.doorsOpenAt = "2026-09-05T19:30:00.000Z";
    server.use(
      http.patch("http://localhost:4000/api/v1/sub-events/:id", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudo copiar la hora de apertura de puertas", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    renderStep("event-3");
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Copiar hora de apertura de puertas a todas" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo copiar la hora de apertura de puertas")
    );
    const subEvents = db.subEvents.filter((s) => s.eventId === "event-3");
    expect(subEvents.some((s) => s.doorsOpenAt !== "2026-09-05T19:30:00.000Z")).toBe(true);
  });
});
