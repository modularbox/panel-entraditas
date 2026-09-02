import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import type { SessionResponse } from "@/shared/auth/sessionStore";
import type { DirectoryUser, DirectoryUserDetail } from "@entraditas/types";

describe("directory users handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login(email: string, password: string) {
    await useSessionStore.getState().login(email, password);
    return useSessionStore.getState().token!;
  }

  it("lists every user across every organization, enriched with the organization's name", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    const users = await apiClient.get<DirectoryUser[]>("/directory/users", { token });
    expect(users).toHaveLength(5);
    const admin = users.find((u) => u.id === "user-admin")!;
    expect(admin.organizationName).toBe("Producciones Norte");
    const superadmin = users.find((u) => u.id === "user-superadmin")!;
    expect(superadmin.organizationName).toBeNull();
  });

  it("rejects a non-superadmin from listing the directory", async () => {
    const token = await login("admin@entraditas.com", "admin1234");
    await expect(apiClient.get("/directory/users", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns a single user's ficha with the permissions actually in effect", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    const detail = await apiClient.get<DirectoryUserDetail>("/directory/users/user-admin", { token });
    expect(detail.organizationName).toBe("Producciones Norte");
    expect(detail.effectivePermissions).toContain("finance:read");
    expect(detail.effectivePermissions).not.toContain("organizations:manage");
  });

  it("404s for an unknown user id", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    await expect(apiClient.get("/directory/users/does-not-exist", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("connects as an active non-superadmin user", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    const session = await apiClient.post<SessionResponse>("/directory/users/user-admin/connect", undefined, { token });
    expect(session.user.email).toBe("admin@entraditas.com");
    expect(session.user.role).toBe("admin");
  });

  it("rejects connecting to a superadmin account", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    await expect(
      apiClient.post("/directory/users/user-superadmin/connect", undefined, { token })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects connecting to a disabled user", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    db.users.find((u) => u.id === "user-admin")!.status = "disabled";
    await expect(
      apiClient.post("/directory/users/user-admin/connect", undefined, { token })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects a non-superadmin from connecting through the directory", async () => {
    const token = await login("admin@entraditas.com", "admin1234");
    await expect(apiClient.post("/directory/users/user-limited/connect", undefined, { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
