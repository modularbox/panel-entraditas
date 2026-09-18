import { describe, expect, it } from "vitest";
import {
  createSeedDatabase,
  DEMO_ORGANIZADOR_ID,
  DEMO_SUBORGANIZADOR_ID,
  DEMO_SUBORGANIZADOR_PUERTA_ID,
  DEMO_SUPERADMIN_ID
} from "./db";
import { EventSchema, GateSchema, GuestListEntrySchema, GuestListSchema, CustomerProfileSchema, OrderItemSchema, OrderSchema, RefundSchema, TicketTypeSchema, UserSchema } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";

describe("createSeedDatabase", () => {
  it("seeds exactly 2 organizations and 13 events, each schema-valid", () => {
    const db = createSeedDatabase();
    expect(db.organizations).toHaveLength(2);
    expect(db.events).toHaveLength(13);
    for (const event of db.events) expect(() => EventSchema.parse(event)).not.toThrow();
    for (const user of db.users) expect(() => UserSchema.parse(user)).not.toThrow();
    for (const tt of db.ticketTypes) expect(() => TicketTypeSchema.parse(tt)).not.toThrow();
  });

  it("seeds 8 schema-valid customer accounts matching the qualifying order emails", () => {
    const db = createSeedDatabase();
    expect(db.customers).toHaveLength(8);
    for (const customer of db.customers) expect(() => CustomerProfileSchema.parse(customer)).not.toThrow();

    const orderEmails = new Set(db.orders.map((order) => order.customerEmail));
    for (const customer of db.customers) expect(orderEmails.has(customer.email)).toBe(true);
  });

  it("seeds exactly one draft event with zero ticket types", () => {
    const db = createSeedDatabase();
    const draftsWithoutTicketTypes = db.events.filter(
      (e) => e.status === "draft" && db.ticketTypes.every((tt) => tt.eventId !== e.id)
    );
    expect(draftsWithoutTicketTypes).toHaveLength(1);
  });

  it("seeds one event with capacity split across zones", () => {
    const db = createSeedDatabase();
    const zonedPools = db.capacityPools.filter((p) => p.zoneId !== null);
    expect(zonedPools.length).toBeGreaterThanOrEqual(2);
  });

  it("seeds a recurring theater-style event with multiple sub-events", () => {
    const db = createSeedDatabase();
    const theater = db.events.find((e) => e.hasSubEvents && e.category === "teatro");
    expect(theater).toBeDefined();
    const subEvents = db.subEvents.filter((s) => s.eventId === theater!.id);
    expect(subEvents.length).toBeGreaterThanOrEqual(3);
  });

  it("seeds a festival event with an event-scoped pass ticket type (subEventId null)", () => {
    const db = createSeedDatabase();
    const pass = db.ticketTypes.find((tt) => tt.kind === "abono" && tt.subEventId === null);
    expect(pass).toBeDefined();
  });

  it("seeds a single-date event with exactly one sub-event", () => {
    const db = createSeedDatabase();
    const single = db.events.find((e) => !e.hasSubEvents);
    expect(single).toBeDefined();
    const subEvents = db.subEvents.filter((s) => s.eventId === single!.id);
    expect(subEvents).toHaveLength(1);
  });

  it("gives the demo roles the expected effective permissions", () => {
    const db = createSeedDatabase();
    const byId = (id: string) => db.users.find((u) => u.id === id)!;

    const superadmin = byId(DEMO_SUPERADMIN_ID);
    expect(resolveEffectivePermissions(superadmin.role, superadmin.permissionOverrides).has("organizations:manage")).toBe(true);

    const organizador = byId(DEMO_ORGANIZADOR_ID);
    expect(organizador.role).toBe("organizador");
    expect(resolveEffectivePermissions(organizador.role, organizador.permissionOverrides).has("users:manage")).toBe(true);
    expect(resolveEffectivePermissions(organizador.role, organizador.permissionOverrides).has("guestlist:manage")).toBe(true);
    expect(resolveEffectivePermissions(organizador.role, organizador.permissionOverrides).has("organizations:manage")).toBe(false);

    // Las dos cuentas de equipo del seed son suborganizadores y parten de cero de base: solo tienen
    // lo que el organizador concedió con overrides allow (los grants exactos difieren por cuenta).
    const conAlcance = byId(DEMO_SUBORGANIZADOR_ID);
    expect(conAlcance.role).toBe("suborganizador");
    expect(conAlcance.eventScopes).toHaveLength(2);
    const conAlcanceEffective = resolveEffectivePermissions(conAlcance.role, conAlcance.permissionOverrides);
    expect(conAlcanceEffective.has("users:manage")).toBe(false);
    expect(conAlcanceEffective.has("orders:read")).toBe(true); // concedido por el organizador en el seed

    // La de puerta: mismo rol, pero solo con lo suyo concedido. Es el antiguo `subuser`.
    const puerta = byId(DEMO_SUBORGANIZADOR_PUERTA_ID);
    expect(puerta.role).toBe("suborganizador");
    const puertaEffective = resolveEffectivePermissions(puerta.role, puerta.permissionOverrides);
    expect(puertaEffective.has("scan:validate")).toBe(true);
    expect(puertaEffective.has("users:manage")).toBe(false);
    expect(puertaEffective.has("orders:read")).toBe(false); // esta cuenta no recibió orders
    expect(puertaEffective.has("guestlist:manage")).toBe(false);
  });

  it("seeds two schema-valid gates across different organizations", () => {
    const db = createSeedDatabase();
    expect(db.gates).toHaveLength(2);
    for (const gate of db.gates) expect(() => GateSchema.parse(gate)).not.toThrow();

    const norte = db.gates.find((g) => g.id === "gate-2-norte")!;
    expect(norte.eventId).toBe("event-2");
    expect(norte.operatorUserIds).toContain(DEMO_SUBORGANIZADOR_PUERTA_ID);

    const entrada = db.gates.find((g) => g.id === "gate-4-entrada")!;
    expect(entrada.eventId).toBe("event-4");
    expect(entrada.zoneId).toBeNull();
    expect(entrada.operatorUserIds).toEqual([]);
  });

  it("seeds an active organizador account for every organization", () => {
    const db = createSeedDatabase();
    for (const organization of db.organizations) {
      const organizador = db.users.find((u) => u.organizationId === organization.id && u.role === "organizador" && u.status === "active");
      expect(organizador).toBeDefined();
    }
  });

  it("seeds 9 schema-valid orders where total = subtotal - discount + service fee", () => {
    const db = createSeedDatabase();
    expect(db.orders).toHaveLength(9);
    for (const order of db.orders) {
      expect(() => OrderSchema.parse(order)).not.toThrow();
      expect(order.total).toBe(order.subtotal - order.discountAmount + order.serviceFee);
      // Un pedido pagado (o que pagó antes de un reembolso) tiene referencia y fecha de pago;
      // uno pendiente de pago, ninguna.
      if (["paid", "refunded", "partially_refunded"].includes(order.status)) {
        expect(order.paymentReference).toBeTruthy();
        expect(order.paidAt).toBeTruthy();
      } else {
        expect(order.paymentReference).toBeNull();
        expect(order.paidAt).toBeNull();
      }
    }
    for (const item of db.orderItems) expect(() => OrderItemSchema.parse(item)).not.toThrow();

    const tt1 = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    expect(tt1.quantitySold).toBe(5);
    const pool1 = db.capacityPools.find((p) => p.id === "pool-1")!;
    expect(pool1.soldCount).toBe(5);

    const ttPista = db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!;
    expect(ttPista.quantitySold).toBe(6);
    const ttGrada = db.ticketTypes.find((tt) => tt.id === "tt-2-grada")!;
    expect(ttGrada.quantitySold).toBe(2);

    const ttPass = db.ticketTypes.find((tt) => tt.id === "tt-4-pass")!;
    expect(ttPass.quantitySold).toBe(5);

    const order5Items = db.orderItems.filter((item) => item.orderId === "order-5");
    expect(order5Items).toHaveLength(2);
    expect(order5Items.reduce((sum, item) => sum + item.subtotal, 0)).toBe(22000);
  });

  it("seeds 3 schema-valid guest lists with entries, none over its capacity", () => {
    const db = createSeedDatabase();
    expect(db.guestLists).toHaveLength(3);
    for (const list of db.guestLists) expect(() => GuestListSchema.parse(list)).not.toThrow();
    for (const entry of db.guestListEntries) expect(() => GuestListEntrySchema.parse(entry)).not.toThrow();

    const prensa = db.guestLists.find((l) => l.id === "gl-1")!;
    expect(prensa.eventId).toBe("event-1");
    expect(db.guestListEntries.filter((e) => e.guestListId === prensa.id).length).toBeLessThanOrEqual(prensa.maxCapacity);
  });

  it("seeds 2 refunds consistent with the 2 orders that already carry a refundedAmount", () => {
    const db = createSeedDatabase();
    expect(db.refunds).toHaveLength(2);
    for (const refund of db.refunds) expect(() => RefundSchema.parse(refund)).not.toThrow();

    const order4 = db.orders.find((o) => o.id === "order-4")!;
    expect(order4.refundedAmount).toBe(5000);
    const refundsForOrder4 = db.refunds.filter((r) => r.orderId === "order-4");
    expect(refundsForOrder4.reduce((sum, r) => sum + r.amount, 0)).toBe(order4.refundedAmount);

    const order10 = db.orders.find((o) => o.id === "order-10")!;
    expect(order10.refundedAmount).toBe(9000);

    const order1 = db.orders.find((o) => o.id === "order-1")!;
    expect(order1.refundedAmount).toBe(0);
  });
});
