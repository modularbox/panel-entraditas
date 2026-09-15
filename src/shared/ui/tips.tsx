import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Que hace cada boton, encima de el, al pasar el raton un momento.
 *
 * Va en capa fija fuera del flujo a proposito: los botones viven dentro de paneles y rejillas con
 * `overflow` recortado, y un aviso dibujado dentro se cortaria justo en el borde, que es donde
 * estan la mitad de los botones.
 *
 * No es el `title` del navegador porque ese aparece pegado al cursor, tarda casi un segundo y no
 * se puede leer con el teclado. Este sale encima del boton y tambien al tabular hasta el.
 */
const RETARDO_MS = 400;

interface Aviso {
  texto: string;
  x: number;
  y: number;
}

export interface TipHandlers {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void;
  onPointerLeave: (e: React.PointerEvent<HTMLElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLElement>) => void;
  onBlur: () => void;
  onClick: () => void;
}

export function useTips(): { tip: (texto: string) => TipHandlers; capa: React.ReactNode } {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const temporizador = useRef<number | null>(null);

  const cancelar = useCallback(() => {
    if (temporizador.current !== null) {
      window.clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  }, []);

  const mostrar = useCallback(
    (texto: string, elemento: HTMLElement, retardoMs: number) => {
      cancelar();
      const pintar = () => {
        const caja = elemento.getBoundingClientRect();
        setAviso({ texto, x: caja.left + caja.width / 2, y: caja.top });
      };
      if (retardoMs === 0) pintar();
      else temporizador.current = window.setTimeout(pintar, retardoMs);
    },
    [cancelar]
  );

  const ocultar = useCallback(() => {
    cancelar();
    setAviso(null);
  }, [cancelar]);

  // Al desplazar la pagina el aviso se quedaria flotando donde ya no esta el boton.
  useEffect(() => {
    if (!aviso) return;
    window.addEventListener("scroll", ocultar, true);
    window.addEventListener("resize", ocultar);
    return () => {
      window.removeEventListener("scroll", ocultar, true);
      window.removeEventListener("resize", ocultar);
    };
  }, [aviso, ocultar]);

  useEffect(() => cancelar, [cancelar]);

  const tip = useCallback(
    (texto: string): TipHandlers => ({
      onPointerEnter: (e) => {
        // Solo el raton espera: con el dedo no hay "pasar por encima", y el propio toque ya dice
        // lo que hace el boton al hacerlo.
        if (e.pointerType === "mouse") mostrar(texto, e.currentTarget, RETARDO_MS);
      },
      onPointerLeave: () => ocultar(),
      onFocus: (e) => mostrar(texto, e.currentTarget, 0),
      onBlur: () => ocultar(),
      // Pulsar ya dice lo que hace: dejarlo puesto tapa el resultado de la propia accion.
      onClick: () => ocultar()
    }),
    [mostrar, ocultar]
  );

  const capa = aviso ? (
    <span
      role="status"
      style={{ left: `${aviso.x}px`, top: `${aviso.y}px` }}
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-[calc(100%+8px)] whitespace-nowrap rounded-md border-2 border-foreground bg-foreground px-2 py-1 text-xs font-bold text-background shadow-flat"
    >
      {aviso.texto}
    </span>
  ) : null;

  return { tip, capa };
}
