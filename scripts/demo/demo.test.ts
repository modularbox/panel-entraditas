import { describe, expect, it } from "vitest";
import {
  CapacityPoolSchema,
  DiscountCodeSchema,
  EventSchema,
  PublicEventSchema,
  SubEventSchema,
  TicketTypeSchema,
  VenueSchema,
  ZoneSchema,
  type Event
} from "@entraditas/types";
import { toApiEventPayload, missingForApi } from "@/features/publish/toApiEventPayload";
import { shouldAppearOnPublicSite } from "@/shared/lib/eventLifecycle";
import { eventosDeLaDemo } from "./index";
import { AHORA_DEMO, CUENTA_DE_PRUEBA, generarVentas } from "./ventas";

const eventos = eventosDeLaDemo();
const ventas = generarVentas(eventos);
const enLaWeb = eventos.filter((e) => shouldAppearOnPublicSite(e.filas.event, AHORA_DEMO));

describe("la demo (tanda 19)", () => {
  it("cumple los esquemas del panel, fila a fila", () => {
    for (const { filas } of eventos) {
      expect(() => EventSchema.parse(filas.event)).not.toThrow();
      expect(() => VenueSchema.parse(filas.venue)).not.toThrow();
      for (const z of filas.zones) expect(() => ZoneSchema.parse(z)).not.toThrow();
      for (const s of filas.subEvents) expect(() => SubEventSchema.parse(s)).not.toThrow();
      for (const p of filas.capacityPools) expect(() => CapacityPoolSchema.parse(p)).not.toThrow();
      for (const t of filas.ticketTypes) expect(() => TicketTypeSchema.parse(t)).not.toThrow();
      for (const d of filas.discountCodes) expect(() => DiscountCodeSchema.parse(d)).not.toThrow();
    }
  });

  it("no repite ningun id, y todo cuelga de algo que existe", () => {
    const ids = eventos.flatMap((e) => [e.filas.event.id, ...e.filas.subEvents.map((s) => s.id), ...e.filas.ticketTypes.map((t) => t.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const { filas } of eventos) {
      const sesiones = new Set(filas.subEvents.map((s) => s.id));
      const grupos = new Set(filas.ticketTypes.map((t) => t.groupId));
      for (const p of filas.capacityPools) {
        expect(sesiones.has(p.subEventId)).toBe(true);
        if (p.ticketTypeGroupId) expect(grupos.has(p.ticketTypeGroupId)).toBe(true);
        for (const a of p.seatAssignments ?? []) expect(grupos.has(a.ticketTypeGroupId)).toBe(true);
      }
      for (const t of filas.ticketTypes) if (t.subEventId) expect(sesiones.has(t.subEventId)).toBe(true);
    }
  });

  it("cada evento publicado sale a la web tal cual, sin que falte nada", () => {
    for (const { publico, demo } of eventos.filter((e) => e.demo.estado === "published")) {
      expect(() => PublicEventSchema.parse(publico)).not.toThrow();
      expect(missingForApi(toApiEventPayload(publico, "published", demo.organizationId))).toEqual([]);
    }
  });

  it("hay de cada tipo, y casi todo con varias sesiones", () => {
    expect(new Set(enLaWeb.map((e) => e.demo.categoria)).size).toBe(10);
    expect(enLaWeb.filter((e) => e.filas.subEvents.length > 1).length).toBeGreaterThanOrEqual(13);
    expect(enLaWeb.some((e) => e.publico.dateStatus === "to_be_announced")).toBe(true);
    expect(enLaWeb.some((e) => e.publico.matchup !== null)).toBe(true);
    expect(enLaWeb.some((e) => e.filas.subEvents.length === 1)).toBe(true);
  });

  it("cada estado del panel tiene su ejemplo", () => {
    const estados = new Set<Event["status"]>(eventos.map((e) => e.filas.event.status));
    for (const estado of ["draft", "in_review", "published", "rejected", "finished", "cancelled"] as const) {
      expect(estados.has(estado)).toBe(true);
    }
  });

  it("lo que se anuncia es futuro, salvo lo que ya se celebro", () => {
    for (const { filas } of enLaWeb) {
      for (const sesion of filas.subEvents) {
        if (sesion.status !== "finished") expect(new Date(sesion.startsAt!).getTime()).toBeGreaterThan(AHORA_DEMO.getTime());
      }
    }
  });
});

describe("las ventas de ejemplo", () => {
  it("dan siempre lo mismo", () => {
    expect(JSON.stringify(generarVentas(eventos))).toBe(JSON.stringify(ventas));
  });

  it("nunca venden una butaca dos veces en la misma sesion", () => {
    const vistas = new Set<string>();
    for (const pedido of ventas.pedidos) {
      for (const entrada of pedido.entradas) {
        if (!entrada.asiento) continue;
        const clave = `${pedido.sesionId}|${entrada.asiento}`;
        expect(vistas.has(clave)).toBe(false);
        vistas.add(clave);
      }
    }
    expect(vistas.size).toBeGreaterThan(1000);
  });

  it("no venden mas de lo que cabe en cada sesion", () => {
    for (const { publico } of eventos) {
      for (const sesion of publico.sessions) {
        for (const tier of sesion.tiers ?? []) {
          const vendidas = ventas.pedidos
            .filter((p) => p.sesionId === sesion.id && p.estado === "paid")
            .flatMap((p) => p.lineas)
            .filter((l) => l.tipoId === tier.id)
            .reduce((n, l) => n + l.cantidad, 0);
          expect(vendidas).toBeLessThanOrEqual(tier.available ?? Infinity);
        }
      }
    }
  });

  it("la sesion agotada lo esta de verdad", () => {
    const primera = eventos.find((e) => e.demo.id === "demo-la-vida-tal-cual")!.publico.sessions[0]!;
    const aforo = (primera.tiers ?? []).reduce((n, t) => n + (t.available ?? 0), 0);
    const vendidas = ventas.pedidos.filter((p) => p.sesionId === primera.id && p.estado === "paid").reduce((n, p) => n + p.entradas.length, 0);
    expect(primera.status).toBe("sold_out");
    expect(vendidas).toBe(aforo);
  });

  it("cuadran los importes de cada pedido", () => {
    for (const p of ventas.pedidos) {
      expect(p.subtotal).toBe(p.lineas.reduce((n, l) => n + l.subtotal, 0));
      expect(p.total).toBe(Math.max(0, p.subtotal - p.descuento + p.gastos));
      expect(p.entradas.length).toBe(p.lineas.reduce((n, l) => n + l.cantidad, 0));
      expect(new Date(p.creado).getTime()).toBeLessThanOrEqual(AHORA_DEMO.getTime());
    }
  });

  it("la cuenta de prueba tiene compras y saldo", () => {
    expect(ventas.pedidos.filter((p) => p.email === CUENTA_DE_PRUEBA.email)).toHaveLength(3);
    expect(ventas.monederoDePrueba.reduce((n, m) => n + m.importe, 0)).toBeGreaterThan(2000);
  });
});
