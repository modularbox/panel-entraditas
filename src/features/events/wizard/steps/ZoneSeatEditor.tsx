import { useEffect, useState } from "react";
import type { Zone } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import type { TicketTypeGroup } from "./Step4TicketTypes";
import {
  assignSeat,
  assignSeatCount,
  clearSeat,
  countUnassigned,
  moveSeat,
  remainingForGroup,
  seatRows,
  seatsForGroup,
  type Seat,
  type SeatAssignments
} from "./seatMap";

export interface ZoneSeatEditorProps {
  zone: Zone;
  seats: Seat[];
  assignments: SeatAssignments;
  groups: TicketTypeGroup[];
  /** Seats of each ticket type already taken by the other zones, so this zone can't overspend the stock. */
  assignedElsewhereByGroup: Record<string, number>;
  onChange: (next: SeatAssignments) => void;
  /** Seats reserved for reduced mobility, by seat id. */
  accessibleSeatIds?: string[];
  onAccessibleChange?: (next: string[]) => void;
}

const UNASSIGNED_LABEL = "sin asignar";
/** Reduced-mobility seats are drawn in blue and marked with the wheelchair symbol. */
const ACCESSIBLE_COLOR = "#2563eb";

export function ZoneSeatEditor({
  zone,
  seats,
  assignments,
  groups,
  assignedElsewhereByGroup,
  onChange,
  accessibleSeatIds = [],
  onAccessibleChange
}: ZoneSeatEditorProps) {
  // Seats are picked first and acted on afterwards, so one action can cover many seats at once.
  const [selection, setSelection] = useState<string[]>([]);
  const [movingSeatId, setMovingSeatId] = useState<string | null>(null);
  // Typed quantities are only applied on Enter or with the OK button. Saving on every keystroke
  // fired one round trip per digit and the field fought back while you were still typing.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const accessible = new Set(accessibleSeatIds);
  const selected = new Set(selection);
  const rows = seatRows(seats);
  const unassigned = countUnassigned(seats, assignments);
  const groupById = new Map(groups.map((group) => [group.groupId, group]));

  // Seats disappear when the zone is resized or its row count changes; drop them from the
  // selection so an action can't target a seat that no longer exists.
  useEffect(() => {
    const valid = new Set(seats.map((seat) => seat.id));
    setSelection((prev) => (prev.every((id) => valid.has(id)) ? prev : prev.filter((id) => valid.has(id))));
  }, [seats]);

  function toggleSeat(seat: Seat) {
    if (movingSeatId) {
      onChange(moveSeat(assignments, movingSeatId, seat.id));
      setMovingSeatId(null);
      setSelection([]);
      return;
    }
    setSelection((prev) => (prev.includes(seat.id) ? prev.filter((id) => id !== seat.id) : [...prev, seat.id]));
  }

  function toggleRow(rowSeats: Seat[]) {
    const ids = rowSeats.map((seat) => seat.id);
    const allSelected = ids.every((id) => selected.has(id));
    setSelection((prev) =>
      allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    );
  }

  /** Applies a ticket type to every selected seat, stopping at what the type still has left. */
  function assignSelection(groupId: string) {
    const group = groupById.get(groupId);
    const elsewhere = assignedElsewhereByGroup[groupId] ?? 0;
    const alreadyHere = seatsForGroup(seats, assignments, groupId).length;
    const remaining = remainingForGroup(group?.quantityTotal, elsewhere + alreadyHere);
    let next = assignments;
    let placed = 0;
    for (const seatId of selection) {
      if (next[seatId] === groupId) continue;
      if (remaining !== null && placed >= remaining) break;
      next = assignSeat(next, seatId, groupId);
      placed += 1;
    }
    onChange(next);
    setSelection([]);
  }

  function clearSelection() {
    let next = assignments;
    for (const seatId of selection) next = clearSeat(next, seatId);
    onChange(next);
    setSelection([]);
  }

  function setSelectionAccessible(next: boolean) {
    if (!onAccessibleChange) return;
    const remaining = accessibleSeatIds.filter((id) => !selection.includes(id));
    onAccessibleChange(next ? [...remaining, ...selection] : remaining);
  }

  function commitQuantity(groupId: string, max: number) {
    const raw = drafts[groupId];
    if (raw === undefined) return;
    const requested = Math.max(0, Math.min(Number(raw) || 0, max));
    onChange(assignSeatCount(seats, assignments, groupId, requested));
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[groupId];
      return next;
    });
  }

  const movingSeat = movingSeatId ? seats.find((seat) => seat.id === movingSeatId) ?? null : null;
  const selectionAllAccessible = selection.length > 0 && selection.every((id) => accessible.has(id));

  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-foreground bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Asientos de {zone.name}</h3>
        <p className="text-sm text-muted-foreground">
          {seats.length} plazas - {seats.length - unassigned} asignadas - {unassigned} {UNASSIGNED_LABEL}
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Los asientos ya estan numerados. Para repartirlos por tipo de entrada crea antes los
          tipos en el paso siguiente y vuelve aqui: no hace falta hacerlo ahora.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Reparte los asientos por tipo de entrada</legend>
          {groups.map((group) => {
            const inThisZone = seatsForGroup(seats, assignments, group.groupId).length;
            const elsewhere = assignedElsewhereByGroup[group.groupId] ?? 0;
            const remaining = remainingForGroup(group.quantityTotal, elsewhere + inThisZone);
            const roomInZone = inThisZone + unassigned;
            const max = remaining === null ? roomInZone : Math.min(roomInZone, inThisZone + remaining);
            const draft = drafts[group.groupId];
            return (
              <div key={group.groupId} className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-sm border-2 border-foreground"
                    style={{ backgroundColor: group.color }}
                  />
                  {group.name}
                </span>
                <label htmlFor={`seat-count-${group.groupId}`} className="sr-only">
                  Asientos de {group.name} en {zone.name}
                </label>
                <input
                  id={`seat-count-${group.groupId}`}
                  type="number"
                  min="0"
                  max={max}
                  step="1"
                  inputMode="numeric"
                  value={draft ?? String(inThisZone)}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [group.groupId]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault(); // don't submit the wizard's form
                    commitQuantity(group.groupId, max);
                  }}
                  className="h-10 w-24 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 px-3 text-xs"
                  aria-label={`Aplicar cantidad de ${group.name}`}
                  disabled={draft === undefined}
                  onClick={() => commitQuantity(group.groupId, max)}
                >
                  OK
                </Button>
                <span className="text-sm text-muted-foreground">
                  {inThisZone}/{seats.length} en esta zona
                  {group.quantityTotal !== null && (
                    <>
                      {" - "}
                      {elsewhere + inThisZone}/{group.quantityTotal} en total
                    </>
                  )}
                </span>
              </div>
            );
          })}
        </fieldset>
      )}

      {movingSeat && (
        <p role="status" className="rounded-md border-2 border-accent bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground">
          Moviendo el asiento {movingSeat.label}. Elige el asiento de destino.{" "}
          <button type="button" className="underline" onClick={() => setMovingSeatId(null)}>
            Cancelar
          </button>
        </p>
      )}

      <div className="flex flex-col gap-1.5 overflow-x-auto">
        {rows.map((row) => (
          <div key={row[0]!.rowLabel} className="flex items-center gap-2">
            <button
              type="button"
              aria-label={`Seleccionar la fila ${row[0]!.rowLabel}`}
              onClick={() => toggleRow(row)}
              className="w-6 shrink-0 rounded-sm text-xs font-semibold text-muted-foreground hover:bg-background"
            >
              {row[0]!.rowLabel}
            </button>
            <div className="flex flex-wrap gap-1">
              {row.map((seat) => {
                const groupId = assignments[seat.id];
                const group = groupId ? groupById.get(groupId) : undefined;
                const isAccessible = accessible.has(seat.id);
                const background = isAccessible ? ACCESSIBLE_COLOR : group?.color;
                const isSelected = selected.has(seat.id);
                return (
                  <button
                    key={seat.id}
                    type="button"
                    aria-label={`Asiento ${seat.label} ${group ? group.name : UNASSIGNED_LABEL}${
                      isAccessible ? " movilidad reducida" : ""
                    }`}
                    aria-pressed={isSelected}
                    onClick={() => toggleSeat(seat)}
                    style={background ? { backgroundColor: background, borderColor: background } : undefined}
                    className={cn(
                      "h-7 w-7 rounded-t-md border-2 text-[10px] font-semibold leading-none",
                      background ? "text-white" : "border-dashed border-muted-foreground text-muted-foreground",
                      isSelected && "ring-2 ring-offset-1 ring-foreground",
                      movingSeatId === seat.id && "ring-2 ring-accent"
                    )}
                  >
                    {isAccessible ? <span aria-hidden="true">&#9855;</span> : seat.number}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {selection.length > 0 && (
        <div
          role="group"
          aria-label="Acciones sobre los asientos seleccionados"
          className="flex flex-wrap items-center gap-2 rounded-md border-2 border-foreground bg-background p-3"
        >
          <span className="text-sm font-semibold">
            {selection.length === 1
              ? `Asiento ${seats.find((seat) => seat.id === selection[0])?.label ?? ""}`
              : `${selection.length} asientos seleccionados`}
          </span>

          {groups.map((group) => (
            <Button
              key={group.groupId}
              type="button"
              variant="outline"
              className="h-8 px-2 text-xs"
              onClick={() => assignSelection(group.groupId)}
            >
              Asignar {group.name}
            </Button>
          ))}

          <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={clearSelection}>
            Quitar tipo de entrada
          </Button>

          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={selectionAllAccessible}
              onChange={(e) => setSelectionAccessible(e.target.checked)}
            />
            Movilidad reducida
          </label>

          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            // Moving is a one-to-one swap, so it only makes sense for a single seat.
            disabled={selection.length !== 1}
            onClick={() => {
              setMovingSeatId(selection[0]!);
              setSelection([]);
            }}
          >
            Mover a otro asiento
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => setSelection([])}
          >
            Limpiar seleccion
          </Button>
        </div>
      )}
    </section>
  );
}
