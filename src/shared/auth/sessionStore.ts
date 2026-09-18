import { create } from "zustand";
import { alPerderLaSesion, apiClient, AppError, SIMULADOR_PARADO } from "@/shared/lib/apiClient";
import { estadoSesionApi, iniciarSesionEnLaApi, logoutFromApi } from "@/shared/lib/entraditasApi";
import { guardarCierre, olvidarCierre, type MotivoDeCierre } from "./sessionExpiry";
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
  /** Cierra la sesion sin que nadie lo haya pedido, dejando dicho por que. */
  expire: (motivo: MotivoDeCierre, inactivoMs?: number) => void;
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
    // Ya ha vuelto a entrar: el aviso de por que se cerro la anterior ha cumplido.
    olvidarCierre();
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

  /**
   * Entrar al panel. Una sola contrasena, la de api.entraditas.com.
   *
   * Antes habia dos: la del panel, que se validaba contra los mocks del navegador (contrasenas de
   * demostracion escritas en el repositorio, que no protegen nada), y la de la API, que decide lo
   * que sale publicado. Como no coincidian, entrar dejaba el panel "sin conexion con
   * entraditas.com" y habia que escribir la segunda a mano en otro formulario. Ahora manda la
   * API: si dice que si, la sesion local se abre sola detras.
   *
   * Si la API no contesta (caida, sin red, o compilacion sin API configurada) se usa el camino de
   * siempre contra los mocks. Una caida de la API no puede dejar a nadie fuera de su panel; lo
   * unico que se pierde entretanto es poder publicar hacia fuera.
   */
  async login(email, password) {
    const enLaApi = await iniciarSesionEnLaApi(email, password);

    if (enLaApi.estado === "rechazado") {
      // Se dice de donde viene la negativa. La contrasena del panel paso a ser la de
      // entraditas.com, y sin decirlo alguien puede reintentar la de siempre indefinidamente.
      throw new Error(`${enLaApi.mensaje} La contraseña del panel es ahora la de entraditas.com.`);
    }
    if (enLaApi.estado === "ok") {
      const session = await apiClient.post<SessionResponse>("/auth/session-from-api", { email });
      get().setSession(session);
      return;
    }

    const result = await apiClient.post<SessionResponse>("/auth/login", { email, password });
    get().setSession(result);
  },

  async logout() {
    const token = get().token;
    if (token) {
      await apiClient.post("/auth/logout", undefined, { token }).catch(() => undefined);
    }
    await logoutFromApi().catch(() => undefined);
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
    // Salir por voluntad propia no deja aviso: el de la vez anterior no tiene nada que decir aqui.
    olvidarCierre();
    set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated", impersonatorToken: null });
  },

  /**
   * La sesion se ha caido sola: por no tocar nada en un buen rato, o porque el servidor ha dicho
   * que el token ya no vale.
   *
   * Deja escrito el motivo ANTES de cerrar, porque cerrar hace que el enrutador mande al login de
   * inmediato: si el motivo se guardara despues, el login ya se habria pintado sin el y la
   * pantalla diria solo "entra", que es exactamente lo que no ayuda.
   */
  expire(motivo, inactivoMs) {
    if (get().status !== "authenticated") return;
    guardarCierre({ motivo, ...(inactivoMs !== undefined ? { inactivoMs } : {}) });
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
    set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated", impersonatorToken: null });
    void logoutFromApi().catch(() => undefined);
  },

  async restore() {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!token) {
      set({ status: "unauthenticated" });
      return;
    }

    // Una sesion del panel sin sesion en la API esta a medias: se entra, pero lo que se publique
    // no sale a entraditas.com. Pasa con las sesiones abiertas antes de que la API mandara, y
    // desde dentro se veia como un aviso de "sin conexion" que habia que resolver a mano. Se
    // prefiere pedir la contrasena una vez: al volver a entrar, las dos sesiones quedan abiertas.
    //
    // Pero SOLO si la API ha dicho que no. Si no contesta, se sigue dentro: antes, cualquier
    // caida de la API sacaba del panel a todo el mundo al recargar la pagina.
    if ((await estadoSesionApi()) === "invalida") {
      // Se deja dicho POR QUE. Sin esto el login aparecia sin explicacion: para quien lo vive, el
      // panel simplemente le echa, y lo que ve es "entra" sin saber que se le habia caducado.
      guardarCierre({ motivo: "sesion-no-valida" });
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
      set({ status: "unauthenticated", token: null, user: null, effectivePermissions: new Set(), eventScopes: [], impersonatorToken: null });
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
    } catch (fallo) {
      // Que el simulador no atienda NO significa que la sesion no valga: el token puede estar
      // perfectamente vivo. Se conserva y no se escribe ningun motivo, porque decir "tu sesion ya
      // no vale" seria otra mentira. Al recargar, la sesion vuelve como estaba.
      if (fallo instanceof AppError && fallo.code === SIMULADOR_PARADO) {
        set({ status: "unauthenticated" });
        return;
      }
      // Habia un token guardado y ya no sirve: para quien lo vive, la sesion se ha cerrado sola.
      guardarCierre({ motivo: "sesion-no-valida" });
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ status: "unauthenticated" });
    }
  }
}));

/**
 * Un 401 en cualquier peticion es la sesion diciendo que ya no vale.
 *
 * Antes se quedaba en el mensaje de error de la pantalla donde saltara ("No se pudo guardar el
 * evento") y el panel seguia navegando con una sesion muerta: cada pantalla fallaba a su manera
 * hasta que alguien recargaba. Ahora se cierra y se manda al login, contando por que.
 */
alPerderLaSesion(() => {
  useSessionStore.getState().expire("sesion-no-valida");
});
