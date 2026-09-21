import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { Event, SubEvent, TicketDesign, TicketDesignData } from "@entraditas/types";
import { cn } from "@/shared/lib/cn";
import { formatTicketDate, formatTicketTime } from "./format";

// A4 a 96 dpi: 210mm x 297mm.
const SHEET_WIDTH = 794;
const SHEET_HEIGHT = 1123;

const FUENTES: Record<TicketDesign["fuente"], string> = {
  Inter: '"Inter", -apple-system, "Segoe UI", sans-serif',
  "Open Sans": '"Open Sans", "Segoe UI", sans-serif',
  Roboto: '"Roboto", "Segoe UI", sans-serif'
};

function orDash(value: string): string {
  return value.trim() ? value : "—";
}

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof ResizeObserver === "undefined") {
      setWidth(node.clientWidth);
      return;
    }
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[130px_1fr] items-baseline gap-4 border-b border-slate-100 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{orDash(value)}</span>
    </div>
  );
}

function BlockHeader({ children, color }: { children: string; color: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="h-3 w-1 rounded-sm" style={{ backgroundColor: color }} />
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-900">{children}</h3>
    </div>
  );
}

function SessionBlock({
  title,
  color,
  rows,
  className
}: {
  title: string;
  color: string;
  rows: Array<[string, string]>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-sm border border-slate-200 p-4", className)}>
      <BlockHeader color={color}>{title}</BlockHeader>
      <dl className="flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">{label}</dt>
            <dd className="text-right font-semibold text-slate-900">{orDash(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * La plantilla de la entrada, lista para imprimir en A4 con el estilo institucional:
 * cabecera azul con logo y referencia, dos columnas (datos del titular + QR/PIN),
 * bloque de evento y sesión, y bloque legal al pie.
 *
 * El diseño solo configura la plantilla: los datos de la entrada (titular, documento,
 * total, QR, PIN...) los genera el emisor al comprar; aqui se muestran valores de ejemplo
 * y los bloques se ocultan segun los interruptores `mostrar*`. La informacion del evento
 * y de la sesion sale del propio evento y estos se pasan como props.
 */
export function TicketDesignPreview({
  design,
  event,
  subEvents = []
}: {
  design: TicketDesign;
  event?: Event | null;
  subEvents?: SubEvent[];
}) {
  const { ref, width } = useContainerWidth();
  // Mientras el contenedor no se ha medido (tests, primer pintado) se muestra en tamaño real.
  const scale = width > 0 ? Math.min((width - 24) / SHEET_WIDTH, 1) : 1;

  // Datos de ejemplo: el emisor los sustituye por los reales al generar cada entrada.
  const datoMuestra: TicketDesignData = {
    titulo: event?.title ?? "Entrada general",
    titular: "Nombre y apellidos del asistente",
    documento: "12345678A",
    tipoEntrada: "General",
    entradas: 1,
    total: "12,00 €",
    referencia: event
      ? `${event.slug.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 16)}-ENTREGA`
      : "EVENTO-ENTREGA",
    pin: "000000",
    qrTexto: event ? `https://entraditas.com/eventos/${event.slug}` : "https://entraditas.com"
  };

  const session = subEvents.find((s) => s.status !== "cancelled") ?? subEvents[0] ?? null;

  const filasEvento: Array<[string, string]> = event
    ? [
        ["Evento", event.title],
        ["Fecha", formatTicketDate(event.startsAt)],
        ["Hora", formatTicketTime(event.startsAt)],
        ["Apertura de puertas", formatTicketTime(event.startsAt)],
        ["Lugar", event.location ?? ""],
        ["Ciudad", event.locality ?? ""]
      ]
    : [
        ["Evento", ""],
        ["Fecha", ""],
        ["Hora", ""],
        ["Apertura de puertas", ""],
        ["Lugar", ""],
        ["Ciudad", ""]
      ];

  const filasSesion: Array<[string, string]> = session
    ? [
        ["Sesión", session.name],
        ["Fecha", formatTicketDate(session.startsAt)],
        ["Hora", formatTicketTime(session.startsAt)],
        ["Apertura de puertas", formatTicketTime(session.doorsOpenAt ?? session.startsAt)]
      ]
    : [];

  return (
    <div ref={ref} className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Vista previa</h2>
        <div className="flex items-center gap-2">
          <span className="rounded-sm border border-border bg-surface-alt px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Datos de ejemplo
          </span>
          <span className="rounded-sm border border-border bg-surface-alt px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            A4 · lista para imprimir
          </span>
        </div>
      </div>
      <div
        className="overflow-hidden"
        style={{ height: scale < 1 ? SHEET_HEIGHT * scale : "auto", transformOrigin: "top left" }}
      >
        <div style={{ width: SHEET_WIDTH * scale, height: SHEET_HEIGHT * scale }}>
          <div
            className="relative bg-white text-slate-900 shadow-flat"
            style={{ width: SHEET_WIDTH, minHeight: SHEET_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left", fontFamily: FUENTES[design.fuente] }}
          >
            {design.marcaAgua && (
              <img
                src={design.marcaAgua}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 mx-auto my-auto object-contain"
                style={{ width: 380, height: 380, opacity: design.opacidadMarcaAgua }}
              />
            )}

            {/* Cabecera azul */}
            <header
              className="relative z-10 flex h-24 items-center justify-between px-12 text-white"
              style={{ backgroundColor: design.colorPrimario }}
            >
              {design.logo ? (
                <img src={design.logo} alt="Logo" className="h-12 w-auto max-w-56 object-contain" />
              ) : (
                <span className="font-black italic tracking-tight">
                  Entradas
                  <span className="ml-2 rounded-sm border border-white/40 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-widest">
                    EVENTO
                  </span>
                </span>
              )}
              <div className="text-right">
                <p className="text-[9px] uppercase tracking-[0.2em] text-white/70">Ref.</p>
                <p className="text-sm font-bold">{orDash(datoMuestra.referencia)}</p>
              </div>
            </header>

            <div className="relative z-10 px-12 pb-10 pt-8">
              <div className="grid grid-cols-[1fr_250px] gap-10">
                {/* Columna izquierda: datos del titular (en cuanto la compra genera la entrada) */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Entrada</p>
                  <h2 className="mt-1 text-3xl font-black tracking-tight text-slate-900">
                    Entrada: {datoMuestra.titulo}
                  </h2>
                  {design.mostrarInformacion && (
                    <dl className="mt-5">
                      <DataRow label="Titular" value={datoMuestra.titular} />
                      <DataRow label="Documento" value={datoMuestra.documento} />
                      <DataRow label="Tipo de entrada" value={datoMuestra.tipoEntrada} />
                      <DataRow label="Entradas" value={String(datoMuestra.entradas)} />
                      <DataRow label="Total" value={datoMuestra.total} />
                      <DataRow label="Referencia" value={datoMuestra.referencia} />
                    </dl>
                  )}
                </div>

                {/* Columna derecha: QR y PIN */}
                <div className="flex flex-col items-center gap-4">
                  {design.mostrarQR && (
                    <div className="flex w-full flex-col items-center rounded-sm border border-slate-200 p-5">
                      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Código QR
                      </p>
                      <QRCodeSVG value={datoMuestra.qrTexto || "https://entraditas.com"} size={168} level="M" marginSize={4} />
                    </div>
                  )}
                  {design.mostrarPIN && (
                    <div className="w-full text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">PIN de acceso</p>
                      <div className="mt-1 rounded-sm border border-slate-300 px-2 py-3">
                        <span className="text-4xl font-black tracking-[0.3em] text-slate-900">
                          {orDash(datoMuestra.pin)}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-slate-400">Introduzca este PIN en el teclado del acceso.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información del evento y de la sesión */}
              <section className="mt-10" aria-label="Evento y sesión">
                <BlockHeader color={design.colorPrimario}>Información del evento y de la sesión</BlockHeader>
                <div className="grid grid-cols-2 gap-4">
                  <SessionBlock title="Evento" color={design.colorPrimario} rows={filasEvento} />
                  {design.mostrarSesion && filasSesion.length > 0 && (
                    <SessionBlock title="Sesión" color={design.colorPrimario} rows={filasSesion} />
                  )}
                </div>
              </section>

              {/* Bloque legal */}
              {design.mostrarTerminos && (
                <section className="mt-10" aria-label="Términos y condiciones">
                  <h3 className="text-sm font-bold text-slate-900">Términos y Condiciones Generales</h3>
                  <ol className="mt-3 flex flex-col">
                    {design.terminos.map((line, index) => (
                      <li
                        key={index}
                        className="flex gap-3 border-b border-slate-100 py-1.5 text-[11px] leading-relaxed text-slate-600"
                      >
                        <span className="font-bold text-slate-400">{index + 1}.</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>

            {/* Pie */}
            <footer className="relative z-10 flex items-end justify-center px-12 pb-6 pt-2">
              <p className="text-center text-[9px] tracking-wide text-slate-400">{design.pie}</p>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}