import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { Order, OrderItem, Refund } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

type OrderDetail = Order & { items: OrderItem[]; refunds: Refund[] };

describe("refunds handlers", () => {
  afterEach(() => resetDb());

  it("a full refund marks the order refunded and releases capacity", async () => {
    const token = await loginAs("admin@entraditas.com");
    const result = await apiClient.post<OrderDetail>(
      "/orders/order-6/refund",
      { amount: 6000, reason: "Duplicado" },
      { token }
    );
    expect(result.status).toBe("refunded");
    expect(result.refundedAmount).toBe(6000);
    expect(result.refunds).toHaveLength(1);

    const pista = db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!;
    expect(pista.quantitySold).toBe(4); // was 6, order-6 had 2
    const pool = db.capacityPools.find((p) => p.id === "pool-2-pista")!;
    expect(pool.soldCount).toBe(4);
  });

  it("a partial refund leaves the order partially_refunded and does not touch capacity", async () => {
    const token = await loginAs("admin@entraditas.com");
    const result = await apiClient.post<OrderDetail>(
      "/orders/order-1/refund",
      { amount: 2000, reason: "Reembolso parcial" },
      { token }
    );
    expect(result.status).toBe("partially_refunded");
    expect(result.refundedAmount).toBe(2000);

    const general = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    expect(general.quantitySold).toBe(5); // unchanged
  });

  it("two successive partial refunds that add up to the total release capacity on the second one", async () => {
    const token = await loginAs("admin@entraditas.com");
    await apiClient.post<OrderDetail>("/orders/order-2/refund", { amount: 2500, reason: "Primera parte" }, { token });
    const general = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    expect(general.quantitySold).toBe(5); // still unaffected after the first partial refund

    const second = await apiClient.post<OrderDetail>("/orders/order-2/refund", { amount: 5000, reason: "Segunda parte" }, { token });
    expect(second.status).toBe("refunded");
    expect(db.ticketTypes.find((tt) => tt.id === "tt-1")!.quantitySold).toBe(2); // 5 - 3 (order-2's quantity)
  });

  it("rejects an amount greater than the pending balance", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders/order-1/refund", { amount: 6000, reason: "Demasiado" }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects refunding an order in a non-refundable status", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders/order-3/refund", { amount: 100, reason: "No debería procesarse" }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); // order-3 is "pending"
  });

  it("rejects an empty reason", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders/order-1/refund", { amount: 1000, reason: "   " }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns FORBIDDEN for a user with orders:read but no orders:refund", async () => {
    const token = await loginAs("usuario@entraditas.com"); // role "user", orders:refund not granted in seed
    await expect(
      apiClient.post("/orders/order-1/refund", { amount: 1000, reason: "Sin permiso" }, { token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns NOT_FOUND for an order outside the actor's organization", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(
      apiClient.post("/orders/order-8/refund", { amount: 100, reason: "Fuera de alcance" }, { token }) // order-8 is org-2
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("GET /refunds respects organization scoping and supports eventId/q filters", async () => {
    const superadminToken = await loginAs("superadmin@entraditas.com");
    const all = await apiClient.get<Refund[]>("/refunds", { token: superadminToken });
    expect(all).toHaveLength(2);

    const adminToken = await loginAs("admin@entraditas.com"); // org-1
    const orgScoped = await apiClient.get<Refund[]>("/refunds", { token: adminToken });
    expect(orgScoped.map((r) => r.id)).toEqual(["refund-1"]); // refund-2 belongs to org-2's order-10

    const byEvent = await apiClient.get<Refund[]>("/refunds?eventId=event-1", { token: superadminToken });
    expect(byEvent.map((r) => r.id)).toEqual(["refund-1"]);

    const byQuery = await apiClient.get<Refund[]>("/refunds?q=hugo", { token: superadminToken });
    expect(byQuery.map((r) => r.id)).toEqual(["refund-2"]);
  });
});
