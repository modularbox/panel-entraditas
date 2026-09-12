import { useState } from "react";
import type { Zone } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";
import { useTips } from "@/shared/ui/tips";
import {
  buildSeatGrid,
  capacityOfSeatRows,
  moveSeatSlot,
  normaliseSeatRows,
  rectangleSeatRows,
  renameSeatSlot,
  seatsInRow,
  toggleRowGap,
  type Naming,
  type RowOrigin,
  type SeatRowSpec
} from "./seatMap";

/** Lo que el editor puede cambiar de la zona. La capacidad la calcula quien recibe esto. */
export interface PlanPatch {
  seatRows?: SeatRowSpec[];
  rowNaming?: Naming;
  seatNaming?: Naming;
}

export interface SeatRowsEditorProps {
  zone: Zone;
  /** Where row A sits, so the names shown here are the ones that end up on the tickets. */
  rowAOrigin: RowOrigin;
  onChange: (patch: PlanPatch) => void;
}

/**
 * The room, row by row.
 *
 * This replaces a single text box that asked for "12, 11, 11, 9". That box could describe the
 * lengths of the rows and nothing else, so a room with a central gangway, a staggered stand or a
 * block numbered from 101 was simply not expressible -- and reading a list of sixteen commas told
 * nobody anything about the room it stood for.
 *
 * Here each row is a line you can see and touch: its name, how many seats it has, a nudge to
 * shift it half a seat, where its numbering starts and which way it runs. The drawing beside each
 * row is the row, with the real seat numbers on it, so what you set is what the buyer will see.
 *
 * Why rows and not free dragging: seats snap to their row because the numbering is derived from
 * the position. Dragging a chair anywhere would either renumber the row under you or leave the
 * label lying about where the seat is -- and a ticket that says A7 has to be the seventh seat of
 * row A in the actual room. Shifting a whole row, punching aisles and sliding a seat into the
 * aisle next to it cover the irregular shapes (curved stands, blocks that narrow at the back,
 * boxes) without ever breaking that.
 */
export function SeatRowsEditor({ zone, rowAOrigin, onChange }: SeatRowsEditorProps) {
  const rows = normaliseSeatRows(zone);
  const rowNaming: Naming = zone.rowNaming ?? "letters";
  const seatNaming: Naming = zone.seatNaming ?? "numbers";
  const seats = buildSeatGrid({ ...zone, seatRows: rows, rowAOrigin, rowNaming, seatNaming });
  const total = capacityOfSeatRows(rows) ?? 0;
  const { tip, capa } = useTips();

  // "Multiplicar" es lo natural cuando conoces la sala; "dividir", cuando lo que te han dado es
  // un aforo total. Son la misma rejilla contada al reves, asi que se elige una u otra.
  const [modo, setModo] = useState<"multiplicar" | "dividir">("multiplicar");
  const [campoFilas, setCampoFilas] = useState("");
  const [campoButacas, setCampoButacas] = useState("");
  const [campoTotal, setCampoTotal] = useState("");
  const [confirmandoRejilla, setConfirmandoRejilla] = useState(false);

  /** Fila sobre la que se va a actuar. Se queda marcada para no perderla de vista. */
  const [filaActiva, setFilaActiva] = useState<number | null>(null);
  /** Butaca abierta para actuar sobre ella, por fila y posicion. */
  const [butacaAbierta, setButacaAbierta] = useState<{ fila: number; slot: number } | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");

  function commit(next: SeatRowSpec[]) {
    onChange({ seatRows: next });
  }

  function patchRow(index: number, patch: Partial<SeatRowSpec>) {
    commit(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function reemplazarFila(index: number, fila: SeatRowSpec) {
    commit(rows.map((row, i) => (i === index ? fila : row)));
  }

  const filasPedidas = Math.max(0, Math.floor(Number(campoFilas) || 0));
  const butacasPedidas = Math.max(0, Math.floor(Number(campoButacas) || 0));
  const totalPedido = Math.max(0, Math.floor(Number(campoTotal) || 0));
  // Dividir no siempre da exacto: 100 entre 8 son 6 filas de 13 y 2 de 12. El resto se reparte
  // entre las primeras filas, que es como se llena una sala de verdad.
  const rejillaPedida =
    modo === "multiplicar"
      ? rectangleSeatRows(filasPedidas, butacasPedidas)
      : filasPedidas > 0 && totalPedido > 0
        ? repartirEnFilas(totalPedido, filasPedidas)
        : [];
  const puedeCrearRejilla = rejillaPedida.length > 0;

  function aplicarRejilla() {
    if (!puedeCrearRejilla) return;
    commit(rejillaPedida);
    setCampoFilas("");
    setCampoButacas("");
    setCampoTotal("");
    setConfirmandoRejilla(false);
    setFilaActiva(null);
    setButacaAbierta(null);
  }

  function anadirFila(donde: "arriba" | "abajo") {
    const modelo = rows[donde === "arriba" ? 0 : rows.length - 1];
    const nueva: SeatRowSpec = { slots: modelo?.slots ?? 10, gaps: modelo?.gaps, offset: modelo?.offset };
    commit(donde === "arriba" ? [nueva, ...rows] : [...rows, nueva]);
    setFilaActiva(donde === "arriba" ? 0 : rows.length);
    setButacaAbierta(null);
  }

  // Butacas por fila y posicion, para que cada linea pueda ensenar sus nombres reales.
  const butacasPorFila = new Map<number, Map<number, string>>();
  const nombrePorFila = new Map<number, string>();
  for (const seat of seats) {
    if (!butacasPorFila.has(seat.rowIndex)) butacasPorFila.set(seat.rowIndex, new Map());
    butacasPorFila.get(seat.rowIndex)!.set(seat.colIndex, seat.numberLabel);
    nombrePorFila.set(seat.rowIndex, seat.rowLabel);
  }

  const botonAnadir = (donde: "arriba" | "abajo") => (
    <Button
      type="button"
      variant="outline"
      className="h-9 w-full justify-center gap-2 text-xs"
      {...tip(donde === "arriba" ? "Anadir una fila delante de todas" : "Anadir una fila detras de todas")}
      onClick={() => anadirFila(donde)}
    >
      <Icon name="plus" size={14} />
      Anadir fila {donde === "arriba" ? "arriba" : "abajo"}
    </Button>
  );

  return (
    <section className="flex flex-col gap-3 rounded-md border-2 border-foreground bg-surface p-4">
      {capa}

      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Filas y butacas de {zone.name}</h3>
        <p className="text-sm text-muted-foreground">
          {total} {total === 1 ? "butaca" : "butacas"} en {rows.length} {rows.length === 1 ? "fila" : "filas"}
        </p>
      </header>

      <div className="flex flex-col gap-2 rounded-md border-2 border-border bg-background p-3">
        <div className="inline-flex w-fit rounded-md border-2 border-foreground bg-surface p-0.5">
          {(["multiplicar", "dividir"] as const).map((opcion) => (
            <button
              key={opcion}
              type="button"
              aria-pressed={modo === opcion}
              {...tip(
                opcion === "multiplicar"
                  ? "Se cuantas filas hay y cuantas butacas tiene cada una"
                  : "Se el total de butacas y en cuantas filas va"
              )}
              onClick={() => {
                setModo(opcion);
                setConfirmandoRejilla(false);
              }}
              className={cn(
                "rounded-sm px-3 py-1.5 text-xs font-extrabold uppercase",
                modo === opcion ? "bg-foreground text-background" : "text-foreground"
              )}
            >
              {opcion === "multiplicar" ? "Filas x butacas" : "Total / filas"}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {modo === "dividir" && (
            <>
              <CampoNumero
                id="grid-total"
                etiqueta="Total de butacas"
                marcador="500"
                valor={campoTotal}
                onChange={setCampoTotal}
                ancho="w-28"
              />
              <span className="pb-2 text-lg font-semibold">/</span>
            </>
          )}
          <CampoNumero
            id="grid-rows"
            etiqueta="Filas"
            marcador="10"
            valor={campoFilas}
            onChange={setCampoFilas}
            ancho="w-20"
          />
          {modo === "multiplicar" && (
            <>
              <span className="pb-2 text-lg font-semibold">x</span>
              <CampoNumero
                id="grid-seats"
                etiqueta="Butacas por fila"
                marcador="12"
                valor={campoButacas}
                onChange={setCampoButacas}
                ancho="w-24"
              />
            </>
          )}

          {/* Rehacer la rejilla tira los pasillos y desplazamientos ya puestos, asi que avisa. */}
          {confirmandoRejilla ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-destructive">
                Esto rehace la zona entera y pierde los pasillos y desplazamientos que ya tengas.
              </span>
              <Button type="button" variant="destructive" className="h-10 px-3 text-xs" onClick={aplicarRejilla}>
                Rehacer
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 px-3 text-xs"
                onClick={() => setConfirmandoRejilla(false)}
              >
                Cancelar
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="h-10 px-3 text-xs"
              disabled={!puedeCrearRejilla}
              {...tip("Crea la zona entera con esa forma")}
              onClick={() => (rows.length === 0 ? aplicarRejilla() : setConfirmandoRejilla(true))}
            >
              Crear la rejilla
            </Button>
          )}

          {puedeCrearRejilla && modo === "dividir" && (
            <span className="pb-2 text-xs text-muted-foreground">
              {describirReparto(rejillaPedida)}
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          Para una sala rectangular, con esto ya esta. Despues puedes retocar fila a fila: pulsa
          una butaca para quitarla, moverla o cambiarle el nombre, y usa las flechas para
          desplazar la fila media butaca, que es como se dibujan los graderios curvos.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs">
        <Alternador
          etiqueta="Filas"
          valor={rowNaming}
          textoLetras="A, B, C"
          textoNumeros="1, 2, 3"
          tip={tip}
          onChange={(naming) => onChange({ rowNaming: naming })}
        />
        <Alternador
          etiqueta="Butacas"
          valor={seatNaming}
          textoLetras="A, B, C"
          textoNumeros="1, 2, 3"
          tip={tip}
          onChange={(naming) => onChange({ seatNaming: naming })}
        />
      </div>

      {rows.length > 0 && botonAnadir("arriba")}

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
          const numeros = butacasPorFila.get(index) ?? new Map<number, string>();
          const name = nombrePorFila.get(index) ?? "";
          const offset = row.offset ?? 0;
          const activa = filaActiva === index;
          const abierta = butacaAbierta?.fila === index ? butacaAbierta.slot : null;
          return (
            <div key={index} className="flex flex-col">
              <div
                // Al pasar el raton, la fila se aclara; al pulsarla se queda marcada. Sin esto, en
                // una zona de cien filas no hay forma de saber cual estas tocando.
                onPointerDown={() => setFilaActiva(index)}
                className={cn(
                  "flex min-w-max items-center gap-2 rounded-md border-2 p-1.5 transition-colors",
                  activa
                    ? "border-foreground bg-[hsl(var(--accent)/0.5)]"
                    : "border-border bg-background hover:border-foreground hover:bg-[hsl(var(--accent)/0.18)]"
                )}
              >
                <label className="sr-only" htmlFor={`row-label-${index}`}>
                  Nombre de la fila {name}
                </label>
                <input
                  id={`row-label-${index}`}
                  value={row.label ?? ""}
                  placeholder={name}
                  maxLength={8}
                  {...tip(`Como se llama esta fila en la sala (ahora, ${name})`)}
                  onChange={(e) => patchRow(index, { label: e.target.value || null })}
                  className="h-8 w-14 shrink-0 rounded-md border-2 border-foreground bg-surface px-1 text-center text-sm font-semibold"
                />

                <div className="flex w-[88px] shrink-0 items-center justify-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8 w-7 shrink-0 p-0 shadow-none"
                    aria-label={`Quitar una butaca de la fila ${name}`}
                    {...tip(`Una butaca menos en la fila ${name}`)}
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
                    aria-label={`Anadir una butaca a la fila ${name}`}
                    {...tip(`Una butaca mas en la fila ${name}`)}
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
                    {...tip("Mueve la fila entera media butaca a la izquierda")}
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
                    {...tip("Mueve la fila entera media butaca a la derecha")}
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
                  {...tip("Por que numero empieza la fila (hay salas que empiezan en 101)")}
                  onChange={(e) => patchRow(index, { startNumber: Math.max(1, Number(e.target.value) || 1) })}
                  className="h-8 w-14 shrink-0 rounded-md border-2 border-foreground bg-surface px-1 text-center text-sm"
                />

                <Button
                  type="button"
                  variant="outline"
                  className="h-8 w-10 shrink-0 p-0 text-xs shadow-none"
                  aria-pressed={Boolean(row.reversed)}
                  aria-label={`Numerar la fila ${name} ${row.reversed ? "de izquierda a derecha" : "de derecha a izquierda"}`}
                  {...tip(row.reversed ? "Ahora numera de derecha a izquierda" : "Ahora numera de izquierda a derecha")}
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
                    {...tip("Copia esta fila justo debajo")}
                    onClick={() =>
                      commit([...rows.slice(0, index + 1), { ...row, label: null }, ...rows.slice(index + 1)])
                    }
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
                    {...tip("Borra esta fila entera")}
                    onClick={() => {
                      commit(rows.filter((_, i) => i !== index));
                      setFilaActiva(null);
                      setButacaAbierta(null);
                    }}
                  >
                    <Icon name="trash" size={13} />
                  </Button>
                </div>

                {/* La fila. Los mandos de la izquierda son todos de ancho fijo, asi que el dibujo
                    de todas empieza en el mismo sitio y el bloque se lee como la sala que es. */}
                <div className="flex items-center gap-0.5" style={{ marginLeft: `${offset * 0.55}rem` }}>
                  {Array.from({ length: row.slots }, (_, slotIndex) => {
                    const numero = numeros.get(slotIndex);
                    const esPasillo = numero === undefined;
                    const slot = slotIndex + 1;
                    const estaAbierta = abierta === slot;
                    return (
                      <button
                        key={slotIndex}
                        type="button"
                        aria-label={
                          esPasillo
                            ? `Posicion ${slot} de la fila ${name}: pasillo. Pulsa para poner una butaca`
                            : `Butaca ${name}${numero}. Pulsa para quitarla, moverla o cambiarle el nombre`
                        }
                        aria-expanded={estaAbierta}
                        onClick={() => {
                          setFilaActiva(index);
                          setNombreNuevo(row.names?.[String(slot)] ?? "");
                          setButacaAbierta(estaAbierta ? null : { fila: index, slot });
                        }}
                        className={cn(
                          "h-6 w-6 shrink-0 rounded-t-md border-2 text-[9px] font-semibold leading-none",
                          esPasillo
                            ? "border-dotted border-muted-foreground bg-transparent text-muted-foreground"
                            : "border-foreground bg-surface-alt text-foreground",
                          estaAbierta && "ring-2 ring-primary ring-offset-1"
                        )}
                      >
                        {esPasillo ? "" : numero}
                      </button>
                    );
                  })}
                </div>
              </div>

              {abierta !== null && (
                <AccionesDeButaca
                  fila={row}
                  nombreFila={name}
                  slot={abierta}
                  esPasillo={numeros.get(abierta - 1) === undefined}
                  nombreActual={numeros.get(abierta - 1) ?? ""}
                  nombreNuevo={nombreNuevo}
                  onNombreNuevo={setNombreNuevo}
                  tip={tip}
                  onFila={(next) => reemplazarFila(index, next)}
                  onCerrar={() => setButacaAbierta(null)}
                  onMovida={(slot) => setButacaAbierta({ fila: index, slot })}
                />
              )}
            </div>
          );
        })}
      </div>

      {botonAnadir("abajo")}
    </section>
  );
}

/** Lo que se puede hacer con una butaca concreta, debajo de su fila. */
function AccionesDeButaca({
  fila,
  nombreFila,
  slot,
  esPasillo,
  nombreActual,
  nombreNuevo,
  onNombreNuevo,
  tip,
  onFila,
  onCerrar,
  onMovida
}: {
  fila: SeatRowSpec;
  nombreFila: string;
  slot: number;
  esPasillo: boolean;
  nombreActual: string;
  nombreNuevo: string;
  onNombreNuevo: (valor: string) => void;
  tip: (texto: string) => ReturnType<ReturnType<typeof useTips>["tip"]>;
  onFila: (next: SeatRowSpec) => void;
  onCerrar: () => void;
  onMovida: (slot: number) => void;
}) {
  const gaps = new Set(fila.gaps ?? []);
  const puedeMover = (direccion: -1 | 1) => {
    const destino = slot + direccion;
    return !esPasillo && destino >= 1 && destino <= fila.slots && gaps.has(destino);
  };

  return (
    <div
      role="group"
      aria-label={`Acciones de la posicion ${slot} de la fila ${nombreFila}`}
      className="ml-6 flex min-w-max flex-wrap items-center gap-2 rounded-b-md border-2 border-t-0 border-foreground bg-surface-alt p-2"
    >
      <span className="text-xs font-semibold">
        {esPasillo ? `Pasillo (posicion ${slot})` : `Butaca ${nombreFila}${nombreActual}`}
      </span>

      <Button
        type="button"
        variant="outline"
        className="h-8 px-2 text-xs shadow-none"
        {...tip(esPasillo ? "Vuelve a haber butaca aqui" : "Aqui no hay butaca: es pasillo o hueco")}
        onClick={() => onFila(toggleRowGap(fila, slot))}
      >
        {esPasillo ? "Poner butaca" : "Quitar (pasillo)"}
      </Button>

      {!esPasillo && (
        <>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 p-0 text-xs shadow-none"
            aria-label="Mover la butaca una posicion a la izquierda"
            {...tip("Solo se puede mover al hueco de al lado")}
            disabled={!puedeMover(-1)}
            onClick={() => {
              onFila(moveSeatSlot(fila, slot, -1));
              onMovida(slot - 1);
            }}
          >
            &#9664;
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-8 w-8 p-0 text-xs shadow-none"
            aria-label="Mover la butaca una posicion a la derecha"
            {...tip("Solo se puede mover al hueco de al lado")}
            disabled={!puedeMover(1)}
            onClick={() => {
              onFila(moveSeatSlot(fila, slot, 1));
              onMovida(slot + 1);
            }}
          >
            &#9654;
          </Button>

          <label className="sr-only" htmlFor={`seat-name-${slot}`}>
            Nombre de la butaca {nombreFila}
            {nombreActual}
          </label>
          <input
            id={`seat-name-${slot}`}
            value={nombreNuevo}
            maxLength={8}
            placeholder={nombreActual}
            {...tip("Como la llama la sala, si no es el numero que le toca")}
            onChange={(e) => onNombreNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              onFila(renameSeatSlot(fila, slot, e.currentTarget.value));
            }}
            className="h-8 w-20 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
          />
          <Button
            type="button"
            variant="outline"
            className="h-8 px-2 text-xs shadow-none"
            {...tip("Le pone ese nombre a esta butaca")}
            onClick={() => onFila(renameSeatSlot(fila, slot, nombreNuevo))}
          >
            Cambiar el nombre
          </Button>
          {fila.names?.[String(slot)] !== undefined && (
            <Button
              type="button"
              variant="outline"
              className="h-8 px-2 text-xs shadow-none"
              {...tip("Vuelve al numero que le toca por su sitio")}
              onClick={() => {
                onNombreNuevo("");
                onFila(renameSeatSlot(fila, slot, null));
              }}
            >
              Quitar el nombre
            </Button>
          )}
        </>
      )}

      <Button type="button" variant="outline" className="ml-auto h-8 px-2 text-xs shadow-none" onClick={onCerrar}>
        Cerrar
      </Button>
    </div>
  );
}

function CampoNumero({
  id,
  etiqueta,
  marcador,
  valor,
  onChange,
  ancho
}: {
  id: string;
  etiqueta: string;
  marcador: string;
  valor: string;
  onChange: (valor: string) => void;
  ancho: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-semibold">
        {etiqueta}
      </label>
      <input
        id={id}
        type="number"
        min="1"
        max="2000"
        inputMode="numeric"
        placeholder={marcador}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-10 rounded-md border-2 border-foreground bg-surface px-2 text-sm", ancho)}
      />
    </div>
  );
}

function Alternador({
  etiqueta,
  valor,
  textoLetras,
  textoNumeros,
  tip,
  onChange
}: {
  etiqueta: string;
  valor: Naming;
  textoLetras: string;
  textoNumeros: string;
  tip: (texto: string) => ReturnType<ReturnType<typeof useTips>["tip"]>;
  onChange: (naming: Naming) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-bold uppercase tracking-wide text-muted-foreground">{etiqueta}</span>
      <div className="inline-flex rounded-md border-2 border-foreground bg-surface p-0.5">
        {(["letters", "numbers"] as const).map((opcion) => (
          <button
            key={opcion}
            type="button"
            aria-pressed={valor === opcion}
            aria-label={`${etiqueta} con ${opcion === "letters" ? "letras" : "numeros"}`}
            {...tip(`${etiqueta} con ${opcion === "letters" ? "letras" : "numeros"}`)}
            onClick={() => onChange(opcion)}
            className={cn(
              "rounded-sm px-2 py-1 text-[11px] font-extrabold",
              valor === opcion ? "bg-foreground text-background" : "text-foreground"
            )}
          >
            {opcion === "letters" ? textoLetras : textoNumeros}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Reparte un total entre filas, dando el resto a las primeras: 100 en 8 filas son 13, 13, 13, 13,
 * 12, 12, 12, 12. Es como se llena una sala, y no deja una ultima fila ridicula.
 */
export function repartirEnFilas(total: number, filas: number): SeatRowSpec[] {
  if (total <= 0 || filas <= 0) return [];
  const base = Math.floor(total / filas);
  const resto = total % filas;
  if (base === 0) return Array.from({ length: total }, () => ({ slots: 1 }));
  return Array.from({ length: filas }, (_, i) => ({ slots: base + (i < resto ? 1 : 0) }));
}

/** "6 filas de 13 y 2 de 12", para ver el reparto antes de aplicarlo. */
export function describirReparto(rows: SeatRowSpec[]): string {
  if (rows.length === 0) return "";
  const grupos: { slots: number; veces: number }[] = [];
  for (const row of rows) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.slots === row.slots) ultimo.veces += 1;
    else grupos.push({ slots: row.slots, veces: 1 });
  }
  return grupos
    .map((grupo, i) => `${grupo.veces} ${grupo.veces === 1 ? "fila" : "filas"}${i === 0 ? " de" : " de"} ${grupo.slots}`)
    .join(" y ");
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
