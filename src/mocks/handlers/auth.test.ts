import { afterEach, describe, expect, it } from "vitest";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { DEMO_ADMIN_ID } from "@/mocks/db";
import { resetDb } from "@/mocks/state";

interface LoginResponse {
  accessToken: string;
  user: { id: string; role: string };
  effectivePermissions: string[];
  eventScopes: string[];
}

describe("auth handlers", () => {
  afterEach(() => resetDb());

  it("logs in a demo user and returns effective permissions", async () => {
    const result = await apiClient.post<LoginResponse>("/auth/login", {
      email: "admin@entraditas.com",
      password: "N8@kP4!wY6#sD2&"
    });
    expect(result.user.id).toBe(DEMO_ADMIN_ID);
    expect(result.effectivePermissions).toContain("finance:read");
  });

  it("rejects an unknown email with UNAUTHENTICATED", async () => {
    await expect(
      apiClient.post("/auth/login", { email: "nope@entraditas.com", password: "N8@kP4!wY6#sD2&" })
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects the wrong password with UNAUTHENTICATED", async () => {
    await expect(
      apiClient.post("/auth/login", { email: "admin@entraditas.com", password: "wrong" })
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("/auth/me returns 401 without a token", async () => {
    await expect(apiClient.get("/auth/me")).rejects.toBeInstanceOf(AppError);
  });

  it("/auth/me returns the session for a valid token, and logout invalidates it", async () => {
    const login = await apiClient.post<LoginResponse>("/auth/login", {
      email: "admin@entraditas.com",
      password: "N8@kP4!wY6#sD2&"
    });
    const me = await apiClient.get<LoginResponse>("/auth/me", { token: login.accessToken });
    expect(me.user.id).toBe(DEMO_ADMIN_ID);

    await apiClient.post("/auth/logout", undefined, { token: login.accessToken });
    await expect(apiClient.get("/auth/me", { token: login.accessToken })).rejects.toMatchObject({
      code: "UNAUTHENTICATED"
    });
  });
});
