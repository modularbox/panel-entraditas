import { afterEach, describe, expect, it, vi } from "vitest";
import * as entraditasApi from "./entraditasApi";
import { normalizeApiBase } from "./entraditasApi";

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
