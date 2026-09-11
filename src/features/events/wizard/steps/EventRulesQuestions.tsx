import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event, EventRules } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { cn } from "@/shared/lib/cn";
import { resolvedRules } from "@/shared/lib/eventRules";

/**
 * Preguntas del organizador que antes vivian en un cuestionario previo al asistente y ahora estan
 * en el paso al que afectan: los limites de compra junto a los tipos de entrada, y los asientos
 * sueltos junto al plano.
 *
 * Tenerlas en una pantalla aparte obligaba a decidir cosas del plano antes de saber como seria el
 * plano. Y ademas no llegaban a ningun sitio: se guardaban en campos que la web publica no leia,
 * asi que entraditas.com vendia siempre con los limites por defecto.
 *
 * Ahora se guardan en `event.rules`, que es lo que se publica.
 */

export function QuestionSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border-2 border-foreground bg-surface p-4">
      <legend className="px-2 text-sm font-extrabold uppercase tracking-wide">{title}</legend>
      {hint && <p className="mb-3 mt-1 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

export function OptionButton({
  selected,
  onClick,
  disabled,
  children
}: {
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md border-2 px-4 py-2 text-sm font-bold transition-transform disabled:opacity-60",
        selected ? "border-foreground bg-foreground text-background" : "border-foreground bg-surface-alt"
      )}
    >
      {children}
    </button>
  );
}

function useEvent(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useSaveRules(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEvent(eventId);
  return useMutation({
    mutationFn: (patch: Partial<EventRules>) =>
      apiClient.patch<Event>(`/events/${eventId}`, { rules: { ...(event?.rules ?? {}), ...patch } }, { token: token! }),
    onSuccess: (updated) => queryClient.setQueryData(["event", eventId], updated)
  });
}

/** Paso 2, arriba: cuantas entradas se pueden comprar. */
export function PurchaseLimitsQuestion({ eventId }: { eventId: string | null }) {
  const { data: event } = useEvent(eventId);
  const save = useSaveRules(eventId);
  const rules = resolvedRules(event);
  const [maxPerOrder, setMaxPerOrder] = useState(String(rules.maxPerOrder));
  const [maxPerCustomer, setMaxPerCustomer] = useState(String(rules.maxPerCustomer));

  // Al cargar el evento se toman sus valores; hasta entonces se ensenan los de por defecto.
  useEffect(() => {
    if (!event) return;
    const loaded = resolvedRules(event);
    setMaxPerOrder(String(loaded.maxPerOrder));
    setMaxPerCustomer(String(loaded.maxPerCustomer));
  }, [event]);

  const pedido = Math.max(1, Math.floor(Number(maxPerOrder) || 1));
  // 0 es "sin tope por cliente", que es un valor valido y el que viene por defecto.
  const cliente = Math.max(0, Math.floor(Number(maxPerCustomer) || 0));
  const incoherente = cliente > 0 && cliente < pedido;
  const cambiado = event !== undefined && (pedido !== rules.maxPerOrder || cliente !== rules.maxPerCustomer);

  return (
    <QuestionSection
      title="¿Cuántas entradas se pueden comprar?"
      hint="Estos límites se aplican en entraditas.com al comprar, por pedido y por cliente. Por cliente, 0 es sin tope."
    >
      <div className="grid max-w-xl gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-semibold">
          <span>Máximo por pedido</span>
          <input
            type="number"
            min="1"
            max="100"
            step="1"
            inputMode="numeric"
            value={maxPerOrder}
            onChange={(e) => setMaxPerOrder(e.target.value)}
            className="h-10 rounded-md border-2 border-foreground bg-surface px-3 text-foreground"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          <span>Máximo por cliente</span>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            inputMode="numeric"
            value={maxPerCustomer}
            onChange={(e) => setMaxPerCustomer(e.target.value)}
            className="h-10 rounded-md border-2 border-foreground bg-surface px-3 text-foreground"
          />
        </label>
      </div>

      {/* Un tope por cliente menor que el de pedido deja un pedido maximo que nadie puede hacer. */}
      {incoherente && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          El máximo por cliente ({cliente}) es menor que el máximo por pedido ({pedido}): nadie podría hacer un pedido
          completo.
        </p>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          disabled={!eventId || !cambiado || incoherente || save.isPending}
          onClick={() => save.mutate({ maxPerOrder: pedido, maxPerCustomer: cliente })}
          className="rounded-md border-2 border-foreground bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {save.isPending ? "Guardando…" : "Guardar límites"}
        </button>
        {save.isSuccess && !cambiado && <span className="text-sm text-success">Guardado.</span>}
        {save.isError && (
          <span role="alert" className="text-sm text-destructive">
            {save.error instanceof AppError ? save.error.message : "No se pudieron guardar los límites."}
          </span>
        )}
      </div>
    </QuestionSection>
  );
}

/** Paso 3, en los asientos: si se puede dejar un asiento suelto entre dos ocupados. */
export function IsolatedSeatsQuestion({ eventId }: { eventId: string | null }) {
  const { data: event } = useEvent(eventId);
  const save = useSaveRules(eventId);
  const permitido = resolvedRules(event).allowIsolatedSeats;

  return (
    <QuestionSection
      title="¿Se permiten asientos sueltos en una fila?"
      hint="Si se desactiva, en entraditas.com no se podrá dejar un único hueco libre entre grupos. Por ejemplo, en una fila de 14 no se podrá dejar un grupo de 6 + hueco 1 + grupo de 7: los huecos libres deberán ser de 2 o más asientos."
    >
      <div className="flex flex-wrap gap-2">
        <OptionButton
          selected={!permitido}
          disabled={!eventId || save.isPending}
          onClick={() => save.mutate({ allowIsolatedSeats: false })}
        >
          No, sin huecos sueltos
        </OptionButton>
        <OptionButton
          selected={permitido}
          disabled={!eventId || save.isPending}
          onClick={() => save.mutate({ allowIsolatedSeats: true })}
        >
          Sí, se permiten
        </OptionButton>
      </div>
      {save.isError && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {save.error instanceof AppError ? save.error.message : "No se pudo guardar."}
        </p>
      )}
    </QuestionSection>
  );
}
