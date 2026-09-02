import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { UsersListPage } from "./UsersListPage";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/usuarios"]}>
        <Routes>
          <Route path="/usuarios" element={<UsersListPage />} />
          <Route path="/usuarios/:id" element={<div>Ficha</div>} />
          <Route path="/eventos" element={<div>Página de eventos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("UsersListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    return useSessionStore.getState().token!;
  }

  it("lists every user across every organization", async () => {
    await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6)); // header + 5 seeded users
    expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("Admin de Sur Live")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getAllByText("Producciones Norte").length).toBeGreaterThan(0);
  });

  it("filters by name or email", async () => {
    await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));
    fireEvent.change(screen.getByLabelText("Buscar"), { target: { value: "sur live" } });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header + 1 match
    expect(screen.getByText("Admin de Sur Live")).toBeInTheDocument();
  });

  it("filters by organization", async () => {
    await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));
    fireEvent.change(screen.getByLabelText("Organización"), { target: { value: "org-2" } });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByText("Admin de Sur Live")).toBeInTheDocument();
  });

  it("filters by role", async () => {
    await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));
    fireEvent.change(screen.getByLabelText("Rol"), { target: { value: "subuser" } });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByText("Personal de puerta")).toBeInTheDocument();
  });

  it("filters by status", async () => {
    await login();
    db.users.find((u) => u.id === "user-admin")!.status = "disabled";
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "disabled" } });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2));
    expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument();
  });

  it("disables Conectar for a superadmin account and for an inactive account", async () => {
    await login();
    db.users.find((u) => u.id === "user-admin")!.status = "disabled";
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));
    const superadminRow = screen.getByText("Super Admin").closest("tr")!;
    const disabledAdminRow = screen.getByText("Admin de Producciones Norte").closest("tr")!;
    const activeRow = screen.getByText("Admin de Sur Live").closest("tr")!;
    expect(within(superadminRow).getByRole("button", { name: "Conectar" })).toBeDisabled();
    expect(within(disabledAdminRow).getByRole("button", { name: "Conectar" })).toBeDisabled();
    expect(within(activeRow).getByRole("button", { name: "Conectar" })).toBeEnabled();
  });

  it("links each row to its ficha", async () => {
    await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));
    fireEvent.click(screen.getByText("Admin de Sur Live"));
    await waitFor(() => expect(screen.getByText("Ficha")).toBeInTheDocument());
  });

  it("Conectar switches the session and lands on Eventos", async () => {
    const superadminToken = await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(6));
    const activeRow = screen.getByText("Admin de Sur Live").closest("tr")!;
    fireEvent.click(within(activeRow).getByRole("button", { name: "Conectar" }));

    await waitFor(() => expect(useSessionStore.getState().user?.email).toBe("admin.surlive@entraditas.com"));
    expect(useSessionStore.getState().impersonatorToken).toBe(superadminToken);
    await waitFor(() => expect(screen.getByText("Página de eventos")).toBeInTheDocument());
  });
});
