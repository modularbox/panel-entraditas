import { afterEach, describe, expect, it, vi } from "vitest";
import * as entraditasApi from "@/shared/lib/entraditasApi";
import { getSessionEffectivePermissions, hydrateConnectedSession } from "./sessionStore";

afterEach(() => vi.restoreAllMocks());

describe("getSessionEffectivePermissions", () => {
  it("uses effective permissions returned at the session root", () => {
    const session = {
      token: "token",
      user: { id: "sub-1", email: "sub@example.com", fullName: "Sub", role: "suborganizador" as const, organizationId: "org-1" },
      effectivePermissions: ["scan:validate"]
    };

    expect(getSessionEffectivePermissions(session)).toEqual(["scan:validate"]);
  });

  it("resolves permissions from overrides nested on the connected user", () => {
    const session = {
      token: "token",
      user: {
        id: "sub-1",
        email: "sub@example.com",
        fullName: "Sub",
        role: "suborganizador" as const,
        organizationId: "org-1",
        permissionOverrides: [{ permission: "scan:validate", effect: "allow" as const }],
        eventScopes: ["event-1"]
      }
    };

    expect(getSessionEffectivePermissions(session)).toEqual(["scan:validate"]);
  });

  it("loads effective permissions for a connected suborganizer from their token profile", async () => {
    vi.spyOn(entraditasApi, "quienSoyEnLaApiConToken").mockResolvedValue({
      id: "sub-1",
      email: "sub@example.com",
      fullName: "Sub",
      role: "suborganizador",
      organizationId: "org-1",
      status: "active",
      effectivePermissions: ["orders:read"],
      eventScopes: ["event-1"]
    });

    const session = await hydrateConnectedSession({
      token: "sub-token",
      user: { id: "sub-1", email: "sub@example.com", fullName: "Sub", role: "suborganizador", organizationId: "org-1" }
    });

    expect(getSessionEffectivePermissions(session)).toEqual(["orders:read"]);
    expect(session.eventScopes).toEqual(["event-1"]);
  });
});