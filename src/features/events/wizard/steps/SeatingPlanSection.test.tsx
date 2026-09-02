import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { SeatingPlanSection } from "./SeatingPlanSection";

function renderSection(eventId: string | null, onValidationChange?: (valid: boolean) => void) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SeatingPlanSection eventId={eventId} onValidationChange={onValidationChange} />
    </QueryClientProvider>
  );
}

/**
 * A brand-new event has no zones yet, so the section asks how capacity should be laid out before
 * showing any editor. These tests are about the drawn plan, so they take that branch.
 */
async function choosePlanMode() {
  fireEvent.click(await screen.findByRole("button", { name: /Crear zonas con plano y asientos/ }));
  await waitFor(() => expect(screen.getByRole("button", { name: "+ Zona numerada" })).toBeInTheDocument());
}

describe("SeatingPlanSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la informaci�n del evento/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Zona numerada" })).not.toBeInTheDocument();
  });

  it("renders the venue's already-drawn zones", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2"); // venue-1 (Sala Apolo), zones Pista + Grada already seeded
    expect(await screen.findByRole("button", { name: "Pista" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grada" })).toBeInTheDocument();
  });

  it("adds a numbered zone and auto-creates its capacity pool for the event's first function", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1"); // venue-2 (Teatro Circo), zero zones seeded
    await choosePlanMode();

    fireEvent.click(screen.getByRole("button", { name: "+ Zona numerada" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Nueva zona numerada" })).toBeInTheDocument());
    const zone = db.zones.find((z) => z.name === "Nueva zona numerada")!;
    await waitFor(() => expect(db.capacityPools.some((p) => p.zoneId === zone.id)).toBe(true));
  });

  it("edits a selected zone's width, height and capacity, keeping its capacity pool in sync", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2");
    fireEvent.click(await screen.findByRole("button", { name: "Pista" }));

    fireEvent.change(screen.getByLabelText("Ancho %"), { target: { value: "50" } });
    fireEvent.blur(screen.getByLabelText("Ancho %"));
    fireEvent.change(screen.getByLabelText("Capacidad"), { target: { value: "900" } });
    fireEvent.blur(screen.getByLabelText("Capacidad"));

    await waitFor(() => expect(db.zones.find((z) => z.id === "zone-pista")!.width).toBe(50));
    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.totalCapacity).toBe(900));
  });

  it("deletes a zone without sales", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1"); // venue-2 (Teatro Circo), zero zones seeded -> a freshly-added zone has no sales
    await choosePlanMode();
    fireEvent.click(screen.getByRole("button", { name: "+ Zona numerada" }));
    await screen.findByRole("button", { name: "Nueva zona numerada" });
    const zone = db.zones.find((z) => z.name === "Nueva zona numerada")!;

    fireEvent.click(screen.getByRole("button", { name: "Eliminar esta zona" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Nueva zona numerada" })).not.toBeInTheDocument());
    expect(db.zones.some((z) => z.id === zone.id)).toBe(false);
  });

  it("assigns a ticket type to a zone", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId = null;
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId = null;
    renderSection("event-2");
    await screen.findByRole("button", { name: "Pista" });

    fireEvent.change(screen.getByLabelText("Tipo de entrada - Pista"), { target: { value: "tt-2-pista" } });

    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId).toBe("tt-2-pista"));
  });

  it("keeps the zone capacity as this zone's allocation when a ticket type is assigned", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.zones.find((z) => z.id === "zone-pista")!.capacity = 500;
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId = null;
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId = null; // quantityTotal is 800
    renderSection("event-2");
    await screen.findByRole("button", { name: "Pista" });

    fireEvent.change(screen.getByLabelText("Tipo de entrada - Pista"), { target: { value: "tt-2-pista" } });

    await waitFor(() => expect(db.zones.find((z) => z.id === "zone-pista")!.capacity).toBe(500));
    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.totalCapacity).toBe(500));
  });

  it("reflects the zone allocation in the Capacidad input while that zone stays selected", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.zones.find((z) => z.id === "zone-pista")!.capacity = 500;
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId = null;
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId = null; // quantityTotal is 800
    renderSection("event-2");
    fireEvent.click(await screen.findByRole("button", { name: "Pista" }));
    expect(screen.getByLabelText("Capacidad")).toHaveValue(500);

    fireEvent.change(screen.getByLabelText("Tipo de entrada - Pista"), { target: { value: "tt-2-pista" } });

    await waitFor(() => expect(screen.getByLabelText("Capacidad")).toHaveValue(500));
  });

  it("leaves the zone's capacity unchanged when the assigned ticket type's quantity is unlimited", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.zones.find((z) => z.id === "zone-pista")!.capacity = 500;
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = null;
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId = null;
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId = null;
    renderSection("event-2");
    await screen.findByRole("button", { name: "Pista" });

    fireEvent.change(screen.getByLabelText("Tipo de entrada - Pista"), { target: { value: "tt-2-pista" } });

    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId).toBe("tt-2-pista"));
    expect(db.zones.find((z) => z.id === "zone-pista")!.capacity).toBe(500);
  });

  it("warns when the assigned zone allocations exceed the ticket type's quantity, and reports invalid", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = 700; // zone-pista assigns 800 from this ticket type
    const onValidationChange = vi.fn();
    renderSection("event-2", onValidationChange);

    expect(await screen.findByRole("alert")).toHaveTextContent(/supera la capacidad/);
    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(false));
  });

  it("reports valid when no zone exceeds its capacity", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const onValidationChange = vi.fn();
    renderSection("event-2", onValidationChange);

    await screen.findByRole("button", { name: "Pista" });
    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(true));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  /** Turns the seeded standing "Grada" into a 25-seat numbered zone with nothing sold yet. */
  function seedNumberedGrada() {
    const zone = db.zones.find((z) => z.id === "zone-grada")!;
    zone.kind = "numbered";
    zone.capacity = 25;
    zone.rows = 5;
    const pool = db.capacityPools.find((p) => p.id === "pool-2-grada")!;
    pool.totalCapacity = 25;
    pool.soldCount = 0;
    pool.ticketTypeGroupId = null;
    db.ticketTypes.find((t) => t.id === "tt-2-grada")!.capacityPoolId = null;
  }

  it("breaks a numbered zone down seat by seat and saves the breakdown on its capacity pool", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    seedNumberedGrada();
    renderSection("event-2");

    fireEvent.click(await screen.findByRole("button", { name: "Grada" }));
    fireEvent.change(await screen.findByLabelText("Asientos de Grada VIP en Grada"), { target: { value: "20" } });

    await waitFor(() => {
      const pool = db.capacityPools.find((p) => p.id === "pool-2-grada")!;
      expect(pool.seatAssignments).toHaveLength(20);
    });
    const pool = db.capacityPools.find((p) => p.id === "pool-2-grada")!;
    expect(pool.seatAssignments!.every((seat) => seat.ticketTypeGroupId === "tt-2-grada")).toBe(true);
    // 25 seats with 20 taken leaves 5 the organizer can still place or leave unsold.
    expect(await screen.findByText(/20\/25 asientos asignados - 5 sin asignar/)).toBeInTheDocument();
  });

  // This step runs before ticket types exist in the wizard, so leaving seats unassigned cannot
  // block it. Only a zone with no capacity at all does.
  it("still lets the organizer move on while a numbered zone has no seat assigned", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    seedNumberedGrada();
    const onValidationChange = vi.fn();
    renderSection("event-2", onValidationChange);

    expect(await screen.findByText(/25 asientos sin ningun tipo de entrada asignado/)).toBeInTheDocument();
    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(true));
  });

  it("blocks the step while a sellable zone has no capacity", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const zone = db.zones.find((z) => z.id === "zone-grada")!;
    zone.kind = "numbered";
    zone.capacity = 0;
    const onValidationChange = vi.fn();
    renderSection("event-2", onValidationChange);

    await screen.findByRole("button", { name: "Pista" });
    await waitFor(() => expect(onValidationChange).toHaveBeenLastCalledWith(false));
  });

  it("adds a second zone once one already exists", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1"); // venue-2, zero zones seeded
    await choosePlanMode();

    fireEvent.click(screen.getByRole("button", { name: "+ Zona numerada" }));
    await screen.findByRole("button", { name: "Nueva zona numerada" });
    fireEvent.click(screen.getByRole("button", { name: "+ Zona de pie" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Nueva zona de pie" })).toBeInTheDocument());
    expect(db.zones.filter((z) => z.venueId === "venue-2")).toHaveLength(2);
  });

  it("creates exactly one capacity pool per zone, even as zones are added", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1");
    await choosePlanMode();

    fireEvent.click(screen.getByRole("button", { name: "+ Zona numerada" }));
    await screen.findByRole("button", { name: "Nueva zona numerada" });
    const zone = db.zones.find((z) => z.name === "Nueva zona numerada")!;

    await waitFor(() => expect(db.capacityPools.filter((p) => p.zoneId === zone.id)).toHaveLength(1));
  });

  it("keeps the typed quantity on screen while the seat breakdown is being saved", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    seedNumberedGrada();
    renderSection("event-2");
    fireEvent.click(await screen.findByRole("button", { name: "Grada" }));
    const input = await screen.findByLabelText("Asientos de Grada VIP en Grada");

    // Typing "2" then "0" must end up as 20, not snap back to the last saved value each keystroke.
    fireEvent.change(input, { target: { value: "2" } });
    fireEvent.change(input, { target: { value: "20" } });

    expect(input).toHaveValue(20);
    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-grada")!.seatAssignments).toHaveLength(20));
  });

  it("asks how to lay out capacity before showing any editor on a fresh event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1"); // venue-2, zero zones

    expect(await screen.findByRole("button", { name: /Crear zonas con plano y asientos/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Crear zonas sin plano/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Zona numerada" })).not.toBeInTheDocument();
  });

  it("shows only the drawn plan once that mode is chosen", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1");
    await choosePlanMode();

    expect(screen.getByRole("button", { name: "+ Escenario/Pantalla" })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Zonas sin plano" })).not.toBeInTheDocument();
  });

  it("shows only the plain zone list when the no-plan mode is chosen", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1");
    fireEvent.click(await screen.findByRole("button", { name: /Crear zonas sin plano/ }));

    await waitFor(() => expect(screen.getByRole("button", { name: "+ Zona de pie" })).toBeInTheDocument());
    // No canvas: the stage and gate tools only make sense on a drawn plan.
    expect(screen.queryByRole("button", { name: "+ Escenario/Pantalla" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Ancho %")).not.toBeInTheDocument();
  });

  it("keeps an already-drawn event on the plan without asking again", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2"); // venue-1 already has zones

    expect(await screen.findByRole("button", { name: "Pista" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Plano de asientos$/ })).not.toBeInTheDocument();
  });

  it("adds zones in the no-plan mode with the same capacity model", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-1");
    fireEvent.click(await screen.findByRole("button", { name: /Crear zonas sin plano/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Zona de pie" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "+ Zona de pie" }));

    await waitFor(() => expect(db.zones.filter((z) => z.venueId === "venue-2")).toHaveLength(1));
    const zone = db.zones.find((z) => z.venueId === "venue-2")!;
    await waitFor(() => expect(db.capacityPools.some((p) => p.zoneId === zone.id)).toBe(true));
  });

  it("saves the drawn plan as a reusable template and applies it back", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2"); // venue-1 has Pista + Grada
    await screen.findByRole("button", { name: "Pista" });

    fireEvent.change(screen.getByLabelText(/Guardar el plano actual como plantilla/), {
      target: { value: "Sala Apolo estandar" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar plantilla" }));

    await waitFor(() => expect(db.venuePlanTemplates).toHaveLength(1));
    expect(db.venuePlanTemplates[0]!.zones).toHaveLength(2);
    // A template stores the shape of the room, never a particular venue's zone ids.
    expect(db.venuePlanTemplates[0]!.zones.every((zone) => !("id" in zone) && !("venueId" in zone))).toBe(true);

    const zonesBefore = db.zones.filter((z) => z.venueId === "venue-1").length;
    fireEvent.click(await screen.findByRole("button", { name: "Aplicar" }));

    await waitFor(() => expect(db.zones.filter((z) => z.venueId === "venue-1")).toHaveLength(zonesBefore + 2));
  });

  it("does not offer a whole-zone ticket type selector for a numbered zone", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    seedNumberedGrada();
    renderSection("event-2");

    await screen.findByRole("button", { name: "Grada" });
    expect(screen.queryByLabelText("Tipo de entrada - Grada")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Tipo de entrada - Pista")).toBeInTheDocument();
  });
});
