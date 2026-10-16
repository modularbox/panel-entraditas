import { describe, expect, it } from "vitest";
import { crearStep1Schema } from "./step1Schema";

const base = {
  category: "concierto",
  title: "Concierto de prueba",
  datePending: false,
  notifyWhenDateConfirmed: false,
  location: "Teatro",
  locality: "Madrid",
  description: "Descripción",
  serviceFeeType: "none" as const,
  hasSubEvents: false
};

describe("crearStep1Schema", () => {
  it("no deja poner una fecha ya pasada", () => {
    const resultado = crearStep1Schema().safeParse({ ...base, startDate: "2020-01-01", startTime: "21:00" });
    expect(resultado.success).toBe(false);
    if (!resultado.success) expect(resultado.error.issues[0]?.message).toBe("La fecha no puede estar en el pasado");
  });

  it("deja una fecha futura", () => {
    expect(crearStep1Schema().safeParse({ ...base, startDate: "2099-01-01", startTime: "21:00" }).success).toBe(true);
  });

  it("deja guardar un evento antiguo sin moverle la fecha", () => {
    const schema = crearStep1Schema({ startDate: "2020-01-01", startTime: "21:00" });
    expect(schema.safeParse({ ...base, startDate: "2020-01-01", startTime: "21:00" }).success).toBe(true);
    expect(schema.safeParse({ ...base, startDate: "2020-01-02", startTime: "21:00" }).success).toBe(false);
  });
});
