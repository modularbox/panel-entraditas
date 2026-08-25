import { create } from "zustand";
import { apiClient } from "@/shared/lib/apiClient";
import type { RoleSlug } from "@entraditas/types";

const TOKEN_STORAGE_KEY = "entraditas.panel.devToken";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleSlug;
  organizationId: string | null;
}

interface SessionResponse {
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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  restore: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  effectivePermissions: new Set(),
  eventScopes: [],
  status: "idle",

  async login(email, password) {
    const result = await apiClient.post<SessionResponse>("/auth/login", { email, password });
    localStorage.setItem(TOKEN_STORAGE_KEY, result.accessToken!);
    set({
      token: result.accessToken!,
      user: result.user,
      effectivePermissions: new Set(result.effectivePermissions),
      eventScopes: result.eventScopes,
      status: "authenticated"
    });
  },

  async logout() {
    const token = get().token;
    if (token) {
      await apiClient.post("/auth/logout", undefined, { token }).catch(() => undefined);
    }
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated" });
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
        status: "authenticated"
      });
    } catch {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ status: "unauthenticated" });
    }
  }
}));
