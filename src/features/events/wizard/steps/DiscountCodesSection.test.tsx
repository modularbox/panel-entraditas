import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { DiscountCodesSection } from "./DiscountCodesSection";

function renderSection(eventId: string | null) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscountCodesSection eventId={eventId} />
    </QueryClientProvider>
  );
}

describe("DiscountCodesSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la información del evento/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
  });

  it("renders the event's already-created discount codes", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderSection("event-2"); // seeded with one code: EARLYBIRD
    expect(await screen.findByText("EARLYBIRD")).toBeInTheDocument();
  });

  it("creates a discount code that applies to all ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderSection("event-2");
    await screen.findByText("EARLYBIRD");

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "VIP20" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));

    await waitFor(() => expect(screen.getByText("VIP20")).toBeInTheDocument());
    const created = db.discountCodes.find((c) => c.code === "VIP20")!;
    expect(created.type).toBe("percent");
    expect(created.value).toBe(20);
    expect(created.appliesTo).toBeNull();
  });

  it("disables Crear código until Código and Valor are filled", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderSection("event-2");
    await screen.findByText("EARLYBIRD");
    expect(screen.getByRole("button", { name: "Crear código" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "VIP20" } });
    expect(screen.getByRole("button", { name: "Crear código" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: "Crear código" })).toBeEnabled();
  });

  it("creates a discount code that applies only to selected ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderSection("event-2"); // ticket-type groups: tt-2-pista (Pista), tt-2-grada (Grada VIP)
    await screen.findByText("EARLYBIRD");

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "PISTAONLY" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText("Tipos concretos"));
    fireEvent.click(screen.getByLabelText("Pista"));
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));

    await waitFor(() => expect(screen.getByText("PISTAONLY")).toBeInTheDocument());
    const created = db.discountCodes.find((c) => c.code === "PISTAONLY")!;
    expect(created.appliesTo).toEqual(["tt-2-pista"]);
  });

  it("toggles a discount code's status between active and inactive", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderSection("event-2"); // EARLYBIRD starts active
    await screen.findByText("EARLYBIRD");

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(db.discountCodes.find((c) => c.id === "dc-2-earlybird")!.status).toBe("inactive"));
    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
  });

  it("deletes a discount code", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderSection("event-2");
    await screen.findByText("EARLYBIRD");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("EARLYBIRD")).not.toBeInTheDocument());
    expect(db.discountCodes.some((c) => c.id === "dc-2-earlybird")).toBe(false);
  });
});
