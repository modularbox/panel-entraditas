import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ROLE_BASE_PERMISSIONS, type Permission } from "@/shared/auth/permissions";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb, sessions, STORAGE_KEY } from "@/mocks/state";
import type { SessionResponse, SessionUser } from "@/shared/auth/sessionStore";
import { PanelLayout } from "./PanelLayout";

const superAdminUser: SessionUser = { id: "user-superadmin", email: "superadmin@entraditas.com", fullName: "Super Admin", role: "superadmin", organizationId: null };
const adminUser: SessionUser = { id: "user-admin", email: "admin@entraditas.com", fullName: "Admin de Producciones Norte", role: "organizador", organizationId: "org-1" };

function renderLayout() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/eventos"]}>
        <Routes>
          <Route element={<PanelLayout />}>
            <Route path="/eventos" element={<div>Contenido</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function setRole(role: keyof typeof ROLE_BASE_PERMISSIONS) {
  useSessionStore.setState({ effectivePermissions: new Set<Permission>(ROLE_BASE_PERMISSIONS[role]), eventScopes: [] });
}

describe("PanelLayout navigation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetDb();
    localStorage.clear();
    useSessionStore.setState({ user: null, token: null, effectivePermissions: new Set(), eventScopes: [], impersonatorToken: null });
  });

  it("shows the logged-in user's fullName below the logo", () => {
    setRole("organizador");
    useSessionStore.setState({ user: adminUser });
    renderLayout();
    expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("Entraditas")).toBeInTheDocument();
  });

  it("shows 6 sections to a superadmin (no Equipo, no Usuarios)", () => {
    setRole("superadmin");
    renderLayout();
    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Organizaciones" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Equipo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
  });

  it("shows 6 sections to an organizador (no Organizaciones, no Usuarios)", () => {
    setRole("organizador");
    renderLayout();
    expect(screen.getAllByRole("link")).toHaveLength(6);
    expect(screen.getByRole("link", { name: "Clientes" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Usuarios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Organizaciones" })).not.toBeInTheDocument();
  });

  it("shows no sections to a suborganizador until the organizador grants access", () => {
    setRole("suborganizador");
    renderLayout();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("shows only the sections a suborganizador was granted (Eventos and Control de accesos)", () => {
    useSessionStore.setState({
      effectivePermissions: new Set<Permission>(["events:read", "scan:validate"]),
      eventScopes: ["event-1"]
    });
    renderLayout();
    const labels = screen.getAllByRole("link").map((el) => el.textContent).sort();
    expect(labels).toEqual(["Control de accesos", "Eventos"]);
  });

  it("shows the reset data button only to a superadmin", () => {
    setRole("superadmin");
    useSessionStore.setState({ user: superAdminUser });
    renderLayout();
    expect(screen.getByRole("button", { name: "Restablecer datos" })).toBeInTheDocument();
  });

  it("hides the reset data button for non-superadmin roles", () => {
    setRole("organizador");
    useSessionStore.setState({ user: adminUser });
    renderLayout();
    expect(screen.queryByRole("button", { name: "Restablecer datos" })).not.toBeInTheDocument();
  });

  it("hides the return-to-superadmin button for a direct login", () => {
    setRole("organizador");
    useSessionStore.setState({ user: adminUser });
    renderLayout();
    expect(screen.queryByRole("button", { name: "Volver a superadmin" })).not.toBeInTheDocument();
  });

  it("shows the return-to-superadmin button while impersonating an organization's organizador, and using it restores the superadmin session", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    const superadminToken = useSessionStore.getState().token;
    const session = await apiClient.post<SessionResponse>("/organizations/org-1/connect", undefined, { token: superadminToken! });
    useSessionStore.getState().connectAs(session);

    renderLayout();
    fireEvent.click(screen.getByRole("button", { name: "Volver a superadmin" }));

    await waitFor(() => expect(useSessionStore.getState().token).toBe(superadminToken));
    expect(useSessionStore.getState().user?.role).toBe("superadmin");
    expect(useSessionStore.getState().impersonatorToken).toBeNull();
  });

  it("resets the demo data from the button but keeps the superadmin logged in", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setRole("superadmin");
    useSessionStore.setState({ user: superAdminUser, token: "token-superadmin" });
    renderLayout();
    db.events[0]!.title = "Título editado";
    fireEvent.click(screen.getByRole("button", { name: "Restablecer datos" }));
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(db.events[0]!.title).not.toBe("Título editado");
    expect(db.events).toHaveLength(5);
    expect(sessions.get("token-superadmin")).toBe("user-superadmin");
  });
});