import { render, screen, waitFor, within } from "@testing-library/react";
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
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3)); // header + 2 refunds
  });

  it("links each row to its order detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "PED-2026-0004" });
    expect(link).toHaveAttribute("href", "/ventas/pedidos/order-4");
  });

  it("shows refund rows with a light red background and the amount negative in bright red", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();

    const order4Link = await screen.findByRole("link", { name: "PED-2026-0004" });
    const order4Row = order4Link.closest("tr")!;
    expect(order4Row).toHaveClass("bg-refund-bg");
    expect(order4Row).toHaveAttribute("aria-label", "Reembolso");
    expect(within(order4Row).getByText("-50,00 €")).toHaveClass("text-refund");

    const order10Link = await screen.findByRole("link", { name: "PED-2026-0010" });
    const order10Row = order10Link.closest("tr")!;
    expect(order10Row).toHaveClass("bg-refund-bg");
    expect(within(order10Row).getByText("-90,00 €")).toHaveClass("text-refund");
  });
});
