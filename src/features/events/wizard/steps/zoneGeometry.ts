import type { Zone } from "@entraditas/types";

export interface ZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STAGE_LAYOUT: ZoneLayout = { x: 20, y: 2, width: 60, height: 12 };
const ACCESSIBLE_LAYOUT: ZoneLayout = { x: 2, y: 86, width: 14, height: 12 };
const SELLABLE_GRID_COLUMNS = 3;
const SELLABLE_CELL_WIDTH = 26;
const SELLABLE_CELL_HEIGHT = 22;
const SELLABLE_GRID_START_Y = 20;
const SELLABLE_GRID_GAP = 4;

/** Margen con el que dos bordes se consideran "pegados": por debajo, no cuentan como solape. */
const EPS = 0.01;
/** Cuantas veces se reintenta sacar una zona encima de otra de su vecina mas cercana. */
const MAX_PASADAS = 8;

export function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultZoneLayout(kind: Zone["kind"], existingZones: Zone[]): ZoneLayout {
  if (kind === "stage") return STAGE_LAYOUT;
  if (kind === "accessible") return ACCESSIBLE_LAYOUT;
  const sellableCount = existingZones.filter((z) => z.kind === "numbered" || z.kind === "standing").length;
  const column = sellableCount % SELLABLE_GRID_COLUMNS;
  const row = Math.floor(sellableCount / SELLABLE_GRID_COLUMNS);
  return {
    x: 5 + column * SELLABLE_CELL_WIDTH,
    y: SELLABLE_GRID_START_Y + row * (SELLABLE_CELL_HEIGHT + SELLABLE_GRID_GAP),
    width: SELLABLE_CELL_WIDTH - 4,
    height: SELLABLE_CELL_HEIGHT - 4
  };
}

/** True si los dos rectangulos se pisan de verdad (no solo si se tocan por el borde). */
export function seSolapan(a: ZoneLayout, b: ZoneLayout): boolean {
  return a.x + EPS < b.x + b.width && a.x + a.width > b.x + EPS && a.y + EPS < b.y + b.height && a.y + a.height > b.y + EPS;
}

/**
 * Saca una zona de encima de sus vecinas por el lado mas cercano.
 *
 * Se usa al arrastrar: la zona sigue al puntero hasta que topa con otra, y ahi se desliza por el
 * borde de la que tiene al lado en vez de meterse dentro. Se empuja por donde menos hay que mover
 * (la traslacion mas pequena), que es lo que hace que pegarse a un lado parezca un tope y no un
 * salto. Si el sitio libre queda fuera del plano, se prueba con otra salida; si no hay ninguna,
 * se deja donde estaba.
 */
export function separarDeSolapes(rect: ZoneLayout, obstaculos: ZoneLayout[]): { x: number; y: number } {
  let x = clampPercent(rect.x, 0, 100 - rect.width);
  let y = clampPercent(rect.y, 0, 100 - rect.height);

  for (let pasada = 0; pasada < MAX_PASADAS; pasada++) {
    const actual: ZoneLayout = { x, y, width: rect.width, height: rect.height };
    const choque = obstaculos.find((otra) => seSolapan(actual, otra));
    if (!choque) break;

    // Los cuatro sitios a los que se puede salir, pegando la zona al borde de la vecina.
    const salidas = [
      { x: choque.x + choque.width, y }, // a la derecha
      { x: choque.x - rect.width, y }, // a la izquierda
      { x, y: choque.y + choque.height }, // por debajo
      { x, y: choque.y - rect.height } // por encima
    ]
      .map((salida) => ({
        x: clampPercent(salida.x, 0, 100 - rect.width),
        y: clampPercent(salida.y, 0, 100 - rect.height),
        distancia: Math.hypot(salida.x - x, salida.y - y)
      }))
      .filter((salida) => !obstaculos.some((otra) => seSolapan({ x: salida.x, y: salida.y, width: rect.width, height: rect.height }, otra)))
      .sort((a, b) => a.distancia - b.distancia);

    if (salidas.length === 0) break;
    x = salidas[0]!.x;
    y = salidas[0]!.y;
  }

  return { x, y };
}

/**
 * La posicion al arrastrar, con las zonas que no pueden solaparse como tope.
 *
 * Sin `obstaculos` el comportamiento es el de siempre (solo el borde del plano). Con ellos, la
 * zona no puede acabar encima de ninguna: si el puntero la empuja contra una, la para en la cara
 * por la que llega (y sigue deslizandose por el resto del borde), en vez de dejarla dentro.
 */
export function computeDragPosition(
  zone: ZoneLayout,
  deltaXPercent: number,
  deltaYPercent: number,
  obstacles: ZoneLayout[] = []
): { x: number; y: number } {
  let x = clampPercent(zone.x + deltaXPercent, 0, 100 - zone.width);
  let y = clampPercent(zone.y + deltaYPercent, 0, 100 - zone.height);
  if (obstacles.length === 0) return { x, y };

  // Cada eje se limita contra las zonas que se pisan con la banda contraria. Se repite unas
  // cuantas veces porque mover un eje cambia contra cuales topa el otro.
  for (let pasada = 0; pasada < 4; pasada++) {
    x = limitarEje(zone, "x", x, y, obstacles);
    y = limitarEje(zone, "y", y, x, obstacles);
  }
  // Red de seguridad por si quedo atrapada entre dos topes mas finos que ella.
  return separarDeSolapes({ x, y, width: zone.width, height: zone.height }, obstacles);
}

/**
 * Mueve `valor` (la coordenada `eje` de la zona) lo justo para no meterse en ninguna zona que ya
 * se pisa con la banda del otro eje. Solo topa por el lado del que viene: por eso acepta deslizarse
 * a lo largo de la vecina en vez de saltarla.
 */
function limitarEje(zone: ZoneLayout, eje: "x" | "y", valor: number, banda: number, obstacles: ZoneLayout[]): number {
  const largo = eje === "x" ? zone.width : zone.height;
  const grosor = eje === "x" ? zone.height : zone.width;
  let minimo = 0;
  let maximo = 100 - largo;

  for (const otra of obstacles) {
    // La otra zona tiene que pisar la banda (lo que ocupa la zona en el eje contrario).
    const solapaBanda =
      eje === "x"
        ? banda + EPS < otra.y + otra.height && banda + grosor > otra.y + EPS
        : banda + EPS < otra.x + otra.width && banda + grosor > otra.x + EPS;
    if (!solapaBanda) continue;

    const origen = eje === "x" ? zone.x : zone.y;
    const inicioOtra = eje === "x" ? otra.x : otra.y;
    const finOtra = inicioOtra + (eje === "x" ? otra.width : otra.height);
    if (origen + largo <= inicioOtra + EPS) {
      // Venia por delante de la vecina: no puede pasar de su borde cercano.
      maximo = Math.min(maximo, inicioOtra - largo);
    } else if (origen >= finOtra - EPS) {
      // Venia por detras: no puede retroceder mas alla de su borde lejano.
      minimo = Math.max(minimo, finOtra);
    }
  }

  return clampPercent(valor, minimo, maximo);
}

/**
 * El tamano al redimensionar, sin invadir las zonas vecinas.
 *
 * La esquina que se estira es la de abajo a la derecha, asi que crecer topa con lo que haya a la
 * derecha (el ancho se para en su borde izquierdo) o por debajo (el alto se para en su borde
 * superior). Tambien se respeta el borde del plano y el minimo de 1%.
 */
export function computeResizeSize(
  zone: ZoneLayout,
  deltaWidthPercent: number,
  deltaHeightPercent: number,
  obstacles: ZoneLayout[] = []
): { width: number; height: number } {
  let width = clampPercent(zone.width + deltaWidthPercent, 1, 100 - zone.x);
  let height = clampPercent(zone.height + deltaHeightPercent, 1, 100 - zone.y);

  // El ancho y el alto se afectan entre si (al alargar uno cambia con que vecinas topa el otro),
  // asi que se recalcula un par de veces hasta que se asientan.
  for (let pasada = 0; pasada < 3; pasada++) {
    for (const otra of obstacles) {
      // Un vecino que se pise en vertical y empiece a la derecha: el ancho se para en su borde.
      const solapaVertical = zone.y + EPS < otra.y + otra.height && zone.y + height > otra.y + EPS;
      if (solapaVertical && otra.x > zone.x + EPS && otra.x < zone.x + width) {
        width = Math.max(1, otra.x - zone.x);
      }
      // Uno que se pise en horizontal y empiece por debajo: el alto se para en su borde.
      const solapaHorizontal = zone.x + EPS < otra.x + otra.width && zone.x + width > otra.x + EPS;
      if (solapaHorizontal && otra.y > zone.y + EPS && otra.y < zone.y + height) {
        height = Math.max(1, otra.y - zone.y);
      }
    }
  }

  return { width, height };
}
