/**
 * Por que se cerro la sesion, para poder decirlo en el login.
 *
 * Se guarda fuera del almacen de React, en `sessionStorage`, porque el motivo tiene que
 * sobrevivir a lo que pase entre que la sesion se cierra y alguien lee el mensaje: un recargado
 * de pagina, o volver a abrir la pestana. En memoria se perderia justo cuando hace falta.
 *
 * `sessionStorage` y no `localStorage` a proposito: el aviso es de ESTA pestana y de este rato.
 * Guardado en localStorage, un "se cerro tu sesion por inactividad" de anteayer saldria otra vez
 * al abrir el panel mañana.
 */
const CLAVE = "entraditas.panel.cierreDeSesion";

export type MotivoDeCierre = "inactividad" | "sesion-no-valida";

export interface CierreDeSesion {
  motivo: MotivoDeCierre;
  /** Cuanto tiempo estuvo sin tocar nada, en milisegundos. Solo para "inactividad". */
  inactivoMs?: number;
}

export function guardarCierre(cierre: CierreDeSesion): void {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(cierre));
  } catch {
    // Un navegador con el almacenamiento bloqueado se queda sin el aviso, no sin poder entrar.
  }
}

export function leerCierre(): CierreDeSesion | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE);
    if (!crudo) return null;
    const valor = JSON.parse(crudo) as CierreDeSesion;
    return valor.motivo === "inactividad" || valor.motivo === "sesion-no-valida" ? valor : null;
  } catch {
    return null;
  }
}

export function olvidarCierre(): void {
  try {
    sessionStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer; el aviso se ira solo al cerrar la pestana.
  }
}

/**
 * "32 minutos", "1 hora y 5 minutos", "2 dias". Se redondea hacia abajo a proposito: decir
 * "has estado 31 minutos" cuando han sido 30 y pico es mas raro que quedarse corto.
 */
export function describirInactividad(ms: number): string {
  const minutos = Math.max(1, Math.floor(ms / 60_000));
  if (minutos < 60) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;

  const horas = Math.floor(minutos / 60);
  if (horas < 24) {
    const resto = minutos % 60;
    const enHoras = `${horas} ${horas === 1 ? "hora" : "horas"}`;
    return resto === 0 ? enHoras : `${enHoras} y ${resto} ${resto === 1 ? "minuto" : "minutos"}`;
  }

  const dias = Math.floor(horas / 24);
  const restoHoras = horas % 24;
  const enDias = `${dias} ${dias === 1 ? "día" : "días"}`;
  return restoHoras === 0 ? enDias : `${enDias} y ${restoHoras} ${restoHoras === 1 ? "hora" : "horas"}`;
}

/** El aviso que se ensena en el login, ya redactado. */
export function mensajeDeCierre(cierre: CierreDeSesion, minutosDeInactividad: number): string {
  if (cierre.motivo === "inactividad") {
    const tiempo = cierre.inactivoMs ? describirInactividad(cierre.inactivoMs) : `${minutosDeInactividad} minutos`;
    return `Se cerró tu sesión: llevabas ${tiempo} sin tocar nada. Vuelve a entrar para seguir donde lo dejaste.`;
  }
  return "Se cerró tu sesión porque ya no era válida. Vuelve a entrar para seguir donde lo dejaste.";
}
