import { describe, expect, it } from "vitest";
import { metodoDePago, textoDeMetodoDePago } from "./metodoDePago";

describe("metodoDePago", () => {
  it("lee el método de una compra sin pasarela y la marca como de prueba", () => {
    expect(metodoDePago("sin-pasarela:bizum")).toEqual({ nombre: "Bizum", dePrueba: true });
    expect(textoDeMetodoDePago("sin-pasarela:tarjeta")).toBe("Tarjeta");
  });

  it("una referencia de pasarela real es un pago con tarjeta de verdad", () => {
    expect(textoDeMetodoDePago("pi_3NkL0q2eZvKYlo2C")).toBe("Tarjeta");
  });

  it("sin referencia no inventa nada", () => {
    expect(metodoDePago(null)).toBeNull();
    expect(textoDeMetodoDePago(undefined)).toBe("—");
  });

  it("el texto no marca los pagos de prueba", () => {
    expect(textoDeMetodoDePago("sin-pasarela:bizum")).toBe("Bizum");
    expect(textoDeMetodoDePago("sin-pasarela:monedero")).toBe("Monedero");
  });
});
