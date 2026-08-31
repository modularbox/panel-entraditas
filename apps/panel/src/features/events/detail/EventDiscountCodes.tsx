import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscountCode, TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { TICKET_COLOR_PALETTE, useTicketTypesQuery } from "../wizard/steps/Step4TicketTypes";

interface EventDiscountCodesProps {
  eventId: string;
}

interface TicketGroup {
  groupId: string;
  name: string;
  color: string;
}

interface DiscountDraft {
  code: string;
  type: DiscountCode["type"];
  value: string;
  maxUses: string;
  maxUsesPerCustomer: string;
  validFrom: string;
  validTo: string;
  appliesTo: string[];
}

const EMPTY_DRAFT: DiscountDraft = {
  code: "",
  type: "percent",
  value: "10",
  maxUses: "",
  maxUsesPerCustomer: "1",
  validFrom: "",
  validTo: "",
  appliesTo: []
};

function useDiscountCodesQuery(eventId: string) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["discount-codes", eventId],
    queryFn: () => apiClient.get<DiscountCode[]>(`/events/${eventId}/discount-codes`, { token: token! }),
    enabled: Boolean(token)
  });
}

function ticketGroups(ticketTypes: TicketType[]): TicketGroup[] {
  const map = new Map<string, TicketGroup>();
  for (const ticketType of ticketTypes) {
    if (!map.has(ticketType.groupId)) {
      map.set(ticketType.groupId, {
        groupId: ticketType.groupId,
        name: ticketType.name,
        color: ticketType.color ?? TICKET_COLOR_PALETTE[ticketType.sortOrder % TICKET_COLOR_PALETTE.length]!
      });
    }
  }
  return [...map.values()];
}

function inputDateTime(value?: string | null): string {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 16);
}

function isoDateTime(value: string): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function valueLabel(discount: DiscountCode): string {
  return discount.type === "percent" ? `${discount.value}%` : `${discount.value.toFixed(2).replace(".", ",")} EUR`;
}

function draftFromDiscount(discount: DiscountCode): DiscountDraft {
  return {
    code: discount.code,
    type: discount.type,
    value: String(discount.value),
    maxUses: discount.maxUses === null ? "" : String(discount.maxUses),
    maxUsesPerCustomer: discount.maxUsesPerCustomer === null ? "" : String(discount.maxUsesPerCustomer),
    validFrom: inputDateTime(discount.validFrom),
    validTo: inputDateTime(discount.validTo),
    appliesTo: discount.appliesTo
  };
}

function payloadFromDraft(draft: DiscountDraft) {
  return {
    code: draft.code,
    type: draft.type,
    value: Number(draft.value),
    maxUses: draft.maxUses ? Number(draft.maxUses) : null,
    maxUsesPerCustomer: draft.maxUsesPerCustomer ? Number(draft.maxUsesPerCustomer) : null,
    validFrom: isoDateTime(draft.validFrom),
    validTo: isoDateTime(draft.validTo),
    appliesTo: draft.appliesTo,
    status: "active" as const
  };
}

function DiscountForm({
  idPrefix,
  draft,
  groups,
  submitLabel,
  onChange,
  onSubmit,
  onCancel
}: {
  idPrefix: string;
  draft: DiscountDraft;
  groups: TicketGroup[];
  submitLabel: string;
  onChange: (draft: DiscountDraft) => void;
  onSubmit: () => void;
  onCancel?: () => void;
}) {
  function toggleGroup(groupId: string) {
    onChange({
      ...draft,
      appliesTo: draft.appliesTo.includes(groupId) ? draft.appliesTo.filter((id) => id !== groupId) : [...draft.appliesTo, groupId]
    });
  }

  return (
    <div className="grid gap-3 rounded-lg border-2 border-foreground bg-background p-4 shadow-flat md:grid-cols-[1fr_130px_130px]">
      <div>
        <label htmlFor={`${idPrefix}-code`}>Codigo</label>
        <input
          id={`${idPrefix}-code`}
          value={draft.code}
          onChange={(event) => onChange({ ...draft, code: event.target.value.toUpperCase() })}
          placeholder="VERANO20"
        />
      </div>
      <div>
        <span className="mb-1 block text-sm font-bold">Tipo</span>
        <div className="inline-flex rounded-md border-2 border-foreground bg-surface p-1">
          {(["percent", "fixed"] as const).map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={draft.type === type}
              onClick={() => onChange({ ...draft, type })}
              className={`rounded-sm px-3 py-2 text-xs font-extrabold uppercase ${draft.type === type ? "bg-primary text-primary-foreground" : "text-foreground"}`}
            >
              {type === "percent" ? "%" : "EUR"}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-value`}>Valor</label>
        <input
          id={`${idPrefix}-value`}
          type="number"
          min="0"
          step="0.01"
          value={draft.value}
          onChange={(event) => onChange({ ...draft, value: event.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-max`}>Usos maximos</label>
        <input
          id={`${idPrefix}-max`}
          type="number"
          min="1"
          value={draft.maxUses}
          onChange={(event) => onChange({ ...draft, maxUses: event.target.value })}
          placeholder="Sin limite"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-customer`}>Usos por cliente</label>
        <input
          id={`${idPrefix}-customer`}
          type="number"
          min="1"
          value={draft.maxUsesPerCustomer}
          onChange={(event) => onChange({ ...draft, maxUsesPerCustomer: event.target.value })}
          placeholder="Sin limite"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-from`}>Valido desde</label>
        <input id={`${idPrefix}-from`} type="datetime-local" value={draft.validFrom} onChange={(event) => onChange({ ...draft, validFrom: event.target.value })} />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-to`}>Valido hasta</label>
        <input id={`${idPrefix}-to`} type="datetime-local" value={draft.validTo} onChange={(event) => onChange({ ...draft, validTo: event.target.value })} />
      </div>

      <fieldset className="md:col-span-3">
        <legend>Tipos de entrada donde aplica</legend>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={draft.appliesTo.length === 0}
            onClick={() => onChange({ ...draft, appliesTo: [] })}
            className={`rounded-md border-2 px-3 py-2 text-sm font-extrabold ${draft.appliesTo.length === 0 ? "border-foreground bg-accent shadow-flat" : "border-border bg-surface"}`}
          >
            Todos
          </button>
          {groups.map((group) => (
            <button
              key={group.groupId}
              type="button"
              aria-pressed={draft.appliesTo.includes(group.groupId)}
              onClick={() => toggleGroup(group.groupId)}
              className={`inline-flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-extrabold ${
                draft.appliesTo.includes(group.groupId) ? "border-foreground bg-accent shadow-flat" : "border-border bg-surface"
              }`}
            >
              <span className="h-3 w-3 rounded-sm border border-foreground" style={{ backgroundColor: group.color }} />
              {group.name}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2 md:col-span-3">
        <Button type="button" onClick={onSubmit}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </div>
  );
}

export function EventDiscountCodes({ eventId }: EventDiscountCodesProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: discounts = [] } = useDiscountCodesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const groups = useMemo(() => ticketGroups(ticketTypes), [ticketTypes]);
  const [draft, setDraft] = useState<DiscountDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<DiscountDraft>(EMPTY_DRAFT);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
  }

  async function createDiscount() {
    setError(null);
    try {
      await apiClient.post(`/events/${eventId}/discount-codes`, payloadFromDraft(draft), { token: token! });
      setDraft(EMPTY_DRAFT);
      await refresh();
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo guardar el descuento");
    }
  }

  async function saveDiscount(discountId: string) {
    setError(null);
    try {
      await apiClient.patch(`/discount-codes/${discountId}`, payloadFromDraft(editingDraft), { token: token! });
      setEditingId(null);
      await refresh();
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo actualizar el descuento");
    }
  }

  async function setStatus(discount: DiscountCode, status: DiscountCode["status"]) {
    setError(null);
    try {
      await apiClient.patch(`/discount-codes/${discount.id}`, { ...discount, status }, { token: token! });
      await refresh();
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo cambiar el estado");
    }
  }

  async function remove(discount: DiscountCode) {
    setError(null);
    try {
      await apiClient.delete(`/discount-codes/${discount.id}`, { token: token! });
      await refresh();
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo eliminar el descuento");
    }
  }

  function appliesLabel(discount: DiscountCode): string {
    if (discount.appliesTo.length === 0) return "Todos los tipos";
    return discount.appliesTo.map((groupId) => groups.find((group) => group.groupId === groupId)?.name ?? groupId).join(", ");
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p role="alert">{error}</p>}

      <section className="flex flex-col gap-3">
        <h2>Codigos de descuento</h2>
        {discounts.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-6">
            <p className="m-0 font-display text-xl font-bold">Sin codigos creados</p>
          </div>
        ) : (
          <ul aria-label="Codigos de descuento" className="flex flex-col gap-3">
            {discounts.map((discount) => (
              <li key={discount.id} className="rounded-lg border-2 border-border bg-surface p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-sm border-2 border-foreground bg-background px-3 py-1 font-display text-xl font-extrabold">
                    {discount.code}
                  </span>
                  <span className="font-bold">{valueLabel(discount)}</span>
                  <span className="text-sm font-semibold text-muted-foreground">
                    {discount.usedCount}/{discount.maxUses ?? "sin limite"} usos
                  </span>
                  <span className="text-sm font-semibold text-muted-foreground">{appliesLabel(discount)}</span>
                  <span className={`rounded-sm px-2 py-1 text-xs font-extrabold uppercase ${discount.status === "active" ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
                    {discount.status === "active" ? "Activo" : discount.status === "paused" ? "Pausado" : "Caducado"}
                  </span>
                  <div className="ml-auto flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      onClick={() => {
                        setEditingId(discount.id);
                        setEditingDraft(draftFromDiscount(discount));
                      }}
                    >
                      <Icon name="edit" size={14} /> Editar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-8 px-2 text-xs"
                      onClick={() => void setStatus(discount, discount.status === "active" ? "paused" : "active")}
                    >
                      {discount.status === "active" ? "Pausar" : "Activar"}
                    </Button>
                    <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => void remove(discount)}>
                      <Icon name="trash" size={14} /> Eliminar
                    </Button>
                  </div>
                </div>
                {editingId === discount.id && (
                  <div className="mt-3">
                    <DiscountForm
                      idPrefix={`discount-edit-${discount.id}`}
                      draft={editingDraft}
                      groups={groups}
                      submitLabel="Guardar cambios"
                      onChange={setEditingDraft}
                      onSubmit={() => void saveDiscount(discount.id)}
                      onCancel={() => setEditingId(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2>Nuevo descuento</h2>
        <DiscountForm idPrefix="discount-new" draft={draft} groups={groups} submitLabel="Crear descuento" onChange={setDraft} onSubmit={() => void createDiscount()} />
      </section>
    </div>
  );
}
