import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Las piezas con las que se dibuja el cuestionario previo a crear un evento (CreateEventDialog).
 *
 * Aqui vivieron tambien dos ajustes sueltos -los limites de compra, junto a los tipos de entrada, y
 * los asientos sueltos, junto al plano-, de cuando no habia cuestionario. Ya lo hay, y pregunta las
 * dos cosas al crear el evento, asi que preguntarlas otra vez dentro de cada paso era preguntar dos
 * veces lo mismo y dejar dos sitios donde cambiar un mismo valor.
 *
 * Lo que responde el cuestionario se guarda en `event.rules`, que es lo que se publica.
 */

export function QuestionSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border-2 border-foreground bg-surface p-4">
      <legend className="px-2 text-sm font-extrabold uppercase tracking-wide">{title}</legend>
      {hint && <p className="mb-3 mt-1 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

export function OptionButton({
  selected,
  onClick,
  disabled,
  children
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border-2 px-4 py-2 text-sm font-bold transition-transform disabled:opacity-60",
        selected ? "border-foreground bg-foreground text-background" : "border-foreground bg-surface-alt"
      )}
    >
      {children}
    </button>
  );
}
