import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
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

async function solveChallenge() {
  fireEvent.click(screen.getByLabelText("No soy un robot"));
  await screen.findByText("Verificado");
}

async function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: password } });
  await solveChallenge();
  fireEvent.click(screen.getByLabelText(/Acepto los/));
  fireEvent.click(screen.getByRole("button", { name: "Entrar" }));
}

describe("LoginPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it.each([
    ["superadmin@entraditas.com", "superadmin1234", "organizations:manage"],
    ["admin@entraditas.com", "admin1234", "users:manage"],
    ["marta.gutierrez@entraditas.com", "marta1234", "orders:read"],
    ["javier.ortega@entraditas.com", "javier1234", "scan:validate"]
  ])("logs in %s and redirects to /eventos with the expected permission granted", async (email, password, expectedPermission) => {
    renderLoginPage();
    await fillAndSubmit(email, password);
    await waitFor(() => expect(screen.getByText("Listado de eventos")).toBeInTheDocument());
    expect(useSessionStore.getState().effectivePermissions.has(expectedPermission)).toBe(true);
  });

  it("shows an error and stays on the login page with wrong credentials", async () => {
    renderLoginPage();
    await fillAndSubmit("admin@entraditas.com", "wrong-password");
    await waitFor(() => expect(screen.getByText("Credenciales inválidas")).toBeInTheDocument());
    expect(screen.queryByText("Listado de eventos")).not.toBeInTheDocument();
  });

  it("blocks submission until the robot checkbox is checked", async () => {
    renderLoginPage();
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "admin@entraditas.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "admin1234" } });
    fireEvent.click(screen.getByLabelText(/Acepto los/));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Marca la casilla para confirmar que no eres un robot")).toBeInTheDocument();
    expect(screen.queryByText("Listado de eventos")).not.toBeInTheDocument();
  });

  it("blocks submission with valid credentials until the terms and conditions are accepted", async () => {
    renderLoginPage();
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "admin@entraditas.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "admin1234" } });
await solveChallenge();
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Debes aceptar los términos y condiciones")).toBeInTheDocument();
    expect(screen.queryByText("Listado de eventos")).not.toBeInTheDocument();
  });

  /**
   * Lo que Axel vio: en el login, con internet perfecto, "No hay conexión con el servidor del
   * panel. Comprueba tu conexión". El panel publicado no tiene servidor —su backend es el
   * simulador, dentro del propio navegador—, así que culpar a su conexión es lo único que no
   * puede ser, y lo que lo arregla es recargar.
   */
  it("si el simulador no atiende, dice que hay que recargar y ofrece hacerlo", async () => {
    server.use(http.post("http://localhost:4000/api/v1/auth/login", () => HttpResponse.error()));
    server.use(http.post("http://localhost:4000/api/v1/auth/session-from-api", () => HttpResponse.error()));

    renderLoginPage();
    await fillAndSubmit("admin@entraditas.com", "admin1234");

    const aviso = await screen.findByText(/Recarga la página/);
    expect(aviso).toBeInTheDocument();
    expect(screen.queryByText(/Comprueba tu conexión/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recargar la página" })).toBeInTheDocument();
  });

  it("con la contraseña mal NO ofrece recargar: recargar ahí no arregla nada", async () => {
    renderLoginPage();
    await fillAndSubmit("admin@entraditas.com", "wrong-password");

    await waitFor(() => expect(screen.getByText("Credenciales inválidas")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Recargar la página" })).not.toBeInTheDocument();
  });
});
