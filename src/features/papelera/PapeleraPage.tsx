import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AccionConConfirmacion } from "@/shared/ui/AccionConConfirmacion";
import { useAvisoGlobal } from "@/shared/ui/AvisoGlobal";
import { Button } from "@/shared/ui/button";
import { Cargando } from "@/shared/ui/Cargando";
import {
  borrarParaSiempre,
  listarPapelera,
  NOMBRE_DEL_TIPO,
  restaurar,
  useRefrescarTodo,
  type ElementoEnPapelera,
  type TipoEnPapelera
} from "./papelera";

const FILTROS: Array<{ valor: "" | TipoEnPapelera; etiqueta: string }> = [
  { valor: "", etiqueta: "Todo" },
  { valor: "event", etiqueta: "Eventos" },
  { valor: "order", etiqueta: "Ventas" },
  { valor: "customer", etiqueta: "Clientes" },
  { valor: "organization", etiqueta: "Organizaciones" }
];

const fecha = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

function cuando(elemento: ElementoEnPapelera): string {
  if (!elemento.deletedAt) return "";
  const valor = new Date(elemento.deletedAt);
  const texto = Number.isNaN(valor.getTime()) ? "" : fecha.format(valor);
  return elemento.deletedBy ? `${texto} · ${elemento.deletedBy}` : texto;
}

/**
 * La papelera del panel (tanda 21).
 *
 * Todo lo que se elimina en el panel (eventos, ventas, clientes y organizaciones) viene aqui. Desde
 * aqui se RESTAURA, que lo devuelve tal cual estaba con todo lo suyo, o se BORRA PARA SIEMPRE, que
 * no se puede deshacer y por eso dice antes que se lleva por delante.
 *
 * El superadmin ve la papelera entera; un organizador, los eventos y ventas de su organizacion.
 */
export function PapeleraPage() {
  const token = useSessionStore((s) => s.token);
  const esSuperadmin = useSessionStore((s) => s.user?.role === "superadmin");
  const refrescar = useRefrescarTodo();
  const avisar = useAvisoGlobal((s) => s.avisar);
  const [filtro, setFiltro] = useState<"" | TipoEnPapelera>("");
  const [vaciando, setVaciando] = useState(false);
  const { data: elementos = [], isLoading, error } = useQuery({
    queryKey: ["papelera"],
    queryFn: () => listarPapelera(token!),
    enabled: Boolean(token)
  });

  const visibles = useMemo(() => (filtro ? elementos.filter((e) => e.type === filtro) : elementos), [elementos, filtro]);
  const cuantos = useMemo(() => {
    const porTipo: Record<string, number> = {};
    for (const elemento of elementos) porTipo[elemento.type] = (porTipo[elemento.type] ?? 0) + 1;
    return porTipo;
  }, [elementos]);

  async function vaciar() {
    setVaciando(true);
    let borrados = 0;
    try {
      // De uno en uno: cada borrado es una transaccion aparte, y si uno falla los demas siguen.
      for (const elemento of visibles) {
        try {
          await borrarParaSiempre(elemento.type, elemento.id, token!);
          borrados += 1;
        } catch {
          // Se queda en la papelera; el aviso de abajo dice cuantos no se pudieron borrar.
        }
      }
    } finally {
      setVaciando(false);
    }
    const fallidos = visibles.length - borrados;
    avisar(fallidos === 0 ? `Papelera vaciada: ${borrados} borrados para siempre.` : `Se han borrado ${borrados}; ${fallidos} no se pudieron borrar y siguen en la papelera.`);
    await refrescar();
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Papelera</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Lo que se elimina en el panel viene aquí y deja de contar en todas partes: no sale en el panel, ni en
            entraditas.com, ni en las cifras. <strong>Restaurar</strong> lo devuelve tal cual estaba, con todo lo suyo.{" "}
            <strong>Borrar para siempre</strong> no se puede deshacer.
            {!esSuperadmin && " Aquí ves los eventos y las ventas de tu organización."}
          </p>
        </div>
        {visibles.length > 0 && (
          <AccionConConfirmacion
            etiqueta={filtro ? `Vaciar ${FILTROS.find((f) => f.valor === filtro)?.etiqueta.toLowerCase()}` : "Vaciar papelera"}
            confirmar={`Sí, borrar ${visibles.length} para siempre`}
            trabajando="Borrando..."
            compacto={false}
            disabled={vaciando}
            aviso={`Se borran para siempre ${visibles.length === 1 ? "lo que hay" : `los ${visibles.length} elementos que ves`}, con todo lo que se lleva cada uno (lo pone en cada fila). No se puede deshacer.`}
            accion={vaciar}
          />
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => {
          if (!esSuperadmin && (f.valor === "customer" || f.valor === "organization")) return null;
          const activo = filtro === f.valor;
          const n = f.valor ? cuantos[f.valor] ?? 0 : elementos.length;
          return (
            <button
              key={f.valor || "todo"}
              type="button"
              aria-pressed={activo}
              onClick={() => setFiltro(f.valor)}
              className={`rounded-md border-2 px-3 py-2 text-xs font-extrabold uppercase ${
                activo ? "border-foreground bg-primary text-primary-foreground shadow-flat" : "border-border bg-surface text-foreground"
              }`}
            >
              {f.etiqueta} ({n})
            </button>
          );
        })}
      </div>

      {error && <p role="alert">No se pudo cargar la papelera.</p>}

      {isLoading ? (
        <Cargando />
      ) : visibles.length === 0 ? (
        <p className="text-muted-foreground">{elementos.length === 0 ? "La papelera está vacía." : "No hay nada de este tipo en la papelera."}</p>
      ) : (
        // Tarjetas y no tabla: en el movil una tabla de cuatro columnas dejaba los botones fuera.
        <ul className="flex flex-col divide-y-2 divide-border rounded-lg border-2 border-foreground bg-surface shadow-flat">
          {visibles.map((elemento) => (
            <FilaDePapelera key={`${elemento.type}-${elemento.id}`} elemento={elemento} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaDePapelera({ elemento }: { elemento: ElementoEnPapelera }) {
  const token = useSessionStore((s) => s.token);
  const refrescar = useRefrescarTodo();
  const avisar = useAvisoGlobal((s) => s.avisar);
  const [restaurando, setRestaurando] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  async function devolver() {
    setRestaurando(true);
    setFallo(null);
    try {
      const nota = await restaurar(elemento.type, elemento.id, token!);
      avisar(nota ?? `"${elemento.title}" restaurado: vuelve a estar como antes.`);
      await refrescar();
    } catch (causa) {
      setFallo(causa instanceof Error ? causa.message : "No se pudo restaurar.");
    } finally {
      setRestaurando(false);
    }
  }

  return (
    <li className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {NOMBRE_DEL_TIPO[elemento.type]} · eliminado {cuando(elemento)}
        </p>
        <p className="mt-1 break-words font-semibold">{elemento.title}</p>
        {elemento.detail && <p className="mt-0.5 break-words text-xs text-muted-foreground">{elemento.detail}</p>}
        {elemento.note && <p className="mt-1 text-xs font-medium text-destructive">{elemento.note}</p>}
      </div>
      <div className="shrink-0">
        <div className="flex flex-wrap items-start gap-2">
          <Button type="button" className="h-8 shrink-0 whitespace-nowrap px-3 text-xs" disabled={restaurando} onClick={() => void devolver()}>
            {restaurando ? "Restaurando..." : "Restaurar"}
          </Button>
          <AccionConConfirmacion
            etiqueta="Borrar para siempre"
            confirmar="Sí, borrar para siempre"
            trabajando="Borrando..."
            aviso={`${elemento.purge} No se puede deshacer.`}
            accion={async () => {
              await borrarParaSiempre(elemento.type, elemento.id, token!);
              avisar(`"${elemento.title}" borrado para siempre.`);
              await refrescar();
            }}
          />
        </div>
        {fallo && (
          <p role="alert" className="mt-1 text-xs font-medium text-destructive">
            {fallo}
          </p>
        )}
      </div>
    </li>
  );
}
