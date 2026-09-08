import type { Event } from "@entraditas/types";
import { cn } from "@/shared/lib/cn";

export type SeatingMode = NonNullable<Event["seatingMode"]>;

export interface SeatingModeChooserProps {
  /** null while the organiser has not chosen yet: both options are offered side by side. */
  mode: SeatingMode | null;
  onChoose: (mode: SeatingMode) => void;
}

/** Miniature of a room with a stage and rows of seats, so the option is recognisable at a glance. */
function PlanPreview() {
  return (
    <svg viewBox="0 0 120 78" role="img" aria-label="Plano con escenario y filas de asientos" className="h-24 w-full">
      <rect x="0" y="0" width="120" height="78" rx="4" className="fill-[#f4ead9]" />
      <rect x="30" y="6" width="60" height="10" rx="2" className="fill-foreground" />
      <text x="60" y="14" textAnchor="middle" className="fill-background text-[6px] font-semibold">
        ESCENARIO
      </text>
      {[0, 1, 2, 3].map((row) => (
        <g key={row}>
          {Array.from({ length: 12 }, (_, seat) => (
            <rect
              key={seat}
              x={12 + seat * 8.5}
              y={26 + row * 11}
              width="6"
              height="7"
              rx="1.5"
              className={row === 0 ? "fill-primary" : row === 1 ? "fill-accent" : "fill-foreground/25"}
            />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** The same room expressed as plain blocks of capacity: no geometry, just zones. */
function ZonesPreview() {
  return (
    <svg viewBox="0 0 120 78" role="img" aria-label="Lista de zonas sin plano" className="h-24 w-full">
      <rect x="0" y="0" width="120" height="78" rx="4" className="fill-[#f4ead9]" />
      {[0, 1, 2].map((row) => (
        <g key={row}>
          <rect x="12" y={12 + row * 20} width="96" height="14" rx="3" className="fill-surface stroke-foreground" strokeWidth="1.5" />
          <rect x="17" y={16 + row * 20} width="34" height="6" rx="1.5" className="fill-foreground/45" />
          <rect
            x="78"
            y={16 + row * 20}
            width="25"
            height="6"
            rx="1.5"
            className={row === 0 ? "fill-primary" : row === 1 ? "fill-accent" : "fill-foreground/25"}
          />
        </g>
      ))}
    </svg>
  );
}

const OPTIONS: { mode: SeatingMode; title: string; blurb: string; Preview: () => JSX.Element }[] = [
  {
    mode: "plan",
    title: "Crear zonas con plano y asientos",
    blurb: "Dibujas las zonas sobre un plano y repartes las butacas una a una. Teatros, cines y recintos numerados.",
    Preview: PlanPreview
  },
  {
    mode: "zones",
    title: "Crear zonas sin plano",
    blurb: "Las mismas zonas y el mismo reparto por tipo de entrada, sin dibujar nada. Salas, conciertos de pie y aforo libre.",
    Preview: ZonesPreview
  }
];

/**
 * The two ways of laying out capacity, and they are exclusive: only the chosen one is saved.
 *
 * Before choosing, both are shown side by side. Once one is picked its editor takes over the
 * step and the *other* stays available as a strip on top, so switching is one click and it is
 * always obvious which of the two is in play.
 */
export function SeatingModeChooser({ mode, onChoose }: SeatingModeChooserProps) {
  if (mode === null) {
    return (
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-semibold">Como quieres crear las zonas de este evento</legend>
        <div className="grid gap-3 md:grid-cols-2">
          {OPTIONS.map(({ mode: optionMode, title, blurb, Preview }) => (
            <button
              key={optionMode}
              type="button"
              onClick={() => onChoose(optionMode)}
              className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-4 text-left hover:bg-background"
            >
              <Preview />
              <span className="text-base font-semibold">{title}</span>
              <span className="text-sm text-muted-foreground">{blurb}</span>
            </button>
          ))}
        </div>
      </fieldset>
    );
  }

  const current = OPTIONS.find((option) => option.mode === mode)!;
  const other = OPTIONS.find((option) => option.mode !== mode)!;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border-2 border-border bg-surface px-3 py-2">
      <span className={cn("text-sm font-semibold")}>{current.title}</span>
      <button
        type="button"
        onClick={() => onChoose(other.mode)}
        className="ml-auto rounded-md border-2 border-foreground px-3 py-1.5 text-sm font-semibold hover:bg-background"
      >
        Cambiar a: {other.title}
      </button>
    </div>
  );
}
