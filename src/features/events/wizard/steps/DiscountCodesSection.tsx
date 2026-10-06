import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscountCode, TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { AccionConConfirmacion } from "@/shared/ui/AccionConConfirmacion";
import { useConfirm } from "@/shared/ui/useConfirm";
import { NumericInput } from "@/shared/ui/NumericInput";
import { groupTicketTypes } from "./Step4TicketTypes";
import { useSyncEventChangesToWeb } from "@/features/publish/useSyncEventChangesToWeb";
import { LIMITES } from "@/shared/lib/formLimits";

export interface DiscountCodesSectionProps {
  eventId: string | null;
}

const CASILLA = "h-10 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground";
const ETIQUETA = "text-sm font-semibold";

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
  // Fixed amounts are stored in cents; percent values are stored as-is.
  return code.type === "percent" ? `${code.value}%` : `${(code.value / 100).toFixed(2)} €`;
}

export function DiscountCodesSection({ eventId }: DiscountCodesSectionProps) {
    const token = useSessionStore((s) => s.token);
    const queryClient = useQueryClient();
    const confirmar = useConfirm();
  const { data: codes = [] } = useDiscountCodesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);
  const syncEventChanges = useSyncEventChangesToWeb(eventId);

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
    const descuento =
      type === "percent" ? `${Number(valueInput)}% de descuento` : `${(Number(valueInput) / 100).toFixed(2)} EUR de descuento`;
    const alcance =
      appliesToMode === "all"
        ? "sirve con cualquier tipo de entrada"
        : `solo sirve con ${selectedGroupIds.length} ${selectedGroupIds.length === 1 ? "tipo" : "tipos"} de entrada`;
    const usos = maxUsesInput === "" ? "" : ` y se puede usar ${maxUsesInput} veces en total`;

    const adelante = await confirmar({
      title: "Crear el código",
      message: `Se crea el código "${code.trim()}" con ${descuento}, que ${alcance}${usos}. Nadie lo podrá usar hasta que lo comparta.`,
      confirmLabel: "Sí, crear el código",
      working: "Creando..."
    });
    if (!adelante) return;

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
          // appliesTo: null means the code applies to every ticket type group.
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
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function toggleStatus(discountCode: DiscountCode) {
    const activar = discountCode.status !== "active";
    const adelante = await confirmar({
      title: activar ? "Activar el código" : "Desactivar el código",
      message: activar
        ? `Vuelve a poder usarse "${discountCode.code}" en el checkout.`
        : `Deja de poder usarse "${discountCode.code}". Los que ya lo aplicaron en una compra siguen descontados, pero nadie nuevo lo puede usar.`,
      confirmLabel: activar ? "Sí, activar" : "Sí, desactivar",
      danger: !activar,
      working: "Guardando..."
    });
    if (!adelante) return;

    setError(null);
    try {
      await apiClient.patch(
        `/discount-codes/${discountCode.id}`,
        { status: discountCode.status === "active" ? "inactive" : "active" },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
      void syncEventChanges();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteDiscountCode(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/discount-codes/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
      void syncEventChanges();
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
          // flex-wrap: en el móvil el código y sus dos botones no caben en una fila (tanda 18).
          <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 basis-40 font-semibold">
              <span>{c.code}</span> — {formatValue(c)}
            </span>
            <Button type="button" variant="outline" onClick={() => toggleStatus(c)} className="h-8 px-2 text-xs">
              {c.status === "active" ? "Desactivar" : "Activar"}
            </Button>
            <AccionConConfirmacion
              etiqueta="Eliminar"
              confirmar="Sí, eliminar"
              aviso={`El código ${c.code} dejará de poder usarse en entraditas.com.`}
              accion={async () => deleteDiscountCode(c.id)}
              compacto
            />
          </li>
        ))}
      </ul>

      {/* En flex y con cada casilla del ancho de lo que cabe en ella: una fecha ocupa lo que
          ocupa una fecha y un tope de usos son tres cifras. En una sola columna a ancho completo
          sobraba media pantalla a la derecha y parecia que cabia algo mas. Envuelve sola cuando
          la pantalla no da para las ocho casillas, en vez de romperlas todas en columnas. */}
      <fieldset className="min-w-0 rounded-lg border-2 border-border bg-surface p-4">
        <legend className="px-2 font-display font-semibold">Nuevo código de descuento</legend>

        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <div className="flex w-28 min-w-24 grow flex-col gap-1">
            <label htmlFor="dc-code" className={ETIQUETA}>
              Código
            </label>
            <input id="dc-code" maxLength={LIMITES.codigo} value={code} onChange={(e) => setCode(e.target.value)} className={`${CASILLA} w-full`} />
          </div>

          {/* Porcentaje o importe: debajo del valor, porque es la unidad de la cifra que se acaba
              de escribir. Encima se elegia la unidad antes de saber el numero. */}
          <div className="flex w-28 min-w-24 grow flex-col gap-1">
            <label htmlFor="dc-value" className={ETIQUETA}>
              Valor
            </label>
            <NumericInput
              id="dc-value"
              allowDecimal
              maxLength={7}
              min="0"
              value={valueInput}
              onChange={(e) => setValueInput(e.target.value)}
              className={`${CASILLA} w-full`}
            />
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="dc-type" checked={type === "percent"} onChange={() => setType("percent")} />
                Porcentaje
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="dc-type" checked={type === "fixed"} onChange={() => setType("fixed")} />
                Importe fijo
              </label>
            </div>
          </div>

          <div className="flex w-24 min-w-20 grow flex-col gap-1">
            <label htmlFor="dc-max-uses" className={ETIQUETA}>
              Usos máximos
            </label>
            <NumericInput
              id="dc-max-uses"
              maxLength={6}
              min="0"
              value={maxUsesInput}
              onChange={(e) => setMaxUsesInput(e.target.value)}
              placeholder="Ilimitado"
              className={`${CASILLA} w-full`}
            />
          </div>

          <div className="flex w-20 min-w-16 grow flex-col gap-1">
            <label htmlFor="dc-max-uses-per-customer" className={ETIQUETA}>
              Usos máximos por cliente
            </label>
            <NumericInput
              id="dc-max-uses-per-customer"
              maxLength={6}
              min="0"
              value={maxUsesPerCustomerInput}
              onChange={(e) => setMaxUsesPerCustomerInput(e.target.value)}
              placeholder="Ilimitado"
              className={`${CASILLA} w-full`}
            />
          </div>

          <div className="flex w-36 min-w-32 grow flex-col gap-1">
            <label htmlFor="dc-valid-from" className={ETIQUETA}>
              Válido desde
            </label>
            <input
              id="dc-valid-from"
              type="date"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className={`${CASILLA} w-full`}
            />
          </div>

          <div className="flex w-36 min-w-32 grow flex-col gap-1">
            <label htmlFor="dc-valid-to" className={ETIQUETA}>
              Válido hasta
            </label>
            <input
              id="dc-valid-to"
              type="date"
              value={validTo}
              onChange={(e) => setValidTo(e.target.value)}
              className={`${CASILLA} w-full`}
            />
          </div>

          <div className="flex w-32 min-w-28 grow flex-col gap-2">
            <span className={ETIQUETA}>Se aplica a</span>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
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
              <div className="flex flex-wrap gap-x-6 gap-y-1.5">
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
            )}
          </div>
          <Button type="button" onClick={createDiscountCode} disabled={!canCreate} className="shrink-0">
            Crear código
          </Button>
        </div>
      </fieldset>
    </div>
  );
}
