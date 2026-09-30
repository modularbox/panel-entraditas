import type { PublicEvent } from "@entraditas/types";
import type { EventoDemo, FilasDelEvento } from "./construir";

/**
 * Las ventas de ejemplo de la demo (tanda 19).
 *
 * Sin ventas, el dashboard, Ventas y Clientes del panel salen vacios y los planos de la web con
 * todas las butacas libres: nada parece real. Aqui se generan pedidos creibles para cada sesion,
 * hasta la ocupacion que dice el catalogo: grupos de 1 a 6 entradas, butacas contiguas en la misma
 * fila (las de delante se venden antes), mas compras cerca de hoy que hace un mes, algun codigo de
 * descuento, alguna devolucion y, en lo ya celebrado, entradas escaneadas en la puerta.
 *
 * Es determinista: la misma semilla da siempre los mismos pedidos. Lo generan igual el panel (para
 * sus devoluciones) y el script que prepara la carga de la API, y los dos tienen que coincidir.
 *
 * Los ids empiezan por "demo-": es lo que permite quitar todo esto de golpe antes de abrir al
 * publico sin tocar ni una compra de verdad.
 */

/** "Hoy" para la demo. Fijo, para que dos generaciones den lo mismo. */
export const AHORA_DEMO = new Date("2026-09-29T09:00:00.000Z");

/** El comprador de prueba de entraditas.com (desplegar-api.yml): su "Mis entradas" no sale vacio. */
export const CUENTA_DE_PRUEBA = { email: "prueba@entraditas.com", nombre: "Usuario Prueba", telefono: "+34600000000" };

export interface CompradorDemo {
  id: string;
  nombre: string;
  apellidos: string;
  email: string;
  telefono: string;
  alta: string;
  publicidad: boolean;
}

export interface LineaDemo {
  id: string;
  tipo: string;
  tipoId: string;
  cantidad: number;
  precio: number;
  subtotal: number;
}

export interface EntradaDemo {
  id: string;
  lineaId: string;
  /** "A7 · Patio de butacas", como la guarda la API al comprar; null sin butaca. */
  asiento: string | null;
  estado: "valid" | "used" | "refunded";
  escaneada: string | null;
}

export interface PedidoDemo {
  id: string;
  numero: string;
  eventoId: string;
  sesionId: string;
  organizacionId: string;
  compradorId: string | null;
  /** Solo en los pedidos de la cuenta de prueba: la API busca su id por el correo. */
  cuentaDePrueba?: true;
  nombre: string;
  email: string;
  telefono: string | null;
  estado: "paid" | "refunded";
  subtotal: number;
  descuento: number;
  gastos: number;
  total: number;
  devuelto: number;
  codigo: string | null;
  pago: string;
  creado: string;
  lineas: LineaDemo[];
  entradas: EntradaDemo[];
}

export interface MovimientoDemo {
  id: string;
  importe: number;
  tipo: "topup" | "cashback";
  pedidoId: string | null;
  referencia: string | null;
  nota: string;
  creado: string;
}

export interface VentasDemo {
  compradores: CompradorDemo[];
  pedidos: PedidoDemo[];
  monederoDePrueba: MovimientoDemo[];
}

export interface EventoParaVender {
  demo: EventoDemo;
  filas: FilasDelEvento;
  publico: PublicEvent;
}

// ---------------------------------------------------------------------------------------------
// Azar reproducible

function mulberry32(semilla: number) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Azar = () => number;

function elegir<T>(azar: Azar, lista: readonly T[]): T {
  return lista[Math.floor(azar() * lista.length)]!;
}

function elegirConPeso<T>(azar: Azar, opciones: ReadonlyArray<readonly [T, number]>): T {
  const total = opciones.reduce((suma, [, peso]) => suma + peso, 0);
  let punto = azar() * total;
  for (const [valor, peso] of opciones) {
    punto -= peso;
    if (punto <= 0) return valor;
  }
  return opciones[opciones.length - 1]![0];
}

// ---------------------------------------------------------------------------------------------
// Compradores

const NOMBRES = [
  "Lucía", "Martina", "Sofía", "María", "Paula", "Julia", "Daniela", "Valeria", "Alba", "Carmen",
  "Laura", "Marta", "Irene", "Elena", "Sara", "Nerea", "Claudia", "Ana", "Cristina", "Raquel",
  "Hugo", "Martín", "Lucas", "Mateo", "Leo", "Daniel", "Alejandro", "Pablo", "Manuel", "Álvaro",
  "Javier", "David", "Adrián", "Mario", "Diego", "Sergio", "Jorge", "Carlos", "Iván", "Rubén",
  "Antonio", "José", "Francisco", "Miguel", "Rafael", "Fernando", "Pilar", "Rocío", "Inés", "Noelia"
] as const;

const APELLIDOS = [
  "García", "Rodríguez", "González", "Fernández", "López", "Martínez", "Sánchez", "Pérez", "Gómez",
  "Martín", "Jiménez", "Ruiz", "Hernández", "Díaz", "Moreno", "Muñoz", "Álvarez", "Romero",
  "Alonso", "Gutiérrez", "Navarro", "Torres", "Domínguez", "Vázquez", "Ramos", "Gil", "Ramírez",
  "Serrano", "Blanco", "Molina", "Morales", "Suárez", "Ortega", "Delgado", "Castro", "Ortiz",
  "Rubio", "Marín", "Sanz", "Núñez", "Iglesias", "Medina", "Garrido", "Cortés", "Castillo",
  "Santos", "Lozano", "Guerrero", "Cano", "Prieto", "Méndez", "Cruz", "Calvo", "Gallego", "Vidal",
  "León", "Márquez", "Herrera", "Peña", "Flores", "Cabrera", "Campos", "Vega", "Fuentes", "Carrasco",
  "Diez", "Caballero", "Reyes", "Nieto", "Aguilar", "Pascual", "Santana", "Herrero", "Montero", "Hidalgo"
] as const;

// Dominios reservados para ejemplos (RFC 2606): nunca le llega un correo a nadie.
const DOMINIOS = ["example.com", "example.org", "example.net"] as const;

function sinAcentos(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

function persona(azar: Azar, usados: Set<string>, n: number) {
  const nombre = elegir(azar, NOMBRES);
  const apellidos = `${elegir(azar, APELLIDOS)} ${elegir(azar, APELLIDOS)}`;
  const [primero, segundo] = apellidos.split(" ").map(sinAcentos);
  const base = elegirConPeso(azar, [
    [`${sinAcentos(nombre)}.${primero}`, 4],
    [`${sinAcentos(nombre)}${primero}${10 + (n % 90)}`, 2],
    [`${sinAcentos(nombre).charAt(0)}${primero}${segundo}`, 2],
    [`${sinAcentos(nombre)}_${segundo}`, 1]
  ] as const);
  let email = `${base}@${elegir(azar, DOMINIOS)}`;
  for (let intento = 2; usados.has(email); intento += 1) email = `${base}${intento}@${elegir(azar, DOMINIOS)}`;
  usados.add(email);
  const telefono = `+346${String(Math.floor(azar() * 1e8)).padStart(8, "0")}`;
  return { nombre, apellidos, email, telefono };
}

function generarCompradores(azar: Azar, usados: Set<string>, cuantos: number): CompradorDemo[] {
  const desde = new Date("2025-10-01T00:00:00.000Z").getTime();
  const hasta = new Date("2026-09-27T00:00:00.000Z").getTime();
  return Array.from({ length: cuantos }, (_, indice) => {
    const datos = persona(azar, usados, indice);
    // Mas altas recientes: la plataforma crece.
    const alta = new Date(desde + (hasta - desde) * Math.pow(azar(), 0.6));
    return {
      id: `demo-u-${String(indice + 1).padStart(3, "0")}`,
      ...datos,
      alta: alta.toISOString(),
      publicidad: azar() < 0.4
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Butacas

interface Butaca {
  etiqueta: string;
  columna: number;
}

/** Filas de una zona numerada, desde el escenario, con sus butacas por columna. */
interface FilaLibre {
  tierId: string;
  butacas: Butaca[];
}

function filasDeLaSesion(publico: PublicEvent): FilaLibre[] {
  const filas: FilaLibre[] = [];
  for (const zona of publico.seatMap?.zones ?? []) {
    if (zona.kind !== "seats") continue;
    const porFila = new Map<string, Map<string, Butaca[]>>();
    const orden: string[] = [];
    for (const butaca of zona.seats ?? []) {
      if (!butaca.tierId) continue;
      if (!porFila.has(butaca.row)) {
        porFila.set(butaca.row, new Map());
        orden.push(butaca.row);
      }
      const porTipo = porFila.get(butaca.row)!;
      const lista = porTipo.get(butaca.tierId) ?? [];
      lista.push({ etiqueta: `${butaca.label} · ${zona.name}`, columna: butaca.column ?? butaca.number - 1 });
      porTipo.set(butaca.tierId, lista);
    }
    // Las filas se piden de delante atras (A, B, C...): es lo que se vende primero.
    orden.sort((a, b) => a.length - b.length || a.localeCompare(b));
    for (const fila of orden) {
      for (const [tierId, butacas] of porFila.get(fila)!) {
        filas.push({ tierId, butacas: butacas.sort((a, b) => a.columna - b.columna) });
      }
    }
  }
  return filas;
}

/** `k` butacas juntas en la fila, o null si no caben. Juntas = columnas seguidas, sin pasillo. */
function bloqueEnFila(azar: Azar, fila: FilaLibre, k: number): Butaca[] | null {
  const tramos: Butaca[][] = [];
  let actual: Butaca[] = [];
  for (const butaca of fila.butacas) {
    if (actual.length > 0 && butaca.columna - actual[actual.length - 1]!.columna !== 1) {
      tramos.push(actual);
      actual = [];
    }
    actual.push(butaca);
  }
  if (actual.length > 0) tramos.push(actual);
  const caben = tramos.filter((tramo) => tramo.length >= k);
  if (caben.length === 0) return null;
  const tramo = elegir(azar, caben);
  // Pegado a un extremo del tramo la mayoria de las veces: asi se llena una sala de verdad, sin
  // dejar huecos sueltos en medio de cada fila.
  const inicio = azar() < 0.7 ? (azar() < 0.5 ? 0 : tramo.length - k) : Math.floor(azar() * (tramo.length - k + 1));
  return tramo.slice(inicio, inicio + k);
}

function tomarButacas(azar: Azar, filas: FilaLibre[], tierId: string, k: number): string[] {
  const candidatas = filas.filter((fila) => fila.tierId === tierId && fila.butacas.length > 0);
  // Delante antes que detras, pero no siempre: hay quien prefiere el fondo.
  const pesos = candidatas.map((fila, indice) => [fila, 1 / (1 + indice * 0.35)] as const);
  for (let intento = 0; intento < 6 && pesos.length > 0; intento += 1) {
    const fila = elegirConPeso(azar, pesos);
    const bloque = bloqueEnFila(azar, fila, k);
    if (bloque) {
      fila.butacas = fila.butacas.filter((butaca) => !bloque.includes(butaca));
      return bloque.map((butaca) => butaca.etiqueta);
    }
  }
  // Nadie cabe junto: sueltas, de delante atras.
  const sueltas: string[] = [];
  for (const fila of candidatas) {
    while (sueltas.length < k && fila.butacas.length > 0) sueltas.push(fila.butacas.shift()!.etiqueta);
  }
  return sueltas;
}

// ---------------------------------------------------------------------------------------------
// Importes, con las mismas reglas que la API (api/index.php) y la web (src/lib/fees.ts)

function gastos(evento: EventoDemo, entradas: number, subtotal: number): number {
  if (subtotal <= 0) return 0;
  if (evento.gastos.tipo === "percent") return Math.round((subtotal * evento.gastos.valor) / 100);
  if (evento.gastos.tipo === "fixed") return evento.gastos.valor * entradas;
  return 0;
}

function descuento(evento: EventoDemo, subtotal: number, cuando: Date): { codigo: string; importe: number } | null {
  const valido = (evento.descuentos ?? []).find((d) => !d.hasta || cuando.getTime() <= new Date(`${d.hasta}T23:59:59.000Z`).getTime());
  if (!valido || subtotal <= 0) return null;
  const importe = valido.tipo === "percent" ? Math.round((subtotal * valido.valor) / 100) : Math.min(subtotal, valido.valor);
  return { codigo: valido.codigo, importe };
}

// ---------------------------------------------------------------------------------------------
// Pedidos

interface Borrador {
  evento: EventoParaVender;
  sesionId: string;
  creado: Date;
  lineas: Array<{ tierId: string; nombre: string; precio: number; asientos: (string | null)[] }>;
  pasada: boolean;
  inicioSesion: Date;
  /** Sesion vendida entera: una devolucion la dejaria con entradas sueltas y marcada "agotada". */
  llena?: boolean;
}

const DIA = 86_400_000;

/** Cuando se compro: mas cerca de hoy que del dia que salio a la venta, y algo el primer dia. */
function momentoDeCompra(azar: Azar, apertura: Date, cierre: Date): Date {
  const desde = apertura.getTime();
  const hasta = Math.max(desde + DIA, cierre.getTime());
  const base = azar() < 0.14 ? desde + azar() * 3 * DIA : desde + (hasta - desde) * Math.pow(azar(), 0.55);
  const dia = new Date(Math.min(base, hasta));
  // A que hora se compra: sobre todo por la tarde y la noche.
  const hora = elegirConPeso(azar, [
    [9, 2], [10, 3], [11, 4], [12, 4], [13, 3], [14, 3], [15, 3], [16, 4], [17, 5], [18, 6],
    [19, 7], [20, 8], [21, 8], [22, 6], [23, 3], [0, 1]
  ] as const);
  dia.setUTCHours(hora, Math.floor(azar() * 60), Math.floor(azar() * 60), 0);
  return new Date(Math.min(dia.getTime(), hasta));
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generarVentas(eventos: EventoParaVender[], semilla = 20260929): VentasDemo {
  const azar = mulberry32(semilla);
  const correos = new Set<string>([CUENTA_DE_PRUEBA.email]);
  const compradores = generarCompradores(azar, correos, 260);
  const borradores: Borrador[] = [];
  const deLaCuenta = new Set<Borrador>();

  // Los pedidos de la cuenta de prueba, para que su "Mis entradas" tenga algo que ensenar: dos
  // compras para lo que viene y una de algo ya celebrado. Se sacan antes que el resto de la sesion
  // para que sus butacas esten libres aunque la funcion acabe casi llena.
  const prueba: Array<{ evento: string; sesion: number; tipo: string; cantidad: number; creado: string }> = [
    { evento: "demo-romeo-y-julieta", sesion: 3, tipo: "preferente", cantidad: 2, creado: "2026-09-12T19:42:10.000Z" },
    { evento: "demo-ribera-electronica", sesion: 0, tipo: "general", cantidad: 2, creado: "2026-09-20T22:10:33.000Z" },
    { evento: "demo-cine-bajo-las-estrellas", sesion: 1, tipo: "general", cantidad: 2, creado: "2026-08-10T12:05:48.000Z" }
  ];

  for (const evento of eventos) {
    const { demo, filas, publico } = evento;
    if (demo.estado !== "published" && demo.estado !== "finished") continue;
    const apertura = new Date(publico.salesStartAt ?? filas.event.createdAt);

    filas.subEvents.forEach((subEvent, indice) => {
      const sesion = demo.sesiones[indice]!;
      if (sesion.ocupacion <= 0 || !subEvent.startsAt) return;
      const inicio = new Date(subEvent.startsAt);
      const pasada = inicio.getTime() < AHORA_DEMO.getTime();
      const cierre = new Date(Math.min(inicio.getTime() - 3 * 3_600_000, AHORA_DEMO.getTime()));
      const sesionPublica = publico.sessions.find((s) => s.id === subEvent.id);
      const quedan = new Map<string, number>(
        (sesionPublica?.tiers ?? []).map((tier) => [tier.id, tier.available ?? 0])
      );
      const capacidad = [...quedan.values()].reduce((suma, n) => suma + n, 0);
      let objetivo = Math.round(capacidad * sesion.ocupacion);
      const butacas = filasDeLaSesion(publico);
      const conButaca = new Set(butacas.map((fila) => fila.tierId));
      const maximo = Math.min(publico.rules.maxPerOrder, 6);

      for (const compra of prueba.filter((c) => c.evento === demo.id && c.sesion === indice)) {
        const tierId = `${demo.id}-${compra.tipo}`;
        const tier = publico.tiers.find((t) => t.id === tierId);
        if (!tier) continue;
        const asientos = conButaca.has(tierId) ? tomarButacas(azar, butacas, tierId, compra.cantidad) : Array(compra.cantidad).fill(null);
        quedan.set(tierId, Math.max(0, (quedan.get(tierId) ?? 0) - asientos.length));
        objetivo -= asientos.length;
        const borrador: Borrador = {
          evento,
          sesionId: subEvent.id,
          creado: new Date(compra.creado),
          lineas: [{ tierId, nombre: tier.name, precio: tier.price, asientos }],
          pasada,
          inicioSesion: inicio
        };
        borradores.push(borrador);
        deLaCuenta.add(borrador);
      }

      while (objetivo > 0) {
        const tipos = publico.tiers.filter((tier) => (quedan.get(tier.id) ?? 0) > 0);
        if (tipos.length === 0) break;
        const tier = elegirConPeso(azar, tipos.map((t) => [t, quedan.get(t.id)!] as const));
        const deseadas: number = elegirConPeso(azar, [[1, 16], [2, 44], [3, 11], [4, 18], [5, 5], [6, 6]] as const);
        const cantidad = Math.max(1, Math.min(deseadas, maximo, tier.maxPerOrder, quedan.get(tier.id)!, objetivo));
        const asientos = conButaca.has(tier.id) ? tomarButacas(azar, butacas, tier.id, cantidad) : Array(cantidad).fill(null);
        if (asientos.length === 0) {
          quedan.set(tier.id, 0);
          continue;
        }
        quedan.set(tier.id, quedan.get(tier.id)! - asientos.length);
        objetivo -= asientos.length;
        borradores.push({
          evento,
          sesionId: subEvent.id,
          creado: momentoDeCompra(azar, apertura, cierre),
          lineas: [{ tierId: tier.id, nombre: tier.name, precio: tier.price, asientos }],
          pasada,
          inicioSesion: inicio,
          llena: sesion.ocupacion >= 1
        });
      }
    });
  }

  borradores.sort((a, b) => a.creado.getTime() - b.creado.getTime());

  const numeros = new Set<string>();
  const pedidos: PedidoDemo[] = [];
  let lineaN = 0;
  let entradaN = 0;
  borradores.forEach((borrador, indice) => {
    const { demo } = borrador.evento;
    const id = `demo-o-${String(indice + 1).padStart(5, "0")}`;
    let numero = "";
    do {
      numero = "ENTRADITAS-" + Array.from({ length: 6 }, () => ALFABETO[Math.floor(azar() * ALFABETO.length)]).join("");
    } while (numeros.has(numero));
    numeros.add(numero);

    const esDePrueba = deLaCuenta.has(borrador);
    const invitado = !esDePrueba && azar() < 0.1;
    const comprador = esDePrueba || invitado ? null : compradores[Math.floor(compradores.length * Math.pow(azar(), 1.7))]!;
    const suelto = invitado ? persona(azar, correos, indice) : null;
    const nombre = esDePrueba ? CUENTA_DE_PRUEBA.nombre : comprador ? `${comprador.nombre} ${comprador.apellidos}` : `${suelto!.nombre} ${suelto!.apellidos}`;
    const email = esDePrueba ? CUENTA_DE_PRUEBA.email : comprador?.email ?? suelto!.email;
    const telefono = esDePrueba ? CUENTA_DE_PRUEBA.telefono : comprador?.telefono ?? suelto!.telefono;

    const lineas: LineaDemo[] = [];
    const entradas: EntradaDemo[] = [];
    let subtotal = 0;
    for (const linea of borrador.lineas) {
      lineaN += 1;
      const lineaId = `demo-i-${String(lineaN).padStart(5, "0")}`;
      lineas.push({
        id: lineaId,
        tipo: linea.nombre,
        tipoId: linea.tierId,
        cantidad: linea.asientos.length,
        precio: linea.precio,
        subtotal: linea.precio * linea.asientos.length
      });
      subtotal += linea.precio * linea.asientos.length;
      for (const asiento of linea.asientos) {
        entradaN += 1;
        entradas.push({ id: `demo-t-${String(entradaN).padStart(5, "0")}`, lineaId, asiento, estado: "valid", escaneada: null });
      }
    }

    const cantidad = entradas.length;
    const conDescuento = !esDePrueba && azar() < 0.12 ? descuento(demo, subtotal, borrador.creado) : null;
    const gasto = gastos(demo, cantidad, subtotal);
    const total = Math.max(0, subtotal - (conDescuento?.importe ?? 0) + gasto);
    // Devoluciones solo sin butaca: una butaca devuelta sigue ocupando su sitio en la base (clave
    // unica por sesion y butaca) y no se podria volver a vender.
    const devuelto = !esDePrueba && !borrador.llena && entradas.every((e) => e.asiento === null) && azar() < 0.02;

    if (devuelto) {
      for (const entrada of entradas) entrada.estado = "refunded";
    } else if (borrador.pasada) {
      for (const entrada of entradas) {
        if (azar() < 0.91) {
          entrada.estado = "used";
          entrada.escaneada = new Date(borrador.inicioSesion.getTime() - Math.floor(azar() * 40) * 60_000).toISOString();
        }
      }
    }

    pedidos.push({
      id,
      numero,
      eventoId: demo.id,
      sesionId: borrador.sesionId,
      organizacionId: demo.organizationId,
      compradorId: comprador?.id ?? null,
      ...(esDePrueba ? { cuentaDePrueba: true as const } : {}),
      nombre,
      email,
      telefono,
      estado: devuelto ? "refunded" : "paid",
      subtotal,
      descuento: conDescuento?.importe ?? 0,
      gastos: gasto,
      total,
      devuelto: devuelto ? total : 0,
      codigo: conDescuento?.codigo ?? null,
      pago: azar() < 0.7 || esDePrueba ? "sin-pasarela:tarjeta" : "sin-pasarela:bizum",
      creado: borrador.creado.toISOString(),
      lineas,
      entradas
    });
  });

  // El monedero de la cuenta de prueba: una recarga y el cashback del festival (5 %).
  const festival = pedidos.find((p) => p.cuentaDePrueba && p.eventoId === "demo-ribera-electronica");
  const monederoDePrueba: MovimientoDemo[] = [
    { id: "demo-w-1", importe: 2000, tipo: "topup", pedidoId: null, referencia: "sin-pasarela:tarjeta", nota: "Recarga", creado: "2026-09-10T18:20:00.000Z" }
  ];
  if (festival) {
    const evento = eventos.find((e) => e.demo.id === festival.eventoId)!;
    monederoDePrueba.push({
      id: "demo-w-2",
      importe: Math.floor(((festival.subtotal - festival.descuento) * (evento.demo.cashback ?? 0)) / 100),
      tipo: "cashback",
      pedidoId: festival.id,
      referencia: null,
      nota: `Cashback ${evento.demo.cashback ?? 0}% · ${evento.demo.titulo}`,
      creado: festival.creado
    });
  }

  return { compradores, pedidos, monederoDePrueba };
}
