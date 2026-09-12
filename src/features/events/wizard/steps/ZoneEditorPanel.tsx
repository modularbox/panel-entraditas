import type { Zone } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { useTips } from "@/shared/ui/tips";

export interface ZoneEditorPanelProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onAddZone: (kind: Zone["kind"]) => void;
  onUpdateZone: (
    id: string,
    patch: Partial<Pick<Zone, "name" | "capacity" | "rows" | "rowSeats" | "width" | "height">>
  ) => void;
  onDeleteZone: (id: string) => void;
  onDuplicateZone?: (id: string) => void;
}

// No hay boton de zona accesible: la movilidad reducida se marca asiento a asiento desde el
// editor de asientos, porque esas plazas van repartidas dentro del patio de butacas y no en un
// bloque aparte. El tipo "accessible" sigue existiendo para planos antiguos que ya lo usaban.
const ADD_BUTTONS: { kind: Zone["kind"]; label: string; ayuda: string }[] = [
  { kind: "numbered", label: "+ Zona numerada", ayuda: "Butacas con fila y numero: patio, anfiteatro, grada" },
  { kind: "standing", label: "+ Zona de pie", ayuda: "Aforo libre, sin asiento asignado: pista, foso" },
  { kind: "stage", label: "+ Escenario/Pantalla", ayuda: "Solo para orientar al comprador; no se vende" },
  { kind: "gate", label: "+ Puerta", ayuda: "Acceso por donde entra el publico; no se vende" }
];

/** El lienzo guarda porcentajes con todos sus decimales; en una casilla solo estorban. */
function redondear(valor: number): number {
  return Math.round(valor * 10) / 10;
}

export function ZoneEditorPanel({
  zones,
  selectedZoneId,
  onAddZone,
  onUpdateZone,
  onDeleteZone,
  onDuplicateZone
}: ZoneEditorPanelProps) {
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  const { tip, capa } = useTips();

  return (
    <div className="flex flex-col gap-3">
      {capa}
      <div className="flex flex-col gap-2">
        {ADD_BUTTONS.map((btn) => (
          <Button
            key={btn.kind}
            type="button"
            variant="outline"
            {...tip(btn.ayuda)}
            onClick={() => onAddZone(btn.kind)}
          >
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

          {selectedZone.kind === "standing" && (
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

          {/*
            Una zona numerada no tiene una capacidad que se escriba: la tiene la sala. Sale de sus
            filas, que se dibujan abajo en "Filas y butacas". Tenerla tambien aqui como casilla
            dejaba dos numeros distintos diciendo cuantas plazas hay, y el que mandaba no era el
            que se veia.
          */}
          {selectedZone.kind === "numbered" && (
            <p className="rounded-md border-2 border-border bg-background px-2 py-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{selectedZone.capacity} plazas</span>, contadas
              de sus filas. Se cambian abajo, en "Filas y butacas": la fila A es la mas cercana al escenario.
            </p>
          )}

          {onDuplicateZone && (
            <Button
              type="button"
              variant="outline"
              {...tip("Copia la forma de la zona al lado, sin su reparto de butacas")}
              onClick={() => onDuplicateZone(selectedZone.id)}
              className="mt-2"
            >
              Duplicar esta zona
            </Button>
          )}

          <label htmlFor="zone-width">Ancho %</label>
          <input
            id="zone-width"
            type="number"
            min="1"
            max="100"
            step="0.1"
            defaultValue={redondear(selectedZone.width)}
            {...tip("Lo ancha que es la zona dentro del plano")}
            onBlur={(e) => onUpdateZone(selectedZone.id, { width: Number(e.target.value) })}
          />

          <label htmlFor="zone-height">Alto %</label>
          <input
            id="zone-height"
            type="number"
            min="1"
            max="100"
            step="0.1"
            defaultValue={redondear(selectedZone.height)}
            {...tip("Lo alta que es la zona dentro del plano")}
            onBlur={(e) => onUpdateZone(selectedZone.id, { height: Number(e.target.value) })}
          />

          <Button
            type="button"
            variant="destructive"
            {...tip("Borra la zona y su reparto de butacas")}
            onClick={() => onDeleteZone(selectedZone.id)}
            className="mt-2"
          >
            Eliminar esta zona
          </Button>
        </fieldset>
      )}
    </div>
  );
}
