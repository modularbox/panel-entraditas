import type { Zone } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";
import { computeRowCount } from "./seatMap";

export interface ZoneListEditorProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string | null) => void;
  onAddZone: (kind: Zone["kind"]) => void;
  onUpdateZone: (id: string, patch: Partial<Pick<Zone, "name" | "capacity" | "rows">>) => void;
  onDeleteZone: (id: string) => void;
}

/**
 * The "zonas sin plano" half of the seating step: the same zones, capacities and ticket-type
 * breakdown as the drawn plan, minus the geometry. For rooms where a map tells the buyer nothing
 * (a club, a standing venue), drawing rectangles is busywork, so this view just lists them.
 *
 * Zones created here still carry x/y/width/height defaults, so switching to the plan later shows
 * them laid out instead of losing them.
 */
export function ZoneListEditor({
  zones,
  selectedZoneId,
  onSelectZone,
  onAddZone,
  onUpdateZone,
  onDeleteZone
}: ZoneListEditorProps) {
  const sellable = zones.filter((zone) => zone.kind === "numbered" || zone.kind === "standing");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => onAddZone("numbered")}>
          + Zona numerada
        </Button>
        <Button type="button" variant="outline" onClick={() => onAddZone("standing")}>
          + Zona de pie
        </Button>
      </div>

      {sellable.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Anade una zona para repartir el aforo de este evento.
        </p>
      ) : (
        <ul aria-label="Zonas sin plano" className="flex flex-col gap-2">
          {sellable.map((zone) => {
            const selected = zone.id === selectedZoneId;
            return (
              <li
                key={zone.id}
                className={cn(
                  "rounded-md border-2 bg-surface p-3",
                  selected ? "border-primary" : "border-border"
                )}
              >
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`zone-name-${zone.id}`} className="text-xs font-semibold">
                      Nombre
                    </label>
                    <input
                      id={`zone-name-${zone.id}`}
                      defaultValue={zone.name}
                      onBlur={(e) => onUpdateZone(zone.id, { name: e.target.value })}
                      className="h-10 w-48 rounded-md border-2 border-foreground bg-surface px-3 text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`zone-capacity-${zone.id}`} className="text-xs font-semibold">
                      {zone.kind === "numbered" ? "Asientos" : "Aforo"}
                    </label>
                    <input
                      id={`zone-capacity-${zone.id}`}
                      type="number"
                      min="0"
                      inputMode="numeric"
                      defaultValue={zone.capacity}
                      onBlur={(e) => onUpdateZone(zone.id, { capacity: Number(e.target.value) })}
                      className="h-10 w-28 rounded-md border-2 border-foreground bg-surface px-3 text-sm"
                    />
                  </div>

                  {zone.kind === "numbered" && (
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`zone-rows-${zone.id}`} className="text-xs font-semibold">
                        Filas
                      </label>
                      <input
                        id={`zone-rows-${zone.id}`}
                        type="number"
                        min="1"
                        max={Math.max(1, zone.capacity)}
                        placeholder="Automatico"
                        defaultValue={zone.rows ?? ""}
                        onBlur={(e) => {
                          const value = e.target.value.trim();
                          onUpdateZone(zone.id, { rows: value === "" ? null : Number(value) });
                        }}
                        className="h-10 w-28 rounded-md border-2 border-foreground bg-surface px-3 text-sm"
                      />
                    </div>
                  )}

                  <span className="text-xs text-muted-foreground">
                    {zone.kind === "numbered"
                      ? zone.capacity > 0
                        ? `${computeRowCount(zone.capacity, zone.width, zone.height, zone.rows)} filas`
                        : "Indica cuantos asientos tiene"
                      : "Aforo libre, sin asiento asignado"}
                  </span>

                  <div className="ml-auto flex gap-2">
                    {zone.kind === "numbered" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 px-2 text-xs"
                        onClick={() => onSelectZone(selected ? null : zone.id)}
                      >
                        {selected ? "Cerrar asientos" : "Repartir asientos"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 px-2 text-xs"
                      onClick={() => onDeleteZone(zone.id)}
                    >
                      <Icon name="trash" size={14} /> Eliminar
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
