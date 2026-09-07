/**
 * Cliente hacia api.entraditas.com, que es un servicio distinto del backend propio del panel.
 *
 * El panel se identifica con la sesion de quien ha iniciado sesion, NO con una clave compartida:
 * es una app de navegador, asi que una clave fija acabaria en el bundle y cualquiera que abriera
 * las devtools podria publicar eventos falsos en la web publica.
 *
 * Mientras `VITE_API_URL` no este configurada, todo esto queda inactivo y el panel funciona igual
 * que hasta ahora contra sus mocks: publicar deja el evento en revision y no sale a la web.
 */

const API_BASE = String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
const TOKEN_STORAGE_KEY = "entraditas.panel.apiToken";

export interface ApiStaff {
  id: string;
  email: string;
  fullName: string;
  role: "superadmin" | "admin" | "user" | "subuser";
  organizationId: string | null;
  status: string;
}

export class ApiUnavailableError extends Error {}

export function isApiConfigured(): boolean {
  return API_BASE !== "";
}

export function getApiToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeApiToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isApiConfigured()) throw new ApiUnavailableError("La API no esta configurada.");
  const token = getApiToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers
    }
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "No se pudo completar la peticion.");
  return payload;
}

/**
 * Abre sesion en la API con las mismas credenciales del panel. Se llama al iniciar sesion y su
 * fallo no debe impedir entrar al panel: mientras la API no exista o la persona no este dada de
 * alta en ella, el panel sigue funcionando contra sus mocks.
 */
export async function loginToApi(email: string, password: string): Promise<ApiStaff | null> {
  if (!isApiConfigured()) return null;
  try {
    const result = await request<{ token: string; staff: ApiStaff }>("/v1/panel/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    storeApiToken(result.token);
    return result.staff;
  } catch {
    storeApiToken(null);
    return null;
  }
}

export async function logoutFromApi(): Promise<void> {
  if (!isApiConfigured() || !getApiToken()) return;
  await request("/v1/panel/auth/logout", { method: "POST" }).catch(() => undefined);
  storeApiToken(null);
}

/** Publica (o actualiza) el evento en la web publica. `payload` es el contrato ya adaptado. */
export async function publishEventToApi(eventId: string, payload: unknown): Promise<void> {
  await request(`/v1/events/${encodeURIComponent(eventId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

/** Si el panel puede publicar ahora mismo: hay API configurada y sesion abierta en ella. */
export function canPublishToApi(): boolean {
  return isApiConfigured() && getApiToken() !== null;
}
