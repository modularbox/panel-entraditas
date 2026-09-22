import type { PublicEvent } from "@entraditas/types";
import { avisarDeSesionPerdida } from "@/shared/lib/apiClient";

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
const WEB_BASE = normalizeApiBase(import.meta.env.VITE_WEB_URL);
const TOKEN_STORAGE_KEY = "entraditas.panel.apiToken";

export interface ApiStaff {
  id: string;
  email: string;
  fullName: string;
  role: "superadmin" | "organizador" | "suborganizador";
  organizationId: string | null;
  status: string;
}

export class ApiUnavailableError extends Error {}

/** Un "no" de la API, con su codigo, para que quien llama pueda distinguir un 404 de lo demas. */
export class ErrorDeLaApi extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ErrorDeLaApi";
  }
}

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

/**
 * Pedir algo a la API ya con la sesion puesta.
 *
 * `avisaSiCaduca` distingue las peticiones que SON la sesion (entrar, comprobar si sigue viva) de
 * las que la USAN. Un 401 al entrar es una contraseña mal escrita; un 401 al pedir los clientes es
 * la sesion diciendo que ya no vale, y entonces hay que cerrar y volver al login como hace el
 * resto del panel, en vez de dejar un error en rojo en la pantalla de turno.
 */
async function request<T>(path: string, init: RequestInit = {}, avisaSiCaduca = true): Promise<T> {
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
  if (!response.ok) {
    // 403 cuenta igual que 401: el hosting devuelve 403 cuando se come la cabecera Authorization,
    // asi que para quien lo vive es lo mismo que no tener sesion.
    if (avisaSiCaduca && (response.status === 401 || response.status === 403)) {
      storeApiToken(null);
      avisarDeSesionPerdida(path);
    }
    throw new ErrorDeLaApi(payload.error || "No se pudo completar la peticion.", response.status);
  }
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
    // Sin aviso: un 401 aqui es una contraseña mal escrita, no una sesion que se ha caido.
    const result = await request<{ token: string; staff: ApiStaff }>("/v1/panel/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    }, false);
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
    // Sin aviso: esta llamada es justo la que PREGUNTA si la sesion sigue viva, y ya limpia el
    // token ella misma. Avisar aqui cerraria el panel al arrancar antes de haberlo abierto.
    const result = await request<{ staff: ApiStaff }>("/v1/panel/me", {}, false);
    return result.staff;
  } catch {
    // El token caduco o se revoco: se limpia para que la interfaz no diga "conectado" sin serlo.
    storeApiToken(null);
    return null;
  }
}

export async function logoutFromApi(): Promise<void> {
  if (!isApiConfigured() || !getApiToken()) return;
  await request("/v1/panel/auth/logout", { method: "POST" }, false).catch(() => undefined);
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
  /** Si ha dado permiso para recibir publicidad, desde la Configuracion de entraditas.com. */
  acceptsAdvertising: boolean;
  ordersCount: number;
  ticketsCount: number;
  totalSpent: number;
  lastPurchaseAt: string | null;
  createdAt: string | null;
  /** Los eventos que le ha comprado. Con alcance de organizacion, solo los de esa organizacion. */
  events: string[];
}

/** Un pedido dentro de la ficha de un cliente. */
export interface ApiCustomerOrder {
  id: string;
  orderNumber: string;
  status: string;
  channel: string;
  total: number;
  refundedAmount: number;
  ticketsCount: number;
  eventId: string | null;
  eventTitle: string;
  eventStartsAt: string | null;
  createdAt: string | null;
}

/** La ficha de un cliente con su historial. Un organizador solo ve lo que le ha comprado a el. */
export interface ApiCustomerDetail extends Omit<ApiCustomer, "events"> {
  acceptsAdvertising: boolean;
  orders: ApiCustomerOrder[];
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

/** Un evento con lo que lleva vendido, tal y como lo calcula la API sobre la base. */
export interface ApiEventMetrics {
  id: string;
  title: string;
  status: string;
  startsAt: string | null;
  organizationId: string | null;
  gross: number;
  net: number;
  refunded: number;
  orders: number;
  tickets: number;
  capacity: number;
  soldSeats: number;
  /** Entradas emitidas y escaneadas: de aqui sale la asistencia, sin inventarla. */
  issued: number;
  used: number;
}

/** Los filtros que la API dice haber aplicado de verdad, que no siempre son los que se pidieron. */
export interface ApiMetricsFilters {
  organizacion: string | null;
  evento: string | null;
  desde: string | null;
  hasta: string | null;
  /** Se pidio otra organizacion y se recorto a la propia de quien pregunta. */
  recortadoAlPropio: boolean;
}

/** Los numeros del dashboard, calculados por la API sobre la base de datos. */
export interface ApiMetrics {
  disponible: boolean;
  motivo?: string;
  filtros?: ApiMetricsFilters;
  compradores?: { total: number; sinCompras: number; ultimos7dias: number; soloDelAlcance: boolean };
  eventos?: { total: number; porEstado: Record<string, number>; publicados: number };
  ventas?: {
    pedidos: number;
    bruto: number;
    neto: number;
    devuelto: number;
    entradas: number;
    ticketMedio: number;
    porCanal: { channel: string; orders: number; net: number }[];
    porTipoDeEntrada: { name: string; tickets: number; amount: number }[];
    porDia: { date: string; net: number; orders: number; cumulative: number }[];
  };
  aforo?: { capacidad: number; vendidas: number; ocupacion: number | null };
  asistencia?: { emitidas: number; usadas: number; porcentaje: number | null };
  organizadores?: { organizaciones: number; solicitudesPendientes: number };
  porEvento?: ApiEventMetrics[];
  actualizado?: string;
}

/** Los filtros del dashboard, en el idioma de la barra de arriba. */
export interface FiltrosDeMetricas {
  organizationId?: string;
  eventId?: string;
  from?: string;
  to?: string;
}

/** Si se puede leer de la API ahora mismo: hay base configurada y sesion abierta en ella. */
export function canReadFromApi(): boolean {
  return isApiConfigured() && getApiToken() !== null;
}

/** Una linea de un pedido, con el nombre y el precio copiados en el momento de la compra. */
export interface ApiOrderLine {
  id: string;
  ticketTypeId: string | null;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

/** Una entrada emitida. El codigo del QR no viaja: en la base solo esta su hash. */
export interface ApiOrderTicket {
  id: string;
  orderItemId: string | null;
  reference: string;
  seat: string | null;
  status: string;
  scanCount?: number;
}

/** Un pedido de verdad, de la base de ventas de entraditas.com. Importes en centimos. */
export interface ApiPanelOrder {
  id: string;
  number: string;
  eventId: string;
  organizationId: string | null;
  eventTitle: string;
  eventStartsAt: string | null;
  status: string;
  channel: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  subtotal: number;
  discount: number;
  serviceFee: number;
  total: number;
  refunded: number;
  currency: string;
  createdAt: string | null;
  items: ApiOrderLine[];
  tickets: ApiOrderTicket[];
}

export interface FiltrosDePedidos {
  eventId?: string;
  from?: string;
  to?: string;
  /** Un pedido concreto, para abrir su ficha. */
  id?: string;
}

/**
 * Los pedidos que esta sesion puede ver.
 *
 * La API los recorta a la organizacion de quien pregunta, igual que las metricas: aqui no hace
 * falta pedirlo, y pedir otra no serviria de nada.
 */
export async function fetchApiOrders(filtros: FiltrosDePedidos = {}): Promise<ApiPanelOrder[]> {
  const params = new URLSearchParams();
  if (filtros.eventId) params.set("eventId", filtros.eventId);
  if (filtros.from) params.set("from", filtros.from);
  if (filtros.to) params.set("to", filtros.to);
  if (filtros.id) params.set("id", filtros.id);
  const query = params.toString();
  const result = await request<{ items: ApiPanelOrder[] }>(`/v1/panel/orders${query ? `?${query}` : ""}`);
  return result.items ?? [];
}

export async function fetchApiCustomers(search?: string): Promise<ApiCustomer[]> {
  const query = search ? `?q=${encodeURIComponent(search)}` : "";
  const result = await request<{ items: ApiCustomer[] }>(`/v1/panel/customers${query}`);
  return result.items ?? [];
}

/**
 * La ficha de un cliente. Devuelve null si la API dice que no existe.
 *
 * Que no exista no siempre significa que no exista: para un organizador, un comprador que nunca le
 * ha comprado nada tampoco es cliente suyo, y la API responde lo mismo. Es lo que se quiere.
 */
export async function fetchApiCustomer(email: string): Promise<ApiCustomerDetail | null> {
  try {
    return await request<ApiCustomerDetail>(`/v1/panel/customers/${encodeURIComponent(email)}`);
  } catch (error) {
    if (error instanceof ErrorDeLaApi && error.status === 404) return null;
    throw error;
  }
}

/** Los clientes de una organizacion, con los eventos que le han comprado. Solo superadmin. */
export async function fetchApiOrganizationCustomers(organizationId: string): Promise<ApiCustomer[]> {
  const result = await request<{ items: ApiCustomer[] }>(
    `/v1/panel/organizations/${encodeURIComponent(organizationId)}/customers`
  );
  return result.items ?? [];
}

/** La cuenta de comprador que la web guarda como sesión (la forma de `cuentaPublica`). */
export interface ApiBuyerAccount {
  name: string;
  surname?: string | null;
  email: string;
  phone: string;
  role: "user";
  avatarUrl?: string | null;
  birthDate?: string | null;
  documentId?: string | null;
}

/**
 * Pide a la API una sesión de comprador para ese cliente («Conectar»).
 *
 * La API valida que quien pide sea de panel, abre una sesión real de comprador para ese correo
 * (sin conocer su contraseña) y devuelve el token y la cuenta. Luego el panel deja que la web la
 * consuma abriendo `VITE_WEB_URL/conectar?token=...`.
 *
 * Devuelve null cuando no se pudo: la API no responde, el correo no existe o no hay permiso.
 */
export async function connectApiCustomerSession(email: string): Promise<{ token: string; account: ApiBuyerAccount } | null> {
  if (!canReadFromApi()) return null;
  try {
    return await request<{ token: string; account: ApiBuyerAccount }>(
      `/v1/panel/customers/${encodeURIComponent(email)}/connect`,
      { method: "POST" }
    );
  } catch {
    return null;
  }
}

/** Base de la web publica sobre la que se abren sesiones de clientes ("VITE_WEB_URL"). */
export function getWebBase(): string {
  return WEB_BASE;
}

/** Si hay donde abrir la sesion de un cliente: la web configurada y sesion de API valida. */
export function canConnectCustomerToWeb(): boolean {
  return canReadFromApi() && WEB_BASE !== "";
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

export async function fetchApiMetrics(filtros: FiltrosDeMetricas = {}): Promise<ApiMetrics> {
  const params = new URLSearchParams();
  if (filtros.organizationId) params.set("organizationId", filtros.organizationId);
  if (filtros.eventId) params.set("eventId", filtros.eventId);
  if (filtros.from) params.set("from", filtros.from);
  if (filtros.to) params.set("to", filtros.to);
  const query = params.toString();
  return request<ApiMetrics>(`/v1/panel/metrics${query ? `?${query}` : ""}`);
}
