import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { TeamListPage } from "./TeamListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TeamListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TeamListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows all 3 members of the organization to an organizador", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4)); // 1 header row + 3 data rows
  });

  it("sorts by Nombre ascending on the first click and descending on the second", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Nombre" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Admin de Producciones Norte"));

    fireEvent.click(screen.getByRole("button", { name: "Nombre" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Marta Gutiérrez Vega"));
  });

  it("sorts by Correo ascending on the first click", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Correo" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("admin@entraditas.com"));
    expect(screen.getAllByRole("row")[3]).toHaveTextContent("marta.gutierrez@entraditas.com");
  });

  it("sorts by Rol in cargo order (Organizador > Suborganizador) on the first click", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(4));

    fireEvent.click(screen.getByRole("button", { name: "Rol" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Admin de Producciones Norte"));
    expect(screen.getAllByRole("row")[1]).toHaveTextContent("Organizador");
    expect(screen.getAllByRole("row")[2]).toHaveTextContent("Marta Gutiérrez Vega");
    expect(screen.getAllByRole("row")[3]).toHaveTextContent("Javier Ortega López");

    fireEvent.click(screen.getByRole("button", { name: "Rol" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("Marta Gutiérrez Vega"));
  });
});