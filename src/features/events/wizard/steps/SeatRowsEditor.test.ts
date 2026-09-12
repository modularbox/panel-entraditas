import { describe, expect, it } from "vitest";
import { describirReparto, formatOffset, repartirEnFilas } from "./SeatRowsEditor";

describe("repartirEnFilas", () => {
  it("reparte exacto cuando divide", () => {
    expect(repartirEnFilas(100, 10).map((r) => r.slots)).toEqual([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  });

  it("da el resto a las primeras filas, no una ultima fila ridicula", () => {
    expect(repartirEnFilas(100, 8).map((r) => r.slots)).toEqual([13, 13, 13, 13, 12, 12, 12, 12]);
  });

  it("suma siempre el total pedido", () => {
    for (const [total, filas] of [[100, 8], [37, 5], [7, 3], [1, 1]] as const) {
      expect(repartirEnFilas(total, filas).reduce((s, r) => s + r.slots, 0)).toBe(total);
    }
  });

  it("con mas filas que butacas, hace una fila por butaca en vez de filas vacias", () => {
    expect(repartirEnFilas(3, 10).map((r) => r.slots)).toEqual([1, 1, 1]);
  });

  it("no inventa nada si falta un dato", () => {
    expect(repartirEnFilas(0, 8)).toEqual([]);
    expect(repartirEnFilas(80, 0)).toEqual([]);
  });
});

describe("describirReparto", () => {
  it("resume el reparto para poder verlo antes de aplicarlo", () => {
    expect(describirReparto(repartirEnFilas(100, 8))).toBe("4 filas de 13 y 4 filas de 12");
  });

  it("no dice nada de una sala vacia", () => {
    expect(describirReparto([])).toBe("");
  });
});

describe("formatOffset", () => {
  it("cuenta los medios pasos como fracciones", () => {
    expect(formatOffset(0)).toBe("0");
    expect(formatOffset(1)).toBe("+1/2");
    expect(formatOffset(2)).toBe("+1");
    expect(formatOffset(3)).toBe("+1.5");
    expect(formatOffset(-1)).toBe("-1/2");
    expect(formatOffset(-4)).toBe("-2");
  });
});
