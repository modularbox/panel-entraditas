import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { TicketType, TicketTypePrice } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

const baseBody = {
  name: "VIP", kind: "pago" as const, basePrice: 5000, currency: "EUR",
  quantityTotal: 100, minPerOrder: 1, maxPerOrder: 4,
  visibility: "public" as const, isTransferable: true, isRefundable: true
};

describe("ticket types handlers", () => {
  afterEach(() => resetDb());

  it("creates a single event-scoped row when scope is 'event'", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<TicketType[]>(
      "/events/event-5/ticket-types",
      { ...baseBody, scope: "event" },
      { token }
    );
    expect(created).toHaveLength(1);
    expect(created[0]!.subEventId).toBeNull();
  });

  it("creates one row per sub-event when scope lists subEventIds, sharing a groupId", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<TicketType[]>(
      "/events/event-3/ticket-types",
      { ...baseBody, scope: { subEventIds: ["sub-event-3-0", "sub-event-3-1"] } },
      { token }
    );
    expect(created).toHaveLength(2);
    expect(created[0]!.groupId).toBe(created[1]!.groupId);
    expect(created.map((t) => t.subEventId).sort()).toEqual(["sub-event-3-0", "sub-event-3-1"]);
  });

  it("stores the color sent when creating an event-scoped ticket type", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<TicketType[]>(
      "/events/event-5/ticket-types",
      { ...baseBody, color: "#3b82f6", scope: "event" },
      { token }
    );
    expect(created[0]!.color).toBe("#3b82f6");
  });

  it("reorder updates sortOrder for every row sharing a groupId", async () => {
    const token = await loginAs("admin@entraditas.com");
    await apiClient.post("/ticket-types/reorder", { items: [{ groupId: "tt-2-pista", sortOrder: 5 }] }, { token });
    expect(db.ticketTypes.find((t) => t.id === "tt-2-pista")!.sortOrder).toBe(5);
  });

  it("blocks deleting a ticket type with sales, allows it once quantitySold is 0", async () => {
    const token = await loginAs("admin@entraditas.com");
    const tt = db.ticketTypes.find((t) => t.id === "tt-1")!;
    tt.quantitySold = 10;
    await expect(apiClient.delete("/ticket-types/tt-1", { token })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    tt.quantitySold = 0;
    await apiClient.delete("/ticket-types/tt-1", { token });
    expect(db.ticketTypes.some((t) => t.id === "tt-1")).toBe(false);
  });

  it("adds a price tier to a ticket type", async () => {
    const token = await loginAs("admin@entraditas.com");
    const price = await apiClient.post<TicketTypePrice>(
      "/ticket-types/tt-1/prices",
      { name: "Early Bird", price: 2000, startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" },
      { token }
    );
    expect(price.ticketTypeId).toBe("tt-1");
    expect(db.ticketTypePrices).toHaveLength(1);
  });

  it("returns NOT_FOUND when patching a ticket type from an out-of-scope event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    // event3TicketType (tt-3) belongs to event-3, which is out of scope
    await expect(
      apiClient.patch("/ticket-types/tt-3", { name: "Updated" }, { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when deleting a ticket type from an out-of-scope event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    // event3TicketType (tt-3) belongs to event-3, which is out of scope
    await expect(
      apiClient.delete("/ticket-types/tt-3", { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when adding a price to a ticket type from an out-of-scope event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    // event3TicketType (tt-3) belongs to event-3, which is out of scope
    await expect(
      apiClient.post(
        "/ticket-types/tt-3/prices",
        { name: "Early Bird", price: 2000, startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" },
        { token }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when reordering a group belonging to an out-of-scope event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    // tt-3 belongs to event-3, which is out of scope
    await expect(
      apiClient.post("/ticket-types/reorder", { items: [{ groupId: "tt-3", sortOrder: 5 }] }, { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
