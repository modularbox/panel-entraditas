import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrdersListPage } from "./OrdersListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrdersListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrdersListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows all 10 orders to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(11)); // 1 header row + 10 data rows
  });

  it("filters by status", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(11));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "cancelled" } });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header + order-7
  });

  it("links each row to its order detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "PED-2026-0005" });
    expect(link).toHaveAttribute("href", "/ventas/pedidos/order-5");
  });
});
