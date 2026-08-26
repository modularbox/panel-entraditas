import { afterEach, describe, expect, it } from "vitest";
import { resetDb, revokeAllSessionsForUser, sessions } from "./state";

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
