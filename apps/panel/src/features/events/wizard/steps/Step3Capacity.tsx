import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapacityPool, Event, Venue } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface Step3CapacityProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  goNext: () => void;
}

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useVenuesQuery() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["venues"],
    queryFn: () => apiClient.get<Venue[]>("/venues", { token: token! }),
    enabled: Boolean(token)
  });
}

function useCapacityPoolsQuery(subEventId: string | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["capacity-pools", subEventId],
    queryFn: () => apiClient.get<CapacityPool[]>(`/sub-events/${subEventId}/capacity`, { token: token! }),
    enabled: Boolean(subEventId && token)
  });
}

export function Step3Capacity({ eventId, goNext }: Step3CapacityProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const { data: venues = [] } = useVenuesQuery();
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const firstSubEvent = subEvents[0];
  const { data: pools = [] } = useCapacityPoolsQuery(firstSubEvent?.id);
  const [error, setError] = useState<string | null>(null);
  const [newPoolName, setNewPoolName] = useState("");
  const [newPoolCapacity, setNewPoolCapacity] = useState(0);

  const venue = venues.find((v) => v.id === event?.venueId);

  async function updatePoolCapacity(poolId: string, totalCapacity: number) {
    setError(null);
    try {
      await apiClient.patch(`/capacity-pools/${poolId}`, { totalCapacity }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function addPool() {
    if (!firstSubEvent) return;
    const currentSum = pools.reduce((sum, p) => sum + p.totalCapacity, 0);
    if (venue && currentSum + newPoolCapacity > venue.totalCapacity) {
      setError(`El aforo total superaría la capacidad del recinto (${venue.totalCapacity})`);
      return;
    }
    setError(null);
    try {
      await apiClient.post(
        `/sub-events/${firstSubEvent.id}/capacity-pools`,
        { name: newPoolName, zoneId: null, totalCapacity: newPoolCapacity },
        { token: token! }
      );
      setNewPoolName("");
      setNewPoolCapacity(0);
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Aforos" className="flex flex-col gap-2">
        {pools.map((pool) => (
          <li
            key={pool.id}
            className="flex items-center gap-3 rounded-md border-2 border-border bg-surface px-3 py-2"
          >
            <label htmlFor={`pool-${pool.id}`} className="flex-1 text-sm font-semibold">
              {pool.name}
            </label>
            <input
              id={`pool-${pool.id}`}
              type="number"
              defaultValue={pool.totalCapacity}
              onBlur={(e) => updatePoolCapacity(pool.id, Number(e.target.value))}
              className="h-9 w-28 rounded-md border-2 border-foreground bg-background px-2 text-sm"
            />
          </li>
        ))}
      </ul>

      <fieldset>
        <legend>Añadir zona</legend>
        <label htmlFor="new-pool-name">Nombre</label>
        <input id="new-pool-name" value={newPoolName} onChange={(e) => setNewPoolName(e.target.value)} />
        <label htmlFor="new-pool-capacity">Capacidad</label>
        <input
          id="new-pool-capacity"
          type="number"
          value={newPoolCapacity}
          onChange={(e) => setNewPoolCapacity(Number(e.target.value))}
        />
        <Button type="button" onClick={addPool} className="mt-4">
          Añadir zona
        </Button>
      </fieldset>

      <Button type="button" onClick={goNext} className="mt-4 self-start">
        Continuar
      </Button>
    </div>
  );
}
