import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event, SubEvent } from "@entraditas/types";
import type { RecurringPattern } from "@/shared/lib/recurringSubEvents";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface Step2ScheduleProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  goNext?: () => void;
}

interface EditableSubEvent {
  id: string;
  name: string;
  datePending: boolean;
  date: string;
  time: string;
  durationMinutes: number;
  doorsTime: string;
}

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function isPast(date: string, time: string): boolean {
  return new Date(`${date}T${time}:00`).getTime() < Date.now();
}

function toRange(date: string, time: string, durationMinutes: number) {
  const startsAt = new Date(`${date}T${time}:00`);
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  return { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() };
}

function dateParts(value: string | null | undefined) {
  if (!value) return { date: "", time: "" };
  const date = new Date(value);
  return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(11, 16) };
}

function durationFromSubEvent(subEvent: SubEvent) {
  if (!subEvent.startsAt || !subEvent.endsAt) return 120;
  return Math.max(15, Math.round((new Date(subEvent.endsAt).getTime() - new Date(subEvent.startsAt).getTime()) / 60_000));
}

function subEventDateLabel(subEvent: SubEvent) {
  if (!subEvent.startsAt) return "Fecha por confirmar";
  const startsAt = new Date(subEvent.startsAt);
  return `${startsAt.toLocaleDateString("es-ES")} - ${startsAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

export function Step2Schedule({ eventId, goNext }: Step2ScheduleProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const eventAllowsPendingDates = Boolean(event?.datePending || !event?.startsAt);
  const [mode, setMode] = useState<"single" | "recurring">("single");
  const [single, setSingle] = useState({
    name: "Sesion unica",
    datePending: eventAllowsPendingDates,
    date: "",
    time: "21:00",
    durationMinutes: 120
  });
  const [pattern, setPattern] = useState<RecurringPattern>({
    startDate: "",
    time: "21:00",
    durationMinutes: 120,
    occurrences: 2,
    intervalDays: 7,
    namePrefix: "Sesion"
  });
  const [editing, setEditing] = useState<EditableSubEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPendingSubEvents = useMemo(() => subEvents.some((subEvent) => !subEvent.startsAt), [subEvents]);

  useEffect(() => {
    if (!eventAllowsPendingDates) return;
    setSingle((current) => (current.date || current.datePending ? current : { ...current, datePending: true }));
  }, [eventAllowsPendingDates]);

  function openEditor(subEvent: SubEvent) {
    const start = dateParts(subEvent.startsAt);
    const doors = dateParts(subEvent.doorsOpenAt);
    setEditing({
      id: subEvent.id,
      name: subEvent.name,
      datePending: !subEvent.startsAt,
      date: start.date,
      time: start.time || "21:00",
      durationMinutes: durationFromSubEvent(subEvent),
      doorsTime: doors.time
    });
  }

  function payloadFromEditor(values: Omit<EditableSubEvent, "id">) {
    if (values.datePending) return { name: values.name, startsAt: null, endsAt: null, doorsOpenAt: null };
    const range = toRange(values.date, values.time, values.durationMinutes);
    const doorsOpenAt = values.doorsTime ? new Date(`${values.date}T${values.doorsTime}:00`).toISOString() : null;
    return { name: values.name, ...range, doorsOpenAt };
  }

  async function createSingleSession() {
    setError(null);
    if (!single.name.trim()) {
      setError("Escribe el nombre de la sesion.");
      return;
    }
    if (!single.datePending && (!single.date || !single.time)) {
      setError("Elige fecha y hora para crear la sesion.");
      return;
    }
    if (!single.datePending && isPast(single.date, single.time)) {
      setError("No se pueden crear sesiones en el pasado.");
      return;
    }
    try {
      await apiClient.post<SubEvent>(
        `/events/${eventId}/sub-events`,
        payloadFromEditor({
          name: single.name,
          datePending: single.datePending,
          date: single.date,
          time: single.time,
          durationMinutes: single.durationMinutes,
          doorsTime: ""
        }),
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["sub-events", eventId] });
    } catch (err) {
      setError(err instanceof AppError ? err.message : "No se pudo crear la sesion");
    }
  }

  async function saveEditing() {
    if (!editing) return;
    setError(null);
    if (!editing.name.trim()) {
      setError("Escribe el nombre de la sesion.");
      return;
    }
    if (!editing.datePending && (!editing.date || !editing.time)) {
      setError("Elige fecha y hora para guardar la sesion.");
      return;
    }
    if (!editing.datePending && isPast(editing.date, editing.time)) {
      setError("No se pueden guardar sesiones en el pasado.");
      return;
    }
    try {
      await apiClient.patch<SubEvent>(`/sub-events/${editing.id}`, payloadFromEditor(editing), { token: token! });
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ["sub-events", eventId] });
    } catch (err) {
      setError(err instanceof AppError ? err.message : "No se pudo guardar la sesion");
    }
  }

  async function handleGenerate() {
    setError(null);
    if (!pattern.startDate || !pattern.time) {
      setError("Elige fecha y hora de inicio.");
      return;
    }
    if (isPast(pattern.startDate, pattern.time)) {
      setError("No se pueden generar sesiones en el pasado.");
      return;
    }
    try {
      await apiClient.post<SubEvent[]>(`/events/${eventId}/sub-events/bulk`, pattern, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["sub-events", eventId] });
    } catch (err) {
      setError(err instanceof AppError ? err.message : "No se pudieron generar las sesiones");
    }
  }

  async function copyFirstDoorsOpenToAll() {
    const sourceDoorsOpenAt = subEvents.find((subEvent) => subEvent.doorsOpenAt)?.doorsOpenAt;
    if (!sourceDoorsOpenAt) return;
    setError(null);
    try {
      await Promise.all(
        subEvents.map((subEvent) =>
          apiClient.patch<SubEvent>(`/sub-events/${subEvent.id}`, { doorsOpenAt: subEvent.startsAt ? sourceDoorsOpenAt : null }, { token: token! })
        )
      );
      await queryClient.invalidateQueries({ queryKey: ["sub-events", eventId] });
    } catch (err) {
      setError(err instanceof AppError ? err.message : "No se pudo copiar la hora de apertura de puertas");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {hasPendingSubEvents && (
        <div className="rounded-lg border-2 border-dashed border-foreground bg-background p-4 text-sm font-bold text-muted-foreground">
          Hay subeventos con fecha por confirmar. En la web no se venderan entradas para esas sesiones: solo aparecera la opcion de aviso.
        </div>
      )}

      {subEvents.length > 0 ? (
        <ul aria-label="Funciones" className="grid gap-2 md:grid-cols-2">
          {subEvents.map((s) => (
            <li key={s.id} className="rounded-md border-2 border-border bg-surface px-3 py-2 text-sm font-bold">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block">{s.name}</span>
                  <span className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon name={s.startsAt ? "calendar" : "bell"} size={14} />
                    {subEventDateLabel(s)}
                    {s.startsAt && ` (${durationLabel(durationFromSubEvent(s))})`}
                  </span>
                </span>
                <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => openEditor(s)}>
                  Editar
                </Button>
              </div>

              {editing?.id === s.id && (
                <div className="mt-3 rounded-md border-2 border-foreground bg-background p-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label htmlFor={`subevent-name-${s.id}`}>Nombre</label>
                      <input
                        id={`subevent-name-${s.id}`}
                        value={editing.name}
                        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                      />
                    </div>
                    <label className="flex items-center gap-2 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm font-bold md:col-span-2">
                      <input
                        type="checkbox"
                        checked={editing.datePending}
                        onChange={(e) => setEditing({ ...editing, datePending: e.target.checked })}
                      />
                      Fecha por confirmar
                    </label>
                    <div>
                      <label htmlFor={`subevent-date-${s.id}`}>Fecha</label>
                      <input
                        id={`subevent-date-${s.id}`}
                        type="date"
                        disabled={editing.datePending}
                        value={editing.date}
                        onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`subevent-time-${s.id}`}>Hora</label>
                      <input
                        id={`subevent-time-${s.id}`}
                        type="time"
                        disabled={editing.datePending}
                        value={editing.time}
                        onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`subevent-duration-${s.id}`}>Duracion minutos</label>
                      <input
                        id={`subevent-duration-${s.id}`}
                        type="number"
                        min={15}
                        step={15}
                        disabled={editing.datePending}
                        value={editing.durationMinutes}
                        onChange={(e) => setEditing({ ...editing, durationMinutes: Number(e.target.value) })}
                      />
                    </div>
                    <div>
                      <label htmlFor={`subevent-doors-${s.id}`}>Puertas</label>
                      <input
                        id={`subevent-doors-${s.id}`}
                        type="time"
                        disabled={editing.datePending}
                        value={editing.doorsTime}
                        onChange={(e) => setEditing({ ...editing, doorsTime: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button type="button" onClick={saveEditing}>
                      Guardar sesion
                    </Button>
                    <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                      Cerrar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-foreground bg-background p-4 text-sm font-bold text-muted-foreground">
          Si el evento sigue sin fecha, puedes continuar. En la web aparecera como "Fecha por confirmar".
        </div>
      )}

      <div className="inline-flex self-start rounded-md border-2 border-foreground bg-surface p-1">
        <button
          type="button"
          aria-pressed={mode === "single"}
          onClick={() => setMode("single")}
          className={`rounded-sm px-3 py-2 text-xs font-extrabold uppercase ${mode === "single" ? "bg-primary text-primary-foreground" : ""}`}
        >
          Evento unico
        </button>
        <button
          type="button"
          aria-pressed={mode === "recurring"}
          onClick={() => setMode("recurring")}
          className={`rounded-sm px-3 py-2 text-xs font-extrabold uppercase ${mode === "recurring" ? "bg-primary text-primary-foreground" : ""}`}
        >
          Varias sesiones
        </button>
      </div>

      {subEvents.length > 1 && subEvents.some((subEvent) => subEvent.doorsOpenAt) && (
        <Button type="button" variant="outline" onClick={copyFirstDoorsOpenToAll} className="self-start">
          Copiar hora de apertura de puertas a todas
        </Button>
      )}

      {mode === "single" ? (
        <fieldset>
          <legend>Anadir sesion</legend>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-2">
              <label htmlFor="session-name">Nombre</label>
              <input id="session-name" value={single.name} onChange={(e) => setSingle({ ...single, name: e.target.value })} />
            </div>
            <label className="flex items-center gap-2 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm font-bold md:col-span-2">
              <input
                type="checkbox"
                checked={single.datePending}
                onChange={(e) => setSingle({ ...single, datePending: e.target.checked })}
              />
              Fecha por confirmar
            </label>
            <div>
              <label htmlFor="session-date">Fecha</label>
              <input id="session-date" type="date" disabled={single.datePending} value={single.date} onChange={(e) => setSingle({ ...single, date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="session-time">Hora</label>
              <input id="session-time" type="time" disabled={single.datePending} value={single.time} onChange={(e) => setSingle({ ...single, time: e.target.value })} />
            </div>
            <div>
              <label htmlFor="session-duration">Duracion minutos</label>
              <input
                id="session-duration"
                type="number"
                min={15}
                step={15}
                disabled={single.datePending}
                value={single.durationMinutes}
                onChange={(e) => setSingle({ ...single, durationMinutes: Number(e.target.value) })}
              />
            </div>
          </div>
          <Button type="button" onClick={createSingleSession} className="mt-4">
            Anadir sesion
          </Button>
        </fieldset>
      ) : (
        <fieldset>
          <legend>Generar varias sesiones</legend>
          <div className="grid gap-3 md:grid-cols-5">
            <div>
              <label htmlFor="startDate">Fecha inicio</label>
              <input id="startDate" type="date" value={pattern.startDate} onChange={(e) => setPattern({ ...pattern, startDate: e.target.value })} />
            </div>
            <div>
              <label htmlFor="session-recurring-time">Hora</label>
              <input id="session-recurring-time" type="time" value={pattern.time} onChange={(e) => setPattern({ ...pattern, time: e.target.value })} />
            </div>
            <div>
              <label htmlFor="occurrences">Sesiones</label>
              <input id="occurrences" type="number" min={1} value={pattern.occurrences} onChange={(e) => setPattern({ ...pattern, occurrences: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="intervalDays">Cada</label>
              <input id="intervalDays" type="number" min={1} value={pattern.intervalDays} onChange={(e) => setPattern({ ...pattern, intervalDays: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="namePrefix">Nombre base</label>
              <input id="namePrefix" value={pattern.namePrefix} onChange={(e) => setPattern({ ...pattern, namePrefix: e.target.value })} />
            </div>
          </div>
          <Button type="button" onClick={handleGenerate} className="mt-4">
            Generar sesiones
          </Button>
        </fieldset>
      )}

      {error && <p role="alert">{error}</p>}

      <Button type="button" onClick={() => goNext?.()} className="self-start">
        Continuar
      </Button>
    </div>
  );
}

function durationLabel(minutes: number) {
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

