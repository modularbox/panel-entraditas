import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/ui/BackButton";
import { Button } from "@/shared/ui/button";
import { useWizardStore } from "./wizardStore";
import { Step1BasicInfo } from "./steps/Step1BasicInfo";
import { Step2Schedule } from "./steps/Step2Schedule";
import { Step4TicketTypes } from "./steps/Step4TicketTypes";
import { Step5Publish } from "./steps/Step5Publish";
import { SeatingPlanSection } from "./steps/SeatingPlanSection";
import { DiscountCodesSection } from "./steps/DiscountCodesSection";
import { GatesSection } from "./steps/GatesSection";
import { IsolatedSeatsQuestion, PurchaseLimitsQuestion } from "./steps/EventRulesQuestions";

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

type StepKey = "info" | "subeventos" | "tipos" | "plano" | "descuentos" | "puertas" | "publicar";

interface WizardStep {
  key: StepKey;
  label: string;
  needsEventId: boolean;
}

/**
 * Los pasos, en el orden en que se piensa un evento.
 *
 * Los codigos de descuento y las puertas estaban hechos pero se habian quedado fuera del
 * asistente: solo se podian configurar desde la ficha del evento, despues de crearlo, y quien
 * creaba un evento no los veia nunca. Vuelven aqui, antes de publicar.
 *
 * Las listas de invitados estuvieron aqui como paso 6 y ya no estan: Jorge retiro la funcion
 * entera del panel el 11/09 (componente, tipos, permisos y mocks) y Axel confirmo el 12/09 que
 * se da por buena esa decision. Si vuelve, vuelve entre "Puertas" y "Publicar".
 *
 * Tampoco hay cuestionario previo: sus preguntas estan ahora en el paso al que afectan (ver
 * EventRulesQuestions). Decidir si habra plano antes de ver el editor de asientos obligaba a
 * elegir a ciegas.
 */
const ALL_STEPS: WizardStep[] = [
  { key: "info", label: "Informacion del evento", needsEventId: false },
  { key: "subeventos", label: "Varias funciones", needsEventId: true },
  { key: "tipos", label: "Tipos de entrada", needsEventId: true },
  { key: "plano", label: "Asientos", needsEventId: true },
  { key: "descuentos", label: "Codigos de descuento", needsEventId: true },
  { key: "puertas", label: "Puertas", needsEventId: true },
  { key: "publicar", label: "Publicar evento", needsEventId: true }
];

export function EventWizardPage() {
  const params = useParams<{ id?: string }>();
  const eventId = useWizardStore((s) => s.eventId);
  const setEventId = useWizardStore((s) => s.setEventId);
  const reset = useWizardStore((s) => s.reset);
  const { data: event } = useEventQuery(eventId);
  const [stepIndex, setStepIndex] = useState(0);
  const [planoValid, setPlanoValid] = useState(true);
  const [tiposValid, setTiposValid] = useState(false);

  useEffect(() => {
    // ":id/nuevo" route means "start a fresh draft"; any other id resumes an existing event
    if (params.id && params.id !== "nuevo") {
      setEventId(params.id);
    } else {
      reset();
    }
    setStepIndex(0);
    setPlanoValid(true);
    setTiposValid(false);
  }, [params.id, setEventId, reset]);

  // "Varias funciones" solo aparece si el evento las tiene, y eso se decide al final del paso 1.
  const steps = ALL_STEPS.filter((step) => step.key !== "subeventos" || Boolean(event?.hasSubEvents));

  const activeIndex = Math.min(stepIndex, steps.length - 1);
  const activeStep = steps[activeIndex]!;
  const goNext = () => setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  const canVisitStep = (step: WizardStep | undefined) => Boolean(step && (!step.needsEventId || eventId));
  const nextStep = steps[Math.min(activeIndex + 1, steps.length - 1)];

  return (
    <div className="flex flex-col gap-6">
      <BackButton fallback="/eventos" />
      <p data-testid="wizard-event-id" className="hidden">
        {eventId ?? "sin-id"}
      </p>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
          Paso {activeIndex + 1} de {steps.length} - {activeStep.label}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={activeIndex === 0}
            onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
          >
            Anterior
          </Button>
          <Button
            type="button"
            disabled={
              activeIndex >= steps.length - 1 ||
              !canVisitStep(nextStep) ||
              (activeStep.key === "plano" && !planoValid) ||
              (activeStep.key === "tipos" && !tiposValid)
            }
            onClick={() => setStepIndex((i) => Math.min(steps.length - 1, i + 1))}
          >
            Siguiente
          </Button>
        </div>
      </div>

      <nav aria-label="Pasos del asistente" className="flex flex-wrap gap-2">
        {steps.map((step, index) => {
          const active = index === activeIndex;
          const disabled = !canVisitStep(step);
          return (
            <button
              key={step.key}
              type="button"
              disabled={disabled}
              aria-current={active ? "step" : undefined}
              onClick={() => setStepIndex(index)}
              className={`inline-flex min-h-10 items-center gap-2 rounded-md border-2 px-3 py-2 text-xs font-extrabold uppercase shadow-flat ${
                active
                  ? "border-foreground bg-foreground text-background"
                  : disabled
                    ? "border-border bg-surface-alt text-muted-foreground"
                    : "border-foreground bg-surface text-foreground"
              }`}
            >
              <span>{index + 1}.</span>
              {step.label}
            </button>
          );
        })}
      </nav>

      <section aria-label={activeStep.label} className="rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat">
        {activeStep.key === "info" && <Step1BasicInfo eventId={eventId} onSaved={setEventId} goNext={goNext} />}
        {activeStep.key === "subeventos" && <Step2Schedule eventId={eventId} onSaved={setEventId} goNext={goNext} />}
        {activeStep.key === "tipos" && (
          <div className="flex flex-col gap-6">
            <PurchaseLimitsQuestion eventId={eventId} />
            <Step4TicketTypes eventId={eventId} onSaved={setEventId} onValidationChange={setTiposValid} />
          </div>
        )}
        {activeStep.key === "plano" && (
          <div className="flex flex-col gap-6">
            <IsolatedSeatsQuestion eventId={eventId} />
            <SeatingPlanSection eventId={eventId} onValidationChange={setPlanoValid} />
          </div>
        )}
        {activeStep.key === "descuentos" && <DiscountCodesSection eventId={eventId} />}
        {activeStep.key === "puertas" && <GatesSection eventId={eventId} />}
        {activeStep.key === "publicar" && <Step5Publish eventId={eventId} onSaved={setEventId} />}
      </section>
    </div>
  );
}
