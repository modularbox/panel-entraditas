import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { resetDb } from "@/mocks/state";
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

    const created = await apiClient.post<Zone>("/venues/venue-1/zones", { name: "Palco", capacity: 50 }, { token });
    expect(created.name).toBe("Palco");
  });
});
