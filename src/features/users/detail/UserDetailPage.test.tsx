import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { UserDetailPage } from "./UserDetailPage";

function renderPage(id: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[`/usuarios/${id}`]}>
        <Routes>
          <Route path="/usuarios/:id" element={<UserDetailPage />} />
          <Route path="/eventos" element={<div>Página de eventos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("UserDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    return useSessionStore.getState().token!;
  }

  it("shows the user's profile, organization and effective permissions", async () => {
    await login();
    renderPage("user-admin");
    await waitFor(() => expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument());
    expect(screen.getByText("admin@entraditas.com")).toBeInTheDocument();
    expect(screen.getByText("Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("users:manage")).toBeInTheDocument();
  });

  it("clarifies that an org-scoped admin's 'Todos' is limited to their own organization", async () => {
    await login();
    renderPage("user-admin");
    await waitFor(() => expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument());
    expect(screen.getByText("Todos los de Producciones Norte")).toBeInTheDocument();
  });

  it("shows a plain 'Todos' for the superadmin, who isn't scoped to any organization", async () => {
    await login();
    renderPage("user-superadmin");
    await waitFor(() => expect(screen.getByText("Super Admin")).toBeInTheDocument());
    expect(screen.getByText("Todos")).toBeInTheDocument();
  });

  it("shows a 404 message for an unknown user id", async () => {
    await login();
    renderPage("does-not-exist");
    await waitFor(() => expect(screen.getByText("Usuario no encontrado.")).toBeInTheDocument());
  });

  it("disables Conectar for a superadmin's own ficha", async () => {
    await login();
    renderPage("user-superadmin");
    await waitFor(() => expect(screen.getByText("Super Admin")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Conectar" })).toBeDisabled();
  });

  it("Conectar switches the session and lands on Eventos", async () => {
    const superadminToken = await login();
    renderPage("user-admin");
    await waitFor(() => expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Conectar" }));

    await waitFor(() => expect(useSessionStore.getState().user?.email).toBe("admin@entraditas.com"));
    expect(useSessionStore.getState().impersonatorToken).toBe(superadminToken);
    await waitFor(() => expect(screen.getByText("Página de eventos")).toBeInTheDocument());
  });

  it("disables Conectar for a disabled account", async () => {
    await login();
    db.users.find((u) => u.id === "user-admin")!.status = "disabled";
    renderPage("user-admin");
    await waitFor(() => expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Conectar" })).toBeDisabled();
  });
});
