import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import type { GuestList, GuestListEntry } from "@entraditas/types";

describe("guestLists handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    return useSessionStore.getState().token!;
  }

  it("lists guest lists for an event", async () => {
    const token = await login();
    const guestLists = await apiClient.get<GuestList[]>("/events/event-2/guest-lists", { token });
    expect(guestLists).toHaveLength(1);
    expect(guestLists[0]!.name).toBe("Prensa");
  });

  it("creates a guest list without a quota", async () => {
    const token = await login();
    const created = await apiClient.post<GuestList>(
      "/events/event-2/guest-lists",
      { name: "Patrocinadores", subEventId: null, quota: null },
      { token }
    );
    expect(created.quota).toBeNull();
    expect(db.guestLists.some((g) => g.name === "Patrocinadores")).toBe(true);
  });

  it("lists entries for a guest list", async () => {
    const token = await login();
    const entries = await apiClient.get<GuestListEntry[]>("/guest-lists/gl-2-prensa/entries", { token });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.fullName).sort()).toEqual(["Carlos Ruiz", "Marta López"]);
  });

  it("adds an entry to a guest list under its quota", async () => {
    const token = await login();
    const created = await apiClient.post<GuestListEntry>(
      "/guest-lists/gl-2-prensa/entries",
      { fullName: "Nuevo Invitado", email: null, phone: null, companions: 0, notes: null },
      { token }
    );
    expect(created.status).toBe("pending");
    expect(db.guestListEntries.some((e) => e.fullName === "Nuevo Invitado")).toBe(true);
  });

  it("rejects adding an entry once the guest list's quota is reached", async () => {
    const token = await login();
    db.guestLists.push({ id: "gl-full", eventId: "event-2", subEventId: null, name: "Lleno", quota: 1 });
    db.guestListEntries.push({
      id: "gle-full-1", guestListId: "gl-full", fullName: "Ya Está", email: null, phone: null,
      companions: 0, status: "pending", notes: null
    });
    await expect(
      apiClient.post(
        "/guest-lists/gl-full/entries",
        { fullName: "Otro Más", email: null, phone: null, companions: 0, notes: null },
        { token }
      )
    ).rejects.toThrow(AppError);
    expect(db.guestListEntries.filter((e) => e.guestListId === "gl-full")).toHaveLength(1);
  });

  it("patches an entry's status", async () => {
    const token = await login();
    const updated = await apiClient.patch<GuestListEntry>("/guest-list-entries/gle-1", { status: "checked_in" }, { token });
    expect(updated.status).toBe("checked_in");
  });

  it("deletes an entry", async () => {
    const token = await login();
    await apiClient.delete("/guest-list-entries/gle-1", { token });
    expect(db.guestListEntries.some((e) => e.id === "gle-1")).toBe(false);
  });

  it("deletes a guest list and cascades to its entries", async () => {
    const token = await login();
    await apiClient.delete("/guest-lists/gl-2-prensa", { token });
    expect(db.guestLists.some((g) => g.id === "gl-2-prensa")).toBe(false);
    expect(db.guestListEntries.some((e) => e.guestListId === "gl-2-prensa")).toBe(false);
  });

  it("rejects access to an out-of-scope event's guest lists", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "subusuario1234"); // scoped to event-1 only
    const token = useSessionStore.getState().token!;
    await expect(apiClient.get("/events/event-2/guest-lists", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects listing guest lists without guestlist:read", async () => {
    const token = await login();
    db.users.find((u) => u.id === "user-admin")!.permissionOverrides = [{ permission: "guestlist:read", effect: "deny" }];
    await expect(apiClient.get("/events/event-2/guest-lists", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects creating a guest list without guestlist:manage", async () => {
    const token = await login();
    db.users.find((u) => u.id === "user-admin")!.permissionOverrides = [{ permission: "guestlist:manage", effect: "deny" }];
    await expect(
      apiClient.post("/events/event-2/guest-lists", { name: "Patrocinadores", subEventId: null, quota: null }, { token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects adding an entry without guestlist:manage", async () => {
    const token = await login();
    db.users.find((u) => u.id === "user-admin")!.permissionOverrides = [{ permission: "guestlist:manage", effect: "deny" }];
    await expect(
      apiClient.post("/guest-lists/gl-2-prensa/entries", { fullName: "X", email: null, phone: null, companions: 0, notes: null }, { token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
