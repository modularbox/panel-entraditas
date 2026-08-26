import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { Venue, Zone } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

describe("venues handlers", () => {
  afterEach(() => resetDb());

  it("lists only the caller's organization venues", async () => {
    const token = await loginAs("admin@entraditas.com");
    const venues = await apiClient.get<Venue[]>("/venues", { token });
    expect(venues.every((v) => v.organizationId === "org-1")).toBe(true);
    expect(venues.length).toBeGreaterThan(0);
  });

  it("creates a venue and lists the zones of an existing one", async () => {
    const token = await loginAs("admin@entraditas.com");
    const zones = await apiClient.get<Zone[]>("/venues/venue-1/zones", { token });
    expect(zones.length).toBeGreaterThanOrEqual(2);

    const created = await apiClient.post<Zone>(
      "/venues/venue-1/zones",
      { name: "Palco", kind: "numbered", capacity: 50, x: 10, y: 10, width: 15, height: 15 },
      { token }
    );
    expect(created).toMatchObject({ name: "Palco", kind: "numbered", capacity: 50 });
  });

  it("defaults kind and position when creating a zone without them", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<Zone>("/venues/venue-1/zones", { name: "Sin posición", capacity: 0 }, { token });
    expect(created).toMatchObject({ kind: "standing", x: 0, y: 0, width: 20, height: 20 });
  });

  it("updates a zone's position and capacity via PATCH", async () => {
    const token = await loginAs("admin@entraditas.com");
    const updated = await apiClient.patch<Zone>("/zones/zone-pista", { x: 30, capacity: 900 }, { token });
    expect(updated).toMatchObject({ x: 30, capacity: 900 });
  });

  it("blocks lowering a zone's capacity below its sold count via PATCH", async () => {
    const token = await loginAs("admin@entraditas.com");
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.soldCount = 50;
    await expect(apiClient.patch("/zones/zone-pista", { capacity: 10 }, { token })).rejects.toMatchObject({
      code: "INSUFFICIENT_CAPACITY"
    });
  });

  it("blocks deleting a zone with sales, allows it once soldCount is 0", async () => {
    const token = await loginAs("admin@entraditas.com");
    db.capacityPools.find((p) => p.id === "pool-2-grada")!.soldCount = 10;
    await expect(apiClient.delete("/zones/zone-grada", { token })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    db.capacityPools.find((p) => p.id === "pool-2-grada")!.soldCount = 0;
    await apiClient.delete("/zones/zone-grada", { token });
    expect(db.zones.some((z) => z.id === "zone-grada")).toBe(false);
    expect(db.capacityPools.some((p) => p.id === "pool-2-grada")).toBe(false);
  });
});
