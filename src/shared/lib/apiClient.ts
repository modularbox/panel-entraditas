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

const API_BASE_URL = "http://localhost:4000/api/v1";

/** Codigos propios, para los fallos que no vienen del servidor con un cuerpo que leer. */
export const SIN_RESPUESTA = "SIN_RESPUESTA";
export const RESPUESTA_ILEGIBLE = "RESPUESTA_ILEGIBLE";

interface RequestOptions {
  /** Bearer token to attach; the session store (Task 13) passes the current one in explicitly — apiClient holds no auth state itself. */
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
 * Entrar con la contrasena mal tambien responde 401, y eso no es una sesion caducada: es alguien
 * que aun no ha entrado. Si contara, el primer intento fallido mandaria al login "por inactividad".
 */
function esIntentoDeEntrar(path: string): boolean {
  return path.startsWith("/auth/login") || path.startsWith("/auth/session-from-api");
}

async function request<T>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    // Sin red, o con el navegador rechazando la peticion. Antes esto salia por el `catch` generico
    // de cada pantalla y se convertia en "No se pudo guardar", que no dice nada de lo que pasa ni
    // de si volver a intentarlo sirve de algo.
    throw new AppError(SIN_RESPUESTA, "No hay conexión con el servidor del panel. Comprueba tu conexión y vuelve a intentarlo.");
  }

  let json: { data?: unknown; error?: { code: string; message: string; details?: Record<string, unknown>[] } };
  try {
    json = await response.json();
  } catch {
    throw new AppError(
      RESPUESTA_ILEGIBLE,
      `El servidor del panel respondió algo que no se entiende (${response.status}). Vuelve a intentarlo en un momento.`
    );
  }

  if (!response.ok) {
    const { code, message, details } = json.error ?? { code: "ERROR", message: `Error ${response.status}` };
    if (response.status === 401 && !esIntentoDeEntrar(path)) avisarSinSesion?.(path);
    throw new AppError(code, message, details);
  }
  return json.data as T;
}

export const apiClient = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("POST", path, body, opts),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>("PATCH", path, body, opts),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, undefined, opts)
};
