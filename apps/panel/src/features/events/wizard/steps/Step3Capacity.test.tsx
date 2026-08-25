import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step3Capacity } from "./Step3Capacity";

function renderStep(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Step3Capacity eventId={eventId} onSaved={() => {}} goNext={() => {}} />
    </QueryClientProvider>
  );
}

describe("Step3Capacity", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows an error when reducing a pool below its sold count", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.soldCount = 50;
    renderStep("event-2");

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
    fireEvent.change(screen.getByLabelText("Pista"), { target: { value: "30" } });
    fireEvent.blur(screen.getByLabelText("Pista"));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("50 entradas ya vendidas"));
  });

  it("blocks adding a new zone that would exceed the venue's total capacity", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-1"); // venue-2 (Teatro Circo) total capacity 400, pool-1 already at 400

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Palco" } });
    fireEvent.change(screen.getByLabelText("Capacidad"), { target: { value: "50" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir zona" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("superaría la capacidad del recinto"));
    expect(db.capacityPools.filter((p) => p.subEventId === "sub-event-1")).toHaveLength(1);
  });

  it("adds a new zone when it fits within the venue's total capacity", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep("event-3"); // venue-2 (Teatro Circo) total capacity 400, sub-event-3-0 has zero pools seeded

    await waitFor(() => expect(screen.getByLabelText("Nombre")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Platea" } });
    fireEvent.change(screen.getByLabelText("Capacidad"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir zona" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(screen.getByLabelText("Platea")).toBeInTheDocument();
  });

  it("shows an error when the server rejects adding a new zone that passed the client-side check", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    server.use(
      http.post("http://localhost:4000/api/v1/sub-events/:id/capacity-pools", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudo añadir la zona", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    renderStep("event-3"); // venue-2 (Teatro Circo) total capacity 400, sub-event-3-0 has zero pools seeded

    await waitFor(() => expect(screen.getByLabelText("Nombre")).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Platea" } });
    fireEvent.change(screen.getByLabelText("Capacidad"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Añadir zona" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo añadir la zona"));
    expect(db.capacityPools.filter((p) => p.subEventId === "sub-event-3-0")).toHaveLength(0);
  });
});
