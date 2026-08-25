import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { cn } from "@/shared/lib/cn";
import { Step1BasicInfo } from "../wizard/steps/Step1BasicInfo";
import { Step2Schedule } from "../wizard/steps/Step2Schedule";
import { Step3Capacity } from "../wizard/steps/Step3Capacity";
import { Step4TicketTypes } from "../wizard/steps/Step4TicketTypes";

const ENABLED_TABS = [
  { key: "general", label: "Información general" },
  { key: "subeventos", label: "Subeventos" },
  { key: "aforos", label: "Aforos y zonas" },
  { key: "tipos", label: "Tipos de entrada" }
] as const;

const DISABLED_TABS = ["Códigos de descuento", "Puertas", "Invitados", "Pedidos", "Métricas"];

function noop() {
  // Reused wizard step components call onSaved/goNext; there is no "next
  // step" on a detail page, so both are intentionally no-ops here.
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id!;
  const token = useSessionStore((s) => s.token);
  const [activeTab, setActiveTab] = useState<(typeof ENABLED_TABS)[number]["key"]>("general");

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(token),
    retry: false
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Evento no encontrado.</p>
      </div>
    );
  }
  if (!event) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1>{event.title}</h1>

      <nav aria-label="Secciones del evento">
        <ul className="flex flex-wrap gap-2">
          {ENABLED_TABS.map((tab) => (
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
        aria-label={ENABLED_TABS.find((t) => t.key === activeTab)!.label}
        className="rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat"
      >
        {activeTab === "general" && <Step1BasicInfo eventId={eventId} onSaved={noop} goNext={noop} />}
        {activeTab === "subeventos" && <Step2Schedule eventId={eventId} onSaved={noop} goNext={noop} />}
        {activeTab === "aforos" && <Step3Capacity eventId={eventId} onSaved={noop} goNext={noop} />}
        {activeTab === "tipos" && <Step4TicketTypes eventId={eventId} onSaved={noop} goNext={noop} />}
      </section>
    </div>
  );
}
