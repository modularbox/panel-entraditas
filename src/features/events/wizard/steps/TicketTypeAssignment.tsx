import type { Zone } from "@entraditas/types";
import type { TicketTypeGroup } from "./Step4TicketTypes";

export interface ZoneAssignment {
  zone: Zone;
  assignedGroupId: string | null;
  assignedCapacity: number;
  groupLimit: number | null;
  assignedTotalForGroup: number;
  isOverCapacity: boolean;
}

export interface TicketTypeAssignmentProps {
  assignments: ZoneAssignment[];
  groups: TicketTypeGroup[];
  onAssign: (zoneId: string, groupId: string | null) => void;
}

export function TicketTypeAssignment({ assignments, groups, onAssign }: TicketTypeAssignmentProps) {
  return (
    <fieldset>
      <legend>Asigna un tipo de entrada a cada zona</legend>
      <div className="flex flex-col gap-2">
        {assignments.map(({ zone, assignedGroupId, assignedCapacity, groupLimit, assignedTotalForGroup, isOverCapacity }) => {
          const assignedGroup = groups.find((group) => group.groupId === assignedGroupId);
          return (
          <div key={zone.id} className="flex flex-col gap-1">
            <div className="flex items-center gap-3">
              <label htmlFor={`assign-${zone.id}`} className="w-40 text-sm font-semibold">
                Tipo de entrada - {zone.name}
              </label>
              <select
                id={`assign-${zone.id}`}
                value={assignedGroupId ?? ""}
                onChange={(e) => onAssign(zone.id, e.target.value || null)}
              >
                <option value="">Sin asignar</option>
                {groups.map((g) => (
                  <option key={g.groupId} value={g.groupId}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            {assignedGroup ? (
              <p className="text-sm text-muted-foreground">
                {groupLimit === null
                  ? `${assignedCapacity} entradas en esta zona`
                  : `${assignedTotalForGroup}/${groupLimit} entradas asignadas a ${assignedGroup.name}`}
              </p>
            ) : (
              <p role="alert" className="text-sm font-semibold text-destructive">
                Cada zona vendible necesita un tipo de entrada asignado.
              </p>
            )}
            {isOverCapacity && (
              <p role="alert" className="text-sm font-semibold text-destructive">
                La cantidad del tipo de entrada asignado supera la capacidad de la zona "{zone.name}" ({zone.capacity}{" "}
                plazas).
              </p>
            )}
          </div>
          );
        })}
      </div>
    </fieldset>
  );
}
