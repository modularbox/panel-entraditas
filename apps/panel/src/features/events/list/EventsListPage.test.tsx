import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
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
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6)); // 1 header row + 5 data rows
    expect(screen.getByRole("button", { name: "Crear evento" })).toBeInTheDocument();
  });

  it("shows only the 1 scoped event to a subuser, with no create button", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header row + 1 data row
    expect(screen.queryByRole("button", { name: "Crear evento" })).not.toBeInTheDocument();
  });
});
