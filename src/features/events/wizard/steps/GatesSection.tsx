import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event, Gate, TicketType, User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { NumericInput } from "@/shared/ui/NumericInput";
import { groupTicketTypes } from "./Step4TicketTypes";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";
import { LIMITES } from "@/shared/lib/formLimits";

export interface GatesSectionProps {
  eventId: string | null;
}

const CASILLA = "h-10 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground";
const ETIQUETA = "text-sm font-semibold";

const timeFormatter = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

const DIRECTION_LABEL: Record<Gate["direction"], string> = { in: "Entrada", out: "Salida", both: "Ambas" };

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

export function GatesSection({ eventId }: GatesSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const { data: gates = [] } = useGatesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const { data: zones = [] } = useZonesQuery(event?.venueId);
  const { data: team = [] } = useTeamQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [subEventMode, setSubEventMode] = useState<"all" | "specific">("all");
  const [selectedSubEventId, setSelectedSubEventId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [direction, setDirection] = useState<Gate["direction"]>("in");
  const [allowReentry, setAllowReentry] = useState(false);
  const [maxScansInput, setMaxScansInput] = useState("1");
  const [ticketTypesMode, setTicketTypesMode] = useState<"all" | "specific">("all");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);

  const canCreate = name.trim() !== "" && code.trim() !== "";

  async function createGate() {
    setError(null);
    try {
      await apiClient.post(
        `/events/${eventId}/gates`,
        {
          name,
          code,
          subEventId: subEventMode === "all" ? null : selectedSubEventId,
          zoneId: zoneId === "" ? null : zoneId,
          direction,
          allowReentry,
          maxScansPerTicket: Number(maxScansInput),
          allowedTicketTypeGroupIds: ticketTypesMode === "all" ? null : selectedGroupIds,
          opensAt: opensAt === "" ? null : new Date(opensAt).toISOString(),
          closesAt: closesAt === "" ? null : new Date(closesAt).toISOString(),
          operatorUserIds: selectedOperatorIds
        },
        { token: token! }
      );
      setName("");
      setCode("");
      setSubEventMode("all");
      setSelectedSubEventId("");
      setZoneId("");
      setDirection("in");
      setAllowReentry(false);
      setMaxScansInput("1");
      setTicketTypesMode("all");
      setSelectedGroupIds([]);
      setOpensAt("");
      setClosesAt("");
      setSelectedOperatorIds([]);
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function toggleActive(gate: Gate) {
    setError(null);
    try {
      await apiClient.patch(`/gates/${gate.id}`, { isActive: !gate.isActive }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function updateOperators(gate: Gate, operatorUserIds: string[]) {
    setError(null);
    try {
      await apiClient.patch(`/gates/${gate.id}`, { operatorUserIds }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteGate(id: string) {
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
              <fieldset>
                <legend className="text-xs font-semibold">Operadores</legend>
                {team.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No hay subusuarios en esta organización</p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {team.map((member) => (
                      <label key={member.id} className="flex items-center gap-1.5 text-xs font-medium">
                        <input
                          type="checkbox"
                          checked={gate.operatorUserIds.includes(member.id)}
                          onChange={(e) =>
                            updateOperators(
                              gate,
                              e.target.checked
                                ? [...gate.operatorUserIds, member.id]
                                : gate.operatorUserIds.filter((id) => id !== member.id)
                            )
                          }
                        />
                        {member.fullName}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            </li>
          );
        })}
      </ul>

      {/* Como en los descuentos: en rejilla y con cada casilla del ancho de lo que cabe en ella.
          Un codigo de puerta son unas letras y los escaneos por entrada, una cifra. */}
      <fieldset className="rounded-lg border-2 border-border bg-surface p-4">
        <legend className="px-2 font-display font-semibold">Nueva puerta</legend>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="gate-name" className={ETIQUETA}>
              Nombre
            </label>
            <input id="gate-name" maxLength={LIMITES.titulo} value={name} onChange={(e) => setName(e.target.value)} className={`${CASILLA} w-48`} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="gate-code" className={ETIQUETA}>
              Código
            </label>
            <input id="gate-code" maxLength={LIMITES.codigo} value={code} onChange={(e) => setCode(e.target.value)} className={`${CASILLA} w-32`} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="gate-zone" className={ETIQUETA}>
              Zona
            </label>
            <select id="gate-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={`${CASILLA} w-48`}>
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
              value={maxScansInput}
              onChange={(e) => setMaxScansInput(e.target.value)}
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
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
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
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className={`${CASILLA} w-56`}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className={ETIQUETA}>Sentido</span>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="gate-direction" checked={direction === "in"} onChange={() => setDirection("in")} />
                Entrada
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="gate-direction" checked={direction === "out"} onChange={() => setDirection("out")} />
                Salida
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="gate-direction" checked={direction === "both"} onChange={() => setDirection("both")} />
                Ambas
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" checked={allowReentry} onChange={(e) => setAllowReentry(e.target.checked)} />
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
                    checked={subEventMode === "all"}
                    onChange={() => setSubEventMode("all")}
                  />
                  Todas las sesiones
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="radio"
                    name="gate-subevent-mode"
                    checked={subEventMode === "specific"}
                    onChange={() => setSubEventMode("specific")}
                  />
                  Sesión concreta
                </label>
                {subEventMode === "specific" && (
                  <select
                    aria-label="Sesión"
                    value={selectedSubEventId}
                    onChange={(e) => setSelectedSubEventId(e.target.value)}
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
                <input type="radio" name="gate-types-mode" checked={ticketTypesMode === "all"} onChange={() => setTicketTypesMode("all")} />
                Todos los tipos de entrada
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="gate-types-mode"
                  checked={ticketTypesMode === "specific"}
                  onChange={() => setTicketTypesMode("specific")}
                />
                Tipos concretos
              </label>
            </div>
            {ticketTypesMode === "specific" && (
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                {groups.map((g) => (
                  <label key={g.groupId} className="flex items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      checked={selectedGroupIds.includes(g.groupId)}
                      onChange={(e) =>
                        setSelectedGroupIds((prev) => (e.target.checked ? [...prev, g.groupId] : prev.filter((id) => id !== g.groupId)))
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
                      checked={selectedOperatorIds.includes(member.id)}
                      onChange={(e) =>
                        setSelectedOperatorIds((prev) =>
                          e.target.checked ? [...prev, member.id] : prev.filter((id) => id !== member.id)
                        )
                      }
                    />
                    {member.fullName}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <Button type="button" onClick={createGate} disabled={!canCreate} className="mt-4">
          Crear puerta
        </Button>
      </fieldset>
    </div>
  );
}
