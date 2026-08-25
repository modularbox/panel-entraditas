import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AppRoutes } from "./router";

function renderApp(initialEntries: string[]) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AppRoutes", () => {
  afterEach(() => {
    resetDb();
    localStorage.clear();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("redirects an unauthenticated visitor to /login", async () => {
    renderApp(["/eventos"]);
    await waitFor(() => expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument());
  });

  it("shows the Eventos placeholder to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["events:read"]),
      eventScopes: []
    });
    renderApp(["/eventos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());
  });
});
