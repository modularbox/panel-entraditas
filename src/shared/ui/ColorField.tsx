import { useEffect, useState, type ClipboardEvent } from "react";
import { cn } from "@/shared/lib/cn";

const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Convierte lo que se pega o se escribe en un hexadecimal "#rrggbb", o null si no lo es.
 *
 * Acepta lo que suele venir del portapapeles: con o sin "#", con espacios o saltos de línea
 * alrededor (o en medio, al copiar de una tabla), en mayúsculas, y la forma corta "#f0a".
 */
export function normalizarHex(entrada: string): string | null {
  const limpio = entrada.replace(/\s+/g, "").replace(/^#+/, "").replace(/;$/, "");
  if (/^[0-9a-fA-F]{6}$/.test(limpio)) return `#${limpio.toLowerCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(limpio)) {
    return `#${limpio
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  }
  return null;
}

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
 * texto es un hexadecimal válido, para no romper el diseño mientras se escribe. Se puede pegar
 * "#FF00AA", "FF00AA", "#f0a" o el código con espacios alrededor: se normaliza a "#rrggbb".
 */
export function ColorField({ id, value, onChange, label, swatchClassName, textClassName, className }: ColorFieldProps) {
  const [texto, setTexto] = useState(value);

  useEffect(() => {
    setTexto(value);
  }, [value]);

  const valido = normalizarHex(texto) !== null;

  function escribir(siguiente: string) {
    setTexto(siguiente);
    // Mientras se teclea solo vale la forma larga: "#abc" puede ser el principio de "#abcdef" y
    // no debe saltar a "#aabbcc" a medias. La corta se acepta al pegar o al salir del campo.
    const hex = normalizarHex(siguiente);
    if (hex && siguiente.replace(/[\s#;]/g, "").length === 6) onChange(hex);
  }

  // Se coge el portapapeles entero: con un límite de caracteres, el navegador recortaba lo pegado
  // (" #FF00AA" se quedaba en " #FF00A") y el código nunca llegaba a ser válido.
  function pegar(e: ClipboardEvent<HTMLInputElement>) {
    const pegado = e.clipboardData.getData("text");
    const hex = normalizarHex(pegado);
    if (!hex) return;
    e.preventDefault();
    setTexto(hex);
    onChange(hex);
  }

  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <input
        id={id}
        type="color"
        aria-label={`${label}: selector`}
        value={HEX.test(value) ? value.toLowerCase() : "#000000"}
        onChange={(e) => escribir(e.target.value)}
        className={cn("shrink-0", swatchClassName)}
      />
      <input
        type="text"
        aria-label={`${label}: código hexadecimal`}
        value={texto}
        maxLength={16}
        spellCheck={false}
        autoComplete="off"
        onChange={(e) => escribir(e.target.value)}
        onPaste={pegar}
        onBlur={() => {
          const hex = normalizarHex(texto);
          if (hex && hex !== value.toLowerCase()) onChange(hex);
          setTexto(hex ?? value);
        }}
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
