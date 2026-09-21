import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/ui/BackButton";
import { cn } from "@/shared/lib/cn";
import { Step1BasicInfo } from "../wizard/steps/Step1BasicInfo";
import { Step2Schedule } from "../wizard/steps/Step2Schedule";
import { Step4TicketTypes } from "../wizard/steps/Step4TicketTypes";
import { Step5Publish } from "../wizard/steps/Step5Publish";
import { SeatingPlanSection } from "../wizard/steps/SeatingPlanSection";
import { DiscountCodesSection } from "../wizard/steps/DiscountCodesSection";
import { GatesSection } from "../wizard/steps/GatesSection";

const ENABLED_TABS = [
  { key: "general", label: "Información general" },
  { key: "subeventos", label: "Sesiones" },
  { key: "aforos", label: "Aforos y zonas" },
  { key: "tipos", label: "Tipos de entrada" },
  { key: "descuentos", label: "Códigos de descuento" },
  { key: "puertas", label: "Puertas" },
  // Retirar de la web deja el evento en borrador: desde aqui se vuelve a enviar a revision
  // (y de ahi a publicado) sin tener que rehacer el asistente entero.
  { key: "publicar", label: "Publicar" }
] as const;

type TabKey = (typeof ENABLED_TABS)[number]["key"];

// Estados desde los que tiene sentido pedir la revision otra vez.
const PUBLISHABLE: Event["status"][] = ["draft", "rejected"];

// Sections not built yet; rendered as disabled buttons so the full nav is visible early.
const DISABLED_TABS = ["Pedidos", "Métricas"];

function noop() {
  // Reused wizard step components call onSaved/goNext; there is no "next
  // step" on a detail page, so both are intentionally no-ops here.
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id!;
  const token = useSessionStore((s) => s.token);
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(token), // wait for the session token before firing the request
    retry: false
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  // Only a 404 gets a dedicated screen; other errors fall through to the "no event" null render below.
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Evento no encontrado.</p>
      </div>
    );
  }
  if (!event) return null;

  const tabs = ENABLED_TABS.filter((tab) => tab.key !== "publicar" || PUBLISHABLE.includes(event.status));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <BackButton fallback="/eventos" />
        <h1>{event.title}</h1>
      </div>

      <nav aria-label="Secciones del evento">
        <ul className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <li key={tab.key}>
              <button
                type="button"
                aria-pressed={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "rounded-md border-2 border-foreground px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-colors",
                  activeTab === tab.key ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-muted"
                )}
              >
                {tab.label}
              </button>
            </li>
          ))}
          {DISABLED_TABS.map((label) => (
            <li key={label}>
              <button
                type="button"
                disabled
                title="Disponible en una fase posterior"
                className="rounded-md border-2 border-border px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground opacity-60"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <section
        aria-label={tabs.find((t) => t.key === activeTab)!.label}
        className="rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat"
      >
        {activeTab === "general" && <Step1BasicInfo eventId={eventId} onSaved={noop} />}
        {activeTab === "subeventos" && <Step2Schedule eventId={eventId} onSaved={noop} />}
        {activeTab === "aforos" && <SeatingPlanSection eventId={eventId} />}
        {activeTab === "tipos" && <Step4TicketTypes eventId={eventId} onSaved={noop} />}
        {activeTab === "descuentos" && <DiscountCodesSection eventId={eventId} />}
        {activeTab === "puertas" && <GatesSection eventId={eventId} />}
        {activeTab === "publicar" && <Step5Publish eventId={eventId} onSaved={noop} />}
      </section>
    </div>
  );
}
