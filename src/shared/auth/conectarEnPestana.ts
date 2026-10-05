import { storeTabApiToken } from "@/shared/lib/entraditasApi";
import type { SessionResponse } from "./sessionStore";

/**
 * "Conectar" abre una pestana nueva con la sesion del organizador o del suborganizador, y deja
 * intacta la de superadmin.
 *
 * El problema es que las dos pestanas son del MISMO origen, asi que `localStorage` esta compartida
 * entre ellas: escribir ahi la sesion conectada expulsaria al superadmin de su propia pestana, que
 * es justo lo que se queria evitar. `sessionStorage` si es por pestana, asi que la sesion conectada
 * vive ahi y cada pestana habla con la API con la suya.
 *
 * Aun asi, una pestana no puede escribir en el `sessionStorage` de otra. Para cruzar ese hueco se
 * usa un traspaso: la pestana de superadmin deja la sesion a nombre de un nonce, abre
 * `/conectar?llave=<nonce>` en otra pestana, y esa consume el traspaso y se guarda el token en SU
 * `sessionStorage`. El nonce va en la URL y no es adivinable; el traspaso se borra al consumirse y
 * caduca a los pocos minutos si nadie lo recoge.
 *
 * La pestana se pide EN BLANCO y de golpe, dentro del clic, sin esperar a la API: la autorizacion
 * para abrirla la da el clic y se agota en cuanto el codigo vuelve al hilo de peticiones, asi que
 * un `await` en medio la gasta y el navegador la bloquea. Luego, cuando ya esta la sesion, se
 * escribe el traspaso y la pestana entra en `/conectar` a buscarlo.
 */

const HANDOFF_PREFIX = "entraditas.panel.conexion.";
const HANDOFF_PARAM = "llave";
/** Margen para que una pestana bloqueada por el navegador llegue a tiempo a recoger el traspaso. */
const HANDOFF_MAX_AGE_MS = 5 * 60 * 1000;

export interface ConexionDePestana {
  token: string;
  session: SessionResponse;
  creadoEn: number;
}

function claveDeTraspaso(nonce: string): string {
  return `${HANDOFF_PREFIX}${nonce}`;
}

/** La llave con la que se busca el traspaso: tiene que ser imposible de adivinar. */
function nonceAleatorio(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function esUnTraspasoVálido(valor: unknown): valor is ConexionDePestana {
  if (typeof valor !== "object" || valor === null) return false;
  const traspaso = valor as Partial<ConexionDePestana>;
  if (typeof traspaso.token !== "string" || typeof traspaso.creadoEn !== "number") return false;
  if (typeof traspaso.session !== "object" || traspaso.session === null) return false;
  return Date.now() - traspaso.creadoEn <= HANDOFF_MAX_AGE_MS;
}

export interface PestanaDeConexion {
  /** Lleva la pestana ya abierta a la ruta que recoge el traspaso. */
  conectar: (session: SessionResponse) => void;
  /** Cierra la pestana en blanco: la conexion no llego a tiempo, o no llego. */
  cerrar: () => void;
}

/**
 * Abre la pestana en blanco AHORA MISMO, sin pedirle nada todavia.
 *
 * Tiene que ser de golpe, dentro del clic que la pidio. Si se espera a la respuesta de la API para
 * abrirla, el navegador ya no la veauthorized y la bloquea: la autorizacion de una pestana nueva
 * caduca en cuanto el codigo se devuelve al hilo de peticiones, y un `await` en medio la gasta.
 *
 * Se abre en blanco a proposito, en vez de abrir `/conectar` directamente: el traspaso se escribe
 * cuando llega la sesion, y si la pestana ya arrancara seeking se lo encontraria vacio.
 *
 * Devuelve `null` si el navegador no dejo abrirla (hab spoils y bloqueadores lo hacen). Quien llama
 * lo dice, en vez de fingir que abrio.
 */
export function abrirPestanaDeConexion(): PestanaDeConexion | null {
  // Sin "noopener" a proposito: cuando se le pide, el navegador devuelve `null` y hace falta el
  // mango para navegar la pestana despues. La referencia al reves se corta a mano justo debajo.
  const pestana = window.open("", "_blank");
  if (!pestana) return null;

  const cerrar = () => {
    try {
      pestana.close();
    } catch {
      // Si ya no hay nada que cerrar, aqui no hay nada que arreglar.
    }
  };

  try {
    pestana.opener = null;
    pestana.document.title = "Conectando...";
    pestana.document.body.innerHTML = "<p style=\"font:system-ui;padding:2rem\">Abriendo el panel del organizador...</p>";
  } catch {
    // Si la pestana no deja tocarse, da igual: lo que hace falta es poder navegarla luego.
  }

  return {
    conectar(session) {
      const token = session.accessToken ?? session.token;
      if (!token) {
        // Sin token no hay traspaso posible; una pestana en blanco no le sirve de nada a nadie.
        cerrar();
        return;
      }
      const nonce = nonceAleatorio();
      const traspaso: ConexionDePestana = { token, session, creadoEn: Date.now() };
      localStorage.setItem(claveDeTraspaso(nonce), JSON.stringify(traspaso));
      pestana.location.replace(`/conectar?${HANDOFF_PARAM}=${encodeURIComponent(nonce)}`);
    },
    cerrar
  };
}

/**
 * Recoge el traspaso que dejo la pestana de superadmin y se guarda el token en ESTA pestana.
 *
 * Se llama antes de restaurar la sesion, para que `restore()` valide directamente el token
 * conectado y no haya un instante en el que la pestana sea el superadmin. Si no hay traspaso (es
 * una visita normal) no hace nada y devuelve `null`.
 */
export function consumirConexionEnPestana(): ConexionDePestana | null {
  const url = new URL(window.location.href);
  const nonce = url.searchParams.get(HANDOFF_PARAM);
  if (!nonce) return null;

  // Se quita la llave de la URL en cuanto se mira: al recargar no se vuelve a consumir, y el
  // token no se queda paseando por el historial ni por el boton "atras".
  url.searchParams.delete(HANDOFF_PARAM);
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);

  const clave = claveDeTraspaso(nonce);
  const guardado = localStorage.getItem(clave);
  // Un traspaso se gasta una sola vez, lo consuma quien sea.
  localStorage.removeItem(clave);
  if (!guardado) return null;

  try {
    const traspaso: unknown = JSON.parse(guardado);
    if (!esUnTraspasoVálido(traspaso)) return null;
    storeTabApiToken(traspaso.token);
    return traspaso;
  } catch {
    return null;
  }
}

/**
 * Los traspasos que nunca se recogieron no se acumulan: se limpian al abrir el panel.
 *
 * Los validos se respetan, porque la pestana que los recoja puede estar todavia cargando.
 */
export function limpiarTraspasosCaducados(): void {
  const claves: string[] = [];
  for (let indice = 0; indice < localStorage.length; indice += 1) {
    const clave = localStorage.key(indice);
    if (clave?.startsWith(HANDOFF_PREFIX)) claves.push(clave);
  }
  for (const clave of claves) {
    try {
      const traspaso: unknown = JSON.parse(localStorage.getItem(clave) ?? "null");
      if (esUnTraspasoVálido(traspaso)) continue;
    } catch {
      // Basura guardada bajo este prefijo: se retira.
    }
    localStorage.removeItem(clave);
  }
}