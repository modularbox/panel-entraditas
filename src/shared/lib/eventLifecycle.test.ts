import { describe, expect, it } from "vitest";
import { hasEventFinished, isPubliclyVisible, shouldAppearOnPublicSite } from "./eventLifecycle";

const AHORA = new Date("2026-09-07T15:00:00.000Z");

function evento(overrides: Partial<Parameters<typeof shouldAppearOnPublicSite>[0]> = {}) {
  return {
    status: "published" as const,
    startsAt: "2026-10-10T21:00:00.000Z",
    endsAt: null,
    datePending: false,
    ...overrides
  };
}

describe("isPubliclyVisible", () => {
  it("solo se publica un evento publicado", () => {
    expect(isPubliclyVisible("published")).toBe(true);
  });

  it("nada que siga en preparacion o ya retirado llega al comprador", () => {
    for (const status of ["draft", "pending_review", "rejected", "finished"] as const) {
      expect(isPubliclyVisible(status), status).toBe(false);
    }
  });
});

describe("hasEventFinished", () => {
  it("un evento futuro no ha terminado", () => {
    expect(hasEventFinished(evento(), AHORA)).toBe(false);
  });

  it("un evento de ayer si ha terminado", () => {
    expect(hasEventFinished(evento({ startsAt: "2026-09-06T21:00:00.000Z" }), AHORA)).toBe(true);
  });

  it("un evento de esta misma noche todavia no ha terminado a mediodia", () => {
    // Se compara por dias enteros justamente por esto: a las 15:00 un concierto de las 21:00 de
    // hoy tiene que seguir apareciendo.
    expect(hasEventFinished(evento({ startsAt: "2026-09-07T21:00:00.000Z" }), AHORA)).toBe(false);
  });

  it("manda la hora de fin cuando la hay", () => {
    // Empezo ayer y acaba hoy (un festival de noche): no ha terminado.
    expect(
      hasEventFinished(evento({ startsAt: "2026-09-06T22:00:00.000Z", endsAt: "2026-09-07T05:00:00.000Z" }), AHORA)
    ).toBe(false);
  });

  it("un evento con la fecha por confirmar nunca esta terminado", () => {
    expect(hasEventFinished(evento({ datePending: true, startsAt: null }), AHORA)).toBe(false);
  });

  it("sin fecha ninguna, tampoco", () => {
    expect(hasEventFinished(evento({ startsAt: null, endsAt: null }), AHORA)).toBe(false);
  });

  it("una fecha ilegible no lo da por terminado", () => {
    // Ante un dato roto, mejor seguir mostrandolo que hacerlo desaparecer sin explicacion.
    expect(hasEventFinished(evento({ startsAt: "no es una fecha" }), AHORA)).toBe(false);
  });
});

describe("shouldAppearOnPublicSite", () => {
  it("publicado y futuro: se ve", () => {
    expect(shouldAppearOnPublicSite(evento(), AHORA)).toBe(true);
  });

  it("publicado pero ya celebrado: NO se ve", () => {
    // El caso que estaba pasando: "Festival del Sur" seguia publicado con fecha de julio.
    expect(shouldAppearOnPublicSite(evento({ startsAt: "2026-07-16T18:00:00.000Z" }), AHORA)).toBe(false);
  });

  it("un borrador con fecha futura tampoco se ve", () => {
    expect(shouldAppearOnPublicSite(evento({ status: "draft" }), AHORA)).toBe(false);
  });

  it("con la fecha por confirmar se ve si esta publicado", () => {
    expect(shouldAppearOnPublicSite(evento({ status: "published", datePending: true, startsAt: null }), AHORA)).toBe(true);
  });
});
