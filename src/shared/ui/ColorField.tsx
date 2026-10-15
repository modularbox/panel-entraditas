import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface ColorFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Nombre del campo, para las etiquetas accesibles. */
  label: string;
  /** Clases del selector nativo de color. */
  swatchClassName?: string;
  /** Clases del campo de texto del hexadecimal. */
  textClassName?: string;
  className?: string;
}

/**
 * Selector de color con hueco para pegar el hexadecimal a mano. El valor solo se propaga cuando el
 * texto es un hexadecimal válido (#RRGGBB), para no romper el diseño mientras se escribe.
 */
export function ColorField({ id, value, onChange, label, swatchClassName, textClassName, className }: ColorFieldProps) {
  const [texto, setTexto] = useState(value);

  useEffect(() => {
    setTexto(value);
  }, [value]);

  const valido = HEX.test(texto);

  function escribir(siguiente: string) {
    setTexto(siguiente);
    if (HEX.test(siguiente)) onChange(siguiente.toLowerCase());
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <input
        id={id}
        type="color"
        aria-label={`${label}: selector`}
        value={HEX.test(value) ? value : "#000000"}
        onChange={(e) => escribir(e.target.value)}
        className={cn("shrink-0", swatchClassName)}
      />
      <input
        type="text"
        aria-label={`${label}: código hexadecimal`}
        value={texto}
        maxLength={7}
        spellCheck={false}
        onChange={(e) => escribir(e.target.value)}
        onBlur={() => setTexto(value)}
        placeholder="#RRGGBB"
        className={cn(
          "h-9 min-w-0 rounded-md border-2 bg-surface px-2 text-sm",
          valido ? "border-foreground" : "border-destructive",
          textClassName
        )}
      />
    </span>
  );
}
