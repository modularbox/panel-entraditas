import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { AccionConConfirmacion } from "@/shared/ui/AccionConConfirmacion";
import {
  describePublishOutcome,
  publishToPublicSite,
  removeFromPublicSite,
  type PublishOutcome
} from "@/features/publish/publishToPublicSite";
import { isPubliclyVisible } from "@/shared/lib/eventLifecycle";
import { EliminarEvento } from "@/features/papelera/BotonesDeGestion";

/** Estados en los que la revision ya ha entrado y el superadmin puede aprobar o rechazar. */
const REVIEWABLE: Event["status"][] = ["in_review"];

/**
 * Acciones de un evento en el listado: revisarlo (aprobar o rechazar), retirarlo de revision o de
 * la web, cancelarlo y eliminarlo (a la papelera).
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
   * Cancelar en vez de borrar (tanda 17). Un evento con entradas vendidas no puede desaparecer:
   * esas ventas, sus compradores y el dinero siguen existiendo. Cancelado, se queda en el panel
   * con todo lo suyo y deja de anunciarse. Solo se ofrece para un evento publicado: si nunca salio
   * a la web no hay nada que retirar, y para eso ya estan los otros botones.
   */
  const cancel = useMutation({
    mutationFn: async () => {
      // Primero se retira de la web y despues se marca en el panel. En este orden porque, si
      // fallara el segundo paso, lo peor que queda es un evento que ya no se anuncia; al reves
      // quedaria a la venta uno cancelado.
      const outcome = await removeFromPublicSite(event.id);
      await apiClient.post<Event>(`/events/${event.id}/cancel`, undefined, { token: token! });
      return outcome;
    },
    onSuccess: async (outcome) => {
      report(outcome, "Evento cancelado.");
      await refresh();
    },
    onError: (error) => reportError(error, "No se pudo cancelar el evento.")
  });

  // Aprobar, retirar, cancelar y borrar es cosa de quien administra, no de quien solo consulta. El
  // servidor lo vuelve a comprobar.
  const canManage = role === "superadmin" || role === "organizador";
  const canReview = role === "superadmin";
  const reviewable = REVIEWABLE.includes(event.status);

  const working =
    approve.isPending ||
    reject.isPending ||
    withdraw.isPending ||
    unpublish.isPending ||
    cancel.isPending;
  const cancelable = isPubliclyVisible(event.status);

  // Quien no administra no ve ninguna accion. Quien si, ve las que el estado del evento permite
  // (cancelar, por ejemplo, solo si está publicado).
  if (!canManage) return null;

  /**
   * Todo lo que cambia el evento pasa por aqui: aprobar, rechazar, retirar y cancelar. Cada boton
   * va a su modal, que dice lo que va a pasar, y no se toca la API hasta que se confirma.
   */
  const acciones: {
    etiqueta: string;
    confirmar: string;
    aviso: string;
    accion: () => void;
    pendiente: string;
    peligro: boolean;
    variante: "default" | "outline" | "destructive";
  }[] = [];
  if (canReview && reviewable) {
    acciones.push({
      etiqueta: approve.isPending ? "Aprobando..." : "Aprobar",
      confirmar: "Sí, aprobar",
      aviso:
        "El evento queda publicado y se anuncia en entraditas.com: el comprador ya puede comprar entradas. Para deshacerlo hay que retirarlo de la web.",
      accion: () => approve.mutate(),
      pendiente: "Aprobando...",
      peligro: false,
      variante: "default"
    });
    acciones.push({
      etiqueta: "Rechazar",
      confirmar: "Sí, rechazar",
      aviso:
        "El evento vuelve al organizador para que lo corrija. No se publica ni se anuncia en entraditas.com.",
      accion: () => reject.mutate(),
      pendiente: "Rechazando...",
      peligro: false,
      variante: "outline"
    });
  }
  if (canManage && reviewable) {
    acciones.push({
      etiqueta: "Retirar de revisión",
      confirmar: "Sí, retirar de revisión",
      aviso: "El evento vuelve a borrador: puedes editarlo y volver a enviarlo a revisión cuando quieras.",
      accion: () => withdraw.mutate(),
      pendiente: "Retirando...",
      peligro: false,
      variante: "outline"
    });
  }
  if (canManage && isPubliclyVisible(event.status)) {
    acciones.push({
      etiqueta: "Retirar de la web",
      confirmar: "Sí, retirar de la web",
      aviso:
        "Deja de anunciarse en entraditas.com y el comprador ya no lo ve. Sigue en el panel y se puede volver a publicar.",
      accion: () => unpublish.mutate(),
      pendiente: "Retirando...",
      peligro: false,
      variante: "outline"
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-nowrap gap-2">
        {acciones.map((accion) => (
          <AccionConConfirmacion
            key={accion.etiqueta}
            etiqueta={accion.etiqueta}
            confirmar={accion.confirmar}
            aviso={accion.aviso}
            accion={async () => accion.accion()}
            trabajando={accion.pendiente}
            peligro={accion.peligro}
            variante={accion.variante}
            disabled={working}
          />
        ))}

        {cancelable ? (
          <AccionConConfirmacion
            etiqueta="Cancelar"
            confirmar="Confirmar cancelación"
            aviso="Deja de venderse y se retira de entraditas.com. El evento y lo vendido se quedan en el panel como cancelados."
            accion={async () => cancel.mutate()}
            trabajando="Cancelando..."
            variante="outline"
            disabled={working}
          />
        ) : null}

        {/* Eliminar no es cancelar: lo manda a la papelera, de donde se restaura (tanda 21). */}
        <EliminarEvento id={event.id} titulo={event.title} />
      </div>

      {message && (
        <p role="status" className={`max-w-xs text-xs font-medium ${failed ? "text-destructive" : "text-success"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
