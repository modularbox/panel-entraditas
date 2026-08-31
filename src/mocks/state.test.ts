import { afterEach, describe, expect, it } from "vitest";
import { createSeedDatabase } from "./db";
import { db, resetDb, restoreFromStorage, revokeAllSessionsForUser, sessions, STORAGE_KEY } from "./state";

describe("revokeAllSessionsForUser", () => {
  afterEach(() => resetDb());

  it("removes only sessions belonging to the given user", () => {
    sessions.set("token-a", "user-1");
    sessions.set("token-b", "user-1");
    sessions.set("token-c", "user-2");
    revokeAllSessionsForUser("user-1");
    expect(sessions.has("token-a")).toBe(false);
    expect(sessions.has("token-b")).toBe(false);
    expect(sessions.has("token-c")).toBe(true);
  });
});

describe("local persistence", () => {
  afterEach(() => resetDb());

  it("starts from the JSON seed when nothing is stored yet", () => {
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(db.events).toHaveLength(5);
    expect(db.orders).toHaveLength(9);
  });

  it("automatically writes every mutation to localStorage", () => {
    db.orders[0]!.status = "cancelled";
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as typeof db;
    expect(stored.orders[0]!.status).toBe("cancelled");
  });

  it("keeps a collection push persisted too", () => {
    const before = db.users.length;
    db.users.push({ ...db.users[0]!, id: "user-extra" });
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as typeof db;
    expect(db.users).toHaveLength(before + 1);
    expect(stored.users).toHaveLength(before + 1);
  });

  it("restores the saved snapshot instead of the seed", () => {
    const snapshot = createSeedDatabase();
    snapshot.events[0]!.title = "Título persistido";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    restoreFromStorage();
    expect(db.events[0]!.title).toBe("Título persistido");
  });

  it("resetDb removes the stored snapshot and goes back to the seed", () => {
    db.events[0]!.title = "Editado";
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    resetDb();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(db.events[0]!.title).not.toBe("Editado");
  });
});
