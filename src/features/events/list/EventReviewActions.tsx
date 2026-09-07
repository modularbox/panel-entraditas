import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { describePublishOutcome, publishToPublicSite } from "@/features/publish/publishToPublicSite";

/** Estados desde los que tiene sentido revisar: lo que el organizador ya ha enviado. */
const REVIEWABLE: Event["status"][] = ["pending_review", "in_review"];

/**
 * Aprobar o rechazar un evento enviado a revision, desde la lista de eventos.
 *
 * Es el eslabon que faltaba para que un evento creado en el panel llegue a entraditas.com:
 * aprobar lo pasa a publicado y, acto seguido, lo manda a la API publica.
 *
 * Un fallo al enviarlo a la web NO deshace la aprobacion, que ya es valida dentro del panel; se
 * cuenta lo que ha pasado en vez de dejar creer que el evento ya esta en la calle.
 */
export function EventReviewActions({ event }: { event: Event }) {
  const token = useSessionStore((s) => s.token);
  const role = useSessionStore((s) => s.user?.role);
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const approve = useMutation({
    mutationFn: async () => {
      await apiClient.post<Event>(`/events/${event.id}/approve`, undefined, { token: token! });
      // Solo despues de que la aprobacion haya cuajado se intenta sacar el evento a la web.
      return publishToPublicSite(event.id, token!);
    },
    onSuccess: async (outcome) => {
      setFailed(outcome.status !== "published");
      setMessage(describePublishOutcome(outcome));
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => {
      setFailed(true);
      setMessage(error instanceof AppError ? error.message : "No se pudo aprobar el evento.");
    }
  });

  const reject = useMutation({
    mutationFn: () => apiClient.post<Event>(`/events/${event.id}/reject`, undefined, { token: token! }),
    onSuccess: async () => {
      setFailed(false);
      setMessage("Rechazado: vuelve al organizador para que lo corrija.");
      await queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => {
      setFailed(true);
      setMessage(error instanceof AppError ? error.message : "No se pudo rechazar el evento.");
    }
  });

  // Revisar es tarea de la plataforma, no del organizador que lo envio: si un admin pudiera
  // aprobarse a si mismo, la revision no serviria de nada. El servidor lo vuelve a comprobar.
  if (role !== "superadmin") return null;

  // Aprobar saca el evento del estado revisable, asi que los botones desaparecen solos. El
  // mensaje tiene que sobrevivir a eso: es donde se dice si el evento llego de verdad a la web,
  // y ocultarlo a la vez dejaria al revisor sin saber que ha pasado.
  const reviewable = REVIEWABLE.includes(event.status);
  if (!reviewable && !message) return null;

  const working = approve.isPending || reject.isPending;

  return (
    <div className="flex flex-col items-start gap-1">
      {reviewable && (
        <div className="flex gap-2">
          <Button
            type="button"
            onClick={() => approve.mutate()}
            disabled={working}
            className="h-8 px-3 text-xs"
          >
            {approve.isPending ? "Publicando..." : "Aprobar y publicar"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => reject.mutate()}
            disabled={working}
            className="h-8 px-3 text-xs"
          >
            Rechazar
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className={`max-w-xs text-xs font-medium ${failed ? "text-destructive" : "text-success"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
