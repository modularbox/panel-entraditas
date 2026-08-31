import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { cn } from "@/shared/lib/cn";
import { Step1BasicInfo } from "../wizard/steps/Step1BasicInfo";
import { Step2Schedule } from "../wizard/steps/Step2Schedule";
import { Step4TicketTypes } from "../wizard/steps/Step4TicketTypes";
import { SeatingPlanSection } from "../wizard/steps/SeatingPlanSection";
import { DiscountCodesSection } from "../wizard/steps/DiscountCodesSection";

const ENABLED_TABS = [
  { key: "general", label: "Informacion general" },
  { key: "subeventos", label: "Subeventos" },
  { key: "aforos", label: "Aforos y zonas" },
  { key: "tipos", label: "Tipos de entrada" },
  { key: "descuentos", label: "Codigos de descuento" },
  { key: "puertas", label: "Puertas" },
  { key: "invitados", label: "Invitados" },
  { key: "pedidos", label: "Pedidos" },
  { key: "metricas", label: "Metricas" }
] as const;

function noop() {
  // Reused wizard step components can call callbacks; there is no next step on a detail page.
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

  if (isLoading) return <p className="text-muted-foreground">Cargando...</p>;
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
        </ul>
      </nav>

      <section
        aria-label={ENABLED_TABS.find((t) => t.key === activeTab)!.label}
        className="rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat"
      >
        {activeTab === "general" && <Step1BasicInfo eventId={eventId} onSaved={noop} />}
        {activeTab === "subeventos" && <Step2Schedule eventId={eventId} onSaved={noop} />}
        {activeTab === "aforos" && <SeatingPlanSection eventId={eventId} />}
        {activeTab === "tipos" && <Step4TicketTypes eventId={eventId} onSaved={noop} />}
        {activeTab === "descuentos" && <DiscountCodesSection eventId={eventId} />}
        {activeTab === "puertas" && <EventModulePlaceholder title="Puertas" copy="Configura accesos, operadores y tipos de entrada admitidos por puerta." />}
        {activeTab === "invitados" && <EventModulePlaceholder title="Invitados" copy="Gestiona listas de invitados, cortesias e importaciones cuando conectemos esta fase." />}
        {activeTab === "pedidos" && <EventModulePlaceholder title="Pedidos" copy="Aqui ira el seguimiento de ventas, reservas, pagos, reembolsos y exportaciones." />}
        {activeTab === "metricas" && <EventModulePlaceholder title="Metricas" copy="Aqui se veran ventas, aforo, asistencia y conversion en tiempo real." />}
      </section>
    </div>
  );
}

function EventModulePlaceholder({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-8">
      <p className="m-0 text-xs font-extrabold uppercase tracking-wide text-primary">Modulo preparado</p>
      <h2 className="mt-2">{title}</h2>
      <p className="m-0 max-w-2xl text-sm font-semibold text-muted-foreground">{copy}</p>
    </div>
  );
}
