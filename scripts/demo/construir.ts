import type {
  CapacityPool,
  DiscountCode,
  Event,
  EventRules,
  Gate,
  GuestList,
  GuestListEntry,
  Organization,
  SubEvent,
  TicketType,
  Venue,
  Zone
} from "@entraditas/types";
import {
  buildSeatGrid,
  capacityOfSeatRows,
  rowOriginForStage,
  type SeatRowSpec
} from "@/features/events/wizard/steps/seatMap";

/**
 * Piezas con las que se escribe la demo (tanda 19).
 *
 * La demo se describe como la contaria un organizador -"un patio en abanico de nueve filas, las
 * tres primeras preferentes, cinco funciones"- y aqui se traduce a las filas que guarda el panel:
 * recinto, zonas, sesiones, aforos por sesion y tipos de entrada por sesion. Escribir esas filas a
 * mano eran cientos de ids que tenian que cuadrar entre si; un descuadre (un aforo sin tipo de
 * entrada, una butaca asignada que no existe) no se nota hasta que alguien intenta comprar.
 */

export interface ZonaDemo {
  clave: string;
  nombre: string;
  tipo: "numbered" | "standing" | "stage";
  x: number;
  y: number;
  ancho: number;
  alto: number;
  /** Zona de pie: cuanta gente cabe. */
  aforo?: number;
  /** Zona numerada: la sala fila a fila, en el orden en que se dibuja (de arriba abajo). */
  filas?: SeatRowSpec[];
  /** Tipo de entrada que vende la zona entera. */
  tipoEntrada?: string;
  /** Las primeras filas contando desde el escenario, vendidas con otro tipo de entrada. */
  preferentes?: { filas: number; tipoEntrada: string };
  /** Cuantas butacas de la ultima fila (desde el escenario) quedan para movilidad reducida. */
  accesibles?: number;
}

export interface RecintoDemo {
  id: string;
  organizationId: string;
  nombre: string;
  ciudad: string;
  provincia: string;
  direccion: string;
  lat: number;
  lng: number;
  zonas?: ZonaDemo[];
}

export interface TipoEntradaDemo {
  clave: string;
  nombre: string;
  /** Centimos. */
  precio: number;
  color: string;
  /** Solo en eventos sin plano: cuantas hay por sesion. Con plano salen de las zonas. */
  cantidad?: number;
  maxPorPedido?: number;
}

export interface SesionDemo {
  nombre: string;
  /** Fecha y hora tal y como las teclea el organizador (hora de Espana). */
  fecha: string;
  hora: string;
  /** Minutos; si no, los del evento. */
  duracion?: number;
  /** Minutos antes del comienzo en que se abren puertas. */
  puertas?: number;
  estado?: SubEvent["status"];
  /** Parte del aforo que se da por vendida en las ventas de ejemplo (0-1). */
  ocupacion: number;
}

export interface DescuentoDemo {
  codigo: string;
  tipo: "percent" | "fixed";
  /** Porcentaje entero, o centimos si es fijo. */
  valor: number;
  hasta?: string;
  usos?: number;
}

export interface EventoDemo {
  id: string;
  organizationId: string;
  recinto: string;
  slug: string;
  titulo: string;
  categoria: Event["category"];
  resumen: string;
  /** HTML sencillo: parrafos, listas y negritas, que es lo que la web sabe pintar. */
  descripcion: string;
  /** Ruta de la portada dentro de entraditas.com. */
  portada?: string;
  /** Fotos de la galeria, tambien rutas de entraditas.com. */
  galeria?: string[];
  etiquetas: string[];
  destacado?: boolean;
  estado: Event["status"];
  creado: string;
  publicado?: string;
  duracion: number;
  gastos: { tipo: "none" | "fixed" | "percent"; valor: number };
  cashback?: number;
  reglas?: EventRules;
  tipos: TipoEntradaDemo[];
  sesiones: SesionDemo[];
  fechaPorConfirmar?: boolean;
  descuentos?: DescuentoDemo[];
  partido?: { competition: string; home: string; away: string };
  puertas?: string[];
  invitados?: { lista: string; maximo: number; nombres: string[] }[];
}

/** Donde viven las portadas: la web las sirve y el panel las ensena desde el mismo sitio. */
export const WEB_PUBLICA = "https://entraditas.com";

/** La hora tecleada, con la "Z" detras: es como la guarda el asistente (ver Step2Schedule). */
export function isoDeLaHora(fecha: string, hora: string): string {
  return `${fecha}T${hora}:00.000Z`;
}

function sumarMinutos(iso: string, minutos: number): string {
  return new Date(new Date(iso).getTime() + minutos * 60_000).toISOString();
}

/** Un bloque rectangular: `butacas` por fila y, si hay pasillo central, una posicion vacia en medio. */
export function filasRectas(filas: number, butacas: number, pasilloCentral = false): SeatRowSpec[] {
  return Array.from({ length: filas }, () => fila(butacas, pasilloCentral, 0));
}

/**
 * Un patio en abanico: cada fila unas butacas mas que la anterior y todas centradas, que es como
 * se abren los patios de los teatros a medida que se alejan del escenario.
 */
export function filasAbanico(filas: number, primera: number, incremento: number, pasilloCentral = false): SeatRowSpec[] {
  const ultima = primera + incremento * (filas - 1);
  return Array.from({ length: filas }, (_, indice) => {
    const butacas = primera + incremento * indice;
    // El desplazamiento va en medias butacas: centrar una fila con N menos es moverla N medias.
    return fila(butacas, pasilloCentral, ultima - butacas);
  });
}

function fila(butacas: number, pasilloCentral: boolean, desplazamiento: number): SeatRowSpec {
  if (!pasilloCentral) return { slots: butacas, ...(desplazamiento ? { offset: desplazamiento } : {}) };
  const posiciones = butacas + 1;
  return {
    slots: posiciones,
    gaps: [Math.ceil(posiciones / 2)],
    ...(desplazamiento ? { offset: desplazamiento } : {})
  };
}

export interface FilasDelEvento {
  venue: Venue;
  zones: Zone[];
  event: Event;
  subEvents: SubEvent[];
  capacityPools: CapacityPool[];
  ticketTypes: TicketType[];
  discountCodes: DiscountCode[];
  gates: Gate[];
  guestLists: GuestList[];
  guestListEntries: GuestListEntry[];
}

export function construirRecinto(recinto: RecintoDemo): { venue: Venue; zones: Zone[] } {
  const zones: Zone[] = (recinto.zonas ?? []).map((zona) => {
    const capacity = zona.tipo === "numbered" ? capacityOfSeatRows(zona.filas) ?? 0 : zona.tipo === "standing" ? zona.aforo ?? 0 : 0;
    return {
      id: `${recinto.id}-${zona.clave}`,
      venueId: recinto.id,
      name: zona.nombre,
      kind: zona.tipo,
      capacity,
      ...(zona.tipo === "numbered" ? { rows: zona.filas!.length, seatRows: zona.filas! } : {}),
      x: zona.x,
      y: zona.y,
      width: zona.ancho,
      height: zona.alto
    };
  });
  const aforo = zones.reduce((total, zone) => total + zone.capacity, 0);
  return {
    venue: {
      id: recinto.id,
      organizationId: recinto.organizationId,
      name: recinto.nombre,
      city: recinto.ciudad,
      province: recinto.provincia,
      address: recinto.direccion,
      latitude: recinto.lat,
      longitude: recinto.lng,
      // Sin plano el recinto no tiene zonas que sumar: su aforo es el de la sesion mas grande.
      totalCapacity: aforo > 0 ? aforo : 1
    },
    zones
  };
}

/** Las butacas de una zona numerada con el mismo dibujo que publica el panel. */
function butacasDeZona(zona: Zone, escenario: Zone | undefined) {
  return buildSeatGrid({ ...zona, rowAOrigin: rowOriginForStage(zona, escenario ?? null) });
}

export function construirEvento(evento: EventoDemo, recinto: RecintoDemo): FilasDelEvento {
  const { venue, zones } = construirRecinto(recinto);
  const escenario = zones.find((zone) => zone.kind === "stage");
  const grupo = (clave: string) => `${evento.id}-${clave}`;
  // Un borrador puede no tener tipos de entrada todavia: sus zonas quedan sin tipo, como en el panel.
  const tiposDelEvento = new Set(evento.tipos.map((tipo) => tipo.clave));

  const subEvents: SubEvent[] = evento.sesiones.map((sesion, indice) => {
    const startsAt = isoDeLaHora(sesion.fecha, sesion.hora);
    return {
      id: `${evento.id}-s${indice + 1}`,
      eventId: evento.id,
      name: sesion.nombre,
      startsAt,
      endsAt: sumarMinutos(startsAt, sesion.duracion ?? evento.duracion),
      doorsOpenAt: sumarMinutos(startsAt, -(sesion.puertas ?? 30)),
      status: sesion.estado ?? "on_sale",
      sortOrder: indice
    };
  });

  // Cuantas entradas de cada tipo caben en UNA sesion: las butacas asignadas a ese tipo mas las
  // zonas de pie que lo venden; sin plano, lo que diga el propio tipo.
  const porTipo = new Map<string, number>();
  const asignaciones = new Map<string, { seatId: string; ticketTypeGroupId: string }[]>();
  const accesibles = new Map<string, string[]>();
  for (const zona of recinto.zonas ?? []) {
    const zone = zones.find((candidata) => candidata.id === `${recinto.id}-${zona.clave}`)!;
    if (zona.tipo === "standing" && zona.tipoEntrada) {
      porTipo.set(zona.tipoEntrada, (porTipo.get(zona.tipoEntrada) ?? 0) + zone.capacity);
    }
    if (zona.tipo !== "numbered" || !zona.tipoEntrada || !tiposDelEvento.has(zona.tipoEntrada)) continue;
    const butacas = butacasDeZona(zone, escenario);
    // Las filas "desde el escenario" son las de etiqueta A, B, C...: con el escenario debajo, la
    // A es la ultima que se dibuja, y contar por posicion se equivocaria de filas.
    const etiquetas = [...new Set(butacas.map((butaca) => butaca.rowLabel))].sort(
      (a, b) => a.length - b.length || a.localeCompare(b)
    );
    const preferentes = new Set(etiquetas.slice(0, zona.preferentes?.filas ?? 0));
    const lista: { seatId: string; ticketTypeGroupId: string }[] = [];
    for (const butaca of butacas) {
      const tipo: string = preferentes.has(butaca.rowLabel) ? zona.preferentes!.tipoEntrada : zona.tipoEntrada;
      porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + 1);
      if (tipo !== zona.tipoEntrada) lista.push({ seatId: butaca.id, ticketTypeGroupId: grupo(tipo) });
    }
    asignaciones.set(zone.id, lista);
    if (zona.accesibles) {
      const ultima = etiquetas[etiquetas.length - 1];
      accesibles.set(
        zone.id,
        butacas.filter((butaca) => butaca.rowLabel === ultima).slice(0, zona.accesibles).map((butaca) => butaca.id)
      );
    }
  }

  const capacityPools: CapacityPool[] = subEvents.flatMap((subEvent, indice) =>
    (recinto.zonas ?? [])
      .filter((zona) => zona.tipo !== "stage")
      .map((zona) => {
        const zoneId = `${recinto.id}-${zona.clave}`;
        const zone = zones.find((candidata) => candidata.id === zoneId)!;
        return {
          id: `${evento.id}-s${indice + 1}-${zona.clave}`,
          subEventId: subEvent.id,
          zoneId,
          name: zona.nombre,
          totalCapacity: zone.capacity,
          // Lo vendido vive en la API (ventas de ejemplo): aqui a cero, o se descontaria dos veces.
          soldCount: 0,
          heldCount: 0,
          ticketTypeGroupId: zona.tipoEntrada && tiposDelEvento.has(zona.tipoEntrada) ? grupo(zona.tipoEntrada) : null,
          ...(asignaciones.get(zoneId)?.length ? { seatAssignments: asignaciones.get(zoneId) } : {}),
          ...(accesibles.get(zoneId)?.length ? { accessibleSeatIds: accesibles.get(zoneId) } : {})
        } satisfies CapacityPool;
      })
  );

  // Una fila por tipo y sesion, con el mismo grupo: es como el panel guarda un tipo de entrada
  // que se vende en varias fechas. Sin sesiones (fecha por confirmar), una fila que vale para todas.
  const sesionesDelTipo: Array<SubEvent | null> = subEvents.length > 0 ? subEvents : [null];
  const ticketTypes: TicketType[] = evento.tipos.flatMap((tipo, orden) =>
    sesionesDelTipo.map((subEvent, indice) => ({
      id: subEvent ? `${grupo(tipo.clave)}-s${indice + 1}` : grupo(tipo.clave),
      groupId: grupo(tipo.clave),
      eventId: evento.id,
      subEventId: subEvent?.id ?? null,
      capacityPoolId: null,
      name: tipo.nombre,
      kind: tipo.precio === 0 ? "gratis" : "pago",
      basePrice: tipo.precio,
      currency: "EUR",
      quantityTotal: tipo.cantidad ?? porTipo.get(tipo.clave) ?? 0,
      quantitySold: 0,
      minPerOrder: 1,
      maxPerOrder: tipo.maxPorPedido ?? evento.reglas?.maxPerOrder ?? 8,
      visibility: "public",
      isTransferable: true,
      isRefundable: evento.reglas?.isRefundable ?? true,
      sortOrder: orden,
      color: tipo.color
    }))
  );

  const discountCodes: DiscountCode[] = (evento.descuentos ?? []).map((descuento) => ({
    id: `${evento.id}-dc-${descuento.codigo.toLowerCase()}`,
    eventId: evento.id,
    code: descuento.codigo,
    type: descuento.tipo,
    value: descuento.valor,
    maxUses: descuento.usos ?? null,
    usedCount: 0,
    maxUsesPerCustomer: 1,
    appliesTo: null,
    validFrom: null,
    validTo: descuento.hasta ? `${descuento.hasta}T23:59:59.000Z` : null,
    status: "active"
  }));

  const gates: Gate[] = (evento.puertas ?? []).map((nombre, indice) => ({
    id: `${evento.id}-puerta-${indice + 1}`,
    eventId: evento.id,
    subEventId: null,
    name: nombre,
    code: nombre
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "")
      .toUpperCase()
      .slice(0, 12),
    zoneId: null,
    direction: "in",
    allowReentry: false,
    maxScansPerTicket: 1,
    allowedTicketTypeGroupIds: null,
    opensAt: null,
    closesAt: null,
    operatorUserIds: [],
    isActive: true
  }));

  const guestLists: GuestList[] = [];
  const guestListEntries: GuestListEntry[] = [];
  (evento.invitados ?? []).forEach((lista, indice) => {
    const id = `${evento.id}-gl-${indice + 1}`;
    guestLists.push({ id, eventId: evento.id, name: lista.lista, maxCapacity: lista.maximo, hasPrivateColumns: false, createdAt: `${evento.creado}T10:00:00.000Z` });
    lista.nombres.forEach((nombre, n) => {
      guestListEntries.push({
        id: `${id}-${n + 1}`,
        guestListId: id,
        fullName: nombre,
        email: null,
        plusOneName: null,
        status: n % 4 === 3 ? "pending" : "confirmed",
        createdAt: `${evento.publicado ?? evento.creado}T12:00:00.000Z`
      });
    });
  });

  const primera = subEvents[0];
  const ultima = subEvents[subEvents.length - 1];
  const event: Event = {
    id: evento.id,
    organizationId: evento.organizationId,
    venueId: recinto.id,
    slug: evento.slug,
    coverImageUrl: evento.portada ? `${WEB_PUBLICA}${evento.portada}` : null,
    gallery: (evento.galeria ?? []).map((ruta) => `${WEB_PUBLICA}${ruta}`),
    title: evento.titulo,
    description: evento.resumen,
    longDescription: evento.descripcion,
    category: evento.categoria,
    tags: evento.etiquetas,
    featured: evento.destacado ?? false,
    durationMinutes: evento.duracion,
    status: evento.estado,
    visibility: "public",
    location: recinto.nombre,
    locality: recinto.ciudad,
    startsAt: evento.fechaPorConfirmar ? null : primera?.startsAt ?? null,
    endsAt: evento.fechaPorConfirmar ? null : ultima?.endsAt ?? null,
    salesStartAt: evento.publicado ? `${evento.publicado}T08:00:00.000Z` : null,
    salesEndAt: null,
    hasSubEvents: subEvents.length > 1,
    seatingMode: zones.length > 0 ? "plan" : null,
    isCompetition: Boolean(evento.partido),
    matchup: evento.partido ? { ...evento.partido, homeLogo: null, awayLogo: null } : null,
    datePending: evento.fechaPorConfirmar ?? false,
    notifyWhenDateConfirmed: evento.fechaPorConfirmar ?? false,
    rules: evento.reglas ?? {},
    serviceFeeType: evento.gastos.tipo,
    serviceFeeValue: evento.gastos.valor,
    cashbackPercent: evento.cashback ?? 0,
    ticketDesign: null,
    createdAt: `${evento.creado}T09:00:00.000Z`,
    publishedAt: evento.publicado ? `${evento.publicado}T08:00:00.000Z` : null
  };

  return { venue, zones, event, subEvents, capacityPools, ticketTypes, discountCodes, gates, guestLists, guestListEntries };
}

export type OrganizacionDemo = Organization;
