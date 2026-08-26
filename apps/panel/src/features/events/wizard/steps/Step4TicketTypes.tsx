import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface Step4TicketTypesProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  onValidationChange?: (valid: boolean) => void;
}

const TICKET_TYPE_COLORS = ["#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#f97316", "#64748b"];

export interface TicketTypeGroup {
  groupId: string;
  name: string;
  basePrice: number;
  sortOrder: number;
}

export function groupTicketTypes(ticketTypes: TicketType[]): TicketTypeGroup[] {
  const byGroup = new Map<string, TicketType[]>();
  for (const tt of ticketTypes) byGroup.set(tt.groupId, [...(byGroup.get(tt.groupId) ?? []), tt]);
  return [...byGroup.values()]
    .map((rows) => ({ groupId: rows[0]!.groupId, name: rows[0]!.name, basePrice: rows[0]!.basePrice, sortOrder: rows[0]!.sortOrder }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function useTicketTypesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: () => apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function SortableRow({
  group,
  onMove,
  canMoveUp,
  canMoveDown
}: {
  group: TicketTypeGroup;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: group.groupId });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-md border-2 border-border bg-surface px-3 py-2"
    >
      <span {...attributes} {...listeners} aria-hidden="true" className="cursor-grab text-lg text-muted-foreground">
        ⠿
      </span>
      <span className="flex-1 text-sm font-semibold">
        {group.name} — {(group.basePrice / 100).toFixed(2)} €
      </span>
      <Button type="button" variant="outline" onClick={() => onMove(-1)} disabled={!canMoveUp} className="h-8 px-2 text-xs">
        Subir
      </Button>
      <Button type="button" variant="outline" onClick={() => onMove(1)} disabled={!canMoveDown} className="h-8 px-2 text-xs">
        Bajar
      </Button>
    </li>
  );
}

export function Step4TicketTypes({ eventId, onValidationChange }: Step4TicketTypesProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  useEffect(() => {
    onValidationChange?.(groups.length > 0);
  }, [groups.length, onValidationChange]);

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priceEuros, setPriceEuros] = useState("0.00");
  const [quantityInput, setQuantityInput] = useState("");
  const [color, setColor] = useState<string | null>(null);
  const [scopeMode, setScopeMode] = useState<"event" | "subevents">("event");
  const [selectedSubEventIds, setSelectedSubEventIds] = useState<string[]>([]);
  const [isFree, setIsFree] = useState(false);

  const canCreate = name.trim() !== "" && quantityInput.trim() !== "" && (isFree || priceEuros.trim() !== "");

  function toggleFree(free: boolean) {
    setIsFree(free);
    setPriceEuros("0.00");
  }

  async function createTicketType() {
    setError(null);
    try {
      await apiClient.post(
        `/events/${eventId}/ticket-types`,
        {
          name,
          kind: isFree ? "gratis" : "pago",
          basePrice: isFree ? 0 : Math.round(Number(priceEuros) * 100),
          currency: "EUR",
          quantityTotal: quantityInput === "" ? null : Number(quantityInput),
          color,
          minPerOrder: 1,
          maxPerOrder: 6,
          visibility: "public",
          isTransferable: true,
          isRefundable: true,
          scope: scopeMode === "event" ? "event" : { subEventIds: selectedSubEventIds }
        },
        { token: token! }
      );
      setName("");
      setPriceEuros("0.00");
      setQuantityInput("");
      setColor(null);
      setSelectedSubEventIds([]);
      setIsFree(false);
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function reorderTo(reordered: TicketTypeGroup[]) {
    setError(null);
    try {
      await apiClient.post(
        "/ticket-types/reorder",
        { items: reordered.map((g, index) => ({ groupId: g.groupId, sortOrder: index })) },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function moveGroup(index: number, direction: -1 | 1) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= groups.length) return;
    await reorderTo(arrayMove(groups, index, newIndex));
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g.groupId === active.id);
    const newIndex = groups.findIndex((g) => g.groupId === over.id);
    await reorderTo(arrayMove(groups, oldIndex, newIndex));
  }

  return (
    <div className="flex flex-col gap-2">
      {error && <p role="alert">{error}</p>}
      <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={groups.map((g) => g.groupId)} strategy={verticalListSortingStrategy}>
          <ul aria-label="Tipos de entrada" className="flex flex-col gap-2">
            {groups.map((group, index) => (
              <SortableRow
                key={group.groupId}
                group={group}
                onMove={(direction) => moveGroup(index, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < groups.length - 1}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <fieldset>
        <legend>Nuevo tipo de entrada</legend>
        <label htmlFor="tt-name">Nombre</label>
        <input id="tt-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="tt-price">Precio (€)</label>
        <div className="flex items-center gap-2">
          <input
            id="tt-price"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            disabled={isFree}
            value={priceEuros}
            onChange={(e) => setPriceEuros(e.target.value)}
            onBlur={(e) => setPriceEuros(Number(e.target.value || 0).toFixed(2))}
            className="h-10 w-28 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground disabled:opacity-50"
          />
          <span className="text-sm font-semibold text-muted-foreground">€</span>
        </div>

        <label className="mt-1 flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={isFree} onChange={(e) => toggleFree(e.target.checked)} />
          Gratuito
        </label>

        <label htmlFor="tt-quantity">Cantidad</label>
        <input
          id="tt-quantity"
          type="number"
          min="0"
          inputMode="numeric"
          value={quantityInput}
          onChange={(e) => setQuantityInput(e.target.value)}
          placeholder="Ilimitada"
          className="h-10 w-28 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground"
        />

        <fieldset className="mt-3">
          <legend>Color</legend>
          <div role="radiogroup" aria-label="Color" className="flex gap-2">
            {TICKET_TYPE_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={color === hex}
                aria-label={hex}
                onClick={() => setColor(hex)}
                style={{ backgroundColor: hex }}
                className={cn(
                  "h-7 w-7 rounded-full border-2",
                  color === hex ? "border-foreground ring-2 ring-offset-2 ring-foreground" : "border-transparent"
                )}
              />
            ))}
          </div>
        </fieldset>

        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="scope" checked={scopeMode === "event"} onChange={() => setScopeMode("event")} />
            Todo el evento
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="scope"
              checked={scopeMode === "subevents"}
              onChange={() => setScopeMode("subevents")}
            />
            Subeventos concretos
          </label>
        </div>

        {scopeMode === "subevents" && (
          <fieldset>
            <legend>Selecciona los subeventos</legend>
            <div className="flex flex-col gap-1.5">
              {subEvents.map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={selectedSubEventIds.includes(s.id)}
                    onChange={(e) =>
                      setSelectedSubEventIds((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id)
                      )
                    }
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <Button type="button" onClick={createTicketType} disabled={!canCreate} className="mt-4">
          Crear tipo de entrada
        </Button>
      </fieldset>
    </div>
  );
}
