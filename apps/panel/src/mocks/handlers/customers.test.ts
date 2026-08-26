import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { resetDb } from "@/mocks/state";
import type { Customer, Order } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

type AttendeeDetail = Customer & { orders: (Order & { eventTitle: string })[] };

describe("customers handlers", () => {
  afterEach(() => resetDb());

  it("lists the 8 qualifying customers to a superadmin", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    expect(customers).toHaveLength(8);
    expect(customers.map((c) => c.email)).not.toContain("lucia.fernandez@example.com"); // pending-only
    expect(customers.map((c) => c.email)).not.toContain("elena.castro@example.com"); // cancelled-only
  });

  it("a fully refunded order still counts, with totalSpent 0", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    const diego = customers.find((c) => c.email === "diego.molina@example.com")!;
    expect(diego.ordersCount).toBe(1);
    expect(diego.totalSpent).toBe(0);
  });

  it("a free courtesy order still counts, with totalSpent 0", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    const prensa = customers.find((c) => c.email === "prensa@surlive.example")!;
    expect(prensa.ordersCount).toBe(1);
    expect(prensa.ticketsCount).toBe(1);
    expect(prensa.totalSpent).toBe(0);
  });

  it("an org-1 admin only sees their 5 customers", async () => {
    const token = await loginAs("admin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    expect(customers.map((c) => c.email).sort()).toEqual([
      "diego.molina@example.com", "javier.soto@example.com", "marta.ruiz@example.com", "pablo.ibanez@example.com", "sara.gomez@example.com"
    ]);
  });

  it("filters by eventId", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers?eventId=event-4", { token });
    expect(customers.map((c) => c.email).sort()).toEqual(["hugo.serrano@example.com", "nuria.vidal@example.com", "prensa@surlive.example"]);
  });

  it("filters by q (name or email)", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers?q=hugo", { token });
    expect(customers.map((c) => c.email)).toEqual(["hugo.serrano@example.com"]);
  });

  it("returns FORBIDDEN for a subuser without orders:read", async () => {
    const token = await loginAs("subusuario@entraditas.com");
    await expect(apiClient.get("/customers", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("detail returns the aggregate metrics plus the full order history", async () => {
    const token = await loginAs("admin@entraditas.com");
    const attendee = await apiClient.get<AttendeeDetail>(
      `/customers/${encodeURIComponent("marta.ruiz@example.com")}`,
      { token }
    );
    expect(attendee.ordersCount).toBe(1);
    expect(attendee.orders).toHaveLength(1);
    expect(attendee.orders[0]!.orderNumber).toBe("PED-2026-0001");
    expect(attendee.orders[0]!.eventTitle).toBe("Noche de Jazz");
  });

  it("returns NOT_FOUND for an email with no qualifying orders", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.get(`/customers/${encodeURIComponent("lucia.fernandez@example.com")}`, { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND for an email outside the actor's organization", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(
      apiClient.get(`/customers/${encodeURIComponent("hugo.serrano@example.com")}`, { token }) // org-2
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
