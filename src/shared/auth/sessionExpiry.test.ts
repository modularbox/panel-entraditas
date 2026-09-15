import { afterEach, describe, expect, it } from "vitest";
import {
  describirInactividad,
  guardarCierre,
  leerCierre,
  mensajeDeCierre,
  olvidarCierre
} from "./sessionExpiry";

afterEach(() => olvidarCierre());

describe("describirInactividad", () => {
  it("cuenta minutos", () => {
    expect(describirInactividad(32 * 60_000)).toBe("32 minutos");
    expect(describirInactividad(60_000)).toBe("1 minuto");
  });

  it("nunca dice cero minutos, aunque el tiempo sea ridiculo", () => {
    expect(describirInactividad(1_500)).toBe("1 minuto");
  });

  it("redondea hacia abajo: es mejor quedarse corto que pasarse", () => {
    expect(describirInactividad(31 * 60_000 + 59_000)).toBe("31 minutos");
  });

  it("pasa a horas", () => {
    expect(describirInactividad(60 * 60_000)).toBe("1 hora");
    expect(describirInactividad(65 * 60_000)).toBe("1 hora y 5 minutos");
    expect(describirInactividad(3 * 60 * 60_000)).toBe("3 horas");
  });

  it("y a dias, para el portatil que estuvo cerrado el fin de semana", () => {
    expect(describirInactividad(48 * 60 * 60_000)).toBe("2 días");
    expect(describirInactividad(26 * 60 * 60_000)).toBe("1 día y 2 horas");
  });
});

describe("mensajeDeCierre", () => {
  it("dice cuanto tiempo se ha estado sin tocar nada", () => {
    expect(mensajeDeCierre({ motivo: "inactividad", inactivoMs: 45 * 60_000 }, 30)).toContain("45 minutos");
  });

  it("sin el dato, cae al limite configurado en vez de callarse", () => {
    expect(mensajeDeCierre({ motivo: "inactividad" }, 30)).toContain("30 minutos");
  });

  it("distingue una sesion que dejo de valer de una inactividad", () => {
    const mensaje = mensajeDeCierre({ motivo: "sesion-no-valida" }, 30);
    expect(mensaje).toContain("ya no era válida");
    expect(mensaje).not.toContain("sin tocar nada");
  });
});

describe("el motivo sobrevive a un recargado de pagina", () => {
  it("se guarda y se lee", () => {
    guardarCierre({ motivo: "inactividad", inactivoMs: 90_000 });
    expect(leerCierre()).toEqual({ motivo: "inactividad", inactivoMs: 90_000 });
  });

  it("se olvida cuando ya se ha contado", () => {
    guardarCierre({ motivo: "sesion-no-valida" });
    olvidarCierre();
    expect(leerCierre()).toBeNull();
  });

  it("no se cree cualquier cosa que haya en el almacenamiento", () => {
    sessionStorage.setItem("entraditas.panel.cierreDeSesion", "{no es json");
    expect(leerCierre()).toBeNull();
    sessionStorage.setItem("entraditas.panel.cierreDeSesion", JSON.stringify({ motivo: "otra cosa" }));
    expect(leerCierre()).toBeNull();
  });
});
