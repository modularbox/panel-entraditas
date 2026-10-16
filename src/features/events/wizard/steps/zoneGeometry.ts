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
/**
 * Lo minimo que puede medir una zona (en % del plano, por lado). Con menos no se ve ni se puede
 * agarrar para moverla o estirarla.
 */
export const TAMANO_MINIMO_ZONA = 3;

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
 * superior). Tambien se respeta el borde del plano y el tamano minimo (TAMANO_MINIMO_ZONA).
 */
export function computeResizeSize(
  zone: ZoneLayout,
  deltaWidthPercent: number,
  deltaHeightPercent: number,
  obstacles: ZoneLayout[] = []
): { width: number; height: number } {
  const minimo = TAMANO_MINIMO_ZONA;
  let width = clampPercent(zone.width + deltaWidthPercent, Math.min(minimo, 100 - zone.x), 100 - zone.x);
  let height = clampPercent(zone.height + deltaHeightPercent, Math.min(minimo, 100 - zone.y), 100 - zone.y);

  // El ancho y el alto se afectan entre si (al alargar uno cambia con que vecinas topa el otro),
  // asi que se recalcula un par de veces hasta que se asientan.
  for (let pasada = 0; pasada < 3; pasada++) {
    for (const otra of obstacles) {
      // Un vecino que se pise en vertical y empiece a la derecha: el ancho se para en su borde.
      const solapaVertical = zone.y + EPS < otra.y + otra.height && zone.y + height > otra.y + EPS;
      if (solapaVertical && otra.x > zone.x + EPS && otra.x < zone.x + width) {
        width = Math.max(Math.min(minimo, width), otra.x - zone.x);
      }
      // Uno que se pise en horizontal y empiece por debajo: el alto se para en su borde.
      const solapaHorizontal = zone.x + EPS < otra.x + otra.width && zone.x + width > otra.x + EPS;
      if (solapaHorizontal && otra.y > zone.y + EPS && otra.y < zone.y + height) {
        height = Math.max(Math.min(minimo, height), otra.y - zone.y);
      }
    }
  }

  return { width, height };
}

/**
 * Coloca una zona nueva (o una copia) sin salirse del plano ni pisar a ninguna de `obstaculos`.
 *
 * Primero se recorta al plano: ningun lado pasa del 100% ni baja del minimo, y la esquina queda
 * dentro. Si en ese sitio choca con otra zona, se busca el hueco libre mas cercano recorriendo el
 * plano de punto en punto. Si no cabe en ninguna parte, se prueba a encogerla poco a poco; y si ni
 * asi, se devuelve recortada al plano (el plano esta lleno y quien la coloca decide).
 */
export function colocarSinSolape(deseado: ZoneLayout, obstaculos: ZoneLayout[]): ZoneLayout {
  let width = clampPercent(deseado.width, TAMANO_MINIMO_ZONA, 100);
  let height = clampPercent(deseado.height, TAMANO_MINIMO_ZONA, 100);
  const enPlano = (w: number, h: number): ZoneLayout => ({
    x: clampPercent(deseado.x, 0, 100 - w),
    y: clampPercent(deseado.y, 0, 100 - h),
    width: w,
    height: h
  });

  while (true) {
    const inicial = enPlano(width, height);
    if (!obstaculos.some((otra) => seSolapan(inicial, otra))) return inicial;

    let mejor: ZoneLayout | null = null;
    let mejorDistancia = Infinity;
    for (let y = 0; y <= 100 - height + EPS; y += 1) {
      for (let x = 0; x <= 100 - width + EPS; x += 1) {
        const candidato = { x: Math.min(x, 100 - width), y: Math.min(y, 100 - height), width, height };
        const distancia = Math.hypot(candidato.x - inicial.x, candidato.y - inicial.y);
        if (distancia >= mejorDistancia) continue;
        if (obstaculos.some((otra) => seSolapan(candidato, otra))) continue;
        mejor = candidato;
        mejorDistancia = distancia;
      }
    }
    if (mejor) return mejor;

    if (width <= TAMANO_MINIMO_ZONA && height <= TAMANO_MINIMO_ZONA) return enPlano(width, height);
    width = Math.max(TAMANO_MINIMO_ZONA, width * 0.8);
    height = Math.max(TAMANO_MINIMO_ZONA, height * 0.8);
  }
}

type ZonaEnPlano = ZoneLayout & { kind: Zone["kind"] };

/**
 * Las zonas del plano que no puede pisar una zona de tipo `kind`.
 *
 * Las puertas marcan un acceso en el borde de su zona, asi que pueden quedar encima de cualquier
 * zona, pero no encima de otra puerta. El resto de zonas se apartan unas de otras y no cuentan
 * las puertas como tope.
 */
export function obstaculosPara(kind: Zone["kind"], zonas: ZonaEnPlano[]): ZoneLayout[] {
  const esPuerta = kind === "gate";
  return zonas
    .filter((otra) => (otra.kind === "gate") === esPuerta)
    .map(({ x, y, width, height }) => ({ x, y, width, height }));
}

/**
 * Donde cae cada zona de una plantilla al aplicarla sobre un plano que ya tiene zonas.
 *
 * Cada zona se coloca con `colocarSinSolape` contra las que ya hay y contra las de la plantilla
 * colocadas antes que ella, con las mismas reglas que una zona nueva (las puertas solo chocan con
 * puertas). Devuelve las zonas en el mismo orden, con la posicion y el tamano ya ajustados.
 */
export function colocarPlantilla<T extends ZonaEnPlano>(plantilla: T[], existentes: ZonaEnPlano[]): T[] {
  const ocupadas: ZonaEnPlano[] = [...existentes];
  return plantilla.map((zona) => {
    const hueco = colocarSinSolape(zona, obstaculosPara(zona.kind, ocupadas));
    const colocada = { ...zona, ...hueco };
    ocupadas.push(colocada);
    return colocada;
  });
}

/**
 * Nombres de las zonas que ya se pisan entre si (con las reglas de `obstaculosPara`). Sirve para
 * avisar de planos guardados antes de que se impidiera el solape, sin moverlos por sorpresa.
 */
export function zonasSuperpuestas<T extends ZonaEnPlano & { name: string }>(zonas: T[]): string[] {
  const nombres = new Set<string>();
  zonas.forEach((zona, i) => {
    for (const otra of zonas.slice(i + 1)) {
      if ((zona.kind === "gate") !== (otra.kind === "gate")) continue;
      if (!seSolapan(zona, otra)) continue;
      nombres.add(zona.name);
      nombres.add(otra.name);
    }
  });
  return [...nombres];
}
