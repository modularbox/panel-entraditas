import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { hasEventFinished } from "@/shared/lib/eventLifecycle";
import { Button } from "@/shared/ui/button";
import {
  describePublishOutcome,
  publishToPublicSite,
  removeFromPublicSite,
  type PublishOutcome
} from "@/features/publish/publishToPublicSite";

/** Estados desde los que tiene sentido revisar: lo que el organizador ya ha enviado. */
const REVIEWABLE: Event["status"][] = ["pending_review", "in_review"];

/**
 * Acciones de un evento en el listado: revisarlo, abrir o cerrar su venta, retirarlo de la web
 * y borrarlo.
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

  const openSales = useMutation({
    mutationFn: async () => {
      await apiClient.post<Event>(`/events/${event.id}/open-sales`, undefined, { token: token! });
      // Se reenvia a la web porque el estado forma parte de lo publicado: pasar a "a la venta"
      // es lo que abre la compra de cara al comprador.
      return publishToPublicSite(event.id, token!);
    },
    onSuccess: async (outcome) => {
      report(outcome, "Venta abierta.");
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo abrir la venta.")
  });

  const closeSales = useMutation({
    mutationFn: async () => {
      await apiClient.post<Event>(`/events/${event.id}/close-sales`, undefined, { token: token! });
      return publishToPublicSite(event.id, token!);
    },
    onSuccess: async (outcome) => {
      report(outcome, "Venta cerrada; el evento sigue anunciado.");
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo cerrar la venta.")
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
  const finished = hasEventFinished(event);

  const working =
    approve.isPending || reject.isPending || openSales.isPending || closeSales.isPending ||
    unpublish.isPending || remove.isPending;

  const acciones: { label: string; onClick: () => void; variant?: "outline" | "destructive" }[] = [];
  if (canReview && reviewable) {
    acciones.push({ label: approve.isPending ? "Publicando..." : "Aprobar y publicar", onClick: () => approve.mutate() });
    acciones.push({ label: "Rechazar", onClick: () => reject.mutate(), variant: "outline" });
  }
  if (canManage && !reviewable) {
    // Un evento ya celebrado no se vuelve a poner a la venta.
    if (event.status === "published" && !finished) {
      acciones.push({ label: "Abrir venta", onClick: () => openSales.mutate() });
    }
    if (event.status === "on_sale") {
      acciones.push({ label: "Cerrar venta", onClick: () => closeSales.mutate(), variant: "outline" });
    }
    if (event.status === "published" || event.status === "on_sale") {
      acciones.push({ label: "Retirar de la web", onClick: () => unpublish.mutate(), variant: "outline" });
    }
  }

  // Quien no administra no ve ninguna accion. Quien si, ve al menos "Eliminar" aunque el estado
  // del evento no ofrezca ninguna transicion.
  if (!canManage) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap gap-2">
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
      </div>

      {confirmingDelete && (
        <p className="max-w-xs text-xs font-medium text-muted-foreground">
          Se borra el evento con sus sesiones, entradas, descuentos, puertas e invitados. No se
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
