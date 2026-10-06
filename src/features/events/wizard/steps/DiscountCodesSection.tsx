import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const CELDA_INPUT =
  "h-9 w-full min-w-0 rounded-md border-2 border-foreground bg-surface px-2 text-sm text-foreground";
const CELDA = "border-t border-border px-3 py-2";
const CABECERA = "border-b-2 border-border px-3 pb-2 pt-3 text-left text-xs font-semibold uppercase text-muted-foreground";

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
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [seAplicaOpen, setSeAplicaOpen] = useState(false);
  const seAplicaRef = useRef<HTMLDivElement>(null);
  const seAplicaPanelRef = useRef<HTMLDivElement>(null);
  const [seAplicaPos, setSeAplicaPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const esEspecifico = selectedGroupIds.length > 0;
  const canCreate = code.trim() !== "" && valueInput.trim() !== "";

  function formatearImporte() {
    if (valueInput.trim() === "") return;
    const num = Number(valueInput);
    setValueInput(Number.isFinite(num) ? num.toFixed(2) : valueInput);
  }

  useEffect(() => {
    if (!seAplicaOpen) return;
    function fuera(e: MouseEvent) {
      const objetivo = e.target as Node;
      if (seAplicaRef.current?.contains(objetivo) || seAplicaPanelRef.current?.contains(objetivo)) return;
      setSeAplicaOpen(false);
    }
    function cerrar() {
      setSeAplicaOpen(false);
    }
    document.addEventListener("mousedown", fuera);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [seAplicaOpen]);

  function toggleSeAplica() {
    if (seAplicaOpen) {
      setSeAplicaOpen(false);
      return;
    }
    const el = seAplicaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSeAplicaPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    setSeAplicaOpen(true);
  }

  async function createDiscountCode() {
    const descuento =
      type === "percent" ? `${Number(valueInput)}% de descuento` : `${(Number(valueInput) / 100).toFixed(2)} EUR de descuento`;
    const alcance =
      selectedGroupIds.length === 0
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
          appliesTo: selectedGroupIds.length === 0 ? null : selectedGroupIds,
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
    <div className="flex flex-col gap-3">
      {error && <p role="alert">{error}</p>}
      <div className="min-w-0 overflow-x-auto rounded-lg border-2 border-border bg-surface">
        <table aria-label="Códigos de descuento" className="w-full min-w-[920px] border-collapse text-sm">
          <caption className="px-4 pt-3 text-left font-display text-base font-semibold">Códigos de descuento</caption>
          <thead>
            <tr>
              <th scope="col" className={CABECERA}>
                Código
              </th>
              <th scope="col" className={CABECERA}>
                Importe
              </th>
              <th scope="col" className={CABECERA}>
                Tipo
              </th>
              <th scope="col" className={CABECERA}>
                Usos máx.
              </th>
              <th scope="col" className={CABECERA}>
                Por cliente
              </th>
              <th scope="col" className={CABECERA}>
                Válido desde
              </th>
              <th scope="col" className={CABECERA}>
                Válido hasta
              </th>
              <th scope="col" className={CABECERA}>
                Se aplica a
              </th>
              <th scope="col" className={`${CABECERA} text-right`}>
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => (
              <tr key={c.id}>
                <td className={`${CELDA} font-semibold`}>{c.code}</td>
                <td className={CELDA}>{formatValue(c)}</td>
                <td className={`${CELDA} text-muted-foreground`}>{c.type === "percent" ? "Porcentual" : "Importe fijo"}</td>
                <td className={`${CELDA} text-muted-foreground`}>{c.maxUses === null ? "Ilimitado" : c.maxUses}</td>
                <td className={`${CELDA} text-muted-foreground`}>
                  {c.maxUsesPerCustomer === null ? "Ilimitado" : c.maxUsesPerCustomer}
                </td>
                <td className={`${CELDA} text-muted-foreground`}>
                  {c.validFrom ? new Date(c.validFrom).toLocaleDateString("es-ES") : "—"}
                </td>
                <td className={`${CELDA} text-muted-foreground`}>
                  {c.validTo ? new Date(c.validTo).toLocaleDateString("es-ES") : "—"}
                </td>
                <td className={`${CELDA} text-muted-foreground`}>
                  {c.appliesTo === null || c.appliesTo.length === 0 ? "Todos los tipos" : "Tipos concretos"}
                </td>
                <td className={`${CELDA}`}>
                  <div className="flex justify-end gap-2">
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
                  </div>
                </td>
              </tr>
            ))}

            {/* Fila de alta: cada campo es una columna de la tabla y el tipo de importe es un
                desplegable con "Porcentual" por defecto. */}
            <tr className="align-bottom">
              <td className={CELDA}>
                <input
                  id="dc-code"
                  aria-label="Código"
                  maxLength={LIMITES.codigo}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={CELDA_INPUT}
                />
              </td>
              <td className={CELDA}>
                <NumericInput
                  id="dc-value"
                  aria-label="Importe"
                  allowDecimal
                  maxLength={7}
                  min="0"
                  value={valueInput}
                  onChange={(e) => setValueInput(e.target.value)}
                  onBlur={formatearImporte}
                  placeholder="0.00"
                  className={`${CELDA_INPUT} max-w-24`}
                />
              </td>
              <td className={CELDA}>
                <select
                  id="dc-type"
                  aria-label="Tipo de importe"
                  value={type}
                  onChange={(e) => setType(e.target.value as DiscountCode["type"])}
                  className={CELDA_INPUT}
                >
                  <option value="percent">Porcentual</option>
                  <option value="fixed">Importe fijo</option>
                </select>
              </td>
              <td className={CELDA}>
                <NumericInput
                  id="dc-max-uses"
                  aria-label="Usos máximos"
                  maxLength={6}
                  min="0"
                  value={maxUsesInput}
                  onChange={(e) => setMaxUsesInput(e.target.value)}
                  placeholder="Ilimitado"
                  className={`${CELDA_INPUT} max-w-24`}
                />
              </td>
              <td className={CELDA}>
                <NumericInput
                  id="dc-max-uses-per-customer"
                  aria-label="Usos máximos por cliente"
                  maxLength={6}
                  min="0"
                  value={maxUsesPerCustomerInput}
                  onChange={(e) => setMaxUsesPerCustomerInput(e.target.value)}
                  placeholder="Ilimitado"
                  className={`${CELDA_INPUT} max-w-24`}
                />
              </td>
              <td className={CELDA}>
                <input
                  id="dc-valid-from"
                  type="date"
                  aria-label="Válido desde"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className={CELDA_INPUT}
                />
              </td>
              <td className={CELDA}>
                <input
                  id="dc-valid-to"
                  type="date"
                  aria-label="Válido hasta"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  className={CELDA_INPUT}
                />
              </td>
              <td className={CELDA}>
                <div ref={seAplicaRef}>
                  <button
                    type="button"
                    aria-label="Se aplica a"
                    aria-expanded={seAplicaOpen}
                    onClick={toggleSeAplica}
                    className={`${CELDA_INPUT} flex items-center justify-between gap-2 text-left`}
                  >
                    <span className="min-w-0 truncate">
                      {esEspecifico ? (
                        <span className="min-w-0 truncate">
                          {selectedGroupIds
                            .map((id) => groups.find((g) => g.groupId === id)?.name ?? "")
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Ningún tipo</span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground" aria-hidden>
                      ▾
                    </span>
                  </button>
                </div>
                {seAplicaOpen &&
                  seAplicaPos &&
                  createPortal(
                    <div
                      ref={seAplicaPanelRef}
                      className="z-50 max-h-64 overflow-y-auto rounded-md border-2 border-border bg-surface p-2 shadow-lg"
                      style={{ position: "fixed", top: seAplicaPos.top, left: seAplicaPos.left, width: seAplicaPos.width }}
                    >
                      {groups.map((g) => (
                        <label key={g.groupId} className="flex items-center gap-2 px-1 py-1 text-sm font-medium">
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
                    </div>,
                    document.body
                  )}
              </td>
              <td className={CELDA}>
                <div className="flex items-end justify-end">
                  <Button type="button" onClick={() => void createDiscountCode()} disabled={!canCreate} className="shrink-0">
                    Añadir
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
