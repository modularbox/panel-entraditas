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

  it("shows only sales to a superadmin, hiding refunded orders", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(8)); // 1 header row + 7 active orders
    expect(screen.queryByRole("link", { name: "PED-2026-0004" })).toBeNull();
    expect(screen.queryByRole("link", { name: "PED-2026-0010" })).toBeNull();
  });

  it("shows the empty state when filtering by cancelled, since cancelled orders are deleted", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(8));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "cancelled" } });
    expect(await screen.findByText("No hay pedidos que coincidan con los filtros.")).toBeInTheDocument();
  });

  it("links each row to its order detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "PED-2026-0005" });
    expect(link).toHaveAttribute("href", "/ventas/pedidos/order-5");
  });

  it("sorts by Total ascending on the first header click and descending on the second", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(8));

    fireEvent.click(screen.getByRole("button", { name: "Total" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("PED-2026-0009"));

    fireEvent.click(screen.getByRole("button", { name: "Total" }));
    await waitFor(() => expect(screen.getAllByRole("row")[1]).toHaveTextContent("PED-2026-0005"));
  });
});
