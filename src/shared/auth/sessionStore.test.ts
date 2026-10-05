import { afterEach, describe, expect, it, vi } from "vitest";
import * as entraditasApi from "@/shared/lib/entraditasApi";
import { getSessionEffectivePermissions, hydrateConnectedSession, useSessionStore } from "./sessionStore";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

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

  it("returns to a clean logged-out state when the API no longer recognises the token", async () => {
    vi.spyOn(entraditasApi, "isApiConfigured").mockReturnValue(true);
    vi.spyOn(entraditasApi, "estadoSesionApi").mockResolvedValue("invalida");
    // El token no estaba en elalmacen: `restore()` lo lee de ahi, no de la store.
    localStorage.setItem("entraditas.panel.apiToken", "organizer-token");
    useSessionStore.setState({
      token: "organizer-token",
      user: { id: "org-1", email: "org@example.com", fullName: "Organizador", role: "organizador", organizationId: "org-1" },
      effectivePermissions: new Set(["events:read"]),
      eventScopes: [],
      status: "idle"
    });

    await useSessionStore.getState().restore();

    expect(useSessionStore.getState().status).toBe("unauthenticated");
    expect(useSessionStore.getState().token).toBeNull();
    expect(useSessionStore.getState().user).toBeNull();
    // El token muerto se retira de verdad, para que el siguiente arranque no lo intente otra vez.
    expect(localStorage.getItem("entraditas.panel.apiToken")).toBeNull();
  });

  it("valida con el token de la pestana cuando \"Conectar\" abrio esta pestana", async () => {
    vi.spyOn(entraditasApi, "isApiConfigured").mockReturnValue(true);
    vi.spyOn(entraditasApi, "estadoSesionApi").mockResolvedValue("valida");
    const quienSoy = vi.spyOn(entraditasApi, "quienSoyEnLaApi").mockResolvedValue({
      id: "org-1",
      email: "org@example.com",
      fullName: "Organizador",
      role: "organizador",
      organizationId: "org-1",
      status: "active",
      effectivePermissions: ["orders:read"]
    });
    // El superadmin sigue con su token en el compartido; esta pestana tiene el suyo encima.
    localStorage.setItem("entraditas.panel.apiToken", "superadmin-token");
    sessionStorage.setItem("entraditas.panel.apiToken.pestana", "organizer-token");
    useSessionStore.setState({ status: "idle" });

    await useSessionStore.getState().restore();

    expect(quienSoy).toHaveBeenCalled();
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().token).toBe("organizer-token");
    expect(useSessionStore.getState().user?.role).toBe("organizador");
    // La del superadmin, en su pestana, sigue donde estaba.
    expect(localStorage.getItem("entraditas.panel.apiToken")).toBe("superadmin-token");
  });
});