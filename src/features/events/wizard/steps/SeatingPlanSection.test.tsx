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

describe("SeatingPlanSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la información del evento/)).toBeInTheDocument();
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
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Zona numerada" })).toBeInTheDocument());

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
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Zona numerada" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ Zona numerada" }));
    await screen.findByRole("button", { name: "Nueva zona numerada" });
    const zone = db.zones.find((z) => z.name === "Nueva zona numerada")!;

    fireEvent.click(screen.getByRole("button", { name: "Eliminar esta zona" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Nueva zona numerada" })).not.toBeInTheDocument());
    expect(db.zones.some((z) => z.id === zone.id)).toBe(false);
  });

  it("assigns a ticket type to a zone", async () => {
<<<<<<< HEAD
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
=======
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId = null;
>>>>>>> 1414b2fd0cecb65dc3686f8624ec85638b33e6e7
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId = null;
    renderSection("event-2");
    await screen.findByRole("button", { name: "Pista" });

    fireEvent.change(screen.getByLabelText("Tipo de entrada - Pista"), { target: { value: "tt-2-pista" } });

    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId).toBe("tt-2-pista"));
  });

<<<<<<< HEAD
  it("auto-sets the zone's capacity to match the assigned ticket type's quantity", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
=======
  it("keeps the zone capacity as this zone's allocation when a ticket type is assigned", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
>>>>>>> 1414b2fd0cecb65dc3686f8624ec85638b33e6e7
    db.zones.find((z) => z.id === "zone-pista")!.capacity = 500;
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.ticketTypeGroupId = null;
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId = null; // quantityTotal is 800
    renderSection("event-2");
    await screen.findByRole("button", { name: "Pista" });

    fireEvent.change(screen.getByLabelText("Tipo de entrada - Pista"), { target: { value: "tt-2-pista" } });

    await waitFor(() => expect(db.zones.find((z) => z.id === "zone-pista")!.capacity).toBe(500));
    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.totalCapacity).toBe(500));
  });

<<<<<<< HEAD
  it("reflects the auto-set capacity in the Capacidad input while that zone stays selected", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
=======
  it("reflects the zone allocation in the Capacidad input while that zone stays selected", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
>>>>>>> 1414b2fd0cecb65dc3686f8624ec85638b33e6e7
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

<<<<<<< HEAD
  it("warns when the assigned ticket type's quantity exceeds the zone's capacity, and reports invalid", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = 900; // zone-pista capacity is 800
=======
  it("warns when the assigned zone allocations exceed the ticket type's quantity, and reports invalid", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.quantityTotal = 700; // zone-pista assigns 800 from this ticket type
>>>>>>> 1414b2fd0cecb65dc3686f8624ec85638b33e6e7
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
});
