import { describe, expect, it } from "vitest";
import type { Zone } from "@entraditas/types";
import {
  clampPercent,
  colocarSinSolape,
  computeDragPosition,
  computeResizeSize,
  colocarPlantilla,
  defaultZoneLayout,
  obstaculosPara,
  seSolapan,
  TAMANO_MINIMO_ZONA,
  zonasSuperpuestas
} from "./zoneGeometry";

describe("clampPercent", () => {
  it("clamps within the given range", () => {
    expect(clampPercent(150, 0, 100)).toBe(100);
    expect(clampPercent(-10, 0, 100)).toBe(0);
    expect(clampPercent(50, 0, 100)).toBe(50);
  });
});

describe("seSolapan", () => {
  it("is false when the rectangles only touch", () => {
    expect(seSolapan({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
    expect(seSolapan({ x: 0, y: 0, width: 10, height: 10 }, { x: 0, y: 10, width: 10, height: 10 })).toBe(false);
  });

  it("is true when they share area", () => {
    expect(seSolapan({ x: 0, y: 0, width: 10, height: 10 }, { x: 9, y: 9, width: 10, height: 10 })).toBe(true);
  });
});

describe("computeDragPosition", () => {
  it("moves by the given delta", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    expect(computeDragPosition(zone, 5, -5)).toEqual({ x: 15, y: 5 });
  });

  it("clamps so the zone never leaves the canvas", () => {
    const zone = { x: 90, y: 90, width: 20, height: 20 };
    expect(computeDragPosition(zone, 50, 50)).toEqual({ x: 80, y: 80 });
  });

  it("stops at the near face of a neighbour instead of crossing it", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    const vecina = { x: 40, y: 10, width: 20, height: 20 };
    expect(computeDragPosition(zone, 40, 0, [vecina])).toEqual({ x: 20, y: 10 });
  });

  it("stops at the far face when arriving from the other side", () => {
    const zone = { x: 70, y: 10, width: 20, height: 20 };
    const vecina = { x: 40, y: 10, width: 20, height: 20 };
    expect(computeDragPosition(zone, -40, 0, [vecina])).toEqual({ x: 60, y: 10 });
  });

  it("keeps sliding along the neighbour's face", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    const vecina = { x: 40, y: 10, width: 20, height: 20 };
    expect(computeDragPosition(zone, 40, 15, [vecina])).toEqual({ x: 20, y: 25 });
  });

  it("ignores neighbours it does not reach", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    const vecina = { x: 40, y: 60, width: 20, height: 20 };
    expect(computeDragPosition(zone, 40, 0, [vecina])).toEqual({ x: 50, y: 10 });
  });
});

describe("computeResizeSize", () => {
  it("resizes by the given delta", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    expect(computeResizeSize(zone, 10, -5)).toEqual({ width: 30, height: 15 });
  });

  it("never shrinks below the minimum size or grows past the canvas edge", () => {
    const zone = { x: 90, y: 90, width: 20, height: 20 };
    expect(computeResizeSize(zone, 50, 50)).toEqual({ width: 10, height: 10 });
    expect(computeResizeSize(zone, -50, -50)).toEqual({ width: TAMANO_MINIMO_ZONA, height: TAMANO_MINIMO_ZONA });
  });

  it("stops the width at a neighbour on the right", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    const vecina = { x: 50, y: 10, width: 20, height: 20 };
    expect(computeResizeSize(zone, 40, 0, [vecina])).toEqual({ width: 40, height: 20 });
  });

  it("stops the height at a neighbour right below", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    const vecina = { x: 10, y: 50, width: 20, height: 20 };
    expect(computeResizeSize(zone, 0, 40, [vecina])).toEqual({ width: 20, height: 40 });
  });
});

describe("defaultZoneLayout", () => {
  it("places a stage at a fixed top position", () => {
    expect(defaultZoneLayout("stage", [])).toEqual({ x: 20, y: 2, width: 60, height: 12 });
  });

  it("places an accessible marker at a fixed bottom-left position", () => {
    expect(defaultZoneLayout("accessible", [])).toEqual({ x: 2, y: 86, width: 14, height: 12 });
  });

  it("staggers sellable zones across a 3-column grid", () => {
    const existing: Zone[] = [
      { id: "z1", venueId: "v1", name: "A", kind: "standing", capacity: 0, x: 0, y: 0, width: 1, height: 1 },
      { id: "z2", venueId: "v1", name: "B", kind: "numbered", capacity: 0, x: 0, y: 0, width: 1, height: 1 },
      { id: "z3", venueId: "v1", name: "C", kind: "stage", capacity: 0, x: 0, y: 0, width: 1, height: 1 }
    ];
    // 2 sellable zones already placed (the stage doesn't count) -> next goes to column index 2
    expect(defaultZoneLayout("standing", existing)).toEqual({ x: 57, y: 20, width: 22, height: 18 });
  });
});

describe("colocarSinSolape", () => {
  it("keeps the requested spot when it is free", () => {
    const deseado = { x: 10, y: 10, width: 20, height: 20 };
    expect(colocarSinSolape(deseado, [{ x: 50, y: 50, width: 10, height: 10 }])).toEqual(deseado);
  });

  it("pulls a zone that would overflow the canvas back inside", () => {
    expect(colocarSinSolape({ x: 5, y: 98, width: 22, height: 18 }, [])).toEqual({ x: 5, y: 82, width: 22, height: 18 });
  });

  it("caps oversized zones to the canvas and the minimum size", () => {
    expect(colocarSinSolape({ x: 0, y: 0, width: 300, height: 0.5 }, [])).toEqual({
      x: 0,
      y: 0,
      width: 100,
      height: TAMANO_MINIMO_ZONA
    });
  });

  it("moves to the nearest free spot instead of landing on another zone", () => {
    const ocupada = { x: 20, y: 2, width: 60, height: 12 };
    const colocada = colocarSinSolape({ x: 20, y: 2, width: 60, height: 12 }, [ocupada]);
    expect(seSolapan(colocada, ocupada)).toBe(false);
    expect(colocada).toEqual({ x: 20, y: 14, width: 60, height: 12 });
  });

  it("shrinks the zone when there is no room for it at full size", () => {
    const obstaculos = [
      { x: 0, y: 0, width: 100, height: 45 },
      { x: 0, y: 55, width: 100, height: 45 }
    ];
    const colocada = colocarSinSolape({ x: 10, y: 10, width: 30, height: 30 }, obstaculos);
    expect(obstaculos.some((otra) => seSolapan(colocada, otra))).toBe(false);
    expect(colocada.height).toBeLessThanOrEqual(10);
  });
});

const zona = (name: string, kind: Zone["kind"], x: number, y: number, width: number, height: number) => ({
  name,
  kind,
  capacity: 0,
  x,
  y,
  width,
  height
});

describe("obstaculosPara", () => {
  const plano = [zona("Platea", "numbered", 10, 10, 40, 40), zona("Escenario", "stage", 20, 0, 60, 8), zona("P1", "gate", 48, 20, 4, 4)];

  it("a door only collides with other doors", () => {
    expect(obstaculosPara("gate", plano)).toEqual([{ x: 48, y: 20, width: 4, height: 4 }]);
  });

  it("any other zone collides with every zone but the doors", () => {
    expect(obstaculosPara("standing", plano)).toEqual([
      { x: 10, y: 10, width: 40, height: 40 },
      { x: 20, y: 0, width: 60, height: 8 }
    ]);
  });

  it("lets a door be dragged onto the edge of its zone but stops it at another door", () => {
    const puerta = { x: 70, y: 20, width: 4, height: 4 };
    // Sobre la platea: no hay tope, se queda donde la deja el puntero.
    expect(computeDragPosition(puerta, -22, 0, obstaculosPara("gate", plano.slice(0, 2)))).toEqual({ x: 48, y: 20 });
    // Con otra puerta en ese sitio, se para en su borde.
    expect(computeDragPosition(puerta, -22, 0, obstaculosPara("gate", plano))).toEqual({ x: 52, y: 20 });
  });

  it("keeps a dragged door inside the plan", () => {
    expect(computeDragPosition({ x: 90, y: 90, width: 4, height: 4 }, 50, 50, obstaculosPara("gate", plano))).toEqual({ x: 96, y: 96 });
  });

  it("stops a door resize at another door but not at a zone", () => {
    const puerta = { x: 40, y: 20, width: 4, height: 4 };
    expect(computeResizeSize(puerta, 20, 0, obstaculosPara("gate", plano))).toEqual({ width: 8, height: 4 });
    expect(computeResizeSize(puerta, 20, 0, obstaculosPara("gate", plano.slice(0, 2)))).toEqual({ width: 24, height: 4 });
  });

  it("places a new door on top of a zone but never on another door", () => {
    const colocada = colocarSinSolape({ x: 48, y: 20, width: 4, height: 4 }, obstaculosPara("gate", plano));
    expect(seSolapan(colocada, { x: 48, y: 20, width: 4, height: 4 })).toBe(false);
    expect(seSolapan(colocada, { x: 10, y: 10, width: 40, height: 40 })).toBe(true);
  });
});

describe("colocarPlantilla", () => {
  it("keeps template zones where they were saved when the plan is empty", () => {
    const plantilla = [zona("A", "numbered", 5, 20, 22, 18), zona("B", "numbered", 31, 20, 22, 18)];
    expect(colocarPlantilla(plantilla, [])).toEqual(plantilla);
  });

  it("moves template zones off the existing zones and off each other", () => {
    const existentes = [zona("Escenario", "stage", 20, 2, 60, 12), zona("Platea", "numbered", 5, 20, 22, 18)];
    // La plantilla trae un escenario y una platea en el mismo sitio, y dos zonas que se pisan entre si.
    const plantilla = [
      zona("Escenario 2", "stage", 20, 2, 60, 12),
      zona("Platea 2", "numbered", 5, 20, 22, 18),
      zona("Grada", "standing", 6, 21, 22, 18)
    ];
    const colocadas = colocarPlantilla(plantilla, existentes);
    const todas = [...existentes, ...colocadas];
    todas.forEach((una, i) =>
      todas.slice(i + 1).forEach((otra) => expect(seSolapan(una, otra), `${una.name} / ${otra.name}`).toBe(false))
    );
    // Conserva todo lo demas de la zona (nombre, tipo, aforo) y no cambia su tamano si cabe.
    expect(colocadas.map((z) => [z.name, z.kind, z.width, z.height])).toEqual([
      ["Escenario 2", "stage", 60, 12],
      ["Platea 2", "numbered", 22, 18],
      ["Grada", "standing", 22, 18]
    ]);
  });

  it("lets template doors sit on zones but not on other doors, inside the plan and above the minimum size", () => {
    const existentes = [zona("Platea", "numbered", 10, 10, 40, 40), zona("P1", "gate", 48, 20, 4, 4)];
    const plantilla = [zona("P2", "gate", 48, 20, 4, 4), zona("P3", "gate", 99, 99, 1, 1)];
    const [p2, p3] = colocarPlantilla(plantilla, existentes);
    expect(seSolapan(p2!, existentes[1]!)).toBe(false);
    expect(p3).toMatchObject({ x: 100 - TAMANO_MINIMO_ZONA, y: 100 - TAMANO_MINIMO_ZONA, width: TAMANO_MINIMO_ZONA, height: TAMANO_MINIMO_ZONA });
  });
});

describe("zonasSuperpuestas", () => {
  it("lists the zones that overlap, ignoring doors on top of zones", () => {
    const plano = [
      zona("Platea", "numbered", 10, 10, 40, 40),
      zona("Grada", "standing", 45, 10, 20, 20),
      zona("Escenario", "stage", 70, 0, 20, 10),
      zona("P1", "gate", 48, 20, 4, 4)
    ];
    expect(zonasSuperpuestas(plano)).toEqual(["Platea", "Grada"]);
  });

  it("flags two doors on top of each other", () => {
    expect(zonasSuperpuestas([zona("P1", "gate", 10, 10, 4, 4), zona("P2", "gate", 12, 12, 4, 4)])).toEqual(["P1", "P2"]);
  });

  it("is empty when nothing overlaps", () => {
    expect(zonasSuperpuestas([zona("A", "numbered", 0, 0, 10, 10), zona("B", "numbered", 10, 0, 10, 10)])).toEqual([]);
  });
});
