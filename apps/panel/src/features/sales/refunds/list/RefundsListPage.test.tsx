import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { RefundsListPage } from "./RefundsListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RefundsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RefundsListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the 2 seeded refunds to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3)); // header + 2 refunds
  });

  it("links each row to its order detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "PED-2026-0004" });
    expect(link).toHaveAttribute("href", "/ventas/pedidos/order-4");
  });
});
