import type { Zone } from "@entraditas/types";
import type { TicketTypeGroup } from "./Step4TicketTypes";

export interface ZoneAssignment {
  zone: Zone;
  assignedGroupId: string | null;
  isOverCapacity: boolean;
}

export interface TicketTypeAssignmentProps {
  assignments: ZoneAssignment[];
  groups: TicketTypeGroup[];
  onAssign: (zoneId: string, groupId: string) => void;
}

export function TicketTypeAssignment({ assignments, groups, onAssign }: TicketTypeAssignmentProps) {
  return (
    <fieldset>
      <legend>Asigna un tipo de entrada a cada zona</legend>
      <div className="flex flex-col gap-2">
        {assignments.map(({ zone, assignedGroupId, isOverCapacity }) => (
          <div key={zone.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <label htmlFor={`assign-${zone.id}`} className="w-40 text-sm font-semibold">
                Tipo de entrada — {zone.name}
              </label>
              <select
                id={`assign-${zone.id}`}
                value={assignedGroupId ?? ""}
                onChange={(e) => e.target.value && onAssign(zone.id, e.target.value)}
              >
                <option value="">— Sin asignar —</option>
                {groups.map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            {isOverCapacity && (
              <p role="alert" className="text-sm font-semibold text-destructive">
                La cantidad del tipo de entrada asignado supera la capacidad de la zona "{zone.name}" ({zone.capacity}{" "}
                plazas).
              </p>
            )}
          </div>
        ))}
      </div>
    </fieldset>
  );
}
