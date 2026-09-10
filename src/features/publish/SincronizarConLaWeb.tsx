import { useState } from "react";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Button } from "@/shared/ui/button";
import { canPublishToApi } from "@/shared/lib/entraditasApi";
import { shouldAppearOnPublicSite } from "@/shared/lib/eventLifecycle";
import { describePublishOutcome, publishToPublicSite } from "./publishToPublicSite";

interface SincronizarConLaWebProps {
  eventos: Event[];
}

/**
 * Manda a entraditas.com todos los eventos que deberian verse alli.
 *
 * Hace falta porque los eventos solo salian a la web al cambiar de estado (al aprobarlos, al
 * abrir su venta...). Un evento que ya estaba publicado ANTES de que existiera la API se quedaba
 * en el panel sin ninguna forma de empujarlo: en el panel constaba como publicado y en la web no
 * aparecia, sin nada que explicara la diferencia.
 *
 * No cambia ningun estado: solo reenvia lo que ya deberia estar publicado. Por eso tambien sirve
 * de reparacion cuando panel y web se separan por lo que sea (un fallo de red a mitad, la API
 * caida en ese momento, un evento editado sin volver a publicarse).
 */
export function SincronizarConLaWeb({ eventos }: SincronizarConLaWebProps) {
  const token = useSessionStore((s) => s.token);
  const [trabajando, setTrabajando] = useState(false);
  const [resumen, setResumen] = useState<string | null>(null);
  const [fallos, setFallos] = useState<string[]>([]);

  // Lo mismo que decide si un evento se ve en la web: publicado o a la venta, y sin celebrarse.
  const publicables = eventos.filter((evento) => shouldAppearOnPublicSite(evento));

  async function sincronizar() {
    setTrabajando(true);
    setResumen(null);
    setFallos([]);

    let enviados = 0;
    const problemas: string[] = [];

    // De uno en uno y no en paralelo: son pocos, y una rafaga de peticiones simultaneas es
    // justo lo que hace que un hosting compartido empiece a cortar conexiones.
    for (const evento of publicables) {
      const resultado = await publishToPublicSite(evento.id, token!);
      if (resultado.status === "published") enviados += 1;
      else problemas.push(`${evento.title}: ${describePublishOutcome(resultado)}`);
    }

    setFallos(problemas);
    setResumen(
      problemas.length === 0
        ? `${enviados} de ${publicables.length} publicados en entraditas.com.`
        : `${enviados} de ${publicables.length} publicados. ${problemas.length} con problemas:`
    );
    setTrabajando(false);
  }

  // Sin sesion en la API no hay nada que sincronizar; el aviso de conexion ya lo explica.
  if (!canPublishToApi()) return null;

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => void sincronizar()}
          disabled={trabajando || publicables.length === 0}
          className="h-8 px-3 text-xs"
        >
          {trabajando ? "Sincronizando..." : `Sincronizar ${publicables.length} con la web`}
        </Button>
        <span className="text-xs text-muted-foreground">
          Reenvía a entraditas.com todo lo que está publicado o a la venta y aún no se ha celebrado.
        </span>
      </div>

      {resumen && (
        <p role="status" className={`text-xs font-medium ${fallos.length > 0 ? "text-destructive" : "text-success"}`}>
          {resumen}
        </p>
      )}
      {fallos.map((fallo) => (
        <p key={fallo} className="max-w-2xl text-xs text-destructive">
          {fallo}
        </p>
      ))}
    </div>
  );
}
