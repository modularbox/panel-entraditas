import { useEffect } from "react";
import { Link } from "react-router-dom";
import { create } from "zustand";

interface Aviso {
  id: number;
  texto: string;
  enlace?: { a: string; texto: string };
}

interface EstadoDelAviso {
  aviso: Aviso | null;
  avisar: (texto: string, enlace?: Aviso["enlace"]) => void;
  cerrar: () => void;
}

/**
 * Un aviso que sobrevive a la fila que lo provoca.
 *
 * Al eliminar algo de una lista, la fila desaparece, y con ella cualquier mensaje que llevara
 * dentro: el que pulso no veia nada pasar. El aviso se queda arriba del todo, dice adonde ha ido
 * lo eliminado ("Ver la papelera") y se va solo.
 */
export const useAvisoGlobal = create<EstadoDelAviso>((set) => ({
  aviso: null,
  avisar: (texto, enlace) => set({ aviso: { id: Date.now(), texto, enlace } }),
  cerrar: () => set({ aviso: null })
}));

const DURACION_MS = 8000;

export function AvisoGlobal() {
  const aviso = useAvisoGlobal((estado) => estado.aviso);
  const cerrar = useAvisoGlobal((estado) => estado.cerrar);

  useEffect(() => {
    if (!aviso) return;
    const temporizador = window.setTimeout(cerrar, DURACION_MS);
    return () => window.clearTimeout(temporizador);
  }, [aviso, cerrar]);

  if (!aviso) return null;
  return (
    <div role="status" className="mb-6 flex flex-wrap items-center justify-between gap-3 border-2 border-success bg-success-bg px-4 py-3 text-sm font-semibold">
      <span>
        {aviso.texto}
        {aviso.enlace && (
          <>
            {" "}
            <Link to={aviso.enlace.a} onClick={cerrar} className="text-primary underline">
              {aviso.enlace.texto}
            </Link>
          </>
        )}
      </span>
      <button type="button" onClick={cerrar} className="text-xs font-bold uppercase tracking-wide hover:underline">
        Cerrar
      </button>
    </div>
  );
}
