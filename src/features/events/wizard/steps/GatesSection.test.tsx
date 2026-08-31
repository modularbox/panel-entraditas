import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { GatesSection } from "./GatesSection";

function renderSection(eventId: string | null) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <GatesSection eventId={eventId} />
    </QueryClientProvider>
  );
}

async function loginAsAdmin() {
  await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
}

describe("GatesSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la información del evento/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
  });

  it("renders the event's already-created gate", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // seeded with one gate: Puerta Norte / NORTE
    expect(await screen.findByText("Puerta Norte — NORTE")).toBeInTheDocument();
  });

  it("creates a gate open to every sub-event and ticket type, with no operators, using the default fields", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByText("Puerta Norte — NORTE");

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Puerta Sur" } });
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "SUR" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear puerta" }));

    await waitFor(() => expect(screen.getByText("Puerta Sur — SUR")).toBeInTheDocument());
    const created = db.gates.find((g) => g.code === "SUR")!;
    expect(created.subEventId).toBeNull();
    expect(created.zoneId).toBeNull();
    expect(created.direction).toBe("in");
    expect(created.allowReentry).toBe(false);
    expect(created.maxScansPerTicket).toBe(1);
    expect(created.allowedTicketTypeGroupIds).toBeNull();
    expect(created.operatorUserIds).toEqual([]);
  });

  it("disables Crear puerta until Nombre and Código are filled", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByText("Puerta Norte — NORTE");
    expect(screen.getByRole("button", { name: "Crear puerta" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Puerta Sur" } });
    expect(screen.getByRole("button", { name: "Crear puerta" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "SUR" } });
    expect(screen.getByRole("button", { name: "Crear puerta" })).toBeEnabled();
  });

  it("creates a gate scoped to a specific sub-event, zone, ticket types, time window and operator", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // sub-event: sub-event-2 ("Función única"); zones: Pista, Grada; ticket-type group: Pista (tt-2-pista)
    await screen.findByText("Puerta Norte — NORTE");
    // Scoped to the create-form fieldset: once per-row operator checkboxes exist too, "Personal
    // de puerta" would otherwise match both the seeded row's checkbox and this one.
    const createForm = screen.getByRole("group", { name: "Nueva puerta" });

    fireEvent.change(within(createForm).getByLabelText("Nombre"), { target: { value: "Puerta Grada" } });
    fireEvent.change(within(createForm).getByLabelText("Código"), { target: { value: "GRADA" } });
    fireEvent.click(within(createForm).getByLabelText("Subevento concreto"));
    fireEvent.change(within(createForm).getByLabelText("Subevento"), { target: { value: "sub-event-2" } });
    fireEvent.change(within(createForm).getByLabelText("Zona"), { target: { value: "zone-grada" } });
    fireEvent.click(within(createForm).getByLabelText("Ambas"));
    fireEvent.click(within(createForm).getByLabelText("Permite reentrada"));
    fireEvent.change(within(createForm).getByLabelText("Escaneos máximos por ticket"), { target: { value: "3" } });
    fireEvent.click(within(createForm).getByLabelText("Tipos concretos"));
    fireEvent.click(within(createForm).getByLabelText("Pista"));
    fireEvent.change(within(createForm).getByLabelText("Abre"), { target: { value: "2026-11-05T19:00" } });
    fireEvent.change(within(createForm).getByLabelText("Cierra"), { target: { value: "2026-11-05T23:00" } });
    fireEvent.click(within(createForm).getByLabelText("Personal de puerta"));
    fireEvent.click(within(createForm).getByRole("button", { name: "Crear puerta" }));

    await waitFor(() => expect(screen.getByText("Puerta Grada — GRADA")).toBeInTheDocument());
    const created = db.gates.find((g) => g.code === "GRADA")!;
    expect(created.subEventId).toBe("sub-event-2");
    expect(created.zoneId).toBe("zone-grada");
    expect(created.direction).toBe("both");
    expect(created.allowReentry).toBe(true);
    expect(created.maxScansPerTicket).toBe(3);
    expect(created.allowedTicketTypeGroupIds).toEqual(["tt-2-pista"]);
    expect(created.opensAt).toBe(new Date("2026-11-05T19:00").toISOString());
    expect(created.closesAt).toBe(new Date("2026-11-05T23:00").toISOString());
    expect(created.operatorUserIds).toEqual(["user-subuser"]);
  });

  it("toggles a gate's active state", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // Puerta Norte starts active
    await screen.findByText("Puerta Norte — NORTE");

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(db.gates.find((g) => g.id === "gate-2-norte")!.isActive).toBe(false));
    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("unassigns an operator from an existing gate via its row checkbox", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // Puerta Norte starts with Personal de puerta assigned
    await screen.findByText("Puerta Norte — NORTE");
    // Scoped to the "Puertas" list: the create form below also has a "Personal de puerta"
    // checkbox (its own, unchecked, operator picker), so an unscoped query would be ambiguous.
    const gatesList = screen.getByRole("list", { name: "Puertas" });

    const operatorCheckbox = within(gatesList).getByRole("checkbox", { name: "Personal de puerta" });
    expect(operatorCheckbox).toBeChecked();
    fireEvent.click(operatorCheckbox);

    await waitFor(() => expect(db.gates.find((g) => g.id === "gate-2-norte")!.operatorUserIds).toEqual([]));
  });

  it("deletes a gate", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByText("Puerta Norte — NORTE");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("Puerta Norte — NORTE")).not.toBeInTheDocument());
    expect(db.gates.some((g) => g.id === "gate-2-norte")).toBe(false);
  });
});
