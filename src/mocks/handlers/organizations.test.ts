import { afterEach, describe, expect, it } from "vitest";
import type { OrganizationDetail, OrganizationListItem } from "@entraditas/types";
import type { SessionResponse } from "@/shared/auth/sessionStore";
import { demoPasswordFor, resetDb } from "@/mocks/state";
import { apiClient } from "@/shared/lib/apiClient";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: demoPasswordFor(email) });
  return result.accessToken;
}

describe("organizations handlers", () => {
  afterEach(() => resetDb());

  it("lists both organizations with their organizador account to a superadmin", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const organizations = await apiClient.get<OrganizationListItem[]>("/organizations", { token });
    expect(organizations).toHaveLength(2);
    expect(organizations[0]).toMatchObject({
      id: "org-1",
      name: "Producciones Norte",
      slug: "producciones-norte",
      organizer: { id: "user-admin", fullName: "Admin de Producciones Norte", email: "admin@entraditas.com" }
    });
    expect(organizations[1]).toMatchObject({
      id: "org-2",
      name: "Sur Live",
      slug: "sur-live",
      organizer: { id: "user-admin-2", fullName: "Admin de Sur Live", email: "admin.surlive@entraditas.com" }
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
    expect(session.user).toMatchObject({ id: "user-admin", email: "admin@entraditas.com", fullName: "Admin de Producciones Norte", role: "organizador", organizationId: "org-1" });
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

  it("serves the detail ficha with organizer bank account, suborganizadores' events and events with granted users", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const detail = await apiClient.get<OrganizationDetail>("/organizations/org-1", { token });

    expect(detail.organizer).toMatchObject({
      id: "user-admin",
      fullName: "Admin de Producciones Norte",
      email: "admin@entraditas.com",
      bankAccount: "ES77 2100 1234 5678 9012 3456"
    });

    // Suborganizadores with the events each has access to.
    expect(detail.subOrganizers).toMatchObject([
      { id: "user-limited", fullName: "Marta Gutiérrez Vega", email: "marta.gutierrez@entraditas.com" },
      { id: "user-subuser", fullName: "Javier Ortega López", email: "javier.ortega@entraditas.com" }
    ]);
    expect(detail.subOrganizers[0]!.accessibleEvents.map((event) => event.id)).toEqual(["event-1", "event-2"]);
    expect(detail.subOrganizers[1]!.accessibleEvents.map((event) => event.id)).toEqual(["event-1"]);

    // Eventos de la organización con los usuarios con acceso (organizador siempre, suborganizadores según eventScopes).
    const jazz = detail.events.find((event) => event.id === "event-1")!;
    expect(jazz.accessUsers.map((user) => user.id).sort()).toEqual(["user-admin", "user-limited", "user-subuser"]);
    const rock = detail.events.find((event) => event.id === "event-2")!;
    expect(rock.accessUsers.map((user) => user.id)).toEqual(["user-admin", "user-limited"]);
    expect(detail.events.some((event) => event.id === "event-3")).toBe(true);
    expect(detail.events.some((event) => event.id === "event-5")).toBe(true);
  });

  it("connects as a specific suborganizador of the organization", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const session = await apiClient.post<SessionResponse>("/organizations/org-1/users/user-limited/connect", undefined, { token });
    expect(session.user).toMatchObject({ id: "user-limited", email: "marta.gutierrez@entraditas.com", fullName: "Marta Gutiérrez Vega", role: "suborganizador", organizationId: "org-1" });
    expect(session.effectivePermissions).not.toContain("organizations:manage");
    expect(session.eventScopes).toEqual(["event-1", "event-2"]);

    const me = await apiClient.get<SessionResponse>("/auth/me", { token: session.accessToken });
    expect(me.user.id).toBe("user-limited");
  });

  it("connects as a suborganizador only within its own organization and for active users", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    // user-limited belongs to org-1, not org-2: no session, but a 404 outcome.
    await expect(apiClient.post("/organizations/org-2/users/user-limited/connect", undefined, { token })).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(apiClient.post("/organizations/org-1/users/user-limited/connect")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const adminToken = await loginAs("admin@entraditas.com");
    await expect(apiClient.post("/organizations/org-1/users/user-limited/connect", undefined, { token: adminToken })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});