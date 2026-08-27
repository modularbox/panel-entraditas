import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscountCode, TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { groupTicketTypes } from "./Step4TicketTypes";

export interface DiscountCodesSectionProps {
  eventId: string | null;
}

function useDiscountCodesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["discount-codes", eventId],
    queryFn: () => apiClient.get<DiscountCode[]>(`/events/${eventId}/discount-codes`, { token: token! }),
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

function formatValue(code: Pick<DiscountCode, "type" | "value">): string {
  return code.type === "percent" ? `${code.value}%` : `${(code.value / 100).toFixed(2)} €`;
}

export function DiscountCodesSection({ eventId }: DiscountCodesSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: codes = [] } = useDiscountCodesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<DiscountCode["type"]>("percent");
  const [valueInput, setValueInput] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [maxUsesPerCustomerInput, setMaxUsesPerCustomerInput] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [appliesToMode, setAppliesToMode] = useState<"all" | "specific">("all");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  const canCreate = code.trim() !== "" && valueInput.trim() !== "";

  async function createDiscountCode() {
    setError(null);
    try {
      await apiClient.post(
        `/events/${eventId}/discount-codes`,
        {
          code,
          type,
          value: Number(valueInput),
          maxUses: maxUsesInput === "" ? null : Number(maxUsesInput),
          maxUsesPerCustomer: maxUsesPerCustomerInput === "" ? null : Number(maxUsesPerCustomerInput),
          appliesTo: appliesToMode === "all" ? null : selectedGroupIds,
          validFrom: validFrom === "" ? null : new Date(validFrom).toISOString(),
          validTo: validTo === "" ? null : new Date(validTo).toISOString()
        },
        { token: token! }
      );
      setCode("");
      setType("percent");
      setValueInput("");
      setMaxUsesInput("");
      setMaxUsesPerCustomerInput("");
      setValidFrom("");
      setValidTo("");
      setAppliesToMode("all");
      setSelectedGroupIds([]);
      await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function toggleStatus(discountCode: DiscountCode) {
    setError(null);
    try {
      await apiClient.patch(
        `/discount-codes/${discountCode.id}`,
        { status: discountCode.status === "active" ? "inactive" : "active" },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteDiscountCode(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/discount-codes/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la información del evento para poder gestionar códigos de descuento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Códigos de descuento" className="flex flex-col gap-2">
        {codes.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm">
            <span className="flex-1 font-semibold">
              <span>{c.code}</span> — {formatValue(c)}
            </span>
            <Button type="button" variant="outline" onClick={() => toggleStatus(c)} className="h-8 px-2 text-xs">
              {c.status === "active" ? "Desactivar" : "Activar"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => deleteDiscountCode(c.id)} className="h-8 px-2 text-xs">
              Eliminar
            </Button>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend>Nuevo código de descuento</legend>

        <label htmlFor="dc-code">Código</label>
        <input id="dc-code" value={code} onChange={(e) => setCode(e.target.value)} />

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="dc-type" checked={type === "percent"} onChange={() => setType("percent")} />
            Porcentaje
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="dc-type" checked={type === "fixed"} onChange={() => setType("fixed")} />
            Importe fijo
          </label>
        </div>

        <label htmlFor="dc-value">Valor</label>
        <input
          id="dc-value"
          type="number"
          min="0"
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
        />

        <label htmlFor="dc-max-uses">Usos máximos</label>
        <input
          id="dc-max-uses"
          type="number"
          min="0"
          value={maxUsesInput}
          onChange={(e) => setMaxUsesInput(e.target.value)}
          placeholder="Ilimitado"
        />

        <label htmlFor="dc-max-uses-per-customer">Usos máximos por cliente</label>
        <input
          id="dc-max-uses-per-customer"
          type="number"
          min="0"
          value={maxUsesPerCustomerInput}
          onChange={(e) => setMaxUsesPerCustomerInput(e.target.value)}
          placeholder="Ilimitado"
        />

        <label htmlFor="dc-valid-from">Válido desde</label>
        <input id="dc-valid-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />

        <label htmlFor="dc-valid-to">Válido hasta</label>
        <input id="dc-valid-to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />

        <div className="mt-2 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="dc-applies-to" checked={appliesToMode === "all"} onChange={() => setAppliesToMode("all")} />
            Todos los tipos de entrada
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="dc-applies-to"
              checked={appliesToMode === "specific"}
              onChange={() => setAppliesToMode("specific")}
            />
            Tipos concretos
          </label>
        </div>

        {appliesToMode === "specific" && (
          <fieldset>
            <legend>Selecciona los tipos de entrada</legend>
            <div className="flex flex-col gap-1.5">
              {groups.map((g) => (
                <label key={g.groupId} className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.groupId)}
                    onChange={(e) =>
                      setSelectedGroupIds((prev) =>
                        e.target.checked ? [...prev, g.groupId] : prev.filter((id) => id !== g.groupId)
                      )
                    }
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <Button type="button" onClick={createDiscountCode} disabled={!canCreate} className="mt-4">
          Crear código
        </Button>
      </fieldset>
    </div>
  );
}
