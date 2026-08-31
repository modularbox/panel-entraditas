import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb, demoPasswordFor } from "@/mocks/state";
import type { CapacityPool } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: demoPasswordFor(email) });
  return result.accessToken;
}

describe("capacity pools handlers", () => {
  afterEach(() => resetDb());

  it("allows increasing total capacity", async () => {
    const token = await loginAs("admin@entraditas.com");
    const updated = await apiClient.patch<CapacityPool>("/capacity-pools/pool-2-pista", { totalCapacity: 900 }, { token });
    expect(updated.totalCapacity).toBe(900);
  });

  it("rejects reducing total capacity below the already-sold count", async () => {
    const pool = db.capacityPools.find((p) => p.id === "pool-2-pista")!;
    pool.soldCount = 50;
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.patch("/capacity-pools/pool-2-pista", { totalCapacity: 30 }, { token })
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CAPACITY" });
  });

  it("lists the pools of a sub-event", async () => {
    const token = await loginAs("admin@entraditas.com");
    const pools = await apiClient.get<CapacityPool[]>("/sub-events/sub-event-2/capacity", { token });
    expect(pools.map((p) => p.id).sort()).toEqual(["pool-2-grada", "pool-2-pista"]);
  });

  it("creates a new pool for a sub-event", async () => {
    const token = await loginAs("admin@entraditas.com");
    const pool = await apiClient.post<CapacityPool>(
      "/sub-events/sub-event-1/capacity-pools",
      { name: "Palco", zoneId: null, totalCapacity: 40 },
      { token }
    );
    expect(pool.subEventId).toBe("sub-event-1");
    expect(pool.soldCount).toBe(0);
  });

  it("returns NOT_FOUND for capacity pools of an out-of-scope sub-event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    await expect(
      apiClient.get("/sub-events/sub-event-3-0/capacity", { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when creating a pool in an out-of-scope sub-event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    await expect(
      apiClient.post(
        "/sub-events/sub-event-3-0/capacity-pools",
        { name: "Test", zoneId: null, totalCapacity: 100 },
        { token }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND when patching a pool from an out-of-scope sub-event", async () => {
    const token = await loginAs("usuario@entraditas.com"); // scoped to event-1 and event-2 only
    // First, create a pool for event-3 (not accessible to this user)
    const adminToken = await loginAs("admin@entraditas.com");
    const pool = await apiClient.post<CapacityPool>(
      "/sub-events/sub-event-3-0/capacity-pools",
      { name: "TestPool", zoneId: null, totalCapacity: 100 },
      { token: adminToken }
    );

    // Now try to patch it with the limited user
    await expect(
      apiClient.patch(`/capacity-pools/${pool.id}`, { totalCapacity: 150 }, { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
