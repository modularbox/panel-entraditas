import { create } from "zustand";
import { alPerderLaSesion } from "@/shared/lib/apiClient";
import {
  estadoSesionApi, getApiToken, iniciarSesionEnLaApi, isApiConfigured, logoutFromApi, quienSoyEnLaApi,
  quienSoyEnLaApiConToken, type ApiStaff
} from "@/shared/lib/entraditasApi";
import { resolveEffectivePermissions } from "./permissions";
import { guardarCierre, olvidarCierre, type MotivoDeCierre } from "./sessionExpiry";
import type { PermissionOverride, RoleSlug } from "@entraditas/types";

// Misma clave con la que `entraditasApi` recuerda el token (`getApiToken`/`storeApiToken`): son la
// misma sesion, la del panel sobre api.entraditas.com. Hasta ahora la store guardaba su token en
// una clave propia y la API en otra, asi que al recargar la pagina `restore()` recuperaba el token
// con el que se habia quedado (el del superadmin antes de un "Conectar") y la sesion saltaba a la
// del superadmin aunque se estuviera dentro de una organizacion.
const TOKEN_STORAGE_KEY = "entraditas.panel.apiToken";
const IMPERSONATOR_STORAGE_KEY = "entraditas.panel.impersonatorToken";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: RoleSlug;
  organizationId: string | null;
  effectivePermissions?: string[];
  permissionOverrides?: PermissionOverride[];
  eventScopes?: string[];
}

export interface SessionResponse {
  accessToken?: string;
  /** El connect de organizacion responde `token` en vez de `accessToken`; se acepta aqui, igual que el de entrar. */
  token?: string;
  user: SessionUser;
  effectivePermissions?: string[];
  permissionOverrides?: PermissionOverride[];
  eventScopes?: string[];
}

export function getSessionEffectivePermissions(session: SessionResponse): string[] {
  const permissions = session.effectivePermissions ?? session.user.effectivePermissions;
  if (permissions) return permissions;
  return [...resolveEffectivePermissions(session.user.role, session.permissionOverrides ?? session.user.permissionOverrides ?? [])];
}

export async function hydrateConnectedSession(session: SessionResponse): Promise<SessionResponse> {
  if (session.user.role !== "suborganizador") return session;
  const token = session.accessToken ?? session.token;
  if (!token) return session;

  const staff = await quienSoyEnLaApiConToken(token);
  if (!staff) return session;

  const permissionOverrides = staff.permissionOverrides ?? session.permissionOverrides ?? session.user.permissionOverrides;
  const effectivePermissions = staff.effectivePermissions ?? (permissionOverrides
    ? [...resolveEffectivePermissions(staff.role, permissionOverrides)]
    : getSessionEffectivePermissions(session));

  return {
    ...session,
    user: {
      ...session.user,
      id: staff.id,
      email: staff.email,
      fullName: staff.fullName,
      role: staff.role,
      organizationId: staff.organizationId,
      permissionOverrides,
      eventScopes: staff.eventScopes ?? session.eventScopes ?? session.user.eventScopes
    },
    effectivePermissions,
    eventScopes: staff.eventScopes ?? session.eventScopes ?? session.user.eventScopes ?? []
  };
}

function getSessionEventScopes(session: SessionResponse): string[] {
  return session.eventScopes ?? session.user.eventScopes ?? [];
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

/**
 * La sesion del panel es la de api.entraditas.com: mismo token, misma cuenta.
 *
 * La API puede devolver permisos efectivos y alcances junto al perfil. Si no incluye los permisos
 * efectivos, los overrides del usuario permiten reconstruirlos con las mismas reglas del panel.
 */
function sesionDesde(staff: ApiStaff, token: string): SessionResponse {
  return {
    accessToken: token,
    user: {
      id: staff.id,
      email: staff.email,
      fullName: staff.fullName,
      role: staff.role,
      organizationId: staff.organizationId
    },
    effectivePermissions: staff.effectivePermissions ?? [...resolveEffectivePermissions(staff.role, staff.permissionOverrides ?? [])],
    eventScopes: staff.eventScopes ?? []
  };
}

export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  effectivePermissions: new Set(),
  eventScopes: [],
  status: "idle",
  impersonatorToken: null,

  setSession(session) {
    const accessToken = session.accessToken ?? session.token;
    if (!accessToken) throw new Error("La API no devolvió un token de sesión.");
    localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
    // Ya ha vuelto a entrar: el aviso de por que se cerro la anterior ha cumplido.
    olvidarCierre();
    // Every fresh session (login, restore-like, or returning to the superadmin) starts clean —
    // any leftover impersonator token from a previous, unrelated session no longer applies.
    localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
    set({ token: accessToken, user: session.user, effectivePermissions: new Set(getSessionEffectivePermissions(session)), eventScopes: getSessionEventScopes(session), status: "authenticated", impersonatorToken: null });
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
      // El token activo sigue siendo el del organizador conectado; el perfil debe validarse con el
      // token del superadmin que se guardó al hacer la conexión.
      const result = await quienSoyEnLaApiConToken(token);
      if (!result) throw new Error("Sesión no válida");
      get().setSession(sesionDesde(result, token));
    } catch {
      // The superadmin's token is no longer valid — there's nothing to return to, so drop back to
      // a clean logged-out state instead of leaving a dead-end button around.
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
      set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated", impersonatorToken: null });
    }
  },

  /**
   * Entrar al panel usando la sesion de api.entraditas.com.
   *
   * Antes habia dos sesiones: la del panel, validada contra los mocks del navegador (contrasenas
   * de demostracion escritas en el repositorio, que no protegen nada), y la de la API, que decide
   * lo que sale publicado. Desde que los mocks desaparecieron solo existe la de la API: si no
   * contesta, no hay limbo en el que quedarse, se dice que no se pudo entrar.
   */
  async login(email, password) {
    const enLaApi = await iniciarSesionEnLaApi(email, password);

    if (enLaApi.estado === "rechazado") {
      // Se dice de donde viene la negativa, para que a nadie le parezca que su credencial falla
      // sin saber por que.
      throw new Error(`${enLaApi.mensaje} La contraseña del panel es la de entraditas.com.`);
    }
    if (enLaApi.estado === "sin-respuesta") {
      throw new Error("No se pudo contactar con entraditas.com. Revisa tu conexión e inténtalo de nuevo.");
    }
    get().setSession(sesionDesde(enLaApi.staff, getApiToken()!));
  },

  async logout() {
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
    if (!isApiConfigured()) {
      set({ status: "unauthenticated" });
      return;
    }

    const token = getApiToken();
    if (!token) {
      // El token viejo del panel no sirve para la API: quien lo tenga guardado tendra que entrar.
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated", impersonatorToken: null });
      return;
    }

    const estado = await estadoSesionApi();
    if (estado === "invalida") {
      // Se deja dicho POR QUE. Sin esto el login aparecia sin explicacion: para quien lo vive, el
      // panel simplemente le echa, y lo que ve es "entra" sin saber que se le habia caducado.
      guardarCierre({ motivo: "sesion-no-valida" });
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(IMPERSONATOR_STORAGE_KEY);
      set({ status: "unauthenticated", token: null, user: null, effectivePermissions: new Set(), eventScopes: [], impersonatorToken: null });
      return;
    }
    if (estado === "sin-respuesta") {
      // No se puede confirmar la sesion: el panel depende de la API, asi que se queda fuera sin
      // acusar de nada a quien entra.
      set({ status: "unauthenticated" });
      return;
    }

    const staff = await quienSoyEnLaApi();
    if (!staff) {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      set({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "unauthenticated", impersonatorToken: null });
      return;
    }
    const session = sesionDesde(staff, token);
    set({
      token,
      user: session.user,
      effectivePermissions: new Set(session.effectivePermissions),
      eventScopes: session.eventScopes,
      status: "authenticated",
      impersonatorToken: localStorage.getItem(IMPERSONATOR_STORAGE_KEY)
    });
  }
}));

/**
 * Un 401 en cualquier peticion es la sesion diciendo que ya no vale.
 *
 * Se cierra y se manda al login contando por que, en vez de dejar cada pantalla ensenando su
 * propio error en rojo sin que nadie diga que lo que hacia falta era volver a entrar.
 */
alPerderLaSesion(() => {
  useSessionStore.getState().expire("sesion-no-valida");
});