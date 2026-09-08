import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { EventsListPage } from "./EventsListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <EventsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EventsListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows all 5 events to a superadmin, with the create button visible", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6)); // 1 header row + 5 data rows
    expect(screen.getByRole("button", { name: "Crear evento" })).toBeInTheDocument();
  });

  it("shows only the 1 scoped event to a subuser, with no create button", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "subusuario1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header row + 1 data row
    expect(screen.queryByRole("button", { name: "Crear evento" })).not.toBeInTheDocument();
  });

  it("sorts by Título ascending on the first header click and descending on the second", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));

    fireEvent.click(screen.getByRole("button", { name: "Título" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Evento sin configurar"));

    fireEvent.click(screen.getByRole("button", { name: "Título" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Rock en Directo"));
  });

  it("colors each event's status label with its state color", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));

    const jazzRow = screen.getByRole("row", { name: /Noche de Jazz/ });
    expect(within(jazzRow).getByText("Publicado")).toHaveClass("border-status-published");

    const theatreRow = screen.getByRole("row", { name: /Bernarda Alba/ });
    expect(within(theatreRow).getByText("Borrador")).toHaveClass("border-status-draft");

    // "Festival del Sur" sigue guardado como "a la venta", pero se celebro en julio: la lista
    // lo marca como terminado en vez de anunciar una venta que ya no existe.
    const festivalRow = screen.getByRole("row", { name: /Festival del Sur/ });
    expect(within(festivalRow).getByText("Finalizado")).toHaveClass("border-status-finished");
    expect(within(festivalRow).queryByText("A la venta")).not.toBeInTheDocument();
  });

  it("un evento a la venta y todavia por celebrar si se muestra a la venta", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    db.events.find((event) => event.id === "event-1")!.status = "on_sale";
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));

    const jazzRow = screen.getByRole("row", { name: /Noche de Jazz/ });
    expect(within(jazzRow).getByText("A la venta")).toHaveClass("border-status-on-sale");
  });
});
