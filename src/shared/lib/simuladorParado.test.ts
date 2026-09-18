import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/server";
import { alFallarElSimulador, apiClient, AppError, SIMULADOR_PARADO } from "./apiClient";

/**
 * Lo que Axel vio: en el login de panel.entraditas.com, con internet perfecto, un
 * "No hay conexión con el servidor del panel. Comprueba tu conexión y vuelve a intentarlo."
 *
 * El panel publicado no tiene servidor: su backend es el simulador, que corre como service worker
 * dentro del navegador y atiende `http://localhost:4000`. Cuando deja de controlar la pestaña esa
 * dirección se intenta de verdad, no hay nada escuchando en el puerto 4000 de su ordenador, y
 * `fetch` falla. Culpar a su conexión es lo único que no puede ser.
 */
describe("cuando el simulador deja de atender", () => {
  beforeEach(() => alFallarElSimulador(async () => undefined));
  afterEach(() => {
    alFallarElSimulador(async () => undefined);
    vi.restoreAllMocks();
  });

  it("lo intenta levantar y reintenta UNA vez, y si vuelve se arregla solo", async () => {
    let fallos = 1;
    server.use(
      http.get("http://localhost:4000/api/v1/events", () => {
        if (fallos-- > 0) return HttpResponse.error();
        return HttpResponse.json({ data: [{ id: "ok" }] });
      })
    );
    const levantar = vi.fn().mockResolvedValue(undefined);
    alFallarElSimulador(levantar);

    await expect(apiClient.get("/events")).resolves.toEqual([{ id: "ok" }]);
    expect(levantar).toHaveBeenCalledTimes(1);
  });

  it("si al reintentar sigue sin atender, dice que hay que recargar y no culpa a la conexión", async () => {
    server.use(http.get("http://localhost:4000/api/v1/events", () => HttpResponse.error()));
    const levantar = vi.fn().mockResolvedValue(undefined);
    alFallarElSimulador(levantar);

    const fallo = await apiClient.get("/events").catch((error: unknown) => error);

    expect(fallo).toBeInstanceOf(AppError);
    expect((fallo as AppError).code).toBe(SIMULADOR_PARADO);
    expect((fallo as AppError).message).toContain("Recarga la página");
    expect((fallo as AppError).message).not.toContain("conexión con el servidor");
    expect((fallo as AppError).message).not.toContain("Comprueba tu conexión");
    expect(levantar).toHaveBeenCalledTimes(1);
  });

  it("no reintenta en bucle: un solo intento de levantarlo", async () => {
    server.use(http.get("http://localhost:4000/api/v1/events", () => HttpResponse.error()));
    const levantar = vi.fn().mockResolvedValue(undefined);
    alFallarElSimulador(levantar);

    await expect(apiClient.get("/events")).rejects.toThrow();

    expect(levantar).toHaveBeenCalledTimes(1);
  });

  it("si ni siquiera se puede levantar, lo dice igual en vez de reventar", async () => {
    server.use(http.get("http://localhost:4000/api/v1/events", () => HttpResponse.error()));
    alFallarElSimulador(async () => {
      throw new Error("el service worker no se pudo registrar");
    });

    await expect(apiClient.get("/events")).rejects.toMatchObject({
      code: SIMULADOR_PARADO,
      message: expect.stringContaining("Recarga la página")
    });
  });

  // Un error del servidor SÍ trae respuesta: no es esto y no debe confundirse con esto.
  it("un 500 con cuerpo no se confunde con el simulador parado", async () => {
    server.use(
      http.get("http://localhost:4000/api/v1/events", () =>
        HttpResponse.json({ error: { code: "BOOM", message: "Se rompio algo" } }, { status: 500 })
      )
    );
    const levantar = vi.fn().mockResolvedValue(undefined);
    alFallarElSimulador(levantar);

    await expect(apiClient.get("/events")).rejects.toMatchObject({ code: "BOOM" });
    expect(levantar).not.toHaveBeenCalled();
  });
});
