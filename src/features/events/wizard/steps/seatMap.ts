/**
 * Seat geometry and per-seat ticket-type assignment.
 *
 * A numbered zone stores only its physical shape (capacity + how many rows it is
 * split into). The individual seats are *derived* from that, so a venue's zone stays
 * a small record while still producing stable, physically meaningful seat labels:
 * row A is the row closest to the stage, and seat 1 is the leftmost seat of its row.
 *
 * Which ticket type each seat sells is a separate, per-event concern (the same venue
 * is reused across events), so assignments live on the event's capacity pool as a
 * sparse seatId -> ticketTypeGroupId map: only assigned seats appear in it.
 */

/** Hard ceiling on how many seats we materialise, so a mistyped capacity can't hang the UI. */
export const MAX_RENDERED_SEATS = 2000;

export interface Seat {
  /** Stable within a layout: derived from the row label and the seat number ("A-1"). */
  id: string;
  /** 0-based row as *drawn*, top to bottom. Not the same as the row label when row A is at the bottom. */
  rowIndex: number;
  /** 0-based position within the drawn row, left to right. */
  colIndex: number;
  rowLabel: string;
  /** 1-based seat number within its row, as printed on the ticket. */
  number: number;
  /** Human label as printed on the ticket ("A1"). */
  label: string;
}

/** Where row A sits: at the top of the zone as drawn, or at the bottom (stage is below). */
export type RowOrigin = "top" | "bottom";

export interface SeatGridInput {
  capacity: number;
  width: number;
  height: number;
  /** Explicit row count; when null/undefined the rows are derived from capacity and shape. */
  rows?: number | null;
  /** Explicit seats per row, for rooms that are not a neat rectangle. Wins over `rows`. */
  rowSeats?: number[] | null;
  rowAOrigin?: RowOrigin;
}

/** Capacity implied by a custom distribution, which is what the zone actually holds. */
export function capacityOfRowSeats(rowSeats: number[] | null | undefined): number | null {
  if (!rowSeats || rowSeats.length === 0) return null;
  return rowSeats.reduce((sum, seats) => sum + Math.max(0, Math.floor(seats)), 0);
}

/** seatId -> ticketTypeGroupId. Only assigned seats are present. */
export type SeatAssignments = Record<string, string>;

/** A, B, ... Z, AA, AB, ... so a zone with more than 26 rows still labels cleanly. */
export function rowLabel(index: number): string {
  let label = "";
  let remaining = index;
  while (remaining >= 0) {
    label = String.fromCharCode(65 + (remaining % 26)) + label;
    remaining = Math.floor(remaining / 26) - 1;
  }
  return label;
}

/**
 * Rows are chosen so the seats come out roughly square on the drawn zone: a wide, short
 * zone gets few long rows and a tall, narrow one gets many short rows, which is what makes
 * the plan read like the actual room.
 */
export function computeRowCount(capacity: number, width: number, height: number, explicitRows?: number | null): number {
  if (capacity <= 0) return 0;
  if (explicitRows !== null && explicitRows !== undefined && explicitRows > 0) {
    return Math.min(Math.floor(explicitRows), capacity);
  }
  const ratio = width > 0 ? height / width : 1;
  return Math.max(1, Math.min(capacity, Math.round(Math.sqrt(capacity * ratio)) || 1));
}

/**
 * Spreads the capacity over the rows as evenly as possible, giving the remainder to the
 * first rows: 25 seats over 4 rows is 7/6/6/6, never 7/7/7/4.
 */
export function seatsPerRow(capacity: number, rows: number): number[] {
  if (rows <= 0 || capacity <= 0) return [];
  const base = Math.floor(capacity / rows);
  const extra = capacity % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

/**
 * Row A is the row physically closest to the stage. When the stage sits below the zone on
 * the plan, that is the *last* row drawn, so the labels have to run bottom-up.
 */
export function rowOriginForStage(
  zone: { y: number; height: number },
  stage: { y: number; height: number } | null | undefined
): RowOrigin {
  if (!stage) return "top";
  const zoneCenter = zone.y + zone.height / 2;
  const stageCenter = stage.y + stage.height / 2;
  return stageCenter > zoneCenter ? "bottom" : "top";
}

/** Builds the seats of a zone in reading order (row drawn first, then left to right). */
export function buildSeatGrid(zone: SeatGridInput): Seat[] {
  const capacity = Math.max(0, Math.min(Math.floor(zone.capacity), MAX_RENDERED_SEATS));
  // A custom distribution describes the room exactly, so it wins over the even split entirely.
  const custom = zone.rowSeats?.length
    ? zone.rowSeats.map((seats) => Math.max(0, Math.floor(seats))).filter((seats) => seats > 0)
    : null;
  const rowCount = custom ? custom.length : computeRowCount(capacity, zone.width, zone.height, zone.rows);
  const counts = custom ?? seatsPerRow(capacity, rowCount);
  const origin = zone.rowAOrigin ?? "top";
  const seats: Seat[] = [];
  counts.forEach((seatsInRow, rowIndex) => {
    const labelIndex = origin === "top" ? rowIndex : counts.length - 1 - rowIndex;
    const label = rowLabel(labelIndex);
    for (let colIndex = 0; colIndex < seatsInRow; colIndex += 1) {
      const number = colIndex + 1;
      seats.push({
        id: `${label}-${number}`,
        rowIndex,
        colIndex,
        rowLabel: label,
        number,
        label: `${label}${number}`
      });
    }
  });
  return seats;
}

/** Groups the seats by drawn row, so the UI can render one line per physical row. */
export function seatRows(seats: Seat[]): Seat[][] {
  const rows: Seat[][] = [];
  for (const seat of seats) {
    (rows[seat.rowIndex] ??= []).push(seat);
  }
  return rows.filter(Boolean);
}

export function countAssignedByGroup(assignments: SeatAssignments): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const groupId of Object.values(assignments)) {
    counts[groupId] = (counts[groupId] ?? 0) + 1;
  }
  return counts;
}

/** Seats currently sold as `groupId`, in reading order. */
export function seatsForGroup(seats: Seat[], assignments: SeatAssignments, groupId: string): Seat[] {
  return seats.filter((seat) => assignments[seat.id] === groupId);
}

export function countUnassigned(seats: Seat[], assignments: SeatAssignments): number {
  return seats.filter((seat) => assignments[seat.id] === undefined).length;
}

/**
 * Brings the number of seats sold as `groupId` in this zone to exactly `target`, which is
 * what backs the "type a quantity and let it place them" flow. Growing takes free seats in
 * reading order; shrinking releases the *last* ones placed, so seats the organizer moved by
 * hand near the front of the zone survive a later reduction.
 */
export function assignSeatCount(
  seats: Seat[],
  assignments: SeatAssignments,
  groupId: string,
  target: number
): SeatAssignments {
  const next = { ...assignments };
  const current = seatsForGroup(seats, next, groupId);
  const desired = Math.max(0, Math.min(Math.floor(target), seats.length));
  if (desired < current.length) {
    for (const seat of current.slice(desired)) delete next[seat.id];
    return next;
  }
  let remaining = desired - current.length;
  for (const seat of seats) {
    if (remaining === 0) break;
    if (next[seat.id] === undefined) {
      next[seat.id] = groupId;
      remaining -= 1;
    }
  }
  return next;
}

export function assignSeat(assignments: SeatAssignments, seatId: string, groupId: string): SeatAssignments {
  return { ...assignments, [seatId]: groupId };
}

export function clearSeat(assignments: SeatAssignments, seatId: string): SeatAssignments {
  const next = { ...assignments };
  delete next[seatId];
  return next;
}

/**
 * Moves a seat's ticket type onto another seat. Landing on a free seat relocates it; landing
 * on an occupied one swaps the two, so a move can never silently drop an assignment.
 */
export function moveSeat(assignments: SeatAssignments, fromSeatId: string, toSeatId: string): SeatAssignments {
  const moving = assignments[fromSeatId];
  if (moving === undefined || fromSeatId === toSeatId) return { ...assignments };
  const next = { ...assignments };
  const displaced = next[toSeatId];
  next[toSeatId] = moving;
  if (displaced === undefined) delete next[fromSeatId];
  else next[fromSeatId] = displaced;
  return next;
}

/**
 * Drops assignments whose seat no longer exists. Resizing a zone or changing its row count
 * rebuilds the labels, and a stale seatId would otherwise keep consuming a ticket type's stock
 * from a seat nobody can see.
 */
export function pruneAssignments(assignments: SeatAssignments, seats: Seat[]): SeatAssignments {
  const valid = new Set(seats.map((seat) => seat.id));
  const next: SeatAssignments = {};
  for (const [seatId, groupId] of Object.entries(assignments)) {
    if (valid.has(seatId)) next[seatId] = groupId;
  }
  return next;
}

/**
 * How many more seats of a ticket type may still be placed, given its total stock and what
 * every zone (this one included) has already taken. `null` stock means unlimited.
 */
export function remainingForGroup(
  quantityTotal: number | null | undefined,
  assignedAcrossZones: number
): number | null {
  if (quantityTotal === null || quantityTotal === undefined) return null;
  return Math.max(0, quantityTotal - assignedAcrossZones);
}

/** Serialises the map for the API, which stores assignments as a list. */
export function toSeatAssignmentList(assignments: SeatAssignments): { seatId: string; ticketTypeGroupId: string }[] {
  return Object.entries(assignments).map(([seatId, ticketTypeGroupId]) => ({ seatId, ticketTypeGroupId }));
}

export function fromSeatAssignmentList(
  list: { seatId: string; ticketTypeGroupId: string }[] | null | undefined
): SeatAssignments {
  const assignments: SeatAssignments = {};
  for (const entry of list ?? []) assignments[entry.seatId] = entry.ticketTypeGroupId;
  return assignments;
}
