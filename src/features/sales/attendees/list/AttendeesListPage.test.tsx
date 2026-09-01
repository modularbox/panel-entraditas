import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AttendeesListPage } from "./AttendeesListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AttendeesListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AttendeesListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows all 8 qualifying attendees to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(9)); // header + 8 data rows
  });

  it("links each row to its attendee detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "Marta Ruiz" });
    expect(link).toHaveAttribute("href", `/ventas/asistentes/${encodeURIComponent("marta.ruiz@example.com")}`);
  });
});
