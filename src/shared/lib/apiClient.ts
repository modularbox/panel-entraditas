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
/** El simulador que hace de servidor del panel no esta atendiendo esta pestana. */
export const SIMULADOR_PARADO = "SIMULADOR_PARADO";

/**
 * Como volver a levantar el simulador cuando deja de atender.
 *
 * El panel publicado NO tiene servidor: su backend es el simulador (MSW), que corre como service
 * worker dentro del propio navegador y atiende `http://localhost:4000`. Si deja de controlar la
 * pestana (una recarga con Ctrl+Shift+R, un despliegue nuevo, o el navegador descartandolo), esa
 * direccion se intenta de verdad, no hay nada escuchando en el puerto 4000 del ordenador de quien
 * mira, y `fetch` falla. Antes eso se contaba como "no hay conexion", que culpa a su internet.
 *
 * Lo registra `main.tsx`, que es quien tiene el simulador a mano.
 */
type Reanimar = () => Promise<void>;
let reanimarSimulador: Reanimar | null = null;

export function alFallarElSimulador(callback: Reanimar): void {
  reanimarSimulador = callback;
}

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
  return path.startsWith("/auth/login") || path.startsWith("/auth/session-from-api");
}

async function request<T>(method: string, path: string, body?: unknown, opts?: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.token) headers.Authorization = `Bearer ${opts.token}`;

  const enviar = () => fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  let response: Response;
  try {
    response = await enviar();
  } catch {
    // No se pudo ni preguntar. Como `API_BASE_URL` es una direccion que solo existe dentro del
    // simulador, esto casi siempre significa que el simulador ha dejado de atender, no que se
    // haya caido internet. Se intenta levantarlo y se reintenta UNA vez: para quien mira, el
    // panel se arregla solo en vez de mandarle a recargar.
    try {
      if (!reanimarSimulador) throw new Error("sin simulador que levantar");
      await reanimarSimulador();
      response = await enviar();
    } catch {
      throw new AppError(
        SIMULADOR_PARADO,
        "El panel no se cargó del todo en esta pestaña. Recarga la página y vuelve a intentarlo."
      );
    }
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
