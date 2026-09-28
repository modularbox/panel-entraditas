import { describe, expect, it } from "vitest";
import { metodoDePago, textoDeMetodoDePago } from "./metodoDePago";

describe("metodoDePago", () => {
  it("lee el método de una compra sin pasarela y dice que es de prueba", () => {
    expect(metodoDePago("sin-pasarela:bizum")).toEqual({ nombre: "Bizum", dePrueba: true });
    expect(textoDeMetodoDePago("sin-pasarela:tarjeta")).toBe("Tarjeta (prueba)");
  });

  it("una referencia de pasarela real es un pago con tarjeta de verdad", () => {
    expect(textoDeMetodoDePago("pi_3NkL0q2eZvKYlo2C")).toBe("Tarjeta");
  });

  it("sin referencia no inventa nada", () => {
    expect(metodoDePago(null)).toBeNull();
    expect(textoDeMetodoDePago(undefined)).toBe("—");
  });
});
