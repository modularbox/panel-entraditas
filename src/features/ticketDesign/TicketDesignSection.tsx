import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Event, TicketDesign } from "@entraditas/types";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useSubEventsQuery } from "@/features/events/wizard/steps/useSubEventsQuery";
import { useTicketDesignQuery, useSaveTicketDesign } from "./useTicketDesignQuery";
import { TicketDesignPreview } from "./TicketDesignPreview";

const COLOR_PRESETS = ["#243B8F", "#0d6e6e", "#7a1fa2", "#b42318", "#0f172a"];

function fieldset(legend: string, children: ReactNode) {
  return (
    <fieldset>
      <legend>{legend}</legend>
      {children}
    </fieldset>
  );
}

function FileControl({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(String(reader.result));
    reader.readAsDataURL(file);
  }
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/svg+xml,image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} className="h-9 px-3 text-xs">
          {value ? "Cambiar imagen" : "Subir imagen"}
        </Button>
        {value && (
          <span className="flex items-center gap-2">
            <img src={value} alt="" className="h-9 w-9 rounded-sm border-2 border-border object-contain p-0.5" />
            <Button type="button" variant="ghost" onClick={() => onChange(null)} className="h-9 px-2 text-xs">
              Quitar
            </Button>
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">SVG o PNG. Para la cabecera azul el logo debe leerse en blanco.</p>
    </div>
  );
}

export function TicketDesignSection({ eventId }: { eventId: string | null }) {
  const token = useSessionStore((s) => s.token);
  const { data, isLoading, error } = useTicketDesignQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const { data: event } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(token) && Boolean(eventId),
    retry: false
  });
  const save = useSaveTicketDesign(eventId);
  const [draft, setDraft] = useState<TicketDesign | null>(null);
  const [terminosText, setTerminosText] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setDraft(data);
    setTerminosText(data.terminos.join("\n"));
  }, [data]);

  function update<K extends keyof TicketDesign>(key: K, value: TicketDesign[K]) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  async function handleSave() {
    if (!draft) return;
    setMessage(null);
    const terminos = terminosText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    try {
      await save.mutateAsync({ ...draft, terminos });
      setMessage({ kind: "ok", text: "Diseño de la entrada guardado." });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof AppError ? e.message : "No se pudo guardar el diseño." });
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Cargando diseño de la entrada…</p>;
  if (error) return <p role="alert">{error instanceof AppError ? error.message : "No se pudo cargar el diseño."}</p>;
  if (!draft) return null;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
      <form className="flex flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <p className="rounded-sm border border-border bg-surface-alt p-3 text-xs text-muted-foreground">
          Aquí solo se configura el <strong>diseño</strong> de la plantilla. Los datos del asistente,
          la referencia, el QR y el PIN se generan automáticamente cuando el cliente compra la entrada;
          la vista previa los muestra con valores de ejemplo.
        </p>

        {fieldset(
          "Estilo",
          <>
            <label htmlFor="td-color">Color corporativo</label>
            <div className="flex flex-wrap items-center gap-2">
              {COLOR_PRESETS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-label={`Usar color ${item}`}
                  aria-pressed={draft.colorPrimario.toLowerCase() === item}
                  onClick={() => update("colorPrimario", item)}
                  className={cn(
                    "h-9 w-9 rounded-md border-2 border-foreground",
                    draft.colorPrimario.toLowerCase() === item && "shadow-flat"
                  )}
                  style={{ backgroundColor: item }}
                />
              ))}
              <input
                id="td-color"
                type="color"
                value={draft.colorPrimario}
                onChange={(e) => update("colorPrimario", e.target.value)}
                className="h-9 w-12"
              />
            </div>

            <label htmlFor="td-fuente">Tipografía</label>
            <select id="td-fuente" value={draft.fuente} onChange={(e) => update("fuente", e.target.value as TicketDesign["fuente"])}>
              <option value="Inter">Inter</option>
              <option value="Open Sans">Open Sans</option>
              <option value="Roboto">Roboto</option>
            </select>

            <label htmlFor="td-opacidad">Opacidad de la marca de agua: {Math.round(draft.opacidadMarcaAgua * 100)}%</label>
            <input
              id="td-opacidad"
              type="range"
              min={0}
              max={0.1}
              step={0.005}
              value={draft.opacidadMarcaAgua}
              onChange={(e) => update("opacidadMarcaAgua", Number(e.target.value))}
              className="w-full max-w-xs"
            />
          </>
        )}

        {fieldset(
          "Imágenes de la plantilla",
          <>
            <FileControl id="td-logo" label="Logo de la cabecera" value={draft.logo} onChange={(url) => update("logo", url)} />
            <FileControl
              id="td-marca-agua"
              label="Marca de agua"
              value={draft.marcaAgua}
              onChange={(url) => update("marcaAgua", url)}
            />
          </>
        )}

        {fieldset(
          "Bloques de la plantilla",
          <>
            <p className="text-xs text-muted-foreground">Marca qué bloques se imprimirán en la entrada.</p>
            <div className="flex flex-col gap-2">
              <label htmlFor="td-bloque-informacion" className="flex items-start gap-2">
                <input
                  id="td-bloque-informacion"
                  type="checkbox"
                  checked={draft.mostrarInformacion}
                  onChange={(e) => update("mostrarInformacion", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium">Datos del titular</span>
                  <span className="block text-xs text-muted-foreground">Nombre, documento, tipo de entrada, total.</span>
                </span>
              </label>
              <label htmlFor="td-bloque-qr" className="flex items-start gap-2">
                <input
                  id="td-bloque-qr"
                  type="checkbox"
                  checked={draft.mostrarQR}
                  onChange={(e) => update("mostrarQR", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium">Código QR</span>
                  <span className="block text-xs text-muted-foreground">Se genera con los datos de la compra.</span>
                </span>
              </label>
              <label htmlFor="td-bloque-pin" className="flex items-start gap-2">
                <input
                  id="td-bloque-pin"
                  type="checkbox"
                  checked={draft.mostrarPIN}
                  onChange={(e) => update("mostrarPIN", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium">PIN de acceso</span>
                  <span className="block text-xs text-muted-foreground">Se asigna en el momento de la compra.</span>
                </span>
              </label>
              <label htmlFor="td-bloque-sesion" className="flex items-start gap-2">
                <input
                  id="td-bloque-sesion"
                  type="checkbox"
                  checked={draft.mostrarSesion}
                  onChange={(e) => update("mostrarSesion", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium">Sesión</span>
                  <span className="block text-xs text-muted-foreground">
                    Si el pedido lleva sesión, se imprimen sus datos junto a los del evento.
                  </span>
                </span>
              </label>
              <label htmlFor="td-bloque-terminos" className="flex items-start gap-2">
                <input
                  id="td-bloque-terminos"
                  type="checkbox"
                  checked={draft.mostrarTerminos}
                  onChange={(e) => update("mostrarTerminos", e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-sm font-medium">Términos y condiciones</span>
                  <span className="block text-xs text-muted-foreground">El bloque legal numerado del documento.</span>
                </span>
              </label>
            </div>
          </>
        )}

        {fieldset(
          "Términos y condiciones",
          <>
            <label htmlFor="td-terminos">Texto (una línea por apartado · lista numerada)</label>
            <textarea
              id="td-terminos"
              value={terminosText}
              onChange={(e) => setTerminosText(e.target.value)}
              rows={8}
              className="w-full"
            />
            <label htmlFor="td-pie">Pie del documento</label>
            <input id="td-pie" value={draft.pie} onChange={(e) => update("pie", e.target.value)} />
          </>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button type="button" onClick={() => void handleSave()} disabled={save.isPending}>
            Guardar diseño
          </Button>
          {message && (
            <p role={message.kind === "error" ? "alert" : "status"} className={cn("text-sm", message.kind === "error" ? "text-destructive" : "text-success")}>
              {message.text}
            </p>
          )}
        </div>
      </form>

      <div className="xl:sticky xl:top-4 xl:self-start">
        <TicketDesignPreview design={draft} event={event} subEvents={subEvents} />
      </div>
    </div>
  );
}