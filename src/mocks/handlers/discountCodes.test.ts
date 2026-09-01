import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import type { DiscountCode } from "@entraditas/types";

describe("discountCodes handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    return useSessionStore.getState().token!;
  }

  it("lists discount codes for an event", async () => {
    const token = await login();
    const codes = await apiClient.get<DiscountCode[]>("/events/event-2/discount-codes", { token });
    expect(codes).toHaveLength(1);
    expect(codes[0]!.code).toBe("EARLYBIRD");
  });

  it("creates a discount code", async () => {
    const token = await login();
    const created = await apiClient.post<DiscountCode>(
      "/events/event-2/discount-codes",
      {
        code: "VIP20",
        type: "percent",
        value: 20,
        maxUses: null,
        maxUsesPerCustomer: null,
        appliesTo: null,
        validFrom: null,
        validTo: null
      },
      { token }
    );
    expect(created.status).toBe("active");
    expect(created.usedCount).toBe(0);
    expect(db.discountCodes.some((c) => c.code === "VIP20")).toBe(true);
  });

  it("rejects a duplicate code within the same event (case-insensitive)", async () => {
    const token = await login();
    await expect(
      apiClient.post(
        "/events/event-2/discount-codes",
        {
          code: "earlybird",
          type: "percent",
          value: 5,
          maxUses: null,
          maxUsesPerCustomer: null,
          appliesTo: null,
          validFrom: null,
          validTo: null
        },
        { token }
      )
    ).rejects.toThrow(AppError);
    expect(db.discountCodes.filter((c) => c.eventId === "event-2")).toHaveLength(1);
  });

  it("patches a discount code's status", async () => {
    const token = await login();
    const updated = await apiClient.patch<DiscountCode>(
      "/discount-codes/dc-2-earlybird",
      { status: "inactive" },
      { token }
    );
    expect(updated.status).toBe("inactive");
    expect(db.discountCodes.find((c) => c.id === "dc-2-earlybird")!.status).toBe("inactive");
  });

  it("deletes a discount code", async () => {
    const token = await login();
    await apiClient.delete("/discount-codes/dc-2-earlybird", { token });
    expect(db.discountCodes.some((c) => c.id === "dc-2-earlybird")).toBe(false);
  });
});
