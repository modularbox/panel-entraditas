import { afterEach, describe, expect, it } from "vitest";
import type { OrganizationListItem } from "@entraditas/types";
import type { SessionResponse } from "@/shared/auth/sessionStore";
import { demoPasswordFor, resetDb } from "@/mocks/state";
import { apiClient } from "@/shared/lib/apiClient";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: demoPasswordFor(email) });
  return result.accessToken;
}

describe("organizations handlers", () => {
  afterEach(() => resetDb());

  it("lists both organizations with their admin account to a superadmin", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const organizations = await apiClient.get<OrganizationListItem[]>("/organizations", { token });
    expect(organizations).toHaveLength(2);
    expect(organizations[0]).toMatchObject({
      id: "org-1",
      name: "Producciones Norte",
      slug: "producciones-norte",
      commissionRate: 0.08,
      admin: { id: "user-admin", fullName: "Admin de Producciones Norte", email: "admin@entraditas.com" }
    });
    expect(organizations[1]).toMatchObject({
      id: "org-2",
      name: "Sur Live",
      slug: "sur-live",
      commissionRate: 0.1,
      admin: { id: "user-admin-2", fullName: "Admin de Sur Live", email: "admin.surlive@entraditas.com" }
    });
  });

  it("rejects the listing without a session (401)", async () => {
    await expect(apiClient.get("/organizations")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects the listing to an org admin actor (403)", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(apiClient.get("/organizations", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("connect switches the session to the organization's admin account", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const session = await apiClient.post<SessionResponse>(`/organizations/org-1/connect`, undefined, { token });
    expect(session.user).toMatchObject({ id: "user-admin", email: "admin@entraditas.com", fullName: "Admin de Producciones Norte", role: "admin", organizationId: "org-1" });
    expect(session.effectivePermissions).toContain("users:manage");
    expect(session.effectivePermissions).not.toContain("organizations:manage");

    const me = await apiClient.get<SessionResponse>("/auth/me", { token: session.accessToken });
    expect(me.user.id).toBe("user-admin");
  });

  it("connect to the second organization switches to its own admin", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const session = await apiClient.post<SessionResponse>("/organizations/org-2/connect", undefined, { token });
    expect(session.user.id).toBe("user-admin-2");
    expect(session.user.email).toBe("admin.surlive@entraditas.com");
    expect(session.user.organizationId).toBe("org-2");
  });

  it("connect guards the actor (401/403) and rejects an unknown organization (404)", async () => {
    await expect(apiClient.post("/organizations/org-1/connect")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    const adminToken = await loginAs("admin@entraditas.com");
    await expect(apiClient.post("/organizations/org-1/connect", undefined, { token: adminToken })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const token = await loginAs("superadmin@entraditas.com");
    await expect(apiClient.post("/organizations/org-999/connect", undefined, { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});