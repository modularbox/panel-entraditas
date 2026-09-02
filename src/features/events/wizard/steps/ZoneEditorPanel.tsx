import type { Zone } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { computeRowCount } from "./seatMap";

export interface ZoneEditorPanelProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onAddZone: (kind: Zone["kind"]) => void;
  onUpdateZone: (id: string, patch: Partial<Pick<Zone, "name" | "capacity" | "rows" | "width" | "height">>) => void;
  onDeleteZone: (id: string) => void;
}

// No hay boton de zona accesible: la movilidad reducida se marca asiento a asiento desde el
// editor de asientos, porque esas plazas van repartidas dentro del patio de butacas y no en un
// bloque aparte. El tipo "accessible" sigue existiendo para planos antiguos que ya lo usaban.
const ADD_BUTTONS: { kind: Zone["kind"]; label: string }[] = [
  { kind: "numbered", label: "+ Zona numerada" },
  { kind: "standing", label: "+ Zona de pie" },
  { kind: "stage", label: "+ Escenario/Pantalla" },
  { kind: "gate", label: "+ Puerta" }
];

export function ZoneEditorPanel({ zones, selectedZoneId, onAddZone, onUpdateZone, onDeleteZone }: ZoneEditorPanelProps) {
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  const sellable = selectedZone?.kind === "numbered" || selectedZone?.kind === "standing";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {ADD_BUTTONS.map((btn) => (
          <Button key={btn.kind} type="button" variant="outline" onClick={() => onAddZone(btn.kind)}>
            {btn.label}
          </Button>
        ))}
      </div>

      {selectedZone && (
        <fieldset
          // Inputs below are uncontrolled (defaultValue + onBlur). Keying on the zone's
          // values forces React to remount them when the selection or its data changes,
          // so the fields reflect the newly selected zone instead of stale typed input.
          key={`${selectedZone.id}-${selectedZone.name}-${selectedZone.capacity}-${selectedZone.rows ?? "auto"}-${selectedZone.width}-${selectedZone.height}`}
          className="flex flex-col gap-2 border-t-2 border-border pt-3"
        >
          <legend>Zona seleccionada</legend>

          <label htmlFor="zone-name">Nombre</label>
          <input
            id="zone-name"
            defaultValue={selectedZone.name}
            onBlur={(e) => onUpdateZone(selectedZone.id, { name: e.target.value })}
          />

          {sellable && (
            <>
              <label htmlFor="zone-capacity">Capacidad</label>
              <input
                id="zone-capacity"
                type="number"
                min="0"
                defaultValue={selectedZone.capacity}
                onBlur={(e) => onUpdateZone(selectedZone.id, { capacity: Number(e.target.value) })}
              />
            </>
          )}

          {selectedZone.kind === "numbered" && (
            <>
              <label htmlFor="zone-rows">Filas</label>
              <input
                id="zone-rows"
                type="number"
                min="1"
                max={Math.max(1, selectedZone.capacity)}
                placeholder="Automatico"
                defaultValue={selectedZone.rows ?? ""}
                // Blank means "work the rows out from the zone's shape", which is what a zone
                // starts as; a number pins the layout to the real room (12 seats over 3 rows).
                onBlur={(e) => {
                  const value = e.target.value.trim();
                  onUpdateZone(selectedZone.id, { rows: value === "" ? null : Number(value) });
                }}
              />
              <p className="text-xs text-muted-foreground">
                {selectedZone.capacity > 0
                  ? `${computeRowCount(selectedZone.capacity, selectedZone.width, selectedZone.height, selectedZone.rows)} filas - la fila A es la mas cercana al escenario`
                  : "Indica la capacidad para repartir los asientos en filas"}
              </p>
            </>
          )}

          <label htmlFor="zone-width">Ancho %</label>
          <input
            id="zone-width"
            type="number"
            min="1"
            max="100"
            defaultValue={selectedZone.width}
            onBlur={(e) => onUpdateZone(selectedZone.id, { width: Number(e.target.value) })}
          />

          <label htmlFor="zone-height">Alto %</label>
          <input
            id="zone-height"
            type="number"
            min="1"
            max="100"
            defaultValue={selectedZone.height}
            onBlur={(e) => onUpdateZone(selectedZone.id, { height: Number(e.target.value) })}
          />

          <Button type="button" variant="destructive" onClick={() => onDeleteZone(selectedZone.id)} className="mt-2">
            Eliminar esta zona
          </Button>
        </fieldset>
      )}
    </div>
  );
}
