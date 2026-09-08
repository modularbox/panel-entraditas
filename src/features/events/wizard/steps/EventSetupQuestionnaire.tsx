import type { ReactNode } from "react";
import { useSetupStore, type EventCategoryChoice } from "../setupStore";
import { Button } from "@/shared/ui/button";
import { Icon } from "@/shared/ui/icon";
import { cn } from "@/shared/lib/cn";
import { PREVIEW_CATEGORIES } from "./publicEventPreview";

interface EventSetupQuestionnaireProps {
  onComplete: () => void;
}

function QuestionSection({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border-2 border-foreground bg-surface p-4">
      <legend className="px-2 text-sm font-extrabold uppercase tracking-wide">{title}</legend>
      {hint && <p className="mb-3 mt-1 text-sm text-muted-foreground">{hint}</p>}
      {children}
    </fieldset>
  );
}

function OptionButton({
  selected,
  onClick,
  children
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "rounded-md border-2 px-4 py-2 text-sm font-bold transition-transform",
        selected ? "border-foreground bg-foreground text-background" : "border-foreground bg-surface-alt"
      )}
    >
      {children}
    </button>
  );
}

export function EventSetupQuestionnaire({ onComplete }: EventSetupQuestionnaireProps) {
  const setup = useSetupStore();
  const { completed, setField } = setup;

  if (completed) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat">
        <h2 className="text-lg font-bold">Antes de crear el evento</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Responde estas preguntas para preparar la configuración. Después rellenarás el formulario del evento.
        </p>
      </div>

      <QuestionSection title="¿Qué tipo de evento es?" hint="Esto marca la categoría y la apariencia en la tienda.">
        <div className="flex flex-wrap gap-2">
          {PREVIEW_CATEGORIES.map((category) => {
            const active = setup.category === category.id;
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={active}
                onClick={() => setField("category", category.id as EventCategoryChoice)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-2 rounded-md border-2 border-foreground px-4 py-2 text-sm font-extrabold shadow-flat transition-transform hover:-translate-y-px",
                  active ? "text-background" : "bg-surface-alt"
                )}
                style={active ? { backgroundColor: category.bg } : undefined}
              >
                <Icon name={category.icon} size={17} />
                {category.label}
              </button>
            );
          })}
        </div>
      </QuestionSection>

      <QuestionSection title="¿Tendrá varias sesiones, pases o fechas?" hint="Festivales y giras suelen tener varias funciones.">
        <div className="flex flex-wrap gap-2">
          <OptionButton selected={!setup.hasSubEvents} onClick={() => setField("hasSubEvents", false)}>
            Sesión única
          </OptionButton>
          <OptionButton selected={setup.hasSubEvents} onClick={() => setField("hasSubEvents", true)}>
            Varias sesiones
          </OptionButton>
        </div>
      </QuestionSection>

      <QuestionSection title="¿Necesita un plano de asientos?" hint="Un plano numerado permite elegir asiento concreto; sin plano la venta es en zona general.">
        <div className="flex flex-wrap gap-2">
          <OptionButton
            selected={setup.needsSeatingPlan}
            onClick={() => setField("needsSeatingPlan", true)}
          >
            Sí, plano numerado
          </OptionButton>
          <OptionButton
            selected={!setup.needsSeatingPlan}
            onClick={() => setField("needsSeatingPlan", false)}
          >
            No, zona general
          </OptionButton>
        </div>
      </QuestionSection>

      <QuestionSection title="¿Cuántas entradas se pueden comprar?" hint="Estos límites se aplican en la compra, por pedido y por cliente.">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-semibold">
            <span>Máximo por pedido</span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={setup.maxTicketsPerOrder}
              onChange={(e) => setField("maxTicketsPerOrder", Math.max(1, Number(e.target.value) || 1))}
              className="h-10 rounded-md border-2 border-foreground bg-surface px-3 text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-semibold">
            <span>Máximo por cliente</span>
            <input
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={setup.maxTicketsPerCustomer}
              onChange={(e) => setField("maxTicketsPerCustomer", Math.max(1, Number(e.target.value) || 1))}
              className="h-10 rounded-md border-2 border-foreground bg-surface px-3 text-foreground"
            />
          </label>
        </div>
      </QuestionSection>

      <QuestionSection
        title="¿Se permiten asientos sueltos en una fila?"
        hint="Si se desactiva, no podrá quedar un único hueco libre entre grupos. Por ejemplo, en una fila de 14 no se podrá dejar un grupo de 6 + hueco 1 + grupo de 7: los huecos libres deberán ser de 2 o más asientos."
      >
        <div className="flex flex-wrap gap-2">
          <OptionButton selected={!setup.allowSingleSeatGaps} onClick={() => setField("allowSingleSeatGaps", false)}>
            No, sin huecos sueltos
          </OptionButton>
          <OptionButton selected={setup.allowSingleSeatGaps} onClick={() => setField("allowSingleSeatGaps", true)}>
            Sí, se permiten
          </OptionButton>
        </div>
      </QuestionSection>

      <QuestionSection title="¿Habrá códigos de descuento?" hint="Puedes añadirlos más adelante, pero esto preconfigura la sección.">
        <div className="flex flex-wrap gap-2">
          <OptionButton selected={setup.hasDiscountCodes} onClick={() => setField("hasDiscountCodes", true)}>
            Sí, habrá descuentos
          </OptionButton>
          <OptionButton selected={!setup.hasDiscountCodes} onClick={() => setField("hasDiscountCodes", false)}>
            No, por ahora
          </OptionButton>
        </div>
      </QuestionSection>

      <div className="flex justify-end">
        <Button type="button" onClick={onComplete}>
          Continuar a la configuración
        </Button>
      </div>
    </div>
  );
}