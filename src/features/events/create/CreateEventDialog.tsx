import { useState } from "react";
import { EVENT_RULE_DEFAULTS, type EventRules } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { NumericInput } from "@/shared/ui/NumericInput";
import { useWizardStore } from "../wizard/wizardStore";
import { OptionButton, QuestionSection } from "../wizard/steps/EventRulesQuestions";

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
 * Las mismas 6 preguntas que respondia el cuestionario antiguo antes de abrir el asistente.
 * Todas son de respuesta cerrada -- si/no o una cantidad -- a proposito: el organizador no
 * escribe texto libre y el sistema no tiene que interpretar nada. Cada respuesta se traduce en
 * una comprobacion concreta en la venta, en la puerta o en la web publica, y lo que se elige
 * aqui queda en `event.rules`, que es lo que se publica.
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

/** Rellena las reglas sin responder con su valor por defecto, para que la pantalla no tenga huecos. */
export function withRuleDefaults(rules: EventRules | null | undefined): Required<EventRules> {
  return { ...EVENT_RULE_DEFAULTS, ...(rules ?? {}) };
}

export interface CreateEventDialogProps {
  onClose: () => void;
  /** El organizador respondio el cuestionario y quiere entrar a crear el evento. */
  onContinue: (rules: Required<EventRules>) => void;
  /** El organizador prefiere no responder y crear con los valores por defecto. */
  onSkip: () => void;
}

export function CreateEventDialog({ onClose, onContinue, onSkip }: CreateEventDialogProps) {
  const draft = useWizardStore((s) => s.draftRules);
  const [rules, setRules] = useState<Required<EventRules>>(() => withRuleDefaults(draft));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-event-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border-2 border-foreground bg-surface shadow-flat"
      >
        <header className="flex items-start justify-between gap-4 border-b-2 border-foreground px-5 py-4">
          <div>
            <h2 id="create-event-dialog-title" className="font-display text-xl font-semibold">
              Antes de crear el evento
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Seis preguntas sobre como se venden y se accede a las entradas. Se contestan ahora y luego se
              pueden cambiar en el asistente; si no se responden, se usan los valores habituales.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="rounded-md border-2 border-foreground bg-surface px-3 py-1.5 text-sm font-bold hover:bg-surface-alt"
          >
            ×
          </button>
        </header>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
          {RULE_GROUPS.map((group) => (
            <QuestionSection key={group.title} title={group.title}>
              <div className="flex flex-col gap-4">
                {group.questions.map((question) =>
                  question.kind === "number" ? (
                    <label key={question.key} className="flex flex-col gap-1 text-sm font-semibold">
                      <span>{question.label}</span>
                      <NumericInput
                        min={question.min}
                        max={100}
                        step="1"
                        maxLength={3}
                        value={String(rules[question.key])}
                        onChange={(event) => {
                          const value = Math.max(question.min, Math.min(100, Math.floor(Number(event.target.value) || question.min)));
                          setRules((prev) => ({ ...prev, [question.key]: value }));
                        }}
                        className="h-10 max-w-28 rounded-md border-2 border-foreground bg-background px-3 text-foreground"
                      />
                      <span className="text-xs font-normal text-muted-foreground">
                        {question.help}
                        {question.zeroMeans ? ` ${question.zeroMeans}.` : ""}
                      </span>
                    </label>
                  ) : (
                    <div key={question.key} className="flex flex-wrap items-center justify-between gap-3">
                      <div className="max-w-xs">
                        <p className="text-sm font-semibold">{question.label}</p>
                        <p className="text-xs text-muted-foreground">{question.help}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <OptionButton selected={rules[question.key] === false} onClick={() => setRules((prev) => ({ ...prev, [question.key]: false }))}>
                          {question.no}
                        </OptionButton>
                        <OptionButton selected={rules[question.key] === true} onClick={() => setRules((prev) => ({ ...prev, [question.key]: true }))}>
                          {question.yes}
                        </OptionButton>
                      </div>
                    </div>
                  )
                )}
              </div>
            </QuestionSection>
          ))}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t-2 border-foreground px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="outline" onClick={onSkip}>
            Empezar sin responder
          </Button>
          <Button type="button" onClick={() => onContinue(rules)}>
            Continuar
          </Button>
        </footer>
      </div>
    </div>
  );
}