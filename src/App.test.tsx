import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
// (unlike UsersListPage.test.tsx, which stubs /eventos as a plain unguarded route) — that's what
// catches the routing race a component-level test can't see.
describe("App - Conectar routing", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle", impersonatorToken: null });
    window.history.pushState({}, "", "/");
  });

  function clickConectarFor(name: string) {
    const row = screen.getByText(name).closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "Conectar" }));
  }

  it("lands on Eventos, not /sin-acceso, after Conectar from a superadmin-only page", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    window.history.pushState({}, "", "/usuarios");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument());

    clickConectarFor("Admin de Producciones Norte");

    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());
    expect(screen.queryByText("No tienes acceso a esta sección.")).not.toBeInTheDocument();
  });

  it("lands back on Eventos, not /sin-acceso, when returning to superadmin from a page only the impersonated account can see", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    window.history.pushState({}, "", "/usuarios");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument());
    clickConectarFor("Admin de Producciones Norte"); // now the org admin, who lacks users:read
    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("link", { name: "Equipo" })); // superadmin lacks users:manage
    await waitFor(() => expect(screen.getByRole("button", { name: "Volver a superadmin" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Volver a superadmin" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Eventos" })).toBeInTheDocument());
    expect(screen.queryByText("No tienes acceso a esta sección.")).not.toBeInTheDocument();
  });
});
