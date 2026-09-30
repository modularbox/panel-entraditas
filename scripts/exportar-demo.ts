/**
 * Prepara la demo para la API y la web publica (tanda 19).
 *
 *   npx vite-node scripts/exportar-demo.ts
 *
 * Escribe, en el repositorio de la web (ENTRADITAS, junto a este):
 *  - api/demo/demo.json      lo que la API carga en MySQL al arrancar: eventos publicados igual que
 *                            los publicaria el panel, sus sesiones, compradores y ventas de ejemplo.
 *  - api/demo/version.txt    la version: la API solo recarga la demo cuando cambia.
 *
 * El catalogo que la web lleva compilado (src/data/publishedCatalog.json) se deja vacio a
 * proposito: con los planos de butacas pesaria casi medio mega dentro del bundle, y la web ya
 * espera a la API antes de dar un evento por inexistente.
 *
 * Todo sale de scripts/demo. Lleva el evento dos veces: como lo publica el panel (lo que lee la
 * web) y fila a fila como lo guarda el panel (recinto, zonas, sesiones, aforos, tipos de entrada),
 * que es lo que el panel lee de la base desde que dejo de tener su simulador.
 * Si se cambia la demo, se sube DEMO_VERSION y se vuelve a ejecutar.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DEMO_VERSION, EVENTOS_ANTERIORES, eventosDeLaDemo, organizacionesDeLaDemo } from "./demo";
import { AHORA_DEMO, CUENTA_DE_PRUEBA, generarVentas } from "./demo/ventas";
import { toApiEventPayload } from "../src/features/publish/toApiEventPayload";
import { shouldAppearOnPublicSite } from "../src/shared/lib/eventLifecycle";

const aqui = dirname(fileURLToPath(import.meta.url));
const web = resolve(process.env.ENTRADITAS_DIR ?? resolve(aqui, "../../ENTRADITAS"));

const organizaciones = organizacionesDeLaDemo();
const eventos = eventosDeLaDemo(organizaciones);
const ventas = generarVentas(eventos);

const eventosParaLaApi = eventos.map(({ demo, filas, publico }) => {
  const payload = toApiEventPayload(publico, "published", demo.organizationId);
  return {
    id: demo.id,
    organizationId: demo.organizationId,
    // El estado de verdad va aparte: en la base es una columna, y es lo que decide si sale en la web.
    status: demo.estado,
    createdAt: filas.event.createdAt,
    publishedAt: filas.event.publishedAt ?? null,
    payload: { ...payload, status: demo.estado },
    sesiones: filas.subEvents.map((s) => ({
      id: s.id,
      name: s.name,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
      doorsOpenAt: s.doorsOpenAt,
      status: s.status,
      sortOrder: s.sortOrder
    })),
    // Fila a fila, como lo guarda el panel.
    panel: {
      event: filas.event,
      venue: filas.venue,
      zones: filas.zones,
      capacityPools: filas.capacityPools,
      ticketTypes: filas.ticketTypes,
      discountCodes: filas.discountCodes,
      gates: filas.gates,
      guestLists: filas.guestLists,
      guestListEntries: filas.guestListEntries
    }
  };
});

const carga = {
  version: DEMO_VERSION,
  generado: AHORA_DEMO.toISOString(),
  cuentaDePrueba: CUENTA_DE_PRUEBA.email,
  // Los eventos de la semilla anterior, que la demo sustituye: la API los retira de la web.
  eventosAnteriores: EVENTOS_ANTERIORES,
  organizaciones: organizaciones
    .filter((org) => eventos.some((e) => e.demo.organizationId === org.id))
    .map(({ id, name, slug, taxId, commissionRate, contactEmail, contactPhone }) => ({ id, name, slug, taxId, commissionRate, contactEmail, contactPhone })),
  eventos: eventosParaLaApi,
  compradores: ventas.compradores,
  pedidos: ventas.pedidos,
  monederoDePrueba: ventas.monederoDePrueba
};

mkdirSync(resolve(web, "api/demo"), { recursive: true });
writeFileSync(resolve(web, "api/demo/demo.json"), JSON.stringify(carga));
writeFileSync(resolve(web, "api/demo/version.txt"), `${DEMO_VERSION}\n`);

const enLaWeb = eventos.filter(({ filas }) => shouldAppearOnPublicSite(filas.event, AHORA_DEMO)).length;

// Resumen, para ver de un vistazo que la demo tiene la forma que se busca.
const entradas = ventas.pedidos.reduce((suma, pedido) => suma + pedido.entradas.length, 0);
const importe = ventas.pedidos.filter((p) => p.estado === "paid").reduce((suma, p) => suma + p.total, 0);
console.log(`Demo ${DEMO_VERSION} -> ${web}`);
console.log(`  eventos: ${eventos.length} (${enLaWeb} en la web), sesiones: ${eventos.reduce((s, e) => s + e.filas.subEvents.length, 0)}`);
console.log(`  compradores: ${ventas.compradores.length}, pedidos: ${ventas.pedidos.length}, entradas: ${entradas}, cobrado: ${(importe / 100).toFixed(2)} EUR`);
for (const { demo, filas } of eventos) {
  const suyos = ventas.pedidos.filter((p) => p.eventoId === demo.id);
  const porSesion = filas.subEvents.map((s) => suyos.filter((p) => p.sesionId === s.id).reduce((n, p) => n + p.entradas.length, 0));
  console.log(`  ${demo.estado.padEnd(10)} ${demo.categoria.padEnd(11)} ${demo.titulo.slice(0, 44).padEnd(44)} ${porSesion.join(" / ")}`);
}
