import { useState, type ReactNode } from "react";
import { AppError } from "@/shared/lib/apiClient";
import { Button } from "./button";

interface AccionConConfirmacionProps {
  /** Lo que pone el boton: "Eliminar", "Bloquear"... */
  etiqueta: string;
  /** El boton que lo confirma: "Sí, a la papelera". */
  confirmar: string;
  /** Lo que va a pasar, dicho antes de que nadie pulse. */
  aviso: ReactNode;
  /** Lo que hace. Si falla, el motivo se ensena aqui mismo y no se cierra. */
  accion: () => Promise<void>;
  /** Mientras trabaja: "Eliminando...". */
  trabajando?: string;
  /** Rojo para lo que se lleva algo por delante; con borde para lo que se deshace igual de facil. */
  peligro?: boolean;
  /** Tamaño de las tablas (botones bajos) o normal (fichas). */
  compacto?: boolean;
  disabled?: boolean;
}

/**
 * Un boton que pide confirmacion en el sitio antes de hacer algo que cambia lo que ve todo el
 * mundo (eliminar, bloquear, borrar para siempre). Igual que "Cancelar evento": se pulsa, aparece
 * lo que va a pasar con "Confirmar" y "Volver", y solo entonces se hace.
 */
export function AccionConConfirmacion({
  etiqueta,
  confirmar,
  aviso,
  accion,
  trabajando = "Un momento...",
  peligro = true,
  compacto = true,
  disabled = false
}: AccionConConfirmacionProps) {
  const [abierta, setAbierta] = useState(false);
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // En una linea y sin encoger: en una tabla estrecha el texto se partia en tres renglones.
  const tamano = `shrink-0 whitespace-nowrap ${compacto ? "h-8 px-3 text-xs" : ""}`;

  async function hacer() {
    setEnCurso(true);
    setError(null);
    try {
      await accion();
      setAbierta(false);
    } catch (causa) {
      setError(causa instanceof AppError || causa instanceof Error ? causa.message : "No se pudo hacer. Vuelve a intentarlo.");
    } finally {
      setEnCurso(false);
    }
  }

  if (!abierta) {
    return (
      <Button
        type="button"
        variant="outline"
        className={tamano}
        disabled={disabled}
        onClick={() => {
          setError(null);
          setAbierta(true);
        }}
      >
        {etiqueta}
      </Button>
    );
  }

  return (
    <div className="flex min-w-[14rem] flex-col items-start gap-1">
      <div className="flex flex-nowrap gap-2">
        <Button type="button" variant={peligro ? "destructive" : "default"} className={tamano} disabled={enCurso} onClick={() => void hacer()}>
          {enCurso ? trabajando : confirmar}
        </Button>
        <Button type="button" variant="outline" className={tamano} disabled={enCurso} onClick={() => setAbierta(false)}>
          Volver
        </Button>
      </div>
      <p className="max-w-xs whitespace-normal text-xs font-medium text-muted-foreground">{aviso}</p>
      {error && (
        <p role="alert" className="max-w-xs whitespace-normal text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
