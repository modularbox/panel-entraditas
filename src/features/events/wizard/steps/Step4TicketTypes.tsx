import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface Step4TicketTypesProps {
  eventId: string | null;
  onSaved: (id: string) => void;
  onValidationChange?: (valid: boolean) => void;
  goNext?: () => void;
}

export const TICKET_COLOR_PALETTE = ["#0f766e", "#e13d25", "#f7c600", "#111111", "#2563eb", "#9333ea"];

export interface TicketTypeGroup {
  id: string;
  groupId: string;
  name: string;
  basePrice: number;
  quantityTotal: number | null;
  quantitySold: number;
  sortOrder: number;
  color: string;
}

export function groupTicketTypes(ticketTypes: TicketType[]): TicketTypeGroup[] {
  const byGroup = new Map<string, TicketType[]>();
  for (const tt of ticketTypes) byGroup.set(tt.groupId, [...(byGroup.get(tt.groupId) ?? []), tt]);
  return [...byGroup.values()]
    .map((rows) => ({
      id: rows[0]!.id,
      groupId: rows[0]!.groupId,
      name: rows[0]!.name,
      basePrice: rows[0]!.basePrice,
      quantityTotal: rows[0]!.quantityTotal,
      quantitySold: rows.reduce((sum, row) => sum + row.quantitySold, 0),
      sortOrder: rows[0]!.sortOrder,
      color: rows[0]!.color ?? TICKET_COLOR_PALETTE[rows[0]!.sortOrder % TICKET_COLOR_PALETTE.length]!
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function useTicketTypesQuery(eventId: string | null) {
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
  canMoveDown,
  onEdit,
  onDelete,
  isEditing,
  editName,
  editPrice,
  editQuantity,
  editColor,
  onEditName,
  onEditPrice,
  onEditQuantity,
  onEditColor,
  onSaveEdit
}: {
  group: TicketTypeGroup;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onEdit: () => void;
  onDelete: () => void;
  isEditing: boolean;
  editName: string;
  editPrice: string;
  editQuantity: string;
  editColor: string;
  onEditName: (value: string) => void;
  onEditPrice: (value: string) => void;
  onEditQuantity: (value: string) => void;
  onEditColor: (value: string) => void;
  onSaveEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: group.groupId });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className="rounded-md border-2 border-border bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <span {...attributes} {...listeners} aria-hidden="true" className="cursor-grab text-lg text-muted-foreground">
          ::
        </span>
        <span className="h-5 w-5 shrink-0 rounded-sm border-2 border-foreground" style={{ backgroundColor: group.color }} />
        <span className="min-w-48 flex-1 text-sm font-semibold">
          {group.name} - {(group.basePrice / 100).toFixed(2)} EUR - {group.quantityTotal ?? "Sin limite"} entradas
        </span>
        <Button type="button" variant="outline" onClick={() => onMove(-1)} disabled={!canMoveUp} className="h-8 px-2 text-xs">
          Subir
        </Button>
        <Button type="button" variant="outline" onClick={() => onMove(1)} disabled={!canMoveDown} className="h-8 px-2 text-xs">
          Bajar
        </Button>
        <Button type="button" variant="outline" onClick={onEdit} className="h-8 px-2 text-xs">
          <Icon name="edit" size={14} /> Editar
        </Button>
        <Button type="button" variant="outline" onClick={onDelete} className="h-8 px-2 text-xs">
          <Icon name="trash" size={14} /> Eliminar
        </Button>
      </div>
      {isEditing && (
        <div className="mt-3 rounded-md border-2 border-foreground bg-background p-3">
          <div className="grid gap-3 md:grid-cols-[1fr_140px_140px_160px_auto] md:items-end">
            <div>
              <label htmlFor={`edit-name-${group.groupId}`}>Nombre</label>
              <input id={`edit-name-${group.groupId}`} value={editName} onChange={(e) => onEditName(e.target.value)} />
            </div>
            <div>
              <label htmlFor={`edit-quantity-${group.groupId}`}>Cantidad</label>
              <input
                id={`edit-quantity-${group.groupId}`}
                type="number"
                min={Math.max(1, group.quantitySold)}
                value={editQuantity}
                onChange={(e) => onEditQuantity(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`edit-price-${group.groupId}`}>Precio (€)</label>
              <input
                id={`edit-price-${group.groupId}`}
                type="number"
                min="0"
                step="0.01"
                value={editPrice}
                onChange={(e) => onEditPrice(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`edit-color-${group.groupId}`}>Color</label>
              <input
                id={`edit-color-${group.groupId}`}
                type="color"
                value={editColor}
                onChange={(e) => onEditColor(e.target.value)}
                className="h-10 w-full rounded-md border-2 border-foreground bg-surface p-1"
              />
            </div>
            <Button type="button" onClick={onSaveEdit}>
              Guardar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function Step4TicketTypes({ eventId, onValidationChange }: Step4TicketTypesProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const groups = useMemo(() => groupTicketTypes(ticketTypes), [ticketTypes]);

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [priceEuros, setPriceEuros] = useState("0.00");
  const [quantityTotal, setQuantityTotal] = useState("");
  const [color, setColor] = useState(TICKET_COLOR_PALETTE[0]!);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPriceEuros, setEditPriceEuros] = useState("0.00");
  const [editQuantityTotal, setEditQuantityTotal] = useState("");
  const [editColor, setEditColor] = useState(TICKET_COLOR_PALETTE[0]!);
  const [scopeMode, setScopeMode] = useState<"event" | "subevents">("event");
  const [selectedSubEventIds, setSelectedSubEventIds] = useState<string[]>([]);
  const hasUnsavedTicketDraft =
    Boolean(name.trim()) ||
    Number(priceEuros) > 0 ||
    Boolean(quantityTotal.trim()) ||
    scopeMode !== "event" ||
    selectedSubEventIds.length > 0;

  useEffect(() => {
    onValidationChange?.(groups.length > 0 && !editingGroupId && !hasUnsavedTicketDraft);
  }, [editingGroupId, groups.length, hasUnsavedTicketDraft, onValidationChange]);

  async function createTicketType() {
    setError(null);
    if (!name.trim()) {
      setError("Escribe el nombre del tipo de entrada antes de guardarlo.");
      return;
    }
    if (scopeMode === "subevents" && selectedSubEventIds.length === 0) {
      setError("Selecciona al menos una sesion o cambia el alcance a todo el evento.");
      return;
    }
    const parsedQuantity = Number(quantityTotal);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
      setError("Indica cuantas entradas se pueden vender para este tipo.");
      return;
    }
    try {
      await apiClient.post(
        `/events/${eventId}/ticket-types`,
        {
          name: name.trim(),
          kind: "pago",
          basePrice: Math.round(Number(priceEuros) * 100),
          currency: "EUR",
          quantityTotal: parsedQuantity,
          minPerOrder: 1,
          maxPerOrder: 6,
          visibility: "public",
          isTransferable: true,
          isRefundable: true,
          color,
          scope: scopeMode === "event" ? "event" : { subEventIds: selectedSubEventIds }
        },
        { token: token! }
      );
      setName("");
      setPriceEuros("0.00");
      setQuantityTotal("");
      setSelectedSubEventIds([]);
      setColor(TICKET_COLOR_PALETTE[(groups.length + 1) % TICKET_COLOR_PALETTE.length]!);
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

  function openEditor(group: TicketTypeGroup) {
    setEditingGroupId(group.groupId);
    setEditName(group.name);
    setEditPriceEuros((group.basePrice / 100).toFixed(2));
    setEditQuantityTotal(String(group.quantityTotal ?? ""));
    setEditColor(group.color);
  }

  async function saveEdit(groupId: string) {
    setError(null);
    try {
      const rows = ticketTypes.filter((item) => item.groupId === groupId);
      const parsedQuantity = Number(editQuantityTotal);
      if (!Number.isInteger(parsedQuantity) || parsedQuantity <= 0) {
        setError("Indica una cantidad valida para el tipo de entrada.");
        return;
      }
      const soldCount = rows.reduce((sum, row) => sum + row.quantitySold, 0);
      if (parsedQuantity < soldCount) {
        setError(`No se puede bajar la cantidad por debajo de las ${soldCount} entradas ya vendidas.`);
        return;
      }
      await Promise.all(
        rows.map((item) =>
          apiClient.patch(
            `/ticket-types/${item.id}`,
            { name: editName, basePrice: Math.round(Number(editPriceEuros) * 100), quantityTotal: parsedQuantity, color: editColor },
            { token: token! }
          )
        )
      );
      setEditingGroupId(null);
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteGroup(groupId: string) {
    setError(null);
    try {
      const rows = ticketTypes.filter((item) => item.groupId === groupId);
      await Promise.all(rows.map((item) => apiClient.delete(`/ticket-types/${item.id}`, { token: token! })));
      if (editingGroupId === groupId) setEditingGroupId(null);
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
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
                onEdit={() => openEditor(group)}
                onDelete={() => void deleteGroup(group.groupId)}
                isEditing={editingGroupId === group.groupId}
                editName={editName}
                editPrice={editPriceEuros}
                editQuantity={editQuantityTotal}
                editColor={editColor}
                onEditName={setEditName}
                onEditPrice={setEditPriceEuros}
                onEditQuantity={setEditQuantityTotal}
                onEditColor={setEditColor}
                onSaveEdit={() => void saveEdit(group.groupId)}
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
            value={priceEuros}
            onFocus={() => {
              if (priceEuros === "0.00") setPriceEuros("");
            }}
            onChange={(e) => setPriceEuros(e.target.value)}
            onBlur={(e) => setPriceEuros(Number(e.target.value || 0).toFixed(2))}
            className="h-10 w-28 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground"
          />
          <span className="text-sm font-semibold text-muted-foreground">€</span>
        </div>

        <label htmlFor="tt-quantity">Cantidad total</label>
        <input
          id="tt-quantity"
          type="number"
          min="1"
          step="1"
          inputMode="numeric"
          value={quantityTotal}
          onChange={(e) => setQuantityTotal(e.target.value)}
          className="h-10 w-32 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground"
        />

        <label htmlFor="tt-color">Color</label>
        <div className="flex flex-wrap items-center gap-2">
          {TICKET_COLOR_PALETTE.map((item) => (
            <button
              key={item}
              type="button"
              aria-label={`Usar color ${item}`}
              aria-pressed={color === item}
              onClick={() => setColor(item)}
              className="h-9 w-9 rounded-md border-2 border-foreground"
              style={{ backgroundColor: item, boxShadow: color === item ? "0 0 0 3px hsl(var(--accent))" : undefined }}
            />
          ))}
          <input id="tt-color" type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12" />
        </div>

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

        <Button type="button" onClick={createTicketType} className="mt-4">
          Crear tipo de entrada
        </Button>
      </fieldset>
    </div>
  );
}
