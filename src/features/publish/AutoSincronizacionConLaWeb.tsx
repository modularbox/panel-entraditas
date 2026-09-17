import { useEffect, useMemo, useState } from "react";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { canPublishToApi } from "@/shared/lib/entraditasApi";
import { shouldAppearOnPublicSite } from "@/shared/lib/eventLifecycle";
import { describePublishOutcome, syncEventChangesToWeb } from "./publishToPublicSite";

interface AutoSincronizacionConLaWebProps {
  eventos: Event[];
}

interface Estado {
  trabajando: boolean;
  actualizados: number;
  fallos: string[];
}

const SIN_AVISO: Estado = { trabajando: false, actualizados: 0, fallos: [] };

/**
 * Mantiene entraditas.com al dia con el panel sin boton.
 *
 * Antes habia un boton "Sincronizar" que empujaba a la web todos los eventos publicados, porque
 * los eventos solo salian al cambiar de estado: uno publicado antes de que existiera la API se
 * quedaba en el panel sin forma de empujarlo. Ahora eso se hace solo: cada vez que la lista de
 * eventos cambia (al entrar, despues de aprobar, despublicar o borrar) se revisan los eventos
 * que deberian verse en la web y se reenvian los que tengan algo nuevo. `syncEventChangesToWeb`
 * ya no manda nada si el cuerpo del evento es identico al del ultimo envio aceptado, asi que
 * entrar en la pagina no re-publica todo: solo lo que ha cambiado o nunca llego a la web.
 *
 * El componente casi no se ve: sin boton, solo aparece un aviso breve mientras hay algo que
 * revisar y los problemas, si los hay. Cuando todo esta al dia, no ocupa sitio.
 */
export function AutoSincronizacionConLaWeb({ eventos }: AutoSincronizacionConLaWebProps) {
  const token = useSessionStore((st) => st.token);
  const [estado, setEstado] = useState<Estado>(SIN_AVISO);
  // Misma lista de eventos mientras el padre no traiga datos nuevos: si no, cada render del
  // padre recrearia el filtro y relanzaria la revision entera sin motivo.
  const publicables = useMemo(() => eventos.filter((evento) => shouldAppearOnPublicSite(evento)), [eventos]);

  useEffect(() => {
    if (!canPublishToApi() || !token) return;

    let cancelado = false;
    setEstado({ trabajando: true, actualizados: 0, fallos: [] });

    void (async () => {
      let actualizados = 0;
      const fallos: string[] = [];
      // De uno en uno y no en paralelo: son pocos, y una rafaga de peticiones simultaneas es
      // justo lo que hace que un hosting compartido empiece a cortar conexiones.
      for (const evento of publicables) {
        const resultado = await syncEventChangesToWeb(evento.id, token);
        if (resultado?.status === "published") actualizados += 1;
        else if (resultado) fallos.push(`${evento.title}: ${describePublishOutcome(resultado)}`);
      }
      if (cancelado) return;
      setEstado({ trabajando: false, actualizados, fallos });
    })();

    return () => {
      cancelado = true;
    };
  }, [token, publicables]);

  // Sin sesion en la API no hay nada que sincronizar; el aviso de conexion ya lo explica.
  if (!canPublishToApi()) return null;
  // Sin novedades ni problemas, no hay nada que contar.
  if (!estado.trabajando && estado.actualizados === 0 && estado.fallos.length === 0) return null;

  const hayFallos = estado.fallos.length > 0;

  return (
    <div className="flex flex-col items-start gap-1">
      {estado.trabajando ? (
        <p role="status" className="text-xs text-muted-foreground">
          Comprobando con entraditas.com...
        </p>
      ) : (
        <p
          role="status"
          className={`text-xs font-medium ${hayFallos ? "text-destructive" : "text-success"}`}
        >
          {hayFallos
            ? `${estado.actualizados} publicados en entraditas.com. ${estado.fallos.length} con problemas:`
            : `${estado.actualizados} eventos actualizados en entraditas.com.`}
        </p>
      )}
      {!estado.trabajando &&
        estado.fallos.map((fallo) => (
          <p key={fallo} className="max-w-2xl text-xs text-destructive">
            {fallo}
          </p>
        ))}
    </div>
  );
}