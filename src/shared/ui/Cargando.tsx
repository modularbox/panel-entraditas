import { cn } from "@/shared/lib/cn";

/**
 * Lo que se ve mientras llegan los datos: nada (tanda 17, "eliminar textos de carga").
 *
 * Cada pantalla decía "Cargando…" durante un instante y luego saltaba al contenido. No aportaba
 * nada y movía la página. Queda el hueco, para que lo que llega no empuje lo de abajo, y el aviso
 * solo para quien usa un lector de pantalla.
 */
export function Cargando({ className }: { className?: string }) {
  return (
    <div className={cn("min-h-24", className)}>
      <span role="status" className="sr-only">
        Cargando…
      </span>
    </div>
  );
}
