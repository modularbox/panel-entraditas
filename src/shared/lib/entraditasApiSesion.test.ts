import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as apiClient from "./apiClient";

/**
 * Lo que fallaba: la tanda 5 hizo que cualquier 401 cerrara la sesión y llevara al login, pero eso
 * vive en `apiClient`, y todo lo que habla con api.entraditas.com pasa por `entraditasApi`, que
 * ante un 401 lanzaba un `Error` pelado. El panel seguía navegando con una sesión muerta y cada
 * pantalla enseñaba su propio error en rojo ("No se pudieron cargar las organizaciones").
 */
describe("entraditasApi y la sesión caducada", () => {
  const fetchOriginal = global.fetch;

  beforeEach(() => {
    vi.stubEnv("VITE_API_URL", "https://api.entraditas.com");
    localStorage.setItem("entraditas.panel.apiToken", "token-viejo");
  });

  afterEach(() => {
    global.fetch = fetchOriginal;
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    // Sin `vi.resetModules()` a proposito: al reiniciar el registro, `entraditasApi` cargaria una
    // copia NUEVA de `apiClient`, y el espia de este fichero esta puesto en la de arriba. El
    // primer test pasaria y los demas dirian "no se ha llamado" por eso y no por el codigo.
  });

  function responder(status: number, body: unknown) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body
    }) as unknown as typeof fetch;
  }

  it("un 401 pidiendo datos avisa de que la sesión se ha caído", async () => {
    const aviso = vi.spyOn(apiClient, "avisarDeSesionPerdida").mockImplementation(() => undefined);
    const { fetchApiCustomers } = await import("./entraditasApi");
    responder(401, { error: "Sesion no valida o caducada." });

    await expect(fetchApiCustomers()).rejects.toThrow();
    expect(aviso).toHaveBeenCalledTimes(1);
    // Y el token se tira: si no, el panel seguiría creyendo que puede leer de la API.
    expect(localStorage.getItem("entraditas.panel.apiToken")).toBeNull();
  });

  /**
   * Este hosting se come la cabecera `Authorization` de vez en cuando y devuelve 403. Para quien
   * lo vive es lo mismo que no tener sesión, así que tiene que acabar igual: en el login.
   */
  it("un 403 cuenta igual que un 401", async () => {
    const aviso = vi.spyOn(apiClient, "avisarDeSesionPerdida").mockImplementation(() => undefined);
    const { fetchApiOrganizations } = await import("./entraditasApi");
    responder(403, { error: "Esta sesion no tiene permiso para esta operacion." });

    await expect(fetchApiOrganizations()).rejects.toThrow();
    expect(aviso).toHaveBeenCalledTimes(1);
  });

  it("entrar con la contraseña mal NO cuenta como sesión caída", async () => {
    const aviso = vi.spyOn(apiClient, "avisarDeSesionPerdida").mockImplementation(() => undefined);
    const { conectarConLaApi } = await import("./entraditasApi");
    responder(401, { error: "Correo o contrasena incorrectos." });

    await expect(conectarConLaApi("quien@entraditas.com", "loquesea")).rejects.toThrow();
    expect(aviso).not.toHaveBeenCalled();
  });

  it("preguntar quién soy tampoco: es justo la llamada que comprueba la sesión", async () => {
    const aviso = vi.spyOn(apiClient, "avisarDeSesionPerdida").mockImplementation(() => undefined);
    const { quienSoyEnLaApi } = await import("./entraditasApi");
    responder(401, { error: "Sesion no valida o caducada." });

    await expect(quienSoyEnLaApi()).resolves.toBeNull();
    expect(aviso).not.toHaveBeenCalled();
  });

  /**
   * De punta a punta y sin espías: un 401 de la API tiene que acabar cerrando la sesión del panel
   * y dejando escrito el motivo, que es lo que hace que el login lo explique en vez de decir solo
   * "entra". Es el camino entero que faltaba.
   */
  it("un 401 de la API cierra la sesión del panel y deja dicho por qué", async () => {
    const { useSessionStore } = await import("@/shared/auth/sessionStore");
    const { leerCierre, olvidarCierre } = await import("@/shared/auth/sessionExpiry");
    const { fetchApiMetrics } = await import("./entraditasApi");

    olvidarCierre();
    useSessionStore.setState({
      token: "token-del-panel",
      user: { id: "u", email: "s@entraditas.com", fullName: "S", role: "superadmin", organizationId: null },
      effectivePermissions: new Set(),
      eventScopes: [],
      status: "authenticated"
    });
    responder(401, { error: "Sesion no valida o caducada." });

    await expect(fetchApiMetrics()).rejects.toThrow();

    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().token).toBeNull();
    expect(leerCierre()).toEqual({ motivo: "sesion-no-valida" });
    olvidarCierre();
  });

  it("un 404 no toca la sesión: ese cliente no existe, pero tú sigues dentro", async () => {
    const aviso = vi.spyOn(apiClient, "avisarDeSesionPerdida").mockImplementation(() => undefined);
    const { fetchApiCustomer } = await import("./entraditasApi");
    responder(404, { error: "Ese cliente no existe." });

    await expect(fetchApiCustomer("nadie@example.com")).resolves.toBeNull();
    expect(aviso).not.toHaveBeenCalled();
    expect(localStorage.getItem("entraditas.panel.apiToken")).toBe("token-viejo");
  });
});
