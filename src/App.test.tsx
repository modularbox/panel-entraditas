import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { App } from "./App";

describe("App", () => {
  it("boots to the login page when there is no stored session", async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByLabelText("Correo electrónico")).toBeInTheDocument());
  });
});

// These render <App /> with a real BrowserRouter and the actual RequirePermission-guarded routes
// (unlike OrganizationsListPage.test.tsx/UsersListPage.test.tsx, which stub /eventos as a plain
// unguarded route) — that's what catches the routing race a component-level test can't see.
describe("App - Conectar routing", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle", impersonatorToken: null });
    window.history.pushState({}, "", "/");
  });

  it("lands on Eventos, not /sin-acceso, after Conectar from a superadmin-only page", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    window.history.pushState({}, "", "/organizaciones");
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Conectar" }).length).toBeGreaterThan(0));

    fireEvent.click(screen.getAllByRole("button", { name: "Conectar" })[0]!);

    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());
    expect(screen.queryByText("No tienes acceso a esta sección.")).not.toBeInTheDocument();
  });

  it("lands back on Eventos, not /sin-acceso, when returning to superadmin from a page only the impersonated account can see", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    window.history.pushState({}, "", "/organizaciones");
    render(<App />);
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Conectar" }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: "Conectar" })[0]!); // now the org admin, who lacks organizations:manage
    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("link", { name: "Equipo" })); // superadmin lacks users:manage
    await waitFor(() => expect(screen.getByRole("button", { name: "Volver a superadmin" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Volver a superadmin" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());
    expect(screen.queryByText("No tienes acceso a esta sección.")).not.toBeInTheDocument();
  });
});
