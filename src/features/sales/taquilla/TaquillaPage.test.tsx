import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { TaquillaPage } from "./TaquillaPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TaquillaPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TaquillaPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a permission notice instead of the form for a user without orders:create", async () => {
    await useSessionStore.getState().login("usuario@entraditas.com", "xR5$Jq9%Fv3!Mn7*");
    renderPage();
    expect(await screen.findByText("No tienes permiso para vender entradas.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evento")).not.toBeInTheDocument();
  });

  it("builds a multi-line cart and confirms the sale", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderPage();

    const eventSelect = await screen.findByLabelText("Evento");
    await screen.findByRole("option", { name: "Rock en Directo" }); // wait for useEventsQuery to populate options
    fireEvent.change(eventSelect, { target: { value: "event-2" } });
    fireEvent.change(await screen.findByLabelText("Cantidad de Pista"), { target: { value: "2" } });
    fireEvent.change(await screen.findByLabelText("Cantidad de Grada VIP"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Nombre del comprador"), { target: { value: "Cliente en taquilla" } });
    fireEvent.change(screen.getByLabelText("Email del comprador"), { target: { value: "taquilla@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar venta" }));

    expect(await screen.findByText(/confirmada/)).toBeInTheDocument();
  });

  it("disables the quantity input and shows Agotado for a sold-out ticket type", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    const tt1 = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    tt1.quantityTotal = tt1.quantitySold; // 0 remaining
    renderPage();

    const eventSelect = await screen.findByLabelText("Evento");
    await screen.findByRole("option", { name: "Noche de Jazz" }); // wait for useEventsQuery to populate options
    fireEvent.change(eventSelect, { target: { value: "event-1" } });
    expect(await screen.findByText("Agotado")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de General")).toBeDisabled();
  });
});
