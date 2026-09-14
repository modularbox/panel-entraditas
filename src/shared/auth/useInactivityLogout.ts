import { useEffect } from "react";
import { useSessionStore } from "./sessionStore";

/**
 * Cuanto se puede estar sin tocar nada antes de que se cierre la sesion.
 *
 * Media hora: lo bastante para atender una llamada o irse a comer sin perder el hilo, y lo
 * bastante poco para que un panel abierto en la taquilla de un teatro no se quede accesible toda
 * la tarde a quien pase por delante.
 */
export const MINUTOS_DE_INACTIVIDAD = 30;

/** Cada cuanto se mira el reloj. No hace falta afinar mas: el aviso dice el tiempo real. */
const CADA_MS = 30_000;

/**
 * Senales de que hay alguien delante. Escribir cuenta (`keydown`), que es lo que evita que se
 * cierre la sesion a mitad de un texto largo sin haber tocado el raton.
 */
const SENALES = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

/**
 * Cierra la sesion despues de un rato sin actividad.
 *
 * Se mide con marcas de tiempo y no contando lo que tarda un temporizador, para que un portatil
 * que estuvo dos horas cerrado cuente esas dos horas: un `setTimeout` no corre mientras el
 * equipo duerme, y al despertar la sesion habria seguido abierta como si nada.
 */
export function useInactivityLogout(): void {
  const status = useSessionStore((s) => s.status);
  const expire = useSessionStore((s) => s.expire);

  useEffect(() => {
    if (status !== "authenticated") return;

    let ultimaSenal = Date.now();
    const marcar = () => {
      ultimaSenal = Date.now();
    };
    for (const senal of SENALES) window.addEventListener(senal, marcar, { passive: true });

    const reloj = window.setInterval(() => {
      const inactivoMs = Date.now() - ultimaSenal;
      if (inactivoMs >= MINUTOS_DE_INACTIVIDAD * 60_000) expire("inactividad", inactivoMs);
    }, CADA_MS);

    return () => {
      for (const senal of SENALES) window.removeEventListener(senal, marcar);
      window.clearInterval(reloj);
    };
  }, [status, expire]);
}
