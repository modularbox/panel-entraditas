import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TemplateZone, VenuePlanTemplate, Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";

export interface PlanTemplatesProps {
  /** Zones currently drawn, which is what "save as template" stores. */
  zones: Zone[];
  onApply: (zones: TemplateZone[]) => Promise<void> | void;
}

/** Strips what belongs to one venue, leaving only the shape of the room. */
export function toTemplateZones(zones: Zone[]): TemplateZone[] {
  return zones.map(({ id: _id, venueId: _venueId, ...rest }) => rest);
}

export function usePlanTemplatesQuery() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["venue-plan-templates"],
    queryFn: () => apiClient.get<VenuePlanTemplate[]>("/venue-plan-templates", { token: token! }),
    enabled: Boolean(token)
  });
}

export function PlanTemplates({ zones, onApply }: PlanTemplatesProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: templates = [] } = usePlanTemplatesQuery();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  const saveTemplate = useMutation({
    mutationFn: (templateName: string) =>
      apiClient.post<VenuePlanTemplate>(
        "/venue-plan-templates",
        { name: templateName, zones: toTemplateZones(zones) },
        { token: token! }
      ),
    onSuccess: async () => {
      setName("");
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ["venue-plan-templates"] });
    },
    onError: (e) => setError(e instanceof AppError ? e.message : "No se pudo guardar la plantilla")
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/venue-plan-templates/${id}`, { token: token! }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["venue-plan-templates"] })
  });

  async function applyTemplate(template: VenuePlanTemplate) {
    setError(null);
    setApplyingId(template.id);
    try {
      await onApply(template.zones);
    } catch (e) {
      setError(e instanceof AppError ? e.message : "No se pudo aplicar la plantilla");
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <fieldset className="flex flex-col gap-3 rounded-md border-2 border-border bg-surface p-3">
      <legend className="text-sm font-semibold">Plantillas de plano</legend>
      {error && <p role="alert">{error}</p>}

      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="template-name" className="text-xs font-semibold">
            Guardar el plano actual como plantilla
          </label>
          <input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Teatro Circo - patio y anfiteatro"
            className="h-10 w-72 rounded-md border-2 border-foreground bg-surface px-3 text-sm"
          />
        </div>
        <Button
          type="button"
          onClick={() => saveTemplate.mutate(name.trim())}
          disabled={name.trim() === "" || zones.length === 0 || saveTemplate.isPending}
        >
          Guardar plantilla
        </Button>
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavia no hay plantillas guardadas. Dibuja un plano y guardalo para reutilizarlo en
          otros eventos del mismo recinto.
        </p>
      ) : (
        <ul aria-label="Plantillas guardadas" className="flex flex-col gap-2">
          {templates.map((template) => (
            <li key={template.id} className="flex flex-wrap items-center gap-3 rounded-md border-2 border-border px-3 py-2">
              <span className="flex-1 text-sm font-semibold">
                {template.name}{" "}
                <span className="font-normal text-muted-foreground">
                  ({template.zones.length} zonas)
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-2 text-xs"
                onClick={() => void applyTemplate(template)}
                disabled={applyingId !== null}
              >
                {applyingId === template.id ? "Aplicando..." : "Aplicar al plano"}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 px-2 text-xs"
                onClick={() => deleteTemplate.mutate(template.id)}
              >
                Eliminar
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Aplicar una plantilla anade sus zonas a este recinto; no borra las que ya haya.
      </p>
    </fieldset>
  );
}
