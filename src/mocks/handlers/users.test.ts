import { afterEach, describe, expect, it } from "vitest";
import type { User } from "@entraditas/types";
import { DEMO_SUBUSER_ID, DEMO_USER_ID } from "@/mocks/db";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb, sessions, demoPasswordFor } from "@/mocks/state";

async function login(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: demoPasswordFor(email) });
  return result.accessToken;
}

describe("users handlers", () => {
  afterEach(() => resetDb());

  it("lists only the admin organization", async () => {
    const members = await apiClient.get<User[]>("/users", { token: await login("admin@entraditas.com") });
    expect(members.map((member) => member.id).sort()).toEqual(["user-admin", DEMO_USER_ID, DEMO_SUBUSER_ID].sort());
  });

  it("enforces privilege guards when inviting", async () => {
    const token = await login("admin@entraditas.com");
    await expect(apiClient.post("/users/invite", { email: "x@example.com", fullName: "X", role: "superadmin" }, { token })).rejects.toMatchObject({ code: "PRIVILEGE_ESCALATION" });
  });

  it("disables a member and revokes every active session", async () => {
    const memberToken = await login("subusuario@entraditas.com");
    const adminToken = await login("admin@entraditas.com");
    await apiClient.post(`/users/${DEMO_SUBUSER_ID}/disable`, undefined, { token: adminToken });
    expect(sessions.has(memberToken)).toBe(false);
    await expect(apiClient.get("/auth/me", { token: memberToken })).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});