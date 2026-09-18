import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { demoPasswordFor, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { LoginPage } from "@/features/auth/LoginPage";
import { useSessionStore } from "./sessionStore";
import { leerCierre, olvidarCierre } from "./sessionExpiry";
import { MINUTOS_DE_INACTIVIDAD } from "./useInactivityLogout";

async function entrar() {
  await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
}

function renderLogin() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("cuando la sesion se cae sola", () => {
  afterEach(() => {
    resetDb();
    olvidarCierre();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("se sale del panel por no tocar nada, y queda dicho cuanto tiempo fue", async () => {
    await entrar();
    expect(useSessionStore.getState().status).toBe("authenticated");

    useSessionStore.getState().expire("inactividad", 47 * 60_000);

    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().token).toBeNull();
    expect(leerCierre()).toEqual({ motivo: "inactividad", inactivoMs: 47 * 60_000 });
    // Y el enrutador solo deja el login cuando no hay sesion (ver router.tsx).
  });

  /**
   * Antes un 401 se quedaba en el mensaje de error de la pantalla donde saltara y el panel seguia
   * navegando con una sesion muerta: cada pantalla fallaba a su manera hasta que alguien recargaba.
   */
  it("un 401 en cualquier peticion cierra la sesion, no solo ensena un error", async () => {
    await entrar();
    server.use(
      http.get("http://localhost:4000/api/v1/events", () =>
        HttpResponse.json(
          { error: { code: "UNAUTHENTICATED", message: "Sesion no valida", requestId: "req" } },
          { status: 401 }
        )
      )
    );

    await expect(apiClient.get("/events", { token: useSessionStore.getState().token! })).rejects.toBeInstanceOf(AppError);

    await waitFor(() => expect(useSessionStore.getState().status).toBe("unauthenticated"));
    expect(leerCierre()?.motivo).toBe("sesion-no-valida");
  });

  it("pero equivocarse de contrasena no cuenta como sesion caida", async () => {
    await expect(useSessionStore.getState().login("admin@entraditas.com", "no-es-la-buena")).rejects.toThrow();
    expect(leerCierre()).toBeNull();
  });

  it("el login cuenta que ha sido por inactividad y cuanto", async () => {
    await entrar();
    useSessionStore.getState().expire("inactividad", 47 * 60_000);

    renderLogin();

    expect(screen.getByRole("status")).toHaveTextContent(/llevabas 47 minutos sin tocar nada/i);
    expect(screen.getByRole("status")).toHaveTextContent(/Vuelve a entrar/i);
  });

  it("sin el dato del tiempo, dice el limite en vez de callarselo", async () => {
    await entrar();
    useSessionStore.getState().expire("sesion-no-valida");

    renderLogin();

    expect(screen.getByRole("status")).toHaveTextContent(/ya no era válida/i);
    expect(MINUTOS_DE_INACTIVIDAD).toBeGreaterThan(0);
  });

  it("al entrar de nuevo, el aviso se va: ya ha cumplido", async () => {
    await entrar();
    useSessionStore.getState().expire("inactividad", 60_000);
    expect(leerCierre()).not.toBeNull();

    await entrar();

    expect(leerCierre()).toBeNull();
  });

  it("salir a proposito no deja ningun aviso", async () => {
    await entrar();
    await useSessionStore.getState().logout();

    expect(leerCierre()).toBeNull();
  });

  it("una sesion ya cerrada no se vuelve a cerrar ni pisa el motivo original", async () => {
    await entrar();
    useSessionStore.getState().expire("inactividad", 60_000);
    useSessionStore.getState().expire("sesion-no-valida");

    expect(leerCierre()).toEqual({ motivo: "inactividad", inactivoMs: 60_000 });
  });
});

describe("cuando el servidor del panel no contesta", () => {
  afterEach(() => {
    resetDb();
    olvidarCierre();
  });

  /**
   * "No se pudo guardar el evento" era el mismo mensaje para esto, para una sesion caducada y para
   * un campo mal: no habia nada que hacer con el salvo volver a pulsar a ver si sonaba la flauta.
   *
   * Y el mensaje que lo sustituyo tampoco valia: decia "no hay conexion, comprueba tu conexion",
   * que culpa al internet de quien mira. El panel publicado no tiene servidor —su backend es el
   * simulador, dentro del propio navegador—, asi que esto significa que el simulador ha dejado de
   * atender, y lo que lo arregla es recargar, no cambiar de wifi.
   */
  it("dice que hay que recargar, en vez de culpar a la conexion de quien mira", async () => {
    server.use(http.get("http://localhost:4000/api/v1/events", () => HttpResponse.error()));

    await expect(apiClient.get("/events")).rejects.toMatchObject({
      code: "SIMULADOR_PARADO",
      message: expect.stringContaining("Recarga la página")
    });
  });

  it("y quedarse sin sesion por eso no pasa: un fallo de red no es un 401", async () => {
    server.use(http.get("http://localhost:4000/api/v1/events", () => HttpResponse.error()));
    await entrar();

    await expect(apiClient.get("/events")).rejects.toThrow();

    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(leerCierre()).toBeNull();
  });
});
