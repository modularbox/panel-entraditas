import { create } from "zustand";
import { alPerderLaSesion } from "@/shared/lib/apiClient";
import {
  clearSesionActiva, estadoSesionApi, getApiToken, iniciarSesionEnLaApi, isApiConfigured, logoutFromApi, quienSoyEnLaApi,
  quienSoyEnLaApiConToken, storeApiToken, type ApiStaff
} from "@/shared/lib/entraditasApi";
import { resolveEffectivePermissions } from "./permissions";
import { guardarCierre, olvidarCierre, type MotivoDeCierre } from "./sessionExpiry";
import type { PermissionOverride, RoleSlug } from "@entraditas/types";

// El token se recuerda en `entraditasApi` (`getApiToken`/`storeApiToken`), no aqui: son la misma
  // sesion, la del panel sobre api.entraditas.com. Hasta ahora la store guardaba su token en una
  // clave propia y la API en otra, asi que al recargar la pagina `restore()` recuperaba el token con
  // el que se habia quedado (el del superadmin antes de un "Conectar") y la sesion saltaba a la del
  // superadmin aunque se estuviera dentro de una organizacion. Por eso la store ya no escribe claves
  // de storage: usa los accesores de la API, que ademas distinguen la sesion compartida de la de
  // pestana.

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
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Cierra la sesion sin que nadie lo haya pedido, dejando dicho por que. */
  expire: (motivo: MotivoDeCierre, inactivoMs?: number) => void;
  restore: () => Promise<void>;
  setSession: (session: SessionResponse) => void;
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

/** Como queda la store cuando no hay sesion que valga, para no repetirlo en cada cierre. */
function sesionCerrada(): Pick<SessionState, "token" | "user" | "effectivePermissions" | "eventScopes" | "status"> {
  return {
    token: null,
    user: null,
    effectivePermissions: new Set(),
    eventScopes: [],
    status: "unauthenticated"
  };
}
export const useSessionStore = create<SessionState>((set, get) => ({
  token: null,
  user: null,
  effectivePermissions: new Set(),
  eventScopes: [],
  status: "idle",

  setSession(session) {
    const accessToken = session.accessToken ?? session.token;
    if (!accessToken) throw new Error("La API no devolvió un token de sesión.");
    storeApiToken(accessToken);
    // Ya ha vuelto a entrar: el aviso de por que se cerro la anterior ha cumplido.
    olvidarCierre();
    set({
      token: accessToken,
      user: session.user,
      effectivePermissions: new Set(getSessionEffectivePermissions(session)),
      eventScopes: getSessionEventScopes(session),
      status: "authenticated"
    });
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
    // Salir es una decision sobre este navegador: se van tambien las pestanas de "Conectar".
    await logoutFromApi().catch(() => undefined);
    // Salir por voluntad propia no deja aviso: el de la vez anterior no tiene nada que decir aqui.
    olvidarCierre();
    set(sesionCerrada());
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
    // Solo se cae la sesion de esta pestana. Si lo que caduca es la de "Conectar", el superadmin
    // sigue con la suya en su pestana y no tiene por que enterarse.
    clearSesionActiva();
    set(sesionCerrada());
    void logoutFromApi("pestana").catch(() => undefined);
  },

  async restore() {
    if (!isApiConfigured()) {
      set({ status: "unauthenticated" });
      return;
    }

    const token = getApiToken();
    if (!token) {
      // El token viejo del panel no sirve para la API: quien lo tenga guardado tendra que entrar.
      clearSesionActiva();
      set(sesionCerrada());
      return;
    }

    const estado = await estadoSesionApi();
    if (estado === "invalida") {
      // Se deja dicho POR QUE. Sin esto el login aparecia sin explicacion: para quien lo vive, el
      // panel simplemente le echa, y lo que ve es "entra" sin saber que se le habia caducado.
      guardarCierre({ motivo: "sesion-no-valida" });
      clearSesionActiva();
      set(sesionCerrada());
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
      clearSesionActiva();
      set(sesionCerrada());
      return;
    }
    const session = sesionDesde(staff, token);
    set({
      token,
      user: session.user,
      effectivePermissions: new Set(session.effectivePermissions),
      eventScopes: session.eventScopes,
      status: "authenticated"
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