import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { LoginPage } from "./LoginPage";

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/eventos" element={<div>Listado de eventos</div>} />
      </Routes>
    </MemoryRouter>
  );
}

async function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it.each([
    ["superadmin@entraditas.com", "organizations:manage"],
    ["admin@entraditas.com", "finance:read"],
    ["usuario@entraditas.com", "orders:read"],
    ["subusuario@entraditas.com", "scan:validate"]
  ])("logs in %s and redirects to /eventos with the expected permission granted", async (email, expectedPermission) => {
    renderLoginPage();
    await fillAndSubmit(email, "demo1234");
    await waitFor(() => expect(screen.getByText("Listado de eventos")).toBeInTheDocument());
    expect(useSessionStore.getState().effectivePermissions.has(expectedPermission)).toBe(true);
  });

  it("shows an error and stays on the login page with wrong credentials", async () => {
    renderLoginPage();
    await fillAndSubmit("admin@entraditas.com", "wrong-password");
    await waitFor(() => expect(screen.getByText("Credenciales inválidas")).toBeInTheDocument());
    expect(screen.queryByText("Listado de eventos")).not.toBeInTheDocument();
  });
});
