import { cn } from "@/shared/lib/cn";

/** Las 24 horas en orden natural: 00, 01, ... 23. Sin envolver, para que no haya salto del 23 al 00. */
export function opcionesHoras(): string[] {
  return Array.from({ length: 24 }, (_, hora) => String(hora).padStart(2, "0"));
}

/**
 * Los minutos de una hora, de `paso` en `paso`. Si el valor que ya había no cae en un múltiplo
 * (una sesión antigua a las 18:07, por ejemplo) se añade para no perderla al abrir el campo.
 */
export function opcionesMinutos(paso: number, actual = ""): string[] {
  const segura = Math.min(30, Math.max(1, Math.floor(paso)));
  const minutos: string[] = [];
  for (let minuto = 0; minuto < 60; minuto += segura) {
    minutos.push(String(minuto).padStart(2, "0"));
  }
  if (actual && !minutos.includes(actual)) minutos.push(actual);
  return minutos.sort();
}

export interface TimeFieldProps {
  id: string;
  /** "HH:MM", como el valor de un `<input type="time">`. Cadena vacía si no hay nada elegido. */
  value: string;
  onChange: (value: string) => void;
  /** Nombre del campo, para las etiquetas accesibles de los dos selectores. */
  label: string;
  disabled?: boolean;
  /** Minutos entre opciones. Por defecto, cada 5. */
  minuteStep?: number;
  /** Se dispara al salir de cualquiera de los dos desplegables (para marcar el campo como tocado). */
  onBlur?: () => void;
  className?: string;
  selectClassName?: string;
}

/**
 * Un selector de hora en dos desplegables (horas y minutos).
 *
 * Sustituye a los `<input type="time">` del editor de eventos: el de serie abre en el móvil una
 * rueda que se atasca y, en varios navegadores, la lista de horas da la vuelta con un hueco entre
 * el 23 y el 00. Dos listas cortas y ordenadas se deslizan bien y no tienen ese salto.
 */
export function TimeField({
  id,
  value,
  onChange,
  label,
  disabled = false,
  minuteStep = 5,
  onBlur,
  className,
  selectClassName,
}: TimeFieldProps) {
  const [hora = "", minuto = ""] = value ? value.split(":") : [];
  const baseSelect = cn(
    "h-10 w-16 rounded-md border-2 border-foreground bg-surface px-2 text-sm font-bold text-foreground",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
    disabled && "opacity-60",
    selectClassName
  );

  function cambiarHora(siguiente: string) {
    if (siguiente === "") onChange("");
    else onChange(`${siguiente}:${minuto || "00"}`);
  }

  function cambiarMinuto(siguiente: string) {
    if (siguiente === "") onChange("");
    else onChange(`${hora || "00"}:${siguiente}`);
  }

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <select
        id={id}
        aria-label={`${label}: horas`}
        value={hora}
        disabled={disabled}
        onChange={(event) => cambiarHora(event.target.value)}
        onBlur={onBlur}
        className={baseSelect}
      >
        <option value="">--</option>
        {opcionesHoras().map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
      <span aria-hidden="true" className="font-bold">
        :
      </span>
      <select
        aria-label={`${label}: minutos`}
        value={minuto}
        disabled={disabled}
        onChange={(event) => cambiarMinuto(event.target.value)}
        onBlur={onBlur}
        className={baseSelect}
      >
        <option value="">--</option>
        {opcionesMinutos(minuteStep, minuto).map((opcion) => (
          <option key={opcion} value={opcion}>
            {opcion}
          </option>
        ))}
      </select>
    </span>
  );
}
