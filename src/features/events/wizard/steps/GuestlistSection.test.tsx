import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { GuestlistSection } from "./GuestlistSection";

function renderSection(eventId: string | null) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestlistSection eventId={eventId} />
    </QueryClientProvider>
  );
}

async function loginAsAdmin() {
  await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
}

describe("GuestlistSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la información del evento/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
  });

  it("renders the event's already-created guest list with its two entries", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // seeded: "Prensa" (cupo 5), Marta López (pending), Carlos Ruiz (checked_in)
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    await within(card).findByText("Marta López", { exact: false }); // wait for the card's own entries fetch to resolve

    expect(within(card).getByText(/2 \/ 5/)).toBeInTheDocument();
    expect(within(card).getByText("Carlos Ruiz", { exact: false })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Pendiente" })).toBeInTheDocument(); // Carlos Ruiz ya está registrado
    expect(within(card).getByRole("button", { name: "Registrado" })).toBeInTheDocument(); // Marta López está pendiente
  });

  it("disables Crear lista until Nombre is filled", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByRole("listitem", { name: "Prensa" });
    const createForm = screen.getByRole("group", { name: "Nueva lista" });
    expect(within(createForm).getByRole("button", { name: "Crear lista" })).toBeDisabled();

    fireEvent.change(within(createForm).getByLabelText("Nombre"), { target: { value: "Patrocinadores" } });
    expect(within(createForm).getByRole("button", { name: "Crear lista" })).toBeEnabled();
  });

  it("creates a new guest list without a quota", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByRole("listitem", { name: "Prensa" });
    const createForm = screen.getByRole("group", { name: "Nueva lista" });

    fireEvent.change(within(createForm).getByLabelText("Nombre"), { target: { value: "Patrocinadores" } });
    fireEvent.click(within(createForm).getByRole("button", { name: "Crear lista" }));

    const card = await screen.findByRole("listitem", { name: "Patrocinadores" });
    expect(within(card).getByText("Sin límite", { exact: false })).toBeInTheDocument();
    expect(db.guestLists.some((g) => g.name === "Patrocinadores" && g.quota === null)).toBe(true);
  });

  it("adds a guest to an existing list", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    const addForm = within(card).getByRole("group", { name: "Añadir invitado" });

    fireEvent.change(within(addForm).getByLabelText("Nombre"), { target: { value: "Nuevo Invitado" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Añadir" }));

    await waitFor(() => expect(within(card).getByText("Nuevo Invitado", { exact: false })).toBeInTheDocument());
    expect(db.guestListEntries.some((e) => e.fullName === "Nuevo Invitado")).toBe(true);
  });

  it("shows an error when the guest list has reached its quota", async () => {
    await loginAsAdmin();
    db.guestLists.push({ id: "gl-full", eventId: "event-2", subEventId: null, name: "Lleno", quota: 1 });
    db.guestListEntries.push({
      id: "gle-full-1", guestListId: "gl-full", fullName: "Ya Está", email: null, phone: null,
      companions: 0, status: "pending", notes: null
    });
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Lleno" });
    const addForm = within(card).getByRole("group", { name: "Añadir invitado" });

    fireEvent.change(within(addForm).getByLabelText("Nombre"), { target: { value: "Otro Más" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Añadir" }));

    expect(await within(card).findByRole("alert")).toHaveTextContent("cupo");
  });

  it("toggles a guest's status between pending and checked in", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    await within(card).findByText("Marta López", { exact: false });

    fireEvent.click(within(card).getByRole("button", { name: "Registrado" })); // Marta López: pending -> checked_in

    await waitFor(() => expect(db.guestListEntries.find((e) => e.id === "gle-1")!.status).toBe("checked_in"));
  });

  it("deletes a guest from a list", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    await within(card).findByText("Marta López", { exact: false });

    fireEvent.click(within(card).getAllByRole("button", { name: "Eliminar" })[0]!);

    await waitFor(() => expect(db.guestListEntries).toHaveLength(1));
  });

  it("deletes an entire guest list along with its entries", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });

    fireEvent.click(within(card).getByRole("button", { name: "Eliminar lista" }));

    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Prensa" })).not.toBeInTheDocument());
    expect(db.guestLists.some((g) => g.id === "gl-2-prensa")).toBe(false);
    expect(db.guestListEntries.some((e) => e.guestListId === "gl-2-prensa")).toBe(false);
  });
});
