import { describe, expect, it } from "vitest";
import { opacidadEnBarra, opacidadReal } from "./format";

describe("opacidad de la marca de agua", () => {
  it("el 100% de la barra es una opacidad real de 0.10", () => {
    expect(opacidadReal(100)).toBe(0.1);
    expect(opacidadReal(0)).toBe(0);
    expect(opacidadReal(50)).toBe(0.05);
  });

  it("pinta en la barra la opacidad guardada", () => {
    expect(opacidadEnBarra(0.08)).toBe(80);
    expect(opacidadEnBarra(0.1)).toBe(100);
    expect(opacidadEnBarra(0)).toBe(0);
  });

  it("no se sale de 0..100 con valores guardados fuera de rango", () => {
    expect(opacidadEnBarra(0.5)).toBe(100);
    expect(opacidadEnBarra(-1)).toBe(0);
    expect(opacidadEnBarra(Number.NaN)).toBe(0);
    expect(opacidadReal(250)).toBe(0.1);
  });

  it("ida y vuelta sin perder el valor", () => {
    for (let barra = 0; barra <= 100; barra++) expect(opacidadEnBarra(opacidadReal(barra))).toBe(barra);
  });
});
