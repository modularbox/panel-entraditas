import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { EVENT_STATUS_LABEL } from "@/shared/ui/EventStatusBadge";
import {
  describePublishOutcome,
  publishToPublicSite,
  removeFromPublicSite,
  type PublishOutcome
} from "@/features/publish/publishToPublicSite";
import { isPubliclyVisible } from "@/shared/lib/eventLifecycle";

/** Estados en los que la revision ya ha entrado y el superadmin puede aprobar o rechazar. */
const REVIEWABLE: Event["status"][] = ["in_review"];

/**
 * Estados que un superadmin puede poner a mano. "Finalizado" no esta: se deduce de la fecha, no se
 * guarda, asi que ponerlo seria inventar un estado que al repintar vuelve a cambiar solo.
 */
const ESTADOS_A_MANO: Event["status"][] = ["draft", "in_review", "published", "rejected"];

/**
 * Acciones de un evento en el listado: revisarlo, retirarlo de revision o de la web, cambiarle el
 * estado y borrarlo.
 *
 * Cada accion que cambia lo que ve el comprador se sincroniza con entraditas.com en el mismo
 * gesto. Antes solo existia "aprobar", asi que un evento despublicado o borrado en el panel
 * seguia anunciandose en la web para siempre.
 *
 * Un fallo al sincronizar NO deshace el cambio en el panel: se cuenta lo que ha pasado, en vez
 * de dejar creer que la web ya esta al dia.
 */
export function EventRowActions({ event }: { event: Event }) {
  const token = useSessionStore((s) => s.token);
  const role = useSessionStore((s) => s.user?.role);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["events"] });
  }

  function report(outcome: PublishOutcome, prefijo?: string) {
    setFailed(outcome.status !== "published" && outcome.status !== "removed");
    setMessage(prefijo ? `${prefijo} ${describePublishOutcome(outcome)}` : describePublishOutcome(outcome));
  }

  function reportError(error: unknown, fallback: string) {
    setFailed(true);
    setMessage(error instanceof AppError ? error.message : fallback);
  }

  const approve = useMutation({
    mutationFn: async () => {
      await apiClient.post<Event>(`/events/${event.id}/approve`, undefined, { token: token! });
      return publishToPublicSite(event.id, token!);
    },
    onSuccess: async (outcome) => {
      report(outcome);
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo aprobar el evento.")
  });

  const reject = useMutation({
    mutationFn: () => apiClient.post<Event>(`/events/${event.id}/reject`, undefined, { token: token! }),
    onSuccess: async () => {
      setFailed(false);
      setMessage("Rechazado: vuelve al organizador para que lo corrija.");
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo rechazar el evento.")
  });

  // Retirar de revision es del organizador: el evento sigue siendo suyo hasta que se aprueba.
  const withdraw = useMutation({
    mutationFn: () => apiClient.post<Event>(`/events/${event.id}/withdraw`, undefined, { token: token! }),
    onSuccess: async () => {
      setFailed(false);
      setMessage("Vuelve a borrador: ya puedes editarlo y volver a enviarlo a revisión.");
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo retirar de revisión.")
  });

  const unpublish = useMutation({
    mutationFn: async () => {
      await apiClient.post<Event>(`/events/${event.id}/unpublish`, undefined, { token: token! });
      return removeFromPublicSite(event.id);
    },
    onSuccess: async (outcome) => {
      report(outcome, "Vuelve a borrador.");
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo retirar el evento.")
  });

  /**
   * Cambio de estado a mano, solo superadmin. Arrastra la web con el: lo que pasa a publicado se
   * envia a entraditas.com y lo que deja de estarlo se retira.
   */
  const changeStatus = useMutation({
    mutationFn: async (status: Event["status"]) => {
      await apiClient.post<Event>(`/events/${event.id}/status`, { status }, { token: token! });
      if (status === "published") return publishToPublicSite(event.id, token!);
      if (isPubliclyVisible(event.status)) return removeFromPublicSite(event.id);
      return null;
    },
    onSuccess: async (outcome) => {
      if (outcome) report(outcome);
      else {
        setFailed(false);
        setMessage("Estado cambiado.");
      }
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo cambiar el estado.")
  });

  const remove = useMutation({
    mutationFn: async () => {
      // Primero se retira de la web y despues se borra del panel. En este orden porque, si
      // fallara el segundo paso, lo peor que queda es un evento en el panel que ya no se
      // anuncia; al reves quedaria anunciandose uno que ya no existe y nadie podria retirarlo.
      const outcome = await removeFromPublicSite(event.id);
      await apiClient.delete(`/events/${event.id}`, { token: token! });
      return outcome;
    },
    onSuccess: async (outcome) => {
      report(outcome, "Evento eliminado.");
      setConfirmingDelete(false);
      await refresh();
    },
    onError: (error) => {
      setConfirmingDelete(false);
      reportError(error, "No se pudo eliminar el evento.");
    }
  });

  // Cambiar estados y borrar es cosa de quien administra, no de quien solo consulta. El servidor
  // lo vuelve a comprobar.
  const canManage = role === "superadmin" || role === "organizador";
  const canReview = role === "superadmin";
  const reviewable = REVIEWABLE.includes(event.status);

  const working =
    approve.isPending ||
    reject.isPending ||
    withdraw.isPending ||
    unpublish.isPending ||
    changeStatus.isPending ||
    remove.isPending;

  const acciones: { label: string; onClick: () => void; variant?: "outline" | "destructive" }[] = [];
  if (canReview && reviewable) {
    acciones.push({ label: approve.isPending ? "Publicando..." : "Aprobar y publicar", onClick: () => approve.mutate() });
    acciones.push({ label: "Rechazar", onClick: () => reject.mutate(), variant: "outline" });
  }
  if (canManage && reviewable) {
    acciones.push({ label: "Retirar de revisión", onClick: () => withdraw.mutate(), variant: "outline" });
  }
  if (canManage && isPubliclyVisible(event.status)) {
    acciones.push({ label: "Retirar de la web", onClick: () => unpublish.mutate(), variant: "outline" });
  }

  // Quien no administra no ve ninguna accion. Quien si, ve al menos "Eliminar" aunque el estado
  // del evento no ofrezca ninguna transicion.
  if (!canManage) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-nowrap gap-2">
        {acciones.map((accion) => (
          <Button
            key={accion.label}
            type="button"
            variant={accion.variant}
            onClick={accion.onClick}
            disabled={working}
            className="h-8 px-3 text-xs"
          >
            {accion.label}
          </Button>
        ))}

        {confirmingDelete ? (
          <>
            <Button
              type="button"
              variant="destructive"
              onClick={() => remove.mutate()}
              disabled={working}
              className="h-8 px-3 text-xs"
            >
              {remove.isPending ? "Eliminando..." : "Confirmar borrado"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmingDelete(false)}
              disabled={working}
              className="h-8 px-3 text-xs"
            >
              Cancelar
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setMessage(null);
              setConfirmingDelete(true);
            }}
            disabled={working}
            className="h-8 px-3 text-xs"
          >
            Eliminar
          </Button>
        )}

        {canReview && (
          <select
            aria-label="Cambiar estado"
            value={event.status}
            disabled={working}
            onChange={(e) => changeStatus.mutate(e.target.value as Event["status"])}
            className="h-8 rounded-md border-2 border-foreground bg-surface px-2 text-xs font-bold text-foreground"
          >
            {ESTADOS_A_MANO.map((status) => (
              <option key={status} value={status}>
                {EVENT_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        )}
      </div>

      {confirmingDelete && (
        <p className="max-w-xs text-xs font-medium text-muted-foreground">
          Se borra el evento con sus sesiones, entradas, descuentos y puertas. No se
          puede deshacer.
        </p>
      )}

      {message && (
        <p role="status" className={`max-w-xs text-xs font-medium ${failed ? "text-destructive" : "text-success"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
