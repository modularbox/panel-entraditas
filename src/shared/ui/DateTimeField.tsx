import { cn } from "@/shared/lib/cn";
import { TimeField } from "./TimeField";

export interface DateTimeFieldProps {
  id: string;
  /** "YYYY-MM-DDTHH:MM", como el valor de un `<input type="datetime-local">`. Vacío si no hay nada. */
  value: string;
  onChange: (value: string) => void;
  /** Nombre del campo, para las etiquetas accesibles. */
  label: string;
  /** Lo más pronto que se puede elegir, en el mismo formato que `value`. */
  min?: string;
  disabled?: boolean;
  className?: string;
  dateClassName?: string;
}

/**
 * Fecha y hora en dos piezas: el calendario de serie para el día y el `TimeField` para la hora.
 *
 * Sustituye a `<input type="datetime-local">`, cuya rueda de horas da la vuelta (con un hueco entre
 * el 23 y el 00) y se atasca al hacer scroll. Si se elige un día sin hora, la hora empieza en 00:00.
 */
export function DateTimeField({ id, value, onChange, label, min, disabled = false, className, dateClassName }: DateTimeFieldProps) {
  const [fecha = "", hora = ""] = value ? value.split("T") : [];
  const fechaMinima = min ? min.slice(0, 10) : undefined;

  function cambiarFecha(siguiente: string) {
    if (siguiente === "") onChange("");
    else onChange(`${siguiente}T${hora || "00:00"}`);
  }

  // La hora solo se puede tocar con un día elegido (si no, está desactivada). Elegir "--" vacía el
  // campo entero, igual que en `TimeField`: un día sin hora no cabe en el formato de `value`, y
  // ponerle 00:00 por su cuenta guardaba una hora que nadie había elegido.
  function cambiarHora(siguiente: string) {
    if (siguiente === "") onChange("");
    else onChange(`${fecha}T${siguiente}`);
  }

  return (
    <span className={cn("flex flex-wrap items-center gap-2", className)}>
      <input
        id={id}
        type="date"
        aria-label={`${label}: día`}
        min={fechaMinima}
        value={fecha}
        disabled={disabled}
        onChange={(e) => cambiarFecha(e.target.value)}
        className={dateClassName}
      />
      <TimeField id={`${id}-hora`} label={label} value={hora} onChange={cambiarHora} disabled={disabled || !fecha} />
    </span>
  );
}
