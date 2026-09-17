import type { PublicEvent } from "@entraditas/types";

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

/**
 * Base de la API, tolerante a como se escriba en `VITE_API_URL`.
 *
 * Sin protocolo (`api.entraditas.com`) el navegador la tomaria como una ruta RELATIVA al propio
 * panel, asi que las peticiones irian a `panel.entraditas.com/api.entraditas.com/...` y fallarian
 * sin decir por que. Se asume https, que es lo unico razonable para un dominio publico.
 */
export function normalizeApiBase(value: string | undefined): string {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL);
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
 * Resultado de intentar entrar en la API.
 *
 * Hay que distinguir "me han dicho que no" de "no me han contestado", porque llevan a decisiones
 * opuestas: un 401 es una respuesta y hay que hacerle caso, mientras que una caida de la API no
 * puede dejar a nadie fuera de su propio panel.
 */
export type ResultadoSesionApi =
  | { estado: "ok"; staff: ApiStaff }
  | { estado: "rechazado"; mensaje: string }
  | { estado: "sin-respuesta" };

/**
 * Abre sesion en la API con las credenciales escritas en el panel.
 *
 * Es la autenticacion que de verdad importa: decide quien puede publicar en entraditas.com. La
 * del panel se valida contra sus mocks, cuyas contrasenas de demostracion estan en el
 * repositorio y no protegen nada.
 */
export async function iniciarSesionEnLaApi(email: string, password: string): Promise<ResultadoSesionApi> {
  if (!isApiConfigured()) return { estado: "sin-respuesta" };
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/v1/panel/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
  } catch {
    // Ni siquiera hubo respuesta: sin red, DNS caido, o la API apagada.
    return { estado: "sin-respuesta" };
  }

  const payload = (await response.json().catch(() => ({}))) as { token?: string; staff?: ApiStaff; error?: string };
  if (response.ok && payload.token && payload.staff) {
    storeApiToken(payload.token);
    return { estado: "ok", staff: payload.staff };
  }

  storeApiToken(null);
  // Un 5xx es un problema del servidor, no una negativa sobre estas credenciales.
  if (response.status >= 500) return { estado: "sin-respuesta" };
  return { estado: "rechazado", mensaje: payload.error ?? "Correo o contraseña incorrectos." };
}

/**
 * Igual, pero devolviendo solo si se pudo o no. Se conserva para las pantallas que ya la usaban.
 */
export async function loginToApi(email: string, password: string): Promise<ApiStaff | null> {
  const resultado = await iniciarSesionEnLaApi(email, password);
  return resultado.estado === "ok" ? resultado.staff : null;
}

/**
 * Igual que `loginToApi`, pero deja salir el error en vez de tragarselo.
 *
 * Existe porque las credenciales de la API NO son las del panel. El panel se autentica contra
 * sus mocks, cuyas contrasenas de demostracion estan en el repositorio y son publicas; la API,
 * que decide lo que sale en entraditas.com, tiene las suyas propias. Cuando alguien las escribe
 * a mano en el formulario de conexion necesita saber por que han fallado, no un silencio.
 */
export async function conectarConLaApi(email: string, password: string): Promise<ApiStaff> {
  if (!isApiConfigured()) throw new ApiUnavailableError("La API publica no esta configurada en esta compilacion.");
  try {
    const result = await request<{ token: string; staff: ApiStaff }>("/v1/panel/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    storeApiToken(result.token);
    return result.staff;
  } catch (error) {
    storeApiToken(null);
    throw error;
  }
}

/**
 * Si la sesion de la API sigue valiendo, distinguiendo "no vale" de "no se puede saber".
 *
 * Al recargar el panel hay que decidir si pedir la contrasena otra vez, y esas dos respuestas
 * llevan a decisiones opuestas. Si la API dice que no, hay que volver a entrar. Si la API no
 * contesta, no: una caida de la API no puede sacar a nadie de su propio panel, igual que al
 * iniciar sesion (ver `iniciarSesionEnLaApi`).
 */
export type EstadoSesionApi = "valida" | "invalida" | "sin-respuesta";

export async function estadoSesionApi(): Promise<EstadoSesionApi> {
  if (!isApiConfigured()) return "sin-respuesta";
  const token = getApiToken();

  try {
    if (!token) {
      // Sin token no hay sesion que comprobar, pero hace falta saber si la API esta ahi: si lo
      // esta, la sesion del panel quedo a medias y hay que entrar para completarla; si no, se
      // entro contra los mocks durante una caida y no se puede hacer nada mejor.
      const salud = await fetch(`${API_BASE}/health`);
      return salud.ok ? "invalida" : "sin-respuesta";
    }
    const respuesta = await fetch(`${API_BASE}/v1/panel/me`, { headers: { authorization: `Bearer ${token}` } });
    if (respuesta.ok) return "valida";
    if (respuesta.status >= 500) return "sin-respuesta";
    storeApiToken(null);
    return "invalida";
  } catch {
    return "sin-respuesta";
  }
}

/** Quien esta conectado ahora mismo a la API, o null si la sesion ya no vale. */
export async function quienSoyEnLaApi(): Promise<ApiStaff | null> {
  if (!isApiConfigured() || !getApiToken()) return null;
  try {
    const result = await request<{ staff: ApiStaff }>("/v1/panel/me");
    return result.staff;
  } catch {
    // El token caduco o se revoco: se limpia para que la interfaz no diga "conectado" sin serlo.
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

/**
 * Retira el evento de la web publica.
 *
 * Hace falta porque despublicar o borrar en el panel no tocaba entraditas.com: el evento seguia
 * anunciandose ahi aunque en el panel ya no existiera.
 */
export async function removeEventFromApi(eventId: string): Promise<void> {
  await request(`/v1/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

/** Si el panel puede publicar ahora mismo: hay API configurada y sesion abierta en ella. */
export function canPublishToApi(): boolean {
  return isApiConfigured() && getApiToken() !== null;
}

// ---------------------------------------------------------------------------
// Catalogo publico (solo lectura, no requiere sesion)
// ---------------------------------------------------------------------------

/** Devuelve los eventos publicados que la web muestra a los compradores. */
export async function fetchPublicCatalog(): Promise<PublicEvent[]> {
  if (!isApiConfigured()) return [];
  const response = await fetch(`${API_BASE}/v1/events`);
  if (!response.ok) return [];
  const payload = (await response.json().catch(() => ({}))) as { items?: PublicEvent[] };
  return payload.items ?? [];
}

// ---------------------------------------------------------------------------
// Lo que de verdad pasa en entraditas.com
// ---------------------------------------------------------------------------
//
// Todo lo de abajo lee de la MISMA base de datos que la web publica, no de los mocks del panel.
// Son dos poblaciones distintas: los mocks sirven para trabajar sin servidor y para las pruebas,
// pero un comprador que se registra en entraditas.com no aparece en ellos por definicion. Cuando
// hay API configurada y sesion abierta en ella, estas funciones son la fuente buena.

/** Un comprador registrado en la web, con lo que lleve comprado (0 si no ha comprado nada). */
export interface ApiCustomer {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  ordersCount: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  createdAt: string | null;
}

export interface ApiOrganization {
  id: string;
  name: string;
  slug: string;
  taxId: string | null;
  commissionRate: number;
  contactEmail: string | null;
  contactPhone: string | null;
  status: string;
  createdAt: string | null;
  organizer: { id: string; fullName: string; email: string } | null;
}

/** Una solicitud de alta enviada desde el formulario de organizadores de la web. */
export interface ApiOrganizerApplication {
  id: string;
  reference: string;
  organizationName: string;
  legalName: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  eventType: string;
  website: string | null;
  estimatedEvents: string;
  localities: string;
  message: string;
  status: "pending" | "approved" | "rejected";
  organizationId: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
}

/** Los numeros del dashboard, calculados por la API sobre la base de datos. */
export interface ApiMetrics {
  disponible: boolean;
  motivo?: string;
  compradores?: { total: number; sinCompras: number; ultimos7dias: number };
  eventos?: { total: number; porEstado: Record<string, number> };
  ventas?: {
    pedidos: number;
    bruto: number;
    neto: number;
    devuelto: number;
    entradas: number;
    ticketMedio: number;
    porCanal: { channel: string; orders: number; net: number }[];
  };
  organizadores?: { organizaciones: number; solicitudesPendientes: number };
  ultimosEventos?: { id: string; title: string; status: string; startsAt: string | null; net: number; orders: number }[];
  actualizado?: string;
}

/** Si se puede leer de la API ahora mismo: hay base configurada y sesion abierta en ella. */
export function canReadFromApi(): boolean {
  return isApiConfigured() && getApiToken() !== null;
}

export async function fetchApiCustomers(search?: string): Promise<ApiCustomer[]> {
  const query = search ? `?q=${encodeURIComponent(search)}` : "";
  const result = await request<{ items: ApiCustomer[] }>(`/v1/panel/customers${query}`);
  return result.items ?? [];
}

export async function fetchApiOrganizations(): Promise<ApiOrganization[]> {
  const result = await request<{ items: ApiOrganization[] }>("/v1/panel/organizations");
  return result.items ?? [];
}

export async function fetchApiOrganizerApplications(status?: string): Promise<ApiOrganizerApplication[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await request<{ items: ApiOrganizerApplication[] }>(`/v1/panel/organizer-applications${query}`);
  return result.items ?? [];
}

/** Aprobar crea la organizacion y la cuenta de su administrador, y devuelve ambas. */
export async function approveApiOrganizerApplication(id: string): Promise<{
  organizationId: string;
  organizer: { id: string; email: string; fullName: string };
}> {
  return request(`/v1/panel/organizer-applications/${encodeURIComponent(id)}/approve`, { method: "POST" });
}

export async function rejectApiOrganizerApplication(id: string): Promise<void> {
  await request(`/v1/panel/organizer-applications/${encodeURIComponent(id)}/reject`, { method: "POST" });
}

export async function fetchApiMetrics(): Promise<ApiMetrics> {
  return request<ApiMetrics>("/v1/panel/metrics");
}
