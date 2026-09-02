import { create } from "zustand";
import { apiClient } from "@/shared/lib/apiClient";
import type { RoleSlug } from "@entraditas/types";

const TOKEN_STORAGE_KEY = "entraditas.panel.devToken";
const IMPERSONATOR_STORAGE_KEY = "entraditas.panel.impersonatorToken";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleSlug;
  organizationId: string | null;
}

export interface SessionResponse {
  accessToken?: string;
  user: SessionUser;
  effectivePermissions: string[];
  eventScopes: string[];
}

interface SessionState {
  token: string | null;
  user: SessionUser | null;
  effectivePermissions: Set<string>;
  eventScopes: string[];
  status: "idle" | "authenticated" | "unauthenticated";
  // The superadmin's own token, saved when they "Conectar" into an organization's admin account
  // (see connectAs) so they can switch straight back without logging in again. Null otherwise.
  impersonatorToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
  setSession: (session: SessionResponse) => void;
  connectAs: (session: SessionResponse) => void;
  returnToSuperadmin: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  effectivePermissions: new Set(),
  eventScopes: [],
  status: "idle",
  impersonatorToken: null,

  setSession(session) {
    localStorage.setItem(TOKEN_STORAGE_KEY, session.accessToken!);
    // Every fresh session (login, restore-like, or returning to the superadmin) starts clean —
    // any leftover impersonator token from a previous, unrelated session no longer applies.
    localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
    set({ token: session.accessToken!, user: session.user, effectivePermissions: new Set(session.effectivePermissions), eventScopes: session.eventScopes, status: "authenticated", impersonatorToken: null });
  },

  connectAs(session) {
    // Only reachable from "Conectar" in Organizaciones, which only a superadmin can open (see
    // requireOrganizationManager), so the token being replaced here is always theirs.
    const currentToken = get().token;
    get().setSession(session);
    if (currentToken) {
      localStorage.setItem(IMPERSONATOR_STORAGE_KEY, currentToken);
      set({ impersonatorToken: currentToken });
    }
  },

  async returnToSuperadmin() {
    const token = get().impersonatorToken;
    if (!token) return;
    try {
      const result = await apiClient.get<SessionResponse>("/auth/me", { token });
      get().setSession({ accessToken: token, ...result });
    } catch {
      // The superadmin's token is no longer valid (e.g. the demo data was reset in between) —
      // there's nothing to return to, so drop back to a clean logged-out state instead of leaving
      // a dead-end button around.
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
      set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated", impersonatorToken: null });
    }
  },

  async login(email, password) {
    const result = await apiClient.post<SessionResponse>("/auth/login", { email, password });
    get().setSession(result);
  },

  async logout() {
    const token = get().token;
    if (token) {
      await apiClient.post("/auth/logout", undefined, { token }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
    set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated", impersonatorToken: null });
  },

  async restore() {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }
    try {
      const result = await apiClient.get<SessionResponse>("/auth/me", { token });
      set({
        token,
        user: result.user,
        effectivePermissions: new Set(result.effectivePermissions),
        eventScopes: result.eventScopes,
        status: "authenticated",
        impersonatorToken: localStorage.getItem(IMPERSONATOR_STORAGE_KEY)
      });
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ status: "unauthenticated" });
    }
  }
}));
