import { useEffect, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui/button";
import { useWizardStore } from "./wizardStore";
import { Step1BasicInfo } from "./steps/Step1BasicInfo";
import { Step2Schedule } from "./steps/Step2Schedule";
import { Step3Capacity } from "./steps/Step3Capacity";
import { Step4TicketTypes } from "./steps/Step4TicketTypes";
import { Step5Publish } from "./steps/Step5Publish";

export const WIZARD_STEP_TITLES = [
  "Datos básicos",
  "Fechas y subeventos",
  "Tipos de entrada",
  "Plano y zonas",
  "Publicación"
];

interface StepActions {
  onSaved: (id: string) => void;
  goNext: () => void;
}

function renderStep(step: number, eventId: string | null, actions: StepActions): ReactElement {
  if (step > 1 && !eventId) {
    return <p role="alert">Primero guarda los datos básicos del evento para poder continuar.</p>;
  }

  switch (step) {
    case 1:
      return <Step1BasicInfo eventId={eventId} onSaved={actions.onSaved} goNext={actions.goNext} />;
    case 2:
      return <Step2Schedule eventId={eventId} onSaved={actions.onSaved} goNext={actions.goNext} />;
    case 3:
      return <Step4TicketTypes eventId={eventId} onSaved={actions.onSaved} goNext={actions.goNext} />;
    case 4:
      return <Step3Capacity eventId={eventId} onSaved={actions.onSaved} goNext={actions.goNext} />;
    case 5:
      return <Step5Publish eventId={eventId} onSaved={actions.onSaved} goNext={actions.goNext} />;
    default:
      return <p>Paso {step} pendiente de implementar.</p>;
  }
}

export function EventWizardPage() {
  const params = useParams<{ id?: string }>();
  const eventId = useWizardStore((s) => s.eventId);
  const currentStep = useWizardStore((s) => s.currentStep);
  const setEventId = useWizardStore((s) => s.setEventId);
  const goToStep = useWizardStore((s) => s.goToStep);
  const next = useWizardStore((s) => s.next);
  const back = useWizardStore((s) => s.back);
  const reset = useWizardStore((s) => s.reset);
  const navigate = useNavigate();

  useEffect(() => {
    if (params.id && params.id !== "nuevo") setEventId(params.id);
    else reset();
  }, [params.id, setEventId, reset]);

  return (
    <div className="flex flex-col gap-6">
      <p data-testid="wizard-event-id" className="hidden">
        {eventId ?? "sin-id"}
      </p>
      <ol aria-label="Pasos del asistente" className="flex flex-wrap gap-2">
        {WIZARD_STEP_TITLES.map((title, index) => {
          const isActive = currentStep === index + 1;
          return (
            <li key={title}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => goToStep(index + 1)}
                className={cn(
                  "rounded-md border-2 px-3 py-1.5 text-sm font-bold uppercase transition-colors",
                  isActive
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground bg-surface text-foreground hover:bg-muted"
                )}
              >
                {index + 1}. {title}
              </button>
            </li>
          );
        })}
      </ol>

      <section
        aria-label={WIZARD_STEP_TITLES[currentStep - 1]}
        className="rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat"
      >
        {renderStep(currentStep, eventId, {
          onSaved: (id) => {
            setEventId(id);
            if (params.id === "nuevo") navigate(`/eventos/${id}/editar`, { replace: true });
          },
          goNext: currentStep === 1 ? () => goToStep(2) : next
        })}
      </section>

      <div className="flex justify-between">
        <Button type="button" variant="outline" onClick={back} disabled={currentStep === 1}>
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={next}
          disabled={currentStep === 5 || (currentStep === 1 && !eventId)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
