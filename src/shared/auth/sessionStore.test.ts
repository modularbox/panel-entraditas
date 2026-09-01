import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "./sessionStore";

const TOKEN_KEY = "entraditas.panel.devToken";

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
});
