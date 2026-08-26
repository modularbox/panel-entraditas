import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SubEvent } from "@entraditas/types";
import type { RecurringPattern } from "@/shared/lib/recurringSubEvents";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface Step2ScheduleProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}

export function Step2Schedule({ eventId }: Step2ScheduleProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const [pattern, setPattern] = useState<RecurringPattern>({
    startDate: "",
    time: "21:00",
    durationMinutes: 120,
    occurrences: 1,
    intervalDays: 7,
    namePrefix: "Función"
  });
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setError(null);
    try {
      await apiClient.post<SubEvent[]>(`/events/${eventId}/sub-events/bulk`, pattern, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["sub-events", eventId] });
    } catch (err) {
      setError(err instanceof AppError ? err.message : "No se pudieron generar las funciones");
    }
  }

  async function handleDuplicateDoorsOpen() {
    setError(null);
    try {
      const [first, ...rest] = subEvents;
      if (!first) return;
      await Promise.all(
        rest.map((s) => apiClient.patch(`/sub-events/${s.id}`, { doorsOpenAt: first.doorsOpenAt }, { token: token! }))
      );
      await queryClient.invalidateQueries({ queryKey: ["sub-events", eventId] });
    } catch (err) {
      setError(err instanceof AppError ? err.message : "No se pudo copiar la hora de apertura de puertas");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <ul aria-label="Funciones" className="flex flex-col gap-2">
        {subEvents.map((s) => (
          <li key={s.id} className="rounded-md border-2 border-border bg-surface px-3 py-2 text-sm font-medium">
            {s.name}
          </li>
        ))}
      </ul>

      <fieldset>
        <legend>Generar funciones recurrentes</legend>
        <label htmlFor="startDate">Fecha de inicio</label>
        <input
          id="startDate"
          type="date"
          value={pattern.startDate}
          onChange={(e) => setPattern({ ...pattern, startDate: e.target.value })}
        />

        <label htmlFor="occurrences">Número de funciones</label>
        <input
          id="occurrences"
          type="number"
          min={1}
          value={pattern.occurrences}
          onChange={(e) => setPattern({ ...pattern, occurrences: Number(e.target.value) })}
        />

        <Button type="button" onClick={handleGenerate} className="mt-4">
          Generar funciones
        </Button>
      </fieldset>

      <Button
        type="button"
        variant="outline"
        onClick={handleDuplicateDoorsOpen}
        disabled={subEvents.length < 2}
        className="mt-2 self-start"
      >
        Copiar hora de apertura de puertas a todas
      </Button>

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
