import { describe, expect, it } from "vitest";
import {
  createSeedDatabase,
  DEMO_ADMIN_ID,
  DEMO_SUBUSER_ID,
  DEMO_SUPERADMIN_ID,
  DEMO_USER_ID
} from "./db";
import { EventSchema, OrderItemSchema, OrderSchema, RefundSchema, TicketTypeSchema, UserSchema } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";

describe("createSeedDatabase", () => {
  it("seeds exactly 2 organizations and 5 events, each schema-valid", () => {
    const db = createSeedDatabase();
    expect(db.organizations).toHaveLength(2);
    expect(db.events).toHaveLength(5);
    for (const event of db.events) expect(() => EventSchema.parse(event)).not.toThrow();
    for (const user of db.users) expect(() => UserSchema.parse(user)).not.toThrow();
    for (const tt of db.ticketTypes) expect(() => TicketTypeSchema.parse(tt)).not.toThrow();
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

  it("gives the 4 demo users the expected effective permissions", () => {
    const db = createSeedDatabase();
    const byId = (id: string) => db.users.find((u) => u.id === id)!;

    const superadmin = byId(DEMO_SUPERADMIN_ID);
    expect(resolveEffectivePermissions(superadmin.role, superadmin.permissionOverrides).has("organizations:manage")).toBe(true);

    const admin = byId(DEMO_ADMIN_ID);
    expect(resolveEffectivePermissions(admin.role, admin.permissionOverrides).has("finance:read")).toBe(true);

    const user = byId(DEMO_USER_ID);
    expect(user.eventScopes).toHaveLength(2);
    expect(resolveEffectivePermissions(user.role, user.permissionOverrides).has("events:publish")).toBe(false);

    const subuser = byId(DEMO_SUBUSER_ID);
    const subuserEffective = resolveEffectivePermissions(subuser.role, subuser.permissionOverrides);
    expect(subuserEffective.has("guestlist:manage")).toBe(true); // granted via an allow override in seed
    expect(subuserEffective.has("finance:read")).toBe(false);
  });

  it("seeds 10 schema-valid orders with schema-valid line items, and keeps sold counts consistent with paid quantities", () => {
    const db = createSeedDatabase();
    expect(db.orders).toHaveLength(10);
    for (const order of db.orders) expect(() => OrderSchema.parse(order)).not.toThrow();
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
