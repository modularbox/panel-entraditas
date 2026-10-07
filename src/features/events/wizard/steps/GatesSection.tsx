import { useState, type Dispatch, type SetStateAction } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event, Gate, SubEvent, TicketType, User, Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { NumericInput } from "@/shared/ui/NumericInput";
import { groupTicketTypes, type TicketTypeGroup } from "./Step4TicketTypes";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useConfirm } from "@/shared/ui/useConfirm";
import { useZonesQuery } from "./useZonesQuery";
import { LIMITES } from "@/shared/lib/formLimits";

export interface GatesSectionProps {
  eventId: string | null;
}

const CASILLA = "h-10 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground";
const ETIQUETA = "text-sm font-semibold";

const timeFormatter = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

const DIRECTION_LABEL: Record<Gate["direction"], string> = { in: "Entrada", out: "Salida", both: "Ambas" };

const DIRECTION_OPTIONS: Gate["direction"][] = ["in", "out", "both"];

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useGatesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["gates", eventId],
    queryFn: () => apiClient.get<Gate[]>(`/events/${eventId}/gates`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useTicketTypesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: () => apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useTeamQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event-team", eventId],
    queryFn: () => apiClient.get<User[]>(`/events/${eventId}/team`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function formatWindow(gate: Pick<Gate, "opensAt" | "closesAt">): string {
  if (!gate.opensAt && !gate.closesAt) return "Sin restricción horaria";
  if (gate.opensAt && gate.closesAt) {
    return `${timeFormatter.format(new Date(gate.opensAt))}–${timeFormatter.format(new Date(gate.closesAt))}`;
  }
  if (gate.opensAt) return `Desde ${timeFormatter.format(new Date(gate.opensAt))}`;
  return `Hasta ${timeFormatter.format(new Date(gate.closesAt!))}`;
}

/** Lo que se puede tocar de una puerta, tanto al crearla como al editarla. */
interface PuertaFormState {
  name: string;
  code: string;
  subEventMode: "all" | "specific";
  selectedSubEventId: string;
  zoneId: string;
  direction: Gate["direction"];
  allowReentry: boolean;
  maxScansInput: string;
  ticketTypesMode: "all" | "specific";
  selectedGroupIds: string[];
  opensAt: string;
  closesAt: string;
  selectedOperatorIds: string[];
}

const PUERTA_VACIA: PuertaFormState = {
  name: "",
  code: "",
  subEventMode: "all",
  selectedSubEventId: "",
  zoneId: "",
  direction: "in",
  allowReentry: false,
  maxScansInput: "1",
  ticketTypesMode: "all",
  selectedGroupIds: [],
  opensAt: "",
  closesAt: "",
  selectedOperatorIds: []
};

/** Rellena un <input type="datetime-local"> desde la ISO guardada en la base de datos (UTC):
 * vuelve a pintar la misma hora del reloj que eligió quien la guardó. */
function aValorLocal(iso: string | null): string {
  if (!iso) return "";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const rellena = (n: number) => String(n).padStart(2, "0");
  return `${fecha.getFullYear()}-${rellena(fecha.getMonth() + 1)}-${rellena(fecha.getDate())}T${rellena(fecha.getHours())}:${rellena(fecha.getMinutes())}`;
}

function aEstadoDe(gate: Gate): PuertaFormState {
  return {
    name: gate.name,
    code: gate.code,
    subEventMode: gate.subEventId ? "specific" : "all",
    selectedSubEventId: gate.subEventId ?? "",
    zoneId: gate.zoneId ?? "",
    direction: gate.direction,
    allowReentry: gate.allowReentry,
    maxScansInput: String(gate.maxScansPerTicket),
    ticketTypesMode: gate.allowedTicketTypeGroupIds ? "specific" : "all",
    selectedGroupIds: gate.allowedTicketTypeGroupIds ?? [],
    opensAt: aValorLocal(gate.opensAt),
    closesAt: aValorLocal(gate.closesAt),
    selectedOperatorIds: gate.operatorUserIds
  };
}

/** El cuerpo que entienden POST y PATCH de puertas, a partir del formulario. */
function aCuerpoDe(v: PuertaFormState) {
  return {
    name: v.name,
    code: v.code,
    subEventId: v.subEventMode === "all" ? null : v.selectedSubEventId,
    zoneId: v.zoneId === "" ? null : v.zoneId,
    direction: v.direction,
    allowReentry: v.allowReentry,
    maxScansPerTicket: Math.max(1, Number(v.maxScansInput) || 1),
    allowedTicketTypeGroupIds: v.ticketTypesMode === "all" ? null : v.selectedGroupIds,
    opensAt: v.opensAt === "" ? null : new Date(v.opensAt).toISOString(),
    closesAt: v.closesAt === "" ? null : new Date(v.closesAt).toISOString(),
    operatorUserIds: v.selectedOperatorIds
  };
}

/** Los mismos campos en el creación que en la edición, para que "Nueva puerta" y "Editar" no se
 * acaben separando. */
function CamposDePuerta({
  valores,
  setValores,
  zones,
  subEvents,
  groups,
  team
}: {
  valores: PuertaFormState;
  setValores: Dispatch<SetStateAction<PuertaFormState>>;
  zones: Zone[];
  subEvents: SubEvent[];
  groups: TicketTypeGroup[];
  team: User[];
}) {
  const cambiar = <K extends keyof PuertaFormState>(campo: K, valor: PuertaFormState[K]) =>
    setValores((prev) => ({ ...prev, [campo]: valor }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="gate-name" className={ETIQUETA}>
          Nombre
        </label>
        <input id="gate-name" maxLength={LIMITES.titulo} value={valores.name} onChange={(e) => cambiar("name", e.target.value)} className={`${CASILLA} w-48`} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="gate-code" className={ETIQUETA}>
          Código
        </label>
        <input id="gate-code" maxLength={LIMITES.codigo} value={valores.code} onChange={(e) => cambiar("code", e.target.value)} className={`${CASILLA} w-32`} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="gate-zone" className={ETIQUETA}>
          Zona
        </label>
        <select id="gate-zone" value={valores.zoneId} onChange={(e) => cambiar("zoneId", e.target.value)} className={`${CASILLA} w-48`}>
          <option value="">Sin zona</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="gate-max-scans" className={ETIQUETA}>
          Escaneos máximos por ticket
        </label>
        <NumericInput
          id="gate-max-scans"
          min="1"
          maxLength={3}
          value={valores.maxScansInput}
          onChange={(e) => cambiar("maxScansInput", e.target.value)}
          className={`${CASILLA} w-24`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="gate-opens-at" className={ETIQUETA}>
          Abre
        </label>
        <input
          id="gate-opens-at"
          type="datetime-local"
          value={valores.opensAt}
          onChange={(e) => cambiar("opensAt", e.target.value)}
          className={`${CASILLA} w-56`}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="gate-closes-at" className={ETIQUETA}>
          Cierra
        </label>
        <input
          id="gate-closes-at"
          type="datetime-local"
          value={valores.closesAt}
          onChange={(e) => cambiar("closesAt", e.target.value)}
          className={`${CASILLA} w-56`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className={ETIQUETA}>Sentido</span>
        <div className="flex flex-wrap gap-4">
          {DIRECTION_OPTIONS.map((opcion) => (
            <label key={opcion} className="flex items-center gap-2 text-sm font-medium">
              <input type="radio" name="gate-direction" checked={valores.direction === opcion} onChange={() => cambiar("direction", opcion)} />
              {DIRECTION_LABEL[opcion]}
            </label>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 self-end text-sm font-medium">
        <input type="checkbox" checked={valores.allowReentry} onChange={(e) => cambiar("allowReentry", e.target.checked)} />
        Permite reentrada
      </label>

      {subEvents.length > 0 && (
        <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-4">
          <span className={ETIQUETA}>Sesiones</span>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="gate-subevent-mode"
                checked={valores.subEventMode === "all"}
                onChange={() => cambiar("subEventMode", "all")}
              />
              Todas las sesiones
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                name="gate-subevent-mode"
                checked={valores.subEventMode === "specific"}
                onChange={() => cambiar("subEventMode", "specific")}
              />
              Sesión concreta
            </label>
            {valores.subEventMode === "specific" && (
              <select
                aria-label="Sesión"
                value={valores.selectedSubEventId}
                onChange={(e) => cambiar("selectedSubEventId", e.target.value)}
                className={`${CASILLA} w-56`}
              >
                <option value="">Selecciona una sesión</option>
                {subEvents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-4">
        <span className={ETIQUETA}>Tipos de entrada admitidos</span>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="gate-types-mode" checked={valores.ticketTypesMode === "all"} onChange={() => cambiar("ticketTypesMode", "all")} />
            Todos los tipos de entrada
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="gate-types-mode"
              checked={valores.ticketTypesMode === "specific"}
              onChange={() => cambiar("ticketTypesMode", "specific")}
            />
            Tipos concretos
          </label>
        </div>
        {valores.ticketTypesMode === "specific" && (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {groups.map((g) => (
              <label key={g.groupId} className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={valores.selectedGroupIds.includes(g.groupId)}
                  onChange={(e) =>
                    cambiar("selectedGroupIds", e.target.checked ? [...valores.selectedGroupIds, g.groupId] : valores.selectedGroupIds.filter((id) => id !== g.groupId))
                  }
                />
                {g.name}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-4">
        <span className={ETIQUETA}>Operadores</span>
        {team.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay subusuarios en esta organización</p>
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-1.5">
            {team.map((member) => (
              <label key={member.id} className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={valores.selectedOperatorIds.includes(member.id)}
                  onChange={(e) =>
                    cambiar("selectedOperatorIds", e.target.checked ? [...valores.selectedOperatorIds, member.id] : valores.selectedOperatorIds.filter((id) => id !== member.id))
                  }
                />
                {member.fullName}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function GatesSection({ eventId }: GatesSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const { data: event } = useEventQuery(eventId);
  const { data: gates = [] } = useGatesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const { data: zones = [] } = useZonesQuery(event?.venueId);
  const { data: team = [] } = useTeamQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  const [error, setError] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<PuertaFormState>(PUERTA_VACIA);

  const gateEditado = editandoId ? gates.find((g) => g.id === editandoId) ?? null : null;
  const puedeGuardar = form.name.trim() !== "" && form.code.trim() !== "";

  function empezarEdicion(gate: Gate) {
    setEditandoId(gate.id);
    setForm(aEstadoDe(gate));
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setForm(PUERTA_VACIA);
  }

  async function createGate() {
    const zona = form.zoneId === "" ? null : zones.find((candidate) => candidate.id === form.zoneId) ?? null;
    const adonde = zona ? `en la zona "${zona.name}"` : "sin zona asignada todavía";
    const puertas = form.allowReentry ? "y deja volver a entrar con la misma entrada" : "y no deja reentrada";

    const adelante = await confirmar({
      title: "Crear la puerta",
      message: `Se crea la puerta "${form.name.trim()}" con código "${form.code.trim()}", ${DIRECTION_LABEL[form.direction].toLowerCase()} y ${adonde}. Escanea como máximo ${form.maxScansInput || "1"} ${Number(form.maxScansInput) === 1 ? "vez" : "veces"} por entrada ${puertas}.`,
      confirmLabel: "Sí, crear la puerta",
      working: "Creando..."
    });
    if (!adelante) return;

    setError(null);
    try {
      await apiClient.post(`/events/${eventId}/gates`, aCuerpoDe(form), { token: token! });
      cancelarEdicion();
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function guardarCambios() {
    if (!gateEditado) return;
    setError(null);
    try {
      await apiClient.patch(`/gates/${gateEditado.id}`, aCuerpoDe(form), { token: token! });
      cancelarEdicion();
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function toggleActive(gate: Gate) {
    const activar = !gate.isActive;
    const zona = zones.find((z) => z.id === gate.zoneId);
    const adelante = await confirmar({
      title: activar ? "Activar la puerta" : "Desactivar la puerta",
      message: activar
        ? `La puerta "${gate.name}" vuelve a comprobar entradas${zona?.name ? ` en la zona "${zona.name}"` : ""}.`
        : `La puerta "${gate.name}" deja de comprobar entradas${zona?.name ? ` en la zona "${zona.name}"` : ""}. Quien ya tenga una entrada se la deja pasar igual.`,
      confirmLabel: activar ? "Sí, activar" : "Sí, desactivar",
      danger: !activar,
      working: "Guardando..."
    });
    if (!adelante) return;

    setError(null);
    try {
      await apiClient.patch(`/gates/${gate.id}`, { isActive: !gate.isActive }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteGate(id: string) {
    const gate = gates.find((g) => g.id === id);
    const zona = zones.find((z) => z.id === gate?.zoneId);
    const adelante = await confirmar({
      title: "Eliminar la puerta",
      message: `Se elimina la puerta "${gate?.name ?? "sin nombre"}"${zona?.name ? ` de la zona "${zona.name}"` : ""} y deja de aparecer en el control de acceso. Las entradas ya validadas con ella siguen valiendo. No se puede deshacer desde aqui.`,
      confirmLabel: "Sí, eliminar",
      danger: true,
      working: "Eliminando..."
    });
    if (!adelante) return;

    setError(null);
    try {
      await apiClient.delete(`/gates/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">Guarda la información del evento para poder gestionar puertas.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Puertas" className="flex flex-col gap-2">
        {gates.map((gate) => {
          const subEventName = gate.subEventId
            ? subEvents.find((s) => s.id === gate.subEventId)?.name ?? ""
            : "Todas las sesiones";
          const zoneName = gate.zoneId ? zones.find((z) => z.id === gate.zoneId)?.name ?? "" : "Sin zona";
          const typesLabel =
            gate.allowedTicketTypeGroupIds === null
              ? "Todos los tipos de entrada"
              : groups.filter((g) => gate.allowedTicketTypeGroupIds!.includes(g.groupId)).map((g) => g.name).join(", ");
          return (
            <li key={gate.id} className="flex flex-col gap-2 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="flex-1 font-semibold">{gate.name} — {gate.code}</span>
                <Button type="button" variant="outline" onClick={() => empezarEdicion(gate)} className="h-8 px-2 text-xs">
                  Editar
                </Button>
                <Button type="button" variant="outline" onClick={() => toggleActive(gate)} className="h-8 px-2 text-xs">
                  {gate.isActive ? "Desactivar" : "Activar"}
                </Button>
                <Button type="button" variant="destructive" onClick={() => deleteGate(gate.id)} className="h-8 px-2 text-xs">
                  Eliminar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {subEventName} · {zoneName} · {DIRECTION_LABEL[gate.direction]} · Reentrada: {gate.allowReentry ? "Sí" : "No"} ·{" "}
                {typesLabel} · {formatWindow(gate)}
              </p>
            </li>
          );
        })}
      </ul>

      {/* Como en los descuentos: en rejilla y con cada casilla del ancho de lo que cabe en ella.
          Un codigo de puerta son unas letras y los escaneos por entrada, una cifra. */}
      <fieldset className="rounded-lg border-2 border-border bg-surface p-4">
        <legend className="px-2 font-display font-semibold">
          {gateEditado ? `Editar la puerta "${gateEditado.name}"` : "Nueva puerta"}
        </legend>

        <CamposDePuerta valores={form} setValores={setForm} zones={zones} subEvents={subEvents} groups={groups} team={team} />

        {gateEditado ? (
          <div className="mt-4 flex items-center gap-2">
            <Button type="button" onClick={() => void guardarCambios()} disabled={!puedeGuardar}>
              Guardar cambios
            </Button>
            <Button type="button" variant="ghost" onClick={cancelarEdicion}>
              Cancelar
            </Button>
          </div>
        ) : (
          <Button type="button" onClick={createGate} disabled={!puedeGuardar} className="mt-4">
            Crear puerta
          </Button>
        )}
      </fieldset>
    </div>
  );
}
