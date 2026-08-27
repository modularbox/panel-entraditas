import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { Order, OrderItem, Refund } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

describe("orders handlers", () => {
  afterEach(() => resetDb());

  it("superadmin sees all 10 seeded orders", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders", { token });
    expect(orders).toHaveLength(10);
  });

  it("an org-1 admin only sees orders for their organization's events", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders", { token });
    expect(orders).toHaveLength(7);
    expect(orders.every((o) => o.organizationId === "org-1")).toBe(true);
  });

  it("filters by eventId", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders?eventId=event-1", { token });
    expect(orders.map((o) => o.id).sort()).toEqual(["order-1", "order-2", "order-3", "order-4"]);
  });

  it("filters by status", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders?status=cancelled", { token });
    expect(orders.map((o) => o.id)).toEqual(["order-7"]);
  });

  it("filters by channel", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders?channel=box_office", { token });
    expect(orders.map((o) => o.id)).toEqual(["order-6"]);
  });

  it("searches by customer name, email, or order number, case-insensitively", async () => {
    const token = await loginAs("admin@entraditas.com");
    const byName = await apiClient.get<Order[]>("/orders?q=sara", { token });
    expect(byName.map((o) => o.id)).toEqual(["order-5"]);
    const byNumber = await apiClient.get<Order[]>("/orders?q=ped-2026-0002", { token });
    expect(byNumber.map((o) => o.id)).toEqual(["order-2"]);
  });

  it("a user scoped to event-1 and event-2 never sees event-4 orders", async () => {
    const token = await loginAs("usuario@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders", { token });
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.eventId === "event-1" || o.eventId === "event-2")).toBe(true);
  });

  it("returns FORBIDDEN for a subuser, who has no orders:read by default", async () => {
    const token = await loginAs("subusuario@entraditas.com");
    await expect(apiClient.get("/orders", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("detail returns the order together with its line items", async () => {
    const token = await loginAs("admin@entraditas.com");
    const order = await apiClient.get<Order & { items: OrderItem[] }>("/orders/order-5", { token });
    expect(order.orderNumber).toBe("PED-2026-0005");
    expect(order.items).toHaveLength(2);
    expect(order.items.reduce((sum, item) => sum + item.subtotal, 0)).toBe(22000);
  });

  it("returns NOT_FOUND for a nonexistent order", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(apiClient.get("/orders/order-999", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND (not FORBIDDEN) for an order outside the actor's organization, to avoid leaking existence", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(apiClient.get("/orders/order-8", { token })).rejects.toMatchObject({ code: "NOT_FOUND" }); // order-8 belongs to org-2
  });
});

describe("orders handlers - creating a box office sale", () => {
  afterEach(() => resetDb());

  it("creates a multi-line paid order and updates stock for each line", async () => {
    const token = await loginAs("admin@entraditas.com");
    const pistaBefore = db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!.quantitySold;
    const poolBefore = db.capacityPools.find((p) => p.id === "pool-2-pista")!.soldCount;

    const result = await apiClient.post<Order & { items: OrderItem[]; refunds: Refund[] }>(
      "/orders",
      {
        eventId: "event-2",
        customerName: "Cliente en taquilla",
        customerEmail: "taquilla@example.com",
        items: [
          { ticketTypeId: "tt-2-pista", quantity: 2 },
          { ticketTypeId: "tt-2-grada", quantity: 1 }
        ]
      },
      { token }
    );

    expect(result.status).toBe("paid");
    expect(result.channel).toBe("box_office");
    expect(result.total).toBe(2 * 3000 + 1 * 5000);
    expect(result.items).toHaveLength(2);
    expect(result.refunds).toEqual([]);

    expect(db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!.quantitySold).toBe(pistaBefore + 2);
    expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.soldCount).toBe(poolBefore + 2);
  });

  it("rejects a sale that exceeds the remaining stock", async () => {
    const token = await loginAs("admin@entraditas.com");
    const tt1 = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    tt1.quantityTotal = tt1.quantitySold + 1; // only 1 left

    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-1", quantity: 2 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CAPACITY" });
  });

  it("rejects a ticket type that doesn't belong to the given event", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-2-pista", quantity: 1 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an empty cart", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders", { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [] }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns FORBIDDEN for a user without orders:create", async () => {
    const token = await loginAs("usuario@entraditas.com"); // role "user", orders:create not granted in seed
    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-1", quantity: 1 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns NOT_FOUND for an event outside the actor's organization", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-4", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-4-pass", quantity: 1 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" }); // event-4 belongs to org-2
  });
});
