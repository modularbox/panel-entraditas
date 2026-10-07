import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/ui/BackButton";
import { Button } from "@/shared/ui/button";
import { useConfirm } from "@/shared/ui/useConfirm";
import { cn } from "@/shared/lib/cn";
import { Step1BasicInfo, type GuardadoSeccion } from "../wizard/steps/Step1BasicInfo";
import { Step2Schedule } from "../wizard/steps/Step2Schedule";
import { Step4TicketTypes } from "../wizard/steps/Step4TicketTypes";
import { Step5Publish } from "../wizard/steps/Step5Publish";
import { SeatingPlanSection } from "../wizard/steps/SeatingPlanSection";
import { DiscountCodesSection } from "../wizard/steps/DiscountCodesSection";
import { GatesSection } from "../wizard/steps/GatesSection";
import { TicketDesignSection } from "@/features/ticketDesign/TicketDesignSection";
import { Cargando } from "@/shared/ui/Cargando";
import { camposObligatoriosFaltantes, fechaDelEventoLista } from "../wizard/steps/camposObligatorios";

const ENABLED_TABS = [
  { key: "general", label: "Información general" },
  { key: "subeventos", label: "Sesiones" },
  { key: "tipos", label: "Tipos de entrada" },
  { key: "aforos", label: "Aforos y zonas" },
  { key: "puertas", label: "Control de acceso" },
  { key: "descuentos", label: "Códigos de descuento" },
  { key: "diseno", label: "Diseño de entradas" },
  // Retirar de la web deja el evento en borrador: desde aqui se vuelve a enviar a revision
  // (y de ahi a publicado) sin tener que rehacer el asistente entero.
  { key: "publicar", label: "Publicar" }
] as const;

type TabKey = (typeof ENABLED_TABS)[number]["key"];

// Estados desde los que tiene sentido pedir la revision otra vez.
const PUBLISHABLE: Event["status"][] = ["draft", "rejected"];

function noop() {
  // Reused wizard step components call onSaved/goNext; there is no "next
  // step" on a detail page, so both are intentionally no-ops here.
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const eventId = id!;
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const confirmar = useConfirm();
  const [activeTab, setActiveTab] = useState<TabKey>("general");
  const [feedback, setFeedback] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(token), // wait for the session token before firing the request
    retry: false
  });

  // Las secciones que guardan por su cuenta se registran aqui (informacion general siempre, aforos
  // cuando esta abierto); el boton "Guardar" las dispara todas y comprueba antes lo obligatorio.
  const guardadosRef = useRef<Map<string, () => Promise<GuardadoSeccion>>>(new Map());
  const registrarGuardado = useMemo(
    () =>
      (id: string) =>
      (guardar: () => Promise<GuardadoSeccion>) => {
        guardadosRef.current.set(id, guardar);
        return () => {
          guardadosRef.current.delete(id);
        };
      },
    []
  );
  const registrarGeneral = useMemo(() => registrarGuardado("general"), [registrarGuardado]);
  const registrarAforos = useMemo(() => registrarGuardado("aforos"), [registrarGuardado]);

  async function guardarTodo() {
    const adelante = await confirmar({
      title: "Guardar los cambios del evento",
      message: `Se guardan los cambios de "${event?.title ?? "este evento"}" y se actualizan en entraditas.com. Quien ya tenga una entrada no pierde su butaca.`,
      confirmLabel: "Sí, guardar",
      working: "Guardando..."
    });
    if (!adelante) return;

    // Igual que Publicar a la hora de crear un evento: si falta un campo obligatorio no se guarda.
    const faltantes = camposObligatoriosFaltantes(event);
    const fechaLista = fechaDelEventoLista(event);
    if (faltantes.length > 0 || !fechaLista) {
      const avisos: string[] = [];
      if (faltantes.length > 0) avisos.push(`Falta: ${faltantes.join(", ")}`);
      if (!fechaLista) avisos.push("Falta la fecha o activar la fecha por confirmar");
      setFeedback({ tipo: "error", texto: `No se puede guardar: ${avisos.join(". ")}.` });
      return;
    }

    const resultados = await Promise.all([...guardadosRef.current.values()].map((guardar) => guardar()));
    const fallo = resultados.find((r) => !r.ok);
    if (fallo) {
      setFeedback({ tipo: "error", texto: fallo.error ?? "No se pudieron guardar los cambios del evento." });
      return;
    }
    setFeedback({ tipo: "ok", texto: "Cambios guardados." });
    await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
  }

  if (isLoading) return <Cargando />;
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

      <div className="flex flex-wrap items-start justify-between gap-4">
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
          </ul>
        </nav>

        <div className="flex flex-col items-end gap-2">
          <Button type="button" onClick={() => void guardarTodo()}>
            Guardar
          </Button>
          {feedback && (
            <p
              role={feedback.tipo === "error" ? "alert" : "status"}
              className="max-w-md text-right text-xs font-semibold"
            >
              {feedback.texto}
            </p>
          )}
        </div>
      </div>

      <section
        aria-label={tabs.find((t) => t.key === activeTab)!.label}
        className="rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat"
      >
        {/* Informacion general vive siempre montada aunque no sea la pestana activa: el "Guardar"
            de fuera la dispara desde cualquier seccion, y sus cambios sin guardar no se pierden. */}
        <div hidden={activeTab !== "general"}>
          <Step1BasicInfo eventId={eventId} onSaved={noop} ocultarBotonGuardar registrarGuardado={registrarGeneral} />
        </div>
        {activeTab === "subeventos" && <Step2Schedule eventId={eventId} onSaved={noop} />}
        {activeTab === "aforos" && <SeatingPlanSection eventId={eventId} registrarGuardado={registrarAforos} />}
        {activeTab === "tipos" && <Step4TicketTypes eventId={eventId} onSaved={noop} />}
        {activeTab === "diseno" && <TicketDesignSection eventId={eventId} />}
        {activeTab === "descuentos" && <DiscountCodesSection eventId={eventId} />}
        {activeTab === "puertas" && <GatesSection eventId={eventId} />}
        {activeTab === "publicar" && <Step5Publish eventId={eventId} onSaved={noop} />}
      </section>
    </div>
  );
}