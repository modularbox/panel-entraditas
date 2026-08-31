import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrganizationsListPage } from "./OrganizationsListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/organizaciones"]}>
        <Routes>
          <Route path="/organizaciones" element={<OrganizationsListPage />} />
          <Route path="/eventos" element={<div>Página de eventos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrganizationsListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows both organizations with their administrator and a Conectar button each", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "vQ7!mZ2#Lr9@Tx5$");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3)); // 1 header row + 2 data rows

    expect(screen.getByText("Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("Sur Live")).toBeInTheDocument();
    expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("admin@entraditas.com")).toBeInTheDocument();
    expect(screen.getByText("Admin de Sur Live")).toBeInTheDocument();
    expect(screen.getByText("admin.surlive@entraditas.com")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Conectar" })).toHaveLength(2);
  });

  it("Conectar switches the session to the organization's admin and lands on Eventos", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "vQ7!mZ2#Lr9@Tx5$");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Conectar" })).toHaveLength(2));

    fireEvent.click(screen.getAllByRole("button", { name: "Conectar" })[0]!); // Producciones Norte (org-1)

    await waitFor(() => expect(useSessionStore.getState().user?.email).toBe("admin@entraditas.com"));
    const state = useSessionStore.getState();
    expect(state.user?.fullName).toBe("Admin de Producciones Norte");
    expect(state.user?.role).toBe("admin");
    expect(state.effectivePermissions.has("users:manage")).toBe(true);
    expect(state.effectivePermissions.has("organizations:manage")).toBe(false);

    await waitFor(() => expect(screen.getByText("Página de eventos")).toBeInTheDocument());
  });
});