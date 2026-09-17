import { useCallback } from "react";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { syncEventChangesToWeb } from "./publishToPublicSite";

/**
 * Auto-sincronizacion tras editar: reenvia el evento a la web si sigue publicado.
 *
 * El asistente no tiene un punto central de guardado: cada paso guarda lo suyo y refresca sus
 * propias queries. Cada mutacion que cambia lo que veria el comprador llama al resultado de este
 * hook, y sin mas aparato el evento se re-publica solo. Silencioso: si el evento no debe salir en
 * la web o no hay sesion con la API, no hace nada.
 */
export function useSyncEventChangesToWeb(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useCallback(async () => {
    if (!eventId || !token) return;
    await syncEventChangesToWeb(eventId, token);
  }, [eventId, token]);
}