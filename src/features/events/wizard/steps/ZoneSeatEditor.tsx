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

/** Reduced-mobility seats are drawn in blue and marked with the wheelchair symbol. */
const ACCESSIBLE_COLOR = "#2563eb";

const UNASSIGNED_LABEL = "sin asignar";

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
  const accessible = new Set(accessibleSeatIds);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(groups[0]?.groupId ?? null);
  const [openSeatId, setOpenSeatId] = useState<string | null>(null);
  const [movingSeatId, setMovingSeatId] = useState<string | null>(null);
  // What the organiser has typed, per ticket type, while the save is still in flight. Without
  // this the field is driven straight from the persisted assignments, so every keystroke was
  // overwritten by the round-trip and typing a two-digit quantity was impossible.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Ticket types can be created and deleted while this editor is open; keep the active one real.
  useEffect(() => {
    if (groups.length === 0) {
      if (activeGroupId !== null) setActiveGroupId(null);
      return;
    }
    if (!groups.some((group) => group.groupId === activeGroupId)) setActiveGroupId(groups[0]!.groupId);
  }, [groups, activeGroupId]);

  const rows = seatRows(seats);
  const unassigned = countUnassigned(seats, assignments);
  const groupById = new Map(groups.map((group) => [group.groupId, group]));

  function handleSeatClick(seat: Seat) {
    if (movingSeatId) {
      onChange(moveSeat(assignments, movingSeatId, seat.id));
      setMovingSeatId(null);
      setOpenSeatId(null);
      return;
    }
    if (assignments[seat.id] !== undefined) {
      setOpenSeatId(openSeatId === seat.id ? null : seat.id);
      return;
    }
    if (activeGroupId) onChange(assignSeat(assignments, seat.id, activeGroupId));
    // Open the actions for the seat just painted too, so the reduced-mobility checkbox is
    // reachable for any seat, not only for ones that already had a ticket type.
    setOpenSeatId(seat.id);
  }

  function toggleAccessible(seatId: string, next: boolean) {
    if (!onAccessibleChange) return;
    const remaining = accessibleSeatIds.filter((id) => id !== seatId);
    onAccessibleChange(next ? [...remaining, seatId] : remaining);
  }

  const openSeat = openSeatId ? seats.find((seat) => seat.id === openSeatId) ?? null : null;
  const movingSeat = movingSeatId ? seats.find((seat) => seat.id === movingSeatId) ?? null : null;

  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-foreground bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Asientos de {zone.name}</h3>
        <p className="text-sm text-muted-foreground">
          {seats.length} plazas - {seats.length - unassigned} asignadas - {unassigned} {UNASSIGNED_LABEL}
        </p>
      </header>

      {groups.length === 0 ? (
        <p role="alert" className="text-sm font-semibold text-destructive">
          Crea primero un tipo de entrada para poder repartir los asientos de esta zona.
        </p>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">Reparte los asientos por tipo de entrada</legend>
          {groups.map((group) => {
            const inThisZone = seatsForGroup(seats, assignments, group.groupId).length;
            const elsewhere = assignedElsewhereByGroup[group.groupId] ?? 0;
            const remaining = remainingForGroup(group.quantityTotal, elsewhere + inThisZone);
            // Cap the input at whatever the zone can still fit and the ticket type can still sell.
            const roomInZone = inThisZone + unassigned;
            const max = remaining === null ? roomInZone : Math.min(roomInZone, inThisZone + remaining);
            const isActive = activeGroupId === group.groupId;
            return (
              <div key={group.groupId} className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`Pintar asientos con ${group.name}`}
                  onClick={() => setActiveGroupId(group.groupId)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border-2 px-2 py-1 text-sm font-semibold",
                    isActive ? "border-foreground" : "border-transparent"
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 rounded-sm border-2 border-foreground"
                    style={{ backgroundColor: group.color }}
                  />
                  {group.name}
                </button>
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
                  value={drafts[group.groupId] ?? String(inThisZone)}
                  onChange={(e) => {
                    const raw = e.target.value;
                    // Keep exactly what was typed on screen, but only ever place a quantity the
                    // zone and the ticket type can both take.
                    setDrafts((prev) => ({ ...prev, [group.groupId]: raw }));
                    if (raw.trim() === "") return; // mid-edit, don't wipe the zone
                    const requested = Math.max(0, Math.min(Number(raw) || 0, max));
                    onChange(assignSeatCount(seats, assignments, group.groupId, requested));
                  }}
                  onBlur={() =>
                    setDrafts((prev) => {
                      const next = { ...prev };
                      delete next[group.groupId];
                      return next;
                    })
                  }
                  className="h-10 w-24 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground"
                />
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
            <span aria-hidden="true" className="w-6 shrink-0 text-xs font-semibold text-muted-foreground">
              {row[0]!.rowLabel}
            </span>
            <div className="flex flex-wrap gap-1">
              {row.map((seat) => {
                const groupId = assignments[seat.id];
                const group = groupId ? groupById.get(groupId) : undefined;
                const isMoving = movingSeatId === seat.id;
                const isAccessible = accessible.has(seat.id);
                // Reduced mobility wins the colour: at the door it matters more than the tier.
                const background = isAccessible ? ACCESSIBLE_COLOR : group?.color;
                return (
                  <button
                    key={seat.id}
                    type="button"
                    aria-label={`Asiento ${seat.label} ${group ? group.name : UNASSIGNED_LABEL}${
                      isAccessible ? " movilidad reducida" : ""
                    }`}
                    aria-pressed={openSeatId === seat.id}
                    onClick={() => handleSeatClick(seat)}
                    style={background ? { backgroundColor: background, borderColor: background } : undefined}
                    className={cn(
                      "h-7 w-7 rounded-t-md border-2 text-[10px] font-semibold leading-none",
                      background ? "text-white" : "border-dashed border-muted-foreground text-muted-foreground",
                      isMoving && "ring-2 ring-accent",
                      openSeatId === seat.id && "ring-2 ring-foreground"
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

      {openSeat && (
        <div role="group" aria-label={`Acciones del asiento ${openSeat.label}`} className="flex flex-wrap items-center gap-2 rounded-md border-2 border-foreground bg-background p-3">
          <span className="text-sm font-semibold">Asiento {openSeat.label}</span>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => {
              onChange(clearSeat(assignments, openSeat.id));
              setOpenSeatId(null);
            }}
          >
            Quitar tipo de entrada
          </Button>
          <label htmlFor="seat-change-group" className="text-xs font-semibold">
            Cambiar a
          </label>
          <select
            id="seat-change-group"
            value={assignments[openSeat.id] ?? ""}
            onChange={(e) => {
              onChange(assignSeat(assignments, openSeat.id, e.target.value));
              setOpenSeatId(null);
            }}
          >
            {groups.map((group) => (
              <option key={group.groupId} value={group.groupId}>
                {group.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs"
            onClick={() => {
              setMovingSeatId(openSeat.id);
              setOpenSeatId(null);
            }}
          >
            Mover a otro asiento
          </Button>
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input
              type="checkbox"
              checked={accessible.has(openSeat.id)}
              onChange={(e) => toggleAccessible(openSeat.id, e.target.checked)}
            />
            Movilidad reducida
          </label>
        </div>
      )}
    </section>
  );
}
