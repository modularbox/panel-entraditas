import type { Organization } from "@entraditas/types";
import { toPublicEvent } from "@/features/publish/toPublicEvent";
import { EVENTOS_DEMO, ORGANIZACIONES_DEMO, RECINTOS_DEMO } from "./catalogo";
import { construirEvento } from "./construir";
import type { EventoParaVender } from "./ventas";

/**
 * La demo de entraditas.com (tanda 19), vista desde el panel.
 *
 * `scripts/exportar-demo.ts` la convierte en lo que carga la API en MySQL. Cada vez que cambie algo
 * de aqui hay que subir DEMO_VERSION: la API solo la vuelve a cargar cuando cambia.
 */
export const DEMO_VERSION = "2026-09-30.2";

/** Las dos organizaciones de siempre, que ya existen en la base: la demo cuelga eventos de ellas. */
export const ORGANIZACIONES_DE_SIEMPRE: Organization[] = [
  {
    id: "org-1",
    name: "Producciones Norte",
    slug: "producciones-norte",
    taxId: "B12345678",
    commissionRate: 0.08,
    contactEmail: "admin@produccionesnorte.es",
    contactPhone: "+34 910 123 456",
    status: "active"
  },
  {
    id: "org-2",
    name: "Sur Live",
    slug: "sur-live",
    taxId: "A87654321",
    commissionRate: 0.1,
    contactEmail: "admin@surlive.es",
    contactPhone: "+34 954 987 654",
    status: "active"
  }
];

/** Los eventos de ejemplo de antes, que la demo sustituye y la API retira de la web. */
export const EVENTOS_ANTERIORES = Array.from({ length: 13 }, (_, i) => `event-${i + 1}`);

export function organizacionesDeLaDemo(anteriores: Organization[] = ORGANIZACIONES_DE_SIEMPRE): Organization[] {
  const ids = new Set(anteriores.map((org) => org.id));
  return [...anteriores, ...ORGANIZACIONES_DEMO.filter((org) => !ids.has(org.id))];
}

export function eventosDeLaDemo(organizaciones: Organization[] = organizacionesDeLaDemo()): EventoParaVender[] {
  const recintos = new Map(RECINTOS_DEMO.map((recinto) => [recinto.id, recinto]));
  return EVENTOS_DEMO.map((demo) => {
    const filas = construirEvento(demo, recintos.get(demo.recinto)!);
    const organization = organizaciones.find((org) => org.id === demo.organizationId) ?? null;
    const publico = toPublicEvent({
      event: filas.event,
      organization,
      venue: filas.venue,
      zones: filas.zones,
      subEvents: filas.subEvents,
      ticketTypes: filas.ticketTypes,
      pools: filas.capacityPools,
      discountCodes: filas.discountCodes
    });
    return { demo, filas, publico };
  });
}
