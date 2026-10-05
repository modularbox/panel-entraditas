import { beforeEach, describe, expect, it, vi } from "vitest";
import * as entraditasApi from "./entraditasApi";
import { clearApiToken, clearSesionActiva, getApiToken, normalizeApiBase, storeApiToken, storeTabApiToken } from "./entraditasApi";

describe("normalizeApiBase", () => {
  it("deja la url tal cual cuando ya trae protocolo", () => {
    expect(normalizeApiBase("https://api.entraditas.com")).toBe("https://api.entraditas.com");
    expect(normalizeApiBase("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
  });

  it("anade https cuando falta el protocolo", () => {
    // Sin esto, `fetch("api.entraditas.com/v1/...")` se resuelve como ruta relativa al panel y la
    // publicacion falla sin explicar por que.
    expect(normalizeApiBase("api.entraditas.com")).toBe("https://api.entraditas.com");
  });

  it("quita la barra final para no acabar con dobles barras al concatenar la ruta", () => {
    expect(normalizeApiBase("https://api.entraditas.com/")).toBe("https://api.entraditas.com");
    expect(normalizeApiBase("https://api.entraditas.com///")).toBe("https://api.entraditas.com");
  });

  it("una variable vacia o sin definir significa 'sin API', no una url rota", () => {
    expect(normalizeApiBase("")).toBe("");
    expect(normalizeApiBase(undefined)).toBe("");
    expect(normalizeApiBase("   ")).toBe("");
  });
});

describe("fetchPublicCatalog", () => {
  it("devuelve [] cuando la API no esta configurada", async () => {
    vi.spyOn(entraditasApi, "isApiConfigured").mockReturnValue(false);
    const items = await entraditasApi.fetchPublicCatalog();
    expect(items).toEqual([]);
  });
});

describe("token por pestana", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("usa el token de la pestana mientras haya uno, sin pisar el compartido", () => {
    storeApiToken("superadmin-token");
    storeTabApiToken("organizer-token");

    expect(getApiToken()).toBe("organizer-token");
    expect(localStorage.getItem("entraditas.panel.apiToken")).toBe("superadmin-token");
  });

  it("vuelve al compartido cuando la pestana ya no tiene token propio", () => {
    storeApiToken("superadmin-token");
    storeTabApiToken("organizer-token");
    sessionStorage.removeItem("entraditas.panel.apiToken.pestana");

    expect(getApiToken()).toBe("superadmin-token");
  });

  it("entrar deja obsoleta la sesion de pestana que hubiera", () => {
    storeApiToken("superadmin-token");
    storeTabApiToken("organizer-token");

    storeApiToken("otro-cuenta-token");

    expect(getApiToken()).toBe("otro-cuenta-token");
    expect(sessionStorage.getItem("entraditas.panel.apiToken.pestana")).toBeNull();
  });

  it("una pestana conectada que caduca NO se lleva por delante la sesion del superadmin", () => {
    storeApiToken("superadmin-token");
    storeTabApiToken("organizer-token");

    clearSesionActiva();

    expect(getApiToken()).toBe("superadmin-token");
  });

  it("si no hay sesion de pestana, lo que caduca es la compartida", () => {
    storeApiToken("superadmin-token");

    clearSesionActiva();

    expect(getApiToken()).toBeNull();
  });

  it("cerrar sesion se lleva las dos, porque es una decision sobre el navegador entero", () => {
    storeApiToken("superadmin-token");
    storeTabApiToken("organizer-token");

    clearApiToken();

    expect(getApiToken()).toBeNull();
    expect(localStorage.getItem("entraditas.panel.apiToken")).toBeNull();
    expect(sessionStorage.getItem("entraditas.panel.apiToken.pestana")).toBeNull();
  });
});
