import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore, type SessionResponse } from "./sessionStore";

const TOKEN_KEY = "entraditas.panel.devToken";
const IMPERSONATOR_KEY = "entraditas.panel.impersonatorToken";

describe("useSessionStore", () => {
  afterEach(() => {
    localStorage.clear();
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("login populates the session with effective permissions", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const state = useSessionStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.effectivePermissions.has("finance:read")).toBe(true);
    expect(localStorage.getItem(TOKEN_KEY)).toBe(state.token);
  });

  it("logout clears the session and the stored token", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    await useSessionStore.getState().logout();
    const state = useSessionStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it("restore re-hydrates the session from a stored token", async () => {
    await useSessionStore.getState().login("usuario@entraditas.com", "usuario1234");
    const token = useSessionStore.getState().token;
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
    localStorage.setItem(TOKEN_KEY, token!);

    await useSessionStore.getState().restore();
    expect(useSessionStore.getState().status).toBe("authenticated");
    expect(useSessionStore.getState().eventScopes).toHaveLength(2);
  });

  it("restore sets status to unauthenticated when there is no stored token", async () => {
    await useSessionStore.getState().restore();
    expect(useSessionStore.getState().status).toBe("unauthenticated");
  });

  async function loginAsSuperadminAndConnect() {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    const superadminToken = useSessionStore.getState().token!;
    const session = await apiClient.post<SessionResponse>("/organizations/org-1/connect", undefined, { token: superadminToken });
    useSessionStore.getState().connectAs(session);
    return superadminToken;
  }

  it("connectAs saves the current token as the impersonator token before switching", async () => {
    const superadminToken = await loginAsSuperadminAndConnect();
    const state = useSessionStore.getState();
    expect(state.impersonatorToken).toBe(superadminToken);
    expect(state.user?.email).toBe("admin@entraditas.com");
    expect(localStorage.getItem(IMPERSONATOR_KEY)).toBe(superadminToken);
  });

  it("returnToSuperadmin restores the previous superadmin session and clears the impersonator token", async () => {
    const superadminToken = await loginAsSuperadminAndConnect();

    await useSessionStore.getState().returnToSuperadmin();

    const state = useSessionStore.getState();
    expect(state.token).toBe(superadminToken);
    expect(state.user?.role).toBe("superadmin");
    expect(state.impersonatorToken).toBeNull();
    expect(localStorage.getItem(IMPERSONATOR_KEY)).toBeNull();
  });

  it("a plain login clears any leftover impersonator token", async () => {
    localStorage.setItem(IMPERSONATOR_KEY, "stale-token");
    useSessionStore.setState({ impersonatorToken: "stale-token" });

    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");

    expect(useSessionStore.getState().impersonatorToken).toBeNull();
    expect(localStorage.getItem(IMPERSONATOR_KEY)).toBeNull();
  });

  it("logout also clears the impersonator token", async () => {
    await loginAsSuperadminAndConnect();

    await useSessionStore.getState().logout();

    expect(useSessionStore.getState().impersonatorToken).toBeNull();
    expect(localStorage.getItem(IMPERSONATOR_KEY)).toBeNull();
  });

  it("restore re-hydrates the impersonator token from storage", async () => {
    await loginAsSuperadminAndConnect();
    const adminToken = useSessionStore.getState().token;
    const impersonatorToken = useSessionStore.getState().impersonatorToken;
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle", impersonatorToken: null });
    localStorage.setItem(TOKEN_KEY, adminToken!);

    await useSessionStore.getState().restore();

    expect(useSessionStore.getState().impersonatorToken).toBe(impersonatorToken);
  });

  it("returnToSuperadmin logs out cleanly when the stored impersonator token is no longer valid", async () => {
    await loginAsSuperadminAndConnect();
    resetDb(); // wipes the in-memory sessions map, invalidating every issued token

    await useSessionStore.getState().returnToSuperadmin();

    const state = useSessionStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.token).toBeNull();
    expect(state.impersonatorToken).toBeNull();
    expect(localStorage.getItem(IMPERSONATOR_KEY)).toBeNull();
  });
});
