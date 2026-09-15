import { forwardRef, type InputHTMLAttributes } from "react";

/** Deja solo los digitos y recorta a `maxLength` caracteres. */
export function digitsOnly(value: string, maxLength?: number): string {
  const digits = value.replace(/\D/g, "");
  return maxLength === undefined ? digits : digits.slice(0, maxLength);
}

/** Deja solo digitos y un unico separador decimal (la coma se normaliza a punto). */
export function decimalOnly(value: string, maxLength?: number): string {
  let out = "";
  let separatorSeen = false;
  for (const ch of value) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if ((ch === "." || ch === ",") && !separatorSeen) {
      out += ".";
      separatorSeen = true;
    }
  }
  return maxLength === undefined ? out : out.slice(0, maxLength);
}

export interface NumericInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Cuantos caracteres admitidos como maximo. Sin el, cualquier longitud. */
  maxLength?: number;
  /** Permitir un separador decimal para cantidades con centimos (precios, %, reembolsos). */
  allowDecimal?: boolean;
}

/**
 * Input que solo acepta numeros: se bloquean las teclas sospechosas (e, -, +) y, cuando el valor
 * llega en el evento, se limpia otra vez. `maxLength` acota los caracteres para que no se pueda
 * teclear un numero absurdo en un campo de cantidades o precios. Con `allowDecimal` el campo es
 * de texto (los `type="number"` rechazan o sancionan la coma en muchos navegadores) y admite tanto
 * el punto como la coma como separador, normalizando la coma a punto.
 */
export const NumericInput = forwardRef<HTMLInputElement, NumericInputProps>(
  ({ allowDecimal = false, maxLength, onChange, onBeforeInput, ...props }, ref) => (
    <input
      {...props}
      ref={ref}
      type={allowDecimal ? "text" : "number"}
      inputMode={allowDecimal ? "decimal" : "numeric"}
      onBeforeInput={(event) => {
        onBeforeInput?.(event);
        const data = event.data;
        if (data === null || data === "") return; // borrar, deshacer, seleccionar todo...
        const allowed = allowDecimal ? /^[\d.,]*$/ : /^\d*$/;
        if (!allowed.test(data) || (maxLength !== undefined && event.currentTarget.value.length + data.length > maxLength)) {
          event.preventDefault();
        }
      }}
      onChange={(event) => {
        const clean = (allowDecimal ? decimalOnly : digitsOnly)(event.target.value, maxLength);
        if (clean !== event.target.value) event.target.value = clean;
        onChange?.(event);
      }}
    />
  )
);
NumericInput.displayName = "NumericInput";