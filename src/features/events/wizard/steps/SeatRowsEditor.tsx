import { useState } from "react";
import type { Zone } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";
import {
  buildSeatGrid,
  capacityOfSeatRows,
  normaliseSeatRows,
  rectangleSeatRows,
  seatsInRow,
  toggleRowGap,
  type RowOrigin,
  type SeatRowSpec
} from "./seatMap";

export interface SeatRowsEditorProps {
  zone: Zone;
  /** Where row A sits, so the names shown here are the ones that end up on the tickets. */
  rowAOrigin: RowOrigin;
  onChange: (rows: SeatRowSpec[], capacity: number) => void;
}

/**
 * The room, row by row.
 *
 * This replaces a single text box that asked for "12, 11, 11, 9". That box could describe the
 * lengths of the rows and nothing else, so a room with a central gangway, a staggered stand or a
 * block numbered from 101 was simply not expressible -- and reading a list of sixteen commas told
 * nobody anything about the room it stood for.
 *
 * Here each row is a line you can see and touch: its name, how many positions it has, a click to
 * turn a position into an aisle, a nudge to shift the whole row half a seat, and where its
 * numbering starts and which way it runs. The drawing beside each row is the row, with the real
 * seat numbers on it, so what you set is what the buyer will see.
 *
 * Why rows and not free dragging: seats snap to their row because the numbering is derived from
 * the position. Dragging a chair anywhere would either renumber the row under you or leave the
 * label lying about where the seat is -- and a ticket that says A7 has to be the seventh seat of
 * row A in the actual room. Shifting a whole row and punching aisles covers the irregular
 * shapes (curved stands, blocks that narrow at the back, boxes) without ever breaking that.
 */
export function SeatRowsEditor({ zone, rowAOrigin, onChange }: SeatRowsEditorProps) {
  const rows = normaliseSeatRows(zone);
  const seats = buildSeatGrid({ ...zone, seatRows: rows, rowAOrigin });
  const total = capacityOfSeatRows(rows) ?? 0;

  const [gridRows, setGridRows] = useState("");
  const [gridSeats, setGridSeats] = useState("");
  const [confirmingGrid, setConfirmingGrid] = useState(false);

  function commit(next: SeatRowSpec[]) {
    onChange(next, capacityOfSeatRows(next) ?? 0);
  }

  function patchRow(index: number, patch: Partial<SeatRowSpec>) {
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function applyGrid() {
    const next = rectangleSeatRows(Number(gridRows) || 0, Number(gridSeats) || 0);
    if (next.length === 0) return;
    commit(next);
    setGridRows("");
    setGridSeats("");
    setConfirmingGrid(false);
  }

  // Seats by drawn row, so each line can show its own real numbers.
  const seatsByRow = new Map<number, Map<number, number>>();
  const labelByRow = new Map<number, string>();
  for (const seat of seats) {
    if (!seatsByRow.has(seat.rowIndex)) seatsByRow.set(seat.rowIndex, new Map());
    seatsByRow.get(seat.rowIndex)!.set(seat.colIndex, seat.number);
    labelByRow.set(seat.rowIndex, seat.rowLabel);
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Filas y butacas de {zone.name}</h3>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "butaca" : "butacas"} en {rows.length} {rows.length === 1 ? "fila" : "filas"}
        </p>
      </header>

      <div className="flex flex-wrap items-end gap-2 rounded-md border-2 border-border bg-background p-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="grid-rows" className="text-xs font-semibold">
            Filas
          </label>
          <input
            id="grid-rows"
            type="number"
            min="1"
            max="200"
            inputMode="numeric"
            placeholder="10"
            value={gridRows}
            onChange={(e) => setGridRows(e.target.value)}
            className="h-10 w-20 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
          />
        </div>
        <span className="pb-3 text-sm font-semibold">x</span>
        <div className="flex flex-col gap-1">
          <label htmlFor="grid-seats" className="text-xs font-semibold">
            Butacas por fila
          </label>
          <input
            id="grid-seats"
            type="number"
            min="1"
            max="120"
            inputMode="numeric"
            placeholder="12"
            value={gridSeats}
            onChange={(e) => setGridSeats(e.target.value)}
            className="h-10 w-24 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
          />
        </div>
        {/* Rebuilding the block throws away every aisle and shift already set, so it asks first. */}
        {confirmingGrid ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-destructive">
              Esto rehace la zona entera y pierde los pasillos y desplazamientos que ya tengas.
            </span>
            <Button type="button" variant="destructive" className="h-10 px-3 text-xs" onClick={applyGrid}>
              Rehacer
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 px-3 text-xs"
              onClick={() => setConfirmingGrid(false)}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-10 px-3 text-xs"
            disabled={!gridRows || !gridSeats}
            onClick={() => (rows.length === 0 ? applyGrid() : setConfirmingGrid(true))}
          >
            Crear la rejilla
          </Button>
        )}
        <p className="w-full text-xs text-muted-foreground">
          Para una sala rectangular, con esto ya esta. Despues puedes retocar fila a fila: pulsa
          una butaca para convertirla en pasillo y usa las flechas para desplazar la fila media
          butaca, que es como se dibujan los graderios curvos.
        </p>
      </div>

      <div className="flex flex-col gap-1 overflow-x-auto">
        {rows.length > 0 && (
          <div className="flex min-w-max items-center gap-2 px-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            <span className="w-14">Fila</span>
            <span className="w-[88px] text-center">Butacas</span>
            <span className="w-[88px] text-center">Desplazar</span>
            <span className="w-14 text-center">Empieza</span>
            <span className="w-10 text-center">Orden</span>
            <span className="w-16" />
            <span>La fila, tal como queda</span>
          </div>
        )}

        {rows.map((row, index) => {
          const numbers = seatsByRow.get(index) ?? new Map<number, number>();
          const name = labelByRow.get(index) ?? "";
          const offset = row.offset ?? 0;
          return (
            <div
              key={index}
              className="flex min-w-max items-center gap-2 rounded-md border-2 border-border bg-background p-1.5"
            >
              <label className="sr-only" htmlFor={`row-label-${index}`}>
                Nombre de la fila {name}
              </label>
              <input
                id={`row-label-${index}`}
                value={row.label ?? ""}
                placeholder={name}
                maxLength={8}
                onChange={(e) => patchRow(index, { label: e.target.value || null })}
                className="h-8 w-14 shrink-0 rounded-md border-2 border-foreground bg-surface px-1 text-center text-sm font-semibold"
              />

              <div className="flex w-[88px] shrink-0 items-center justify-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-7 shrink-0 p-0 shadow-none"
                  aria-label={`Quitar una posicion de la fila ${name}`}
                  disabled={row.slots <= 1}
                  onClick={() => patchRow(index, { slots: row.slots - 1 })}
                >
                  <Icon name="minus" size={13} />
                </Button>
                <span className="w-6 text-center text-sm font-semibold" aria-hidden="true">
                  {seatsInRow(row)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-7 shrink-0 p-0 shadow-none"
                  aria-label={`Anadir una posicion a la fila ${name}`}
                  disabled={row.slots >= 120}
                  onClick={() => patchRow(index, { slots: row.slots + 1 })}
                >
                  <Icon name="plus" size={13} />
                </Button>
              </div>

              <div className="flex w-[88px] shrink-0 items-center justify-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-7 shrink-0 p-0 text-[10px] shadow-none"
                  aria-label={`Desplazar la fila ${name} a la izquierda`}
                  onClick={() => patchRow(index, { offset: offset - 1 })}
                >
                  &#9664;
                </Button>
                <span className="w-6 text-center text-[11px] text-muted-foreground" aria-hidden="true">
                  {formatOffset(offset)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-7 shrink-0 p-0 text-[10px] shadow-none"
                  aria-label={`Desplazar la fila ${name} a la derecha`}
                  onClick={() => patchRow(index, { offset: offset + 1 })}
                >
                  &#9654;
                </Button>
              </div>

              <label className="sr-only" htmlFor={`row-start-${index}`}>
                Primer numero de la fila {name}
              </label>
              <input
                id={`row-start-${index}`}
                type="number"
                min="1"
                inputMode="numeric"
                value={row.startNumber ?? 1}
                onChange={(e) => patchRow(index, { startNumber: Math.max(1, Number(e.target.value) || 1) })}
                className="h-8 w-14 shrink-0 rounded-md border-2 border-foreground bg-surface px-1 text-center text-sm"
              />

              <Button
                type="button"
                variant="outline"
                className="h-8 w-10 shrink-0 p-0 text-xs shadow-none"
                aria-pressed={Boolean(row.reversed)}
                aria-label={`Numerar la fila ${name} ${row.reversed ? "de izquierda a derecha" : "de derecha a izquierda"}`}
                onClick={() => patchRow(index, { reversed: !row.reversed })}
              >
                {row.reversed ? "9←8" : "1→2"}
              </Button>

              <div className="flex w-16 shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-7 shrink-0 p-0 shadow-none"
                  aria-label={`Duplicar la fila ${name}`}
                  onClick={() => commit([...rows.slice(0, index + 1), { ...row, label: null }, ...rows.slice(index + 1)])}
                >
                  <span aria-hidden="true" className="text-[13px] leading-none">
                    &#10697;
                  </span>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-7 shrink-0 p-0 shadow-none"
                  aria-label={`Eliminar la fila ${name}`}
                  onClick={() => commit(rows.filter((_, i) => i !== index))}
                >
                  <Icon name="trash" size={13} />
                </Button>
              </div>

              {/* The row itself. Pressing a seat makes it an aisle; pressing an aisle gives the
                  seat back. The controls to its left are all fixed width, so every row's drawing
                  starts at the same place and the block reads as the room it is. */}
              <div className="flex items-center gap-0.5" style={{ marginLeft: `${offset * 0.55}rem` }}>
                {Array.from({ length: row.slots }, (_, slotIndex) => {
                  const number = numbers.get(slotIndex);
                  const isGap = number === undefined;
                  return (
                    <button
                      key={slotIndex}
                      type="button"
                      aria-label={
                        isGap
                          ? `Posicion ${slotIndex + 1} de la fila ${name}: pasillo. Pulsa para poner una butaca`
                          : `Butaca ${name}${number}. Pulsa para convertirla en pasillo`
                      }
                      onClick={() => patchRow(index, toggleRowGap(row, slotIndex + 1))}
                      className={cn(
                        "h-6 w-6 shrink-0 rounded-t-md border-2 text-[9px] font-semibold leading-none",
                        isGap
                          ? "border-dotted border-muted-foreground bg-transparent text-muted-foreground"
                          : "border-foreground bg-surface-alt text-foreground"
                      )}
                    >
                      {isGap ? "" : number}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <Button
          type="button"
          variant="outline"
          className="h-10 px-3 text-xs"
          onClick={() => commit([...rows, { slots: rows[rows.length - 1]?.slots ?? 10 }])}
        >
          <Icon name="plus" size={14} />
          Anadir fila
        </Button>
      </div>
    </section>
  );
}

/** Half-seat shifts read better as fractions than as the raw count of half steps. */
export function formatOffset(offset: number): string {
  if (offset === 0) return "0";
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  const whole = Math.floor(abs / 2);
  const half = abs % 2 === 1;
  if (whole === 0) return `${sign}1/2`;
  return half ? `${sign}${whole}.5` : `${sign}${whole}`;
}
