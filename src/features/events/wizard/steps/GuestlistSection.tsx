import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuestList, GuestListEntry, SubEvent } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface GuestlistSectionProps {
  eventId: string | null;
}

function useGuestListsQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["guest-lists", eventId],
    queryFn: () => apiClient.get<GuestList[]>(`/events/${eventId}/guest-lists`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useGuestListEntriesQuery(guestListId: string) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["guest-list-entries", guestListId],
    queryFn: () => apiClient.get<GuestListEntry[]>(`/guest-lists/${guestListId}/entries`, { token: token! }),
    enabled: Boolean(token)
  });
}

function quotaLabel(guestList: GuestList, count: number): string {
  return guestList.quota === null ? `${count} · Sin límite` : `${count} / ${guestList.quota}`;
}

function GuestListCard({
  guestList,
  subEvents,
  onDeleted
}: {
  guestList: GuestList;
  subEvents: SubEvent[];
  onDeleted: () => void;
}) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: entries = [] } = useGuestListEntriesQuery(guestList.id);

  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companionsInput, setCompanionsInput] = useState("0");
  const [notes, setNotes] = useState("");

  const canAdd = fullName.trim() !== "";

  async function addEntry() {
    setError(null);
    try {
      await apiClient.post(
        `/guest-lists/${guestList.id}/entries`,
        {
          fullName,
          email: email === "" ? null : email,
          phone: phone === "" ? null : phone,
          companions: Number(companionsInput),
          notes: notes === "" ? null : notes
        },
        { token: token! }
      );
      setFullName("");
      setEmail("");
      setPhone("");
      setCompanionsInput("0");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["guest-list-entries", guestList.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function toggleStatus(entry: GuestListEntry) {
    setError(null);
    try {
      await apiClient.patch(
        `/guest-list-entries/${entry.id}`,
        { status: entry.status === "pending" ? "checked_in" : "pending" },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["guest-list-entries", guestList.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteEntry(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/guest-list-entries/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["guest-list-entries", guestList.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteList() {
    setError(null);
    try {
      await apiClient.delete(`/guest-lists/${guestList.id}`, { token: token! });
      onDeleted();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  const subEventName = guestList.subEventId
    ? subEvents.find((s) => s.id === guestList.subEventId)?.name ?? ""
    : "Todos los subeventos";

  return (
    <li aria-label={guestList.name} className="flex flex-col gap-3 rounded-md border-2 border-border bg-surface px-4 py-3 text-sm">
      {error && <p role="alert">{error}</p>}
      <div className="flex items-center gap-3">
        <span className="flex-1 font-semibold">{guestList.name}</span>
        <span className="text-xs text-muted-foreground">{subEventName} · {quotaLabel(guestList, entries.length)}</span>
        <Button type="button" variant="destructive" onClick={deleteList} className="h-8 px-2 text-xs">
          Eliminar lista
        </Button>
      </div>

      <ul aria-label={`Invitados de ${guestList.name}`} className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 rounded-md border-2 border-border bg-surface-alt px-3 py-2">
            <span className="flex-1">
              <span className="font-semibold">{entry.fullName}</span>
              {" — "}
              {entry.email ?? entry.phone ?? "—"}
              {entry.companions > 0 ? ` · +${entry.companions}` : ""}
              {entry.notes ? ` · ${entry.notes}` : ""}
            </span>
            <Button type="button" variant="outline" onClick={() => toggleStatus(entry)} className="h-8 px-2 text-xs">
              {entry.status === "pending" ? "Registrado" : "Pendiente"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => deleteEntry(entry.id)} className="h-8 px-2 text-xs">
              Eliminar
            </Button>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend>Añadir invitado</legend>
        <label htmlFor={`gle-name-${guestList.id}`}>Nombre</label>
        <input id={`gle-name-${guestList.id}`} value={fullName} onChange={(e) => setFullName(e.target.value)} />

        <label htmlFor={`gle-email-${guestList.id}`}>Email</label>
        <input id={`gle-email-${guestList.id}`} value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor={`gle-phone-${guestList.id}`}>Teléfono</label>
        <input id={`gle-phone-${guestList.id}`} value={phone} onChange={(e) => setPhone(e.target.value)} />

        <label htmlFor={`gle-companions-${guestList.id}`}>Acompañantes</label>
        <input
          id={`gle-companions-${guestList.id}`}
          type="number"
          min="0"
          value={companionsInput}
          onChange={(e) => setCompanionsInput(e.target.value)}
        />

        <label htmlFor={`gle-notes-${guestList.id}`}>Notas</label>
        <input id={`gle-notes-${guestList.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <Button type="button" onClick={addEntry} disabled={!canAdd} className="mt-2">
          Añadir
        </Button>
      </fieldset>
    </li>
  );
}

export function GuestlistSection({ eventId }: GuestlistSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: guestLists = [] } = useGuestListsQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subEventMode, setSubEventMode] = useState<"all" | "specific">("all");
  const [selectedSubEventId, setSelectedSubEventId] = useState("");
  const [quotaInput, setQuotaInput] = useState("");

  const canCreate = name.trim() !== "";

  async function createGuestList() {
    setError(null);
    try {
      await apiClient.post(
        `/events/${eventId}/guest-lists`,
        {
          name,
          subEventId: subEventMode === "all" ? null : selectedSubEventId,
          quota: quotaInput === "" ? null : Number(quotaInput)
        },
        { token: token! }
      );
      setName("");
      setSubEventMode("all");
      setSelectedSubEventId("");
      setQuotaInput("");
      await queryClient.invalidateQueries({ queryKey: ["guest-lists", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">Guarda la información del evento para poder gestionar invitados.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Listas de invitados" className="flex flex-col gap-3">
        {guestLists.map((guestList) => (
          <GuestListCard
            key={guestList.id}
            guestList={guestList}
            subEvents={subEvents}
            onDeleted={() => queryClient.invalidateQueries({ queryKey: ["guest-lists", eventId] })}
          />
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend>Nueva lista</legend>
        <label htmlFor="gl-name">Nombre</label>
        <input id="gl-name" value={name} onChange={(e) => setName(e.target.value)} />

        {subEvents.length > 0 && (
          <>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="gl-subevent-mode" checked={subEventMode === "all"} onChange={() => setSubEventMode("all")} />
                Todos los subeventos
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="gl-subevent-mode"
                  checked={subEventMode === "specific"}
                  onChange={() => setSubEventMode("specific")}
                />
                Subevento concreto
              </label>
            </div>
            {subEventMode === "specific" && (
              <select aria-label="Subevento" value={selectedSubEventId} onChange={(e) => setSelectedSubEventId(e.target.value)}>
                <option value="">Selecciona un subevento</option>
                {subEvents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </>
        )}

        <label htmlFor="gl-quota">Cupo</label>
        <input id="gl-quota" type="number" min="1" value={quotaInput} onChange={(e) => setQuotaInput(e.target.value)} placeholder="Sin límite" />

        <Button type="button" onClick={createGuestList} disabled={!canCreate} className="mt-4">
          Crear lista
        </Button>
      </fieldset>
    </div>
  );
}
