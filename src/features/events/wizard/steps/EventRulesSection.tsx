import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EVENT_RULE_DEFAULTS, type Event, type EventRules } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useWizardStore } from "../wizardStore";

export interface EventRulesSectionProps {
  eventId: string | null;
}

// `-?` quita la opcionalidad del tipo mapeado; sin el, cada clave arrastra `undefined` y no
// sirve para indexar. Todas las reglas son opcionales en el esquema, de ahi que haga falta.
type BooleanRule = {
  [K in keyof EventRules]-?: EventRules[K] extends boolean | undefined ? K : never;
}[keyof EventRules];

type NumberRule = {
  [K in keyof EventRules]-?: EventRules[K] extends number | undefined ? K : never;
}[keyof EventRules];

interface BooleanQuestion {
  kind: "boolean";
  key: BooleanRule;
  label: string;
  help: string;
  /** Etiquetas de las dos respuestas, para que la pregunta se lea sin ambiguedad. */
  yes: string;
  no: string;
}

interface NumberQuestion {
  kind: "number";
  key: NumberRule;
  label: string;
  help: string;
  min: number;
  /** Que significa el 0, cuando significa algo distinto de "cero". */
  zeroMeans?: string;
}

type Question = BooleanQuestion | NumberQuestion;

interface QuestionGroup {
  title: string;
  questions: Question[];
}

/**
 * Todas las preguntas son de respuesta cerrada -- si/no o una cantidad -- a proposito: el
 * organizador no escribe texto libre y el sistema no tiene que interpretar nada. Cada respuesta
 * se traduce en una comprobacion concreta en la venta, en la puerta o en la web publica.
 */
export const RULE_GROUPS: QuestionGroup[] = [
  {
    title: "Venta",
    questions: [
      {
        kind: "number",
        key: "minPerOrder",
        label: "Minimo de entradas por pedido",
        help: "Cuantas entradas tiene que llevarse como minimo quien compre.",
        min: 1
      },
      {
        kind: "number",
        key: "maxPerOrder",
        label: "Maximo de entradas por pedido",
        help: "Tope de entradas en una misma compra.",
        min: 1
      },
      {
        kind: "number",
        key: "maxPerCustomer",
        label: "Maximo de entradas por comprador",
        help: "Tope sumando todas sus compras a este evento.",
        min: 0,
        zeroMeans: "sin tope"
      },
      {
        kind: "boolean",
        key: "allowGuestCheckout",
        label: "Comprar sin crear cuenta",
        help: "Si esta activado, se puede comprar solo con un email, sin registrarse.",
        yes: "Se puede comprar como invitado",
        no: "Hay que registrarse para comprar"
      }
    ]
  },
  {
    title: "Asientos",
    questions: [
      {
        kind: "boolean",
        key: "allowIsolatedSeats",
        label: "Dejar asientos aislados",
        help: "Un asiento aislado es una butaca suelta entre dos ocupadas, que luego casi nunca se vende.",
        yes: "Se permite dejar huecos de un asiento",
        no: "La venta impide dejar huecos de un asiento"
      },
      {
        kind: "boolean",
        key: "allowSeatSelection",
        label: "Elegir butaca concreta",
        help: "Si se desactiva, el sistema asigna automaticamente las mejores butacas libres.",
        yes: "El comprador elige su butaca",
        no: "El sistema asigna la butaca"
      },
      {
        kind: "number",
        key: "maxContiguousSeats",
        label: "Maximo de asientos seguidos por pedido",
        help: "Evita que una sola compra se lleve una fila entera.",
        min: 0,
        zeroMeans: "sin tope"
      }
    ]
  },
  {
    title: "Titular de la entrada",
    questions: [
      {
        kind: "boolean",
        key: "requiresAttendeeName",
        label: "Entrada nominativa",
        help: "Pedir nombre y apellidos de cada asistente, no solo de quien paga.",
        yes: "Se pide el nombre de cada asistente",
        no: "Basta con los datos del comprador"
      },
      {
        kind: "boolean",
        key: "requiresAttendeeDocument",
        label: "Pedir documento de identidad",
        help: "Se comprueba en la puerta contra el nombre de la entrada.",
        yes: "Se pide DNI/NIE de cada asistente",
        no: "No se pide documento"
      },
      {
        kind: "boolean",
        key: "isTransferable",
        label: "Ceder la entrada a otra persona",
        help: "Al ceder se genera un QR nuevo y el anterior deja de valer.",
        yes: "Se puede ceder",
        no: "La entrada no se puede ceder"
      }
    ]
  },
  {
    title: "Acceso en puerta",
    questions: [
      {
        kind: "boolean",
        key: "allowReentry",
        label: "Permitir reentrada",
        help: "Salir del recinto y volver a entrar con la misma entrada.",
        yes: "Se permite salir y volver a entrar",
        no: "Una vez dentro, no se puede reentrar"
      },
      {
        kind: "number",
        key: "maxScansPerTicket",
        label: "Escaneos permitidos por entrada",
        help: "Cuantas veces vale el mismo QR en la puerta.",
        min: 1
      }
    ]
  },
  {
    title: "Reembolsos",
    questions: [
      {
        kind: "boolean",
        key: "isRefundable",
        label: "Admitir devoluciones",
        help: "Si se desactiva, no se puede devolver ninguna entrada de este evento.",
        yes: "Se admiten devoluciones",
        no: "No se admiten devoluciones"
      },
      {
        kind: "number",
        key: "refundDeadlineDays",
        label: "Dias antes del evento hasta los que se devuelve",
        help: "Pasado ese margen ya no se admite la devolucion.",
        min: 0,
        zeroMeans: "hasta el mismo dia"
      }
    ]
  },
  {
    title: "Lo que ve el comprador",
    questions: [
      {
        kind: "number",
        key: "minimumAge",
        label: "Edad minima",
        help: "Se avisa en la ficha del evento y se comprueba en la puerta.",
        min: 0,
        zeroMeans: "sin edad minima"
      },
      {
        kind: "boolean",
        key: "showRemainingTickets",
        label: "Mostrar entradas restantes",
        help: "Ensenar cuantas entradas quedan en la ficha del evento.",
        yes: "Se muestran las entradas que quedan",
        no: "No se muestra el numero"
      },
      {
        kind: "number",
        key: "lowStockThreshold",
        label: "Avisar de ultimas entradas cuando queden",
        help: "A partir de esa cantidad, la web marca el evento como ultimas entradas.",
        min: 0,
        zeroMeans: "no avisar"
      },
      {
        kind: "boolean",
        key: "wheelchairAccessible",
        label: "Recinto accesible",
        help: "Hay acceso y plazas para personas con movilidad reducida.",
        yes: "El recinto es accesible",
        no: "El recinto no es accesible"
      }
    ]
  }
];

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

/** Rellena las reglas sin responder con su valor por defecto, para que la pantalla no tenga huecos. */
export function withRuleDefaults(rules: EventRules | undefined): Required<EventRules> {
  return { ...EVENT_RULE_DEFAULTS, ...(rules ?? {}) };
}

export function EventRulesSection({ eventId }: EventRulesSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const draftRules = useWizardStore((s) => s.draftRules);
  const setDraftRules = useWizardStore((s) => s.setDraftRules);
  // Si se respondio antes de crear el evento, se arranca de esas respuestas y no de los valores
  // por defecto: si no, volver a este paso borraria lo contestado.
  const [rules, setRules] = useState<Required<EventRules>>(() => withRuleDefaults(draftRules ?? undefined));
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Las reglas del servidor solo se adoptan mientras el organizador no haya tocado nada. Sin
  // esta condicion, una carga que termine tarde (o la recarga posterior a cada guardado) pisa lo
  // que este escribiendo en ese momento y le revierte la respuesta sin avisar.
  const touched = useRef(false);
  useEffect(() => {
    if (!event || touched.current) return;
    setRules(withRuleDefaults(event.rules));
  }, [event]);

  async function save(next: Required<EventRules>) {
    touched.current = true;
    setRules(next);
    setError(null);
    if (!eventId) {
      // Todavia no hay evento contra el que guardar: las respuestas se quedan en el asistente y
      // viajan dentro de la peticion que lo crea.
      setDraftRules(next);
      setSavedAt(Date.now());
      return;
    }
    try {
      await apiClient.patch(`/events/${eventId}`, { rules: next }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
      setSavedAt(Date.now());
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <p role="alert">{error}</p>}
      <p className="text-sm text-muted-foreground">
        Todas las respuestas son si/no o una cantidad. Cada una se aplica sola en la venta, en la
        puerta o en la ficha publica: no hay nada que redactar.
        {!eventId && " Se guardan aqui y se aplican en cuanto crees el evento en el paso siguiente."}
      </p>

      {RULE_GROUPS.map((group) => (
        <fieldset key={group.title} className="flex flex-col gap-3 rounded-md border-2 border-border bg-surface p-4">
          <legend className="text-sm font-semibold">{group.title}</legend>

          {group.questions.map((question) => {
            if (question.kind === "boolean") {
              const value = rules[question.key];
              return (
                <div key={question.key} className="flex flex-col gap-1">
                  <span className="text-sm font-semibold">{question.label}</span>
                  <span className="text-xs text-muted-foreground">{question.help}</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {[true, false].map((option) => (
                      <button
                        key={String(option)}
                        type="button"
                        aria-pressed={value === option}
                        onClick={() => void save({ ...rules, [question.key]: option })}
                        className={`rounded-md border-2 px-3 py-1.5 text-xs font-semibold ${
                          value === option
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-background text-foreground"
                        }`}
                      >
                        {option ? question.yes : question.no}
                      </button>
                    ))}
                  </div>
                </div>
              );
            }

            const value = rules[question.key];
            return (
              <div key={question.key} className="flex flex-col gap-1">
                <label htmlFor={`rule-${question.key}`} className="text-sm font-semibold">
                  {question.label}
                </label>
                <span className="text-xs text-muted-foreground">
                  {question.help}
                  {question.zeroMeans ? ` 0 = ${question.zeroMeans}.` : ""}
                </span>
                <input
                  id={`rule-${question.key}`}
                  type="number"
                  min={question.min}
                  step="1"
                  inputMode="numeric"
                  value={value}
                  onChange={(e) => {
                    touched.current = true;
                    setRules({ ...rules, [question.key]: Math.max(question.min, Number(e.target.value) || 0) });
                  }}
                  // Se lee del propio input y no del estado: si el blur llega en el mismo ciclo
                  // que el cambio, el estado del closure todavia es el anterior y se guardaria
                  // el valor viejo.
                  onBlur={(e) => void save({ ...rules, [question.key]: Math.max(question.min, Number(e.target.value) || 0) })}
                  className="h-10 w-28 rounded-md border-2 border-foreground bg-surface px-3 text-sm"
                />
              </div>
            );
          })}
        </fieldset>
      ))}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={() => void save(rules)}>
          Guardar respuestas
        </Button>
        {savedAt !== null && (
          <span role="status" className="text-sm text-muted-foreground">
            {eventId ? "Respuestas guardadas." : "Respuestas guardadas. Se aplicaran al crear el evento."}
          </span>
        )}
      </div>
    </div>
  );
}
