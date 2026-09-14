import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb, demoPasswordFor } from "@/mocks/state";
import type { GuestList, GuestListEntry } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: demoPasswordFor(email) });
  return result.accessToken;
}

type GuestListWithEntries = GuestList & { entries: GuestListEntry[] };

describe("guest lists handlers", () => {
  afterEach(() => resetDb());

  it("superadmin and admin list the seeded guest lists of an event, with their entries", async () => {
    const token = await loginAs("admin@entraditas.com");
    const lists = await apiClient.get<GuestListWithEntries[]>(`/events/event-1/guest-lists`, { token });
    expect(lists.map((l) => l.id).sort()).toEqual(["gl-1", "gl-2"]);
    const prensa = lists.find((l) => l.id === "gl-1")!;
    expect(prensa.entries.map((e) => e.id).sort()).toEqual(["gle-1", "gle-2"]);
    expect(prensa.hasPrivateColumns).toBe(false);
  });

  it("returns FORBIDDEN for a user without guestlist:read", async () => {
    const token = await loginAs("marta.gutierrez@entraditas.com");
    await expect(apiClient.get("/events/event-1/guest-lists", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("hides private columns from someone who can read but not manage", async () => {
    const user = db.users.find((u) => u.email === "marta.gutierrez@entraditas.com")!;
    user.permissionOverrides.push({ permission: "guestlist:read", effect: "allow" });
    const token = await loginAs("marta.gutierrez@entraditas.com");
    const lists = await apiClient.get<GuestListWithEntries[]>(`/events/event-1/guest-lists`, { token });
    const cortesias = lists.find((l) => l.id === "gl-2")!;
    expect(cortesias.hasPrivateColumns).toBeUndefined();
  });

  it("creates a list, adds invited guests up to its capacity, and refuses more", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<GuestListWithEntries & { entries: GuestListEntry[] }>(`/events/event-1/guest-lists`, { name: "Producción", maxCapacity: 2, hasPrivateColumns: false }, { token });
    expect(created.id).toMatch(/^gl-/);
    expect(created.entries).toEqual([]);

    const first = await apiClient.post<GuestListEntry>(`/guest-lists/${created.id}/entries`, { fullName: "Nuria Pineda", email: "nuria@produccion.es" }, { token });
    expect(first.status).toBe("confirmed");
    await apiClient.post<GuestListEntry>(`/guest-lists/${created.id}/entries`, { fullName: "Toni Vidal", email: "toni@produccion.es" }, { token });

    await expect(apiClient.post(`/guest-lists/${created.id}/entries`, { fullName: "Tercero" }, { token })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("refuses to lower a list's capacity below its current number of guests", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(apiClient.patch(`/guest-lists/gl-1`, { maxCapacity: 1 }, { token })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("updates and deletes a guest list together with its entries", async () => {
    const token = await loginAs("admin@entraditas.com");
    const patched = await apiClient.patch<GuestList>(`/guest-lists/gl-1`, { name: "Prensa y medios" }, { token });
    expect(patched.name).toBe("Prensa y medios");

    await apiClient.delete(`/guest-lists/gl-1`, { token });
    expect(db.guestLists.some((l) => l.id === "gl-1")).toBe(false);
    expect(db.guestListEntries.some((e) => e.guestListId === "gl-1")).toBe(false);
  });

  it("updates and deletes a single guest entry", async () => {
    const token = await loginAs("admin@entraditas.com");
    const patched = await apiClient.patch<GuestListEntry>(`/guest-list-entries/gle-2`, { status: "confirmed" }, { token });
    expect(patched.status).toBe("confirmed");
    await expect(apiClient.patch(`/guest-list-entries/gle-2`, { status: "unknown" }, { token })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await apiClient.delete(`/guest-list-entries/gle-2`, { token });
    expect(db.guestListEntries.some((e) => e.id === "gle-2")).toBe(false);
  });

  it("returns FORBIDDEN for writes from a user without guestlist:manage", async () => {
    const token = await loginAs("marta.gutierrez@entraditas.com");
    await expect(apiClient.post(`/events/event-1/guest-lists`, { name: "Lista pirata" }, { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(apiClient.post(`/guest-lists/gl-1/entries`, { fullName: "Alguien" }, { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});