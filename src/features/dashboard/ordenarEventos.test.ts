import { describe, expect, it } from "vitest";
import { ordenarEventos } from "./ordenarEventos";

function fila(id: string, extra: Partial<Parameters<typeof ordenarEventos>[0][number]> = {}) {
  return {
    id,
    title: id,
    status: "published",
    startsAt: null,
    grossRevenue: 0,
    netRevenue: 0,
    ticketsSold: 0,
    averageTicket: null,
    occupancy: null,
    conversion: null,
    attendance: null,
    refunds: 0,
    ...extra
  };
}

const filas = [
  fila("b", { title: "Bailes", grossRevenue: 500, occupancy: 40, startsAt: "2026-10-02T20:00:00Z" }),
  fila("a", { title: "álbum", grossRevenue: 900, occupancy: null, startsAt: null }),
  fila("c", { title: "Cine", grossRevenue: 100, occupancy: 90, startsAt: "2026-10-01T20:00:00Z" })
];

const ids = (lista: ReturnType<typeof ordenarEventos>) => lista.map((f) => f.id);

describe("ordenarEventos", () => {
  it("ordena por importe, de mayor a menor y al revés", () => {
    expect(ids(ordenarEventos(filas, "grossRevenue", "desc"))).toEqual(["a", "b", "c"]);
    expect(ids(ordenarEventos(filas, "grossRevenue", "asc"))).toEqual(["c", "b", "a"]);
  });

  it("ordena por fecha", () => {
    expect(ids(ordenarEventos(filas, "fecha", "asc"))).toEqual(["c", "b", "a"]);
  });

  it("lo que no tiene dato va siempre al final, en los dos sentidos", () => {
    expect(ids(ordenarEventos(filas, "occupancy", "asc")).at(-1)).toBe("a");
    expect(ids(ordenarEventos(filas, "occupancy", "desc")).at(-1)).toBe("a");
    expect(ids(ordenarEventos(filas, "fecha", "desc")).at(-1)).toBe("a");
  });

  it("por nombre respeta el español: 'álbum' va con la A, no detrás de la Z", () => {
    expect(ids(ordenarEventos(filas, "titulo", "asc"))).toEqual(["a", "b", "c"]);
  });

  it("no toca la lista original", () => {
    const copia = ids(filas as never);
    ordenarEventos(filas, "grossRevenue", "desc");
    expect(ids(filas as never)).toEqual(copia);
  });
});
