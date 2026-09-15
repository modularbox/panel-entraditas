/**
 * Seat geometry and per-seat ticket-type assignment.
 *
 * A numbered zone is described row by row (`seatRows`): how many positions each row has, which of
 * those are aisles rather than seats, and how far the row is shifted sideways. That is what lets a
 * plan describe a real room -- a stalls block that narrows at the back, a central aisle, the
 * staggered rows of a curved stand -- instead of only a rectangle.
 *
 * The individual seats are *derived* from that description, never stored, so the venue's zone
 * stays a small record while still producing stable, physically meaningful labels: row A is the
 * row closest to the stage, and numbering runs over the real seats only, skipping the aisles, so
 * it matches what is printed on the chairs.
 *
 * Zones drawn before this existed carry `rowSeats` (just the lengths) or nothing at all (an even
 * split of `capacity` over `rows`). Both are still read, and normaliseSeatRows turns any of the
 * three into the same row-by-row description.
 *
 * Which ticket type each seat sells is a separate, per-event concern (the same venue is reused
 * across events), so assignments live on the event's capacity pool as a sparse
 * seatId -> ticketTypeGroupId map: only assigned seats appear in it.
 */

/** Hard ceiling on how many seats we materialise, so a mistyped capacity can't hang the UI. */
export const MAX_RENDERED_SEATS = 2000;

/**
 * One physical row.
 *
 * `slots` counts *positions*, aisles included, because that is what makes the drawing match the
 * room: a row of 14 with a gangway in the middle is 15 slots with slot 8 empty, and the seats
 * either side of it stay where they are instead of sliding together.
 */
export interface SeatRowSpec {
  /** Row name as printed in the venue. Absent means the automatic A, B, C... */
  label?: string | null;
  /** Positions in the row, aisles included. */
  slots: number;
  /** 1-based positions that are an aisle or a gap, not a seat. */
  gaps?: number[];
  /**
   * Sideways shift, in HALF seats, so rows can be staggered against each other: 1 moves the row
   * half a seat to the right, -2 a whole seat to the left. Half steps because that is exactly
   * what a curved or offset stand needs and whole steps cannot express.
   */
  offset?: number;
  /** Number of the row's first seat. Theatres often start a block at 101, or at 2 for even sides. */
  startNumber?: number;
  /** Numbering runs right to left, as in halls numbered outwards from the centre aisle. */
  reversed?: boolean;
  /**
   * Seats the venue calls something other than what the count would give them, by position
   * (1-based slot). For the odd chair that keeps an old number after a refurbishment, or a
   * bis/duplicate. The key is the slot so the name stays put when the row grows or shrinks.
   */
  names?: Record<string, string>;
}

/** A, B, C... or 1, 2, 3... Whichever the venue paints on the row ends and the chairs. */
export type Naming = "letters" | "numbers";

export interface Seat {
  /** Stable within a layout: derived from the row label and the seat number ("A-1"). */
  id: string;
  /** 0-based row as *drawn*, top to bottom. Not the same as the row label when row A is at the bottom. */
  rowIndex: number;
  /** 0-based position within the drawn row, left to right. Counts aisles, so it is the drawn column. */
  colIndex: number;
  /**
   * Drawn horizontal position in seat widths, with the row's shift already applied. Can land on a
   * half (3.5) when the row is staggered. This is the one number every surface -- the canvas
   * miniature, the editor grid and the buyer site -- positions the seat by, so they cannot disagree.
   */
  column: number;
  rowLabel: string;
  /** 1-based ordinal within its row. Always a number, whatever the seat is *called*. */
  number: number;
  /** What the seat is called within its row ("7", "G", "12bis"), as painted on the chair. */
  numberLabel: string;
  /** Human label as printed on the ticket ("A7"). */
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
  /** Full row-by-row description. Wins over everything else. */
  seatRows?: SeatRowSpec[] | null;
  rowAOrigin?: RowOrigin;
  /** How the rows are named when they have no name of their own. Default: letters. */
  rowNaming?: Naming | null;
  /** How the seats are numbered within a row. Default: numbers. */
  seatNaming?: Naming | null;
}

/** Capacity implied by a custom distribution, which is what the zone actually holds. */
export function capacityOfRowSeats(rowSeats: number[] | null | undefined): number | null {
  if (!rowSeats || rowSeats.length === 0) return null;
  return rowSeats.reduce((sum, seats) => sum + Math.max(0, Math.floor(seats)), 0);
}

/** Real seats in a row: its positions minus its aisles. */
export function seatsInRow(row: SeatRowSpec): number {
  const slots = Math.max(0, Math.floor(row.slots));
  const gaps = new Set((row.gaps ?? []).filter((gap) => gap >= 1 && gap <= slots));
  return slots - gaps.size;
}

/** What the zone actually holds once the aisles are discounted. */
export function capacityOfSeatRows(rows: SeatRowSpec[] | null | undefined): number | null {
  if (!rows || rows.length === 0) return null;
  return rows.reduce((sum, row) => sum + seatsInRow(row), 0);
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

/**
 * The room as rows, whatever the zone happens to store.
 *
 * The three shapes a zone can be in -- a full row-by-row description, the older list of row
 * lengths, or just a capacity to spread -- all collapse to the same thing here, so the editor
 * only ever deals with one model and nothing has to branch on how old a plan is.
 */
export function normaliseSeatRows(zone: SeatGridInput): SeatRowSpec[] {
  if (zone.seatRows?.length) {
    return zone.seatRows
      .map((row) => ({ ...row, slots: Math.max(0, Math.floor(row.slots)) }))
      .filter((row) => row.slots > 0);
  }
  const capacity = Math.max(0, Math.min(Math.floor(zone.capacity), MAX_RENDERED_SEATS));
  if (zone.rowSeats?.length) {
    return zone.rowSeats
      .map((seats) => ({ slots: Math.max(0, Math.floor(seats)) }))
      .filter((row) => row.slots > 0);
  }
  return seatsPerRow(capacity, computeRowCount(capacity, zone.width, zone.height, zone.rows)).map((slots) => ({
    slots
  }));
}

/** A rectangular block, which is what most zones are and what the quick setup produces. */
export function rectangleSeatRows(rows: number, seatsPerRowCount: number): SeatRowSpec[] {
  const rowCount = Math.max(0, Math.floor(rows));
  const slots = Math.max(0, Math.floor(seatsPerRowCount));
  if (rowCount === 0 || slots === 0) return [];
  return Array.from({ length: rowCount }, () => ({ slots }));
}

/** Turns a position of a row into an aisle, or back into a seat. */
export function toggleRowGap(row: SeatRowSpec, slot: number): SeatRowSpec {
  const gaps = new Set(row.gaps ?? []);
  if (gaps.has(slot)) gaps.delete(slot);
  else gaps.add(slot);
  const next = [...gaps].filter((gap) => gap >= 1 && gap <= row.slots).sort((a, b) => a - b);
  return { ...row, gaps: next.length > 0 ? next : undefined };
}

/** The automatic name of the nth row or seat, in whichever scheme the venue uses. */
export function autoName(index: number, naming: Naming | null | undefined): string {
  return naming === "numbers" ? String(index + 1) : rowLabel(index);
}

/**
 * What is printed on the ticket: "A7", but "1-7" when the row is numbered too.
 *
 * Run together, a numbered row and a numbered seat are unreadable: row 1 seat 1 and row 11 seat
 * nothing both come out as "11", and row 1 seat 10 reads as "110". A separator only goes in when
 * a digit would land against a digit, so the usual "A7" stays as short as it always was.
 */
export function seatLabel(row: string, seat: string): string {
  return /\d$/.test(row) && /^\d/.test(seat) ? `${row}-${seat}` : `${row}${seat}`;
}

/** Builds the seats of a zone in reading order (row drawn first, then left to right). */
export function buildSeatGrid(zone: SeatGridInput): Seat[] {
  const rows = normaliseSeatRows(zone);
  const origin = zone.rowAOrigin ?? "top";
  const rowNaming: Naming = zone.rowNaming ?? "letters";
  const seatNaming: Naming = zone.seatNaming ?? "numbers";
  const seats: Seat[] = [];
  // Two rows sharing a name would produce two seats with the same id, and one would silently
  // shadow the other's ticket type. A repeated name is disambiguated rather than rejected.
  const usedLabels = new Set<string>();
  let placed = 0;

  rows.forEach((row, rowIndex) => {
    const automatic = autoName(origin === "top" ? rowIndex : rows.length - 1 - rowIndex, rowNaming);
    let label = row.label?.trim() ? row.label.trim() : automatic;
    if (usedLabels.has(label)) {
      let suffix = 2;
      while (usedLabels.has(`${label}.${suffix}`)) suffix += 1;
      label = `${label}.${suffix}`;
    }
    usedLabels.add(label);

    const gaps = new Set((row.gaps ?? []).filter((gap) => gap >= 1 && gap <= row.slots));
    const realSlots: number[] = [];
    for (let slot = 1; slot <= row.slots; slot += 1) if (!gaps.has(slot)) realSlots.push(slot);

    const start = row.startNumber && row.startNumber > 0 ? Math.floor(row.startNumber) : 1;
    const offset = Number.isFinite(row.offset) ? (row.offset as number) : 0;
    const usedNames = new Set<string>();

    realSlots.forEach((slot, realIndex) => {
      if (placed >= MAX_RENDERED_SEATS) return;
      const position = row.reversed ? realSlots.length - 1 - realIndex : realIndex;
      const number = start + position;
      // The chair's own name wins over the count: a refurbished hall keeps the odd old number.
      const custom = row.names?.[String(slot)]?.trim();
      let numberLabel = custom || autoName(number - 1, seatNaming);
      if (usedNames.has(numberLabel)) {
        let suffix = 2;
        while (usedNames.has(`${numberLabel}.${suffix}`)) suffix += 1;
        numberLabel = `${numberLabel}.${suffix}`;
      }
      usedNames.add(numberLabel);
      const colIndex = slot - 1;
      seats.push({
        id: `${label}-${numberLabel}`,
        rowIndex,
        colIndex,
        column: colIndex + offset / 2,
        rowLabel: label,
        number,
        numberLabel,
        label: seatLabel(label, numberLabel)
      });
      placed += 1;
    });
  });

  return seats;
}

/**
 * Carries a zone's per-seat data across a re-labelling.
 *
 * Seat ids are the labels the organiser sees ("A-7"), which is what makes them meaningful and
 * what lets the buyer site and the panel agree on which chair is which. The price of that is that
 * renaming a row, renumbering a block or switching the whole zone from letters to numbers changes
 * every id, and the ticket types pinned to those ids would be dropped on the floor. Seats are
 * matched by where they are, which does not change, so the breakdown survives.
 */
export function remapById(before: Seat[], after: Seat[], ids: string[]): string[];
export function remapById(before: Seat[], after: Seat[], assignments: SeatAssignments): SeatAssignments;
export function remapById(
  before: Seat[],
  after: Seat[],
  value: string[] | SeatAssignments
): string[] | SeatAssignments {
  const key = (seat: Seat) => `${seat.rowIndex}:${seat.colIndex}`;
  const oldIdToPlace = new Map(before.map((seat) => [seat.id, key(seat)]));
  const placeToNewId = new Map(after.map((seat) => [key(seat), seat.id]));
  const translate = (id: string): string | null => {
    const place = oldIdToPlace.get(id);
    if (place === undefined) return null;
    return placeToNewId.get(place) ?? null;
  };

  if (Array.isArray(value)) {
    return value.flatMap((id) => {
      const next = translate(id);
      return next === null ? [] : [next];
    });
  }
  const next: SeatAssignments = {};
  for (const [id, groupId] of Object.entries(value)) {
    const moved = translate(id);
    if (moved !== null) next[moved] = groupId;
  }
  return next;
}

/**
 * Slides a seat one position sideways, swapping it with the aisle next to it. Only into an aisle:
 * anywhere else there is already a chair, and two chairs cannot share a place.
 */
export function moveSeatSlot(row: SeatRowSpec, slot: number, direction: -1 | 1): SeatRowSpec {
  const target = slot + direction;
  if (target < 1 || target > row.slots) return row;
  const gaps = new Set(row.gaps ?? []);
  if (gaps.has(slot) || !gaps.has(target)) return row;
  gaps.delete(target);
  gaps.add(slot);
  const names = { ...(row.names ?? {}) };
  if (names[String(slot)] !== undefined) {
    names[String(target)] = names[String(slot)]!;
    delete names[String(slot)];
  }
  return {
    ...row,
    gaps: [...gaps].sort((a, b) => a - b),
    names: Object.keys(names).length > 0 ? names : undefined
  };
}

/** Gives one seat a name of its own, or takes it back to the automatic one. */
export function renameSeatSlot(row: SeatRowSpec, slot: number, name: string | null): SeatRowSpec {
  const names = { ...(row.names ?? {}) };
  const trimmed = name?.trim() ?? "";
  if (trimmed === "") delete names[String(slot)];
  else names[String(slot)] = trimmed;
  return { ...row, names: Object.keys(names).length > 0 ? names : undefined };
}

/** Groups the seats by drawn row, so the UI can render one line per physical row. */
export function seatRows(seats: Seat[]): Seat[][] {
  const rows: Seat[][] = [];
  for (const seat of seats) {
    (rows[seat.rowIndex] ??= []).push(seat);
  }
  return rows.filter(Boolean);
}

/**
 * The box the drawn seats occupy, in seat widths.
 *
 * Every surface that paints a plan needs the same two numbers to place a seat, and a staggered
 * row can start at a negative column, so the left edge is part of the answer rather than assumed
 * to be zero. Returning it here is what keeps the canvas miniature, the editor grid and the
 * buyer site drawing the same room.
 */
export function seatGridExtent(seats: Seat[]): { left: number; right: number; columns: number; rows: number } {
  if (seats.length === 0) return { left: 0, right: 0, columns: 0, rows: 0 };
  let left = Infinity;
  let right = -Infinity;
  let rows = 0;
  for (const seat of seats) {
    left = Math.min(left, seat.column);
    right = Math.max(right, seat.column);
    rows = Math.max(rows, seat.rowIndex + 1);
  }
  return { left, right, columns: right - left + 1, rows };
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
