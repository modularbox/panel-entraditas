export class AppError extends Error {
  code: string;
  details?: Record<string, unknown>[];

  constructor(code: string, message: string, details?: Record<string, unknown>[]) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Base de la API, tolerante a como se escriba `VITE_API_URL`.
 *
 * Sin protocolo (`api.entraditas.com`) el navegador la tomaria como una ruta RELATIVA al propio
 * panel. Si `VITE_API_URL` no viene o viene vacia (pasa en los tests), la base queda "": el cliente
 * se queda sin destino y cada peticion falla como falta de respuesta, que es lo que se quiere.
 */
function normalizeApiBase(value: string | undefined): string {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL);

/**
 * Los recursos del panel viven bajo `/v1/panel/...` en api.entraditas.com. El panel pide con el
 * nombre de siempre (`/customers`, `/events/:id`...); aqui se traduce al espacio real.
 */
const PANEL_PREFIX = "/v1/panel";

/**
 * Rutas cuyo nombre en el panel no coincide con el de la API. El resto se traduce tal cual:
 * `path` bajo `PANEL_PREFIX`.
 */
function rutaReal(path: string): string {
  if (path === "/auth/me") return "/me";
  if (path === "/dashboard/overview") return "/metrics";
  return path;
}

export function apiUrlFor(path: string): string {
  return `${API_BASE}${PANEL_PREFIX}${rutaReal(path)}`;
}

/** El codigo de dominio que se asocia a un estado HTTP cuando la API no da ninguno propio. */
function codigoDeEstado(status: number): string {
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 422) return "VALIDATION_ERROR";
  return `HTTP_${status}`;
}

/** Codigos propios, para los fallos que no vienen del servidor con un cuerpo que leer. */
export const SIN_RESPUESTA = "SIN_RESPUESTA";
export const RESPUESTA_ILEGIBLE = "RESPUESTA_ILEGIBLE";

interface RequestOptions {
  /** Bearer token to attach; the session store passes the current one in explicitly — apiClient holds no auth state itself. */
  token?: string;
}

/**
 * A quien avisar cuando el servidor dice que la sesion ya no vale.
 *
 * apiClient no guarda estado de sesion y no va a empezar a hacerlo: solo avisa. Quien decide que
 * hacer con eso es el almacen de sesion, que se apunta aqui al arrancar. Sin este aviso, un 401
 * se quedaba en el mensaje de error de la pantalla donde saltara, y el panel seguia como si nada
 * con una sesion que ya no existe.
 */
type AvisoSinSesion = (path: string) => void;
let avisarSinSesion: AvisoSinSesion | null = null;

export function alPerderLaSesion(callback: AvisoSinSesion): void {
  avisarSinSesion = callback;
}

/**
 * Dar el mismo aviso desde fuera de este cliente.
 *
 * Lo necesita `entraditasApi.ts`, que habla con api.entraditas.com por su cuenta y no pasa por
 * aqui. Sin esto, una sesion de la API caducada no cerraba nada: el panel seguia navegando y cada
 * pantalla enseñaba su propio error en rojo ("No se pudieron cargar las organizaciones") sin que
 * nadie dijera que lo que hacia falta era volver a entrar.
 */
export function avisarDeSesionPerdida(path: string): void {
  avisarSinSesion?.(path);
}

/**
 * Entrar con la contrasena mal tambien responde 401, y eso no es una sesion caducada: es alguien
 * que aun no ha entrado. Si contara, el primer intento fallido mandaria al login "por inactividad".
 */
function esIntentoDeEntrar(path: string): boolean {
  return path.startsWith("/auth/login");
}

async function request<T>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  let response: Response;
  try {
    response = await fetch(apiUrlFor(path), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new AppError(
      SIN_RESPUESTA,
      "No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."
    );
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new AppError(
      RESPUESTA_ILEGIBLE,
      `El servidor del panel respondió algo que no se entiende (${response.status}). Vuelve a intentarlo en un momento.`
    );
  }

  if (!response.ok) {
    const mensaje =
      json && typeof json === "object" && "error" in json && typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `Error ${response.status}`;
    if (response.status === 401 && !esIntentoDeEntrar(path)) avisarSinSesion?.(path);
    throw new AppError(codigoDeEstado(response.status), mensaje);
  }

  // La API envuelve los listados en `{ items }`; los demas cuerpos se devuelven tal cual. El
  // cliente mantiene `data` por compatibilidad con los cuerpos que antano envolvia el simulador.
  if (json && typeof json === "object") {
    const envelope = json as { data?: unknown; items?: unknown };
    if ("data" in envelope) return envelope.data as T;
    if ("items" in envelope) return envelope.items as T;
  }
  return json as T;
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PUT", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts)
};