import type { DashboardOverview } from "./dashboardTypes";

type FilaDeEvento = DashboardOverview["eventMetrics"][number];

/**
 * Por qué se puede ordenar la tabla "Detalle por evento".
 *
 * Es lo que Julio llamaba "filas": un "Ordenar por" con varias opciones. Cada opción es una
 * columna de la tabla, para que lo que se ve ordenado coincida con lo que se lee.
 */
export const CRITERIOS_DE_ORDEN = [
  { id: "fecha", etiqueta: "Fecha" },
  { id: "titulo", etiqueta: "Nombre" },
  { id: "grossRevenue", etiqueta: "Ingresos brutos" },
  { id: "netRevenue", etiqueta: "Ingresos netos" },
  { id: "ticketsSold", etiqueta: "Entradas vendidas" },
  { id: "averageTicket", etiqueta: "Ticket medio" },
  { id: "occupancy", etiqueta: "Aforo" },
  { id: "attendance", etiqueta: "Asistencia" },
  { id: "refunds", etiqueta: "Reembolsos" }
] as const;

export type CriterioDeOrden = (typeof CRITERIOS_DE_ORDEN)[number]["id"];
export type SentidoDeOrden = "asc" | "desc";

/** Lo que se compara de cada fila. `null` = no hay dato (sin fecha, sin aforo...). */
function valorDe(fila: FilaDeEvento, criterio: CriterioDeOrden): number | string | null {
  switch (criterio) {
    case "fecha":
      return fila.startsAt ? new Date(fila.startsAt).getTime() : null;
    case "titulo":
      return fila.title.toLocaleLowerCase("es");
    default:
      return fila[criterio];
  }
}

/**
 * Ordena sin tocar la lista original.
 *
 * Lo que no tiene dato va SIEMPRE al final, ascendente o descendente: un evento sin fecha o sin
 * aforo no es "el más pequeño" ni "el más grande", simplemente no se puede comparar, y dejarlo
 * arriba al ordenar de menor a mayor esconde lo que sí se quería ver.
 */
export function ordenarEventos(filas: FilaDeEvento[], criterio: CriterioDeOrden, sentido: SentidoDeOrden): FilaDeEvento[] {
  const factor = sentido === "asc" ? 1 : -1;
  return [...filas].sort((a, b) => {
    const x = valorDe(a, criterio);
    const y = valorDe(b, criterio);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "es") * factor;
    return ((x as number) - (y as number)) * factor;
  });
}
