import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";

describe("invitation handlers", () => {
  afterEach(() => resetDb());

  it("accepts a pending invitation and creates a session", async () => {
    const login = await apiClient.post<{ accessToken: string }>("/auth/login", { email: "admin@entraditas.com", password: "N8@kP4!wY6#sD2&" });
    const invitation = await apiClient.post<{ inviteUrl: string }>("/users/invite", { email: "new@example.com", fullName: "Nueva", role: "user" }, { token: login.accessToken });
    const token = invitation.inviteUrl.split("/invitacion/")[1];
    const session = await apiClient.post<{ accessToken: string }>(`/invitations/${token}/accept`, { password: "password" });
    expect(session.accessToken).toBeTruthy();
    expect(db.invitations[0]?.status).toBe("accepted");
  });
});