import { useEffect, useRef, useState } from "react";
import type { SubEvent, VenuePlanElement } from "@entraditas/types";
import { Button } from "@/shared/ui/button";
import { Icon, type IconName } from "@/shared/ui/icon";

export interface PreviewCategory {
  id: string;
  label: string;
  icon: IconName;
  bg: string;
  text: string;
}

export interface PreviewTicketTier {
  id: string;
  name: string;
  priceCents: number;
  description?: string;
  color?: string;
}

export interface PreviewEventData {
  category: PreviewCategory;
  title?: string;
  coverImageUrl?: string | null;
  gallery?: string[];
  datePending?: boolean;
  startDate?: string;
  startTime?: string;
  location?: string;
  locality?: string;
  description?: string;
  durationMinutes?: number;
  featured?: boolean;
  serviceFeeType?: "none" | "fixed" | "percent";
  serviceFeeValue?: number;
  ticketTiers?: PreviewTicketTier[];
  planElements?: VenuePlanElement[];
  subEvents?: Pick<SubEvent, "id" | "name" | "startsAt" | "endsAt" | "doorsOpenAt">[];
  tags?: string[];
}

export const PREVIEW_CATEGORIES: PreviewCategory[] = [
  { id: "concierto", label: "Conciertos", icon: "mic", bg: "hsl(var(--primary))", text: "#ffffff" },
  { id: "teatro", label: "Teatro", icon: "masks", bg: "#4b2e5b", text: "#ffffff" },
  { id: "cine", label: "Cine", icon: "clapper", bg: "hsl(var(--foreground))", text: "#ffffff" },
  { id: "festival", label: "Festivales", icon: "tent", bg: "hsl(var(--accent))", text: "hsl(var(--foreground))" },
  { id: "deporte", label: "Deporte", icon: "trophy", bg: "#0e6e5e", text: "#ffffff" },
  { id: "conferencia", label: "Conferencias", icon: "presentation", bg: "hsl(var(--success))", text: "#ffffff" },
  { id: "familiar", label: "Familiar", icon: "balloon", bg: "#2e4d6b", text: "#ffffff" }
];

function hasHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function htmlFromPlainText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</p>`)
    .join("");
}

function descriptionHtml(value?: string): string {
  const text = value?.trim();
  if (!text) return "<p>La descripcion aparecera aqui.</p>";
  return hasHtml(text) ? text : htmlFromPlainText(text);
}

function isDatePending(event: PreviewEventData): boolean {
  const subEvents = event.subEvents ?? [];
  const allSubEventsPending = subEvents.length > 0 && subEvents.every((subEvent) => !subEvent.startsAt);
  return Boolean(event.datePending || !event.startDate || allSubEventsPending);
}

function formatLongDate(event: PreviewEventData): string {
  if (isDatePending(event)) return "Fecha por confirmar";
  const date = new Date(`${event.startDate!}T${event.startTime || "00:00"}:00`);
  return date.toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(".", "");
}

function formatShortDate(event: PreviewEventData, options: Intl.DateTimeFormatOptions): string | null {
  if (isDatePending(event)) return null;
  return new Date(event.startDate!).toLocaleDateString("es-ES", options).replace(".", "");
}

function priceFrom(event: PreviewEventData): number | null {
  const prices = (event.ticketTiers ?? []).map((tier) => tier.priceCents).filter((price) => price >= 0);
  return prices.length ? Math.min(...prices) / 100 : null;
}

function priceLabel(event: PreviewEventData, prefix = "Desde"): string {
  if (isDatePending(event)) return "Avisar";
  const price = priceFrom(event);
  if (price === null) return "Entradas pronto";
  if (price === 0) return prefix === "Desde" ? "Entrada gratuita" : "Gratis";
  const feeSuffix = hasServiceFee(event) ? " + gastos" : "";
  return `${prefix ? `${prefix} ` : ""}${price.toFixed(2).replace(".", ",")} EUR${feeSuffix}`;
}

function previewTitle(event: PreviewEventData): string {
  return event.title?.trim() || "Titulo del evento";
}

function venueName(event: PreviewEventData): string {
  return event.location?.trim() || "Ubicacion";
}

function venueCity(event: PreviewEventData): string {
  return event.locality?.trim() || "Localidad";
}

function durationLabel(minutes?: number): string | null {
  if (!minutes) return null;
  if (minutes % 60 === 0) return `${minutes / 60} h`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function hasServiceFee(event: PreviewEventData): boolean {
  return Boolean(event.serviceFeeType && event.serviceFeeType !== "none" && Number(event.serviceFeeValue) > 0);
}

function serviceFeeAmount(event: PreviewEventData, subtotalCents: number, quantity = 1): number {
  if (!hasServiceFee(event)) return 0;
  const value = Number(event.serviceFeeValue ?? 0);
  if (event.serviceFeeType === "percent") return Math.round(subtotalCents * (value / 100));
  return Math.round(value * 100 * quantity);
}

function serviceFeeCopy(event: PreviewEventData, feeCents: number): string {
  if (!hasServiceFee(event)) return "Sin gastos";
  const fee = (feeCents / 100).toFixed(2).replace(".", ",");
  return event.serviceFeeType === "percent" ? `${event.serviceFeeValue}% (${fee} EUR)` : `${fee} EUR`;
}

function sessionDateLabel(subEvent: Pick<SubEvent, "startsAt" | "endsAt">): string {
  if (!subEvent.startsAt) return "Fecha por confirmar";
  const startsAt = new Date(subEvent.startsAt);
  const date = startsAt.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" }).replace(".", "");
  const time = startsAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  if (!subEvent.endsAt) return `${date} - ${time}`;
  const minutes = Math.round((new Date(subEvent.endsAt).getTime() - startsAt.getTime()) / 60_000);
  const duration = durationLabel(minutes);
  return duration ? `${date} - ${time} (${duration})` : `${date} - ${time}`;
}

function seatPositions(capacity: number, width: number, height: number) {
  const maxVisible = 180;
  const count = Math.min(Math.max(0, capacity), maxVisible);
  if (count === 0) return [];
  const aspect = Math.max(0.4, width / Math.max(height, 1));
  const columns = Math.max(1, Math.ceil(Math.sqrt(count * aspect)));
  const rows = Math.max(1, Math.ceil(count / columns));
  return Array.from({ length: count }, (_, index) => ({
    id: index,
    x: ((index % columns) + 0.5) / columns,
    y: (Math.floor(index / columns) + 0.5) / rows
  }));
}

function commandState(name: string): boolean {
  return typeof document.queryCommandState === "function" ? document.queryCommandState(name) : false;
}

export function RichTextEditor({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef("");
  const labelId = `${id}-label`;
  const [activeFormats, setActiveFormats] = useState({ bold: false, list: false });

  useEffect(() => {
    if (editorRef.current && value !== lastValueRef.current) {
      editorRef.current.innerHTML = descriptionHtml(value);
      lastValueRef.current = value;
    }
  }, [value]);

  useEffect(() => {
    function refreshState() {
      if (!editorRef.current || !editorRef.current.contains(document.activeElement)) return;
      setActiveFormats({
        bold: commandState("bold"),
        list: commandState("insertUnorderedList")
      });
    }
    document.addEventListener("selectionchange", refreshState);
    return () => document.removeEventListener("selectionchange", refreshState);
  }, []);

  function sync() {
    const next = editorRef.current?.innerHTML ?? "";
    lastValueRef.current = next;
    onChange(next);
    setActiveFormats({
      bold: commandState("bold"),
      list: commandState("insertUnorderedList")
    });
  }

  function command(name: "bold" | "insertUnorderedList") {
    editorRef.current?.focus();
    if (name === "insertUnorderedList" && activeFormats.list) {
      if (typeof document.execCommand === "function") document.execCommand(name);
      setActiveFormats((current) => ({ ...current, list: false }));
      sync();
      return;
    }
    if (typeof document.execCommand === "function") document.execCommand(name);
    sync();
  }

  return (
    <div>
      <span id={labelId} className="mb-1 block text-sm font-bold">
        {label}
      </span>
      <div className="mb-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant={activeFormats.bold ? "default" : "outline"}
          aria-pressed={activeFormats.bold}
          className="h-9 px-3"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("bold")}
        >
          <Icon name="bold" size={16} /> Negrita
        </Button>
        <Button
          type="button"
          variant={activeFormats.list ? "default" : "outline"}
          aria-pressed={activeFormats.list}
          className="h-9 px-3"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => command("insertUnorderedList")}
        >
          <Icon name="list" size={16} /> Puntos
        </Button>
      </div>
      <div
        ref={editorRef}
        id={id}
        role="textbox"
        aria-labelledby={labelId}
        aria-multiline="true"
        contentEditable
        suppressContentEditableWarning
        onInput={sync}
        onBlur={sync}
        onClick={sync}
        onKeyUp={sync}
        className="min-h-36 w-full max-w-none rounded-lg border-2 border-foreground bg-surface px-4 py-3 text-sm leading-6 text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent [&_p]:mb-2 [&_strong]:font-extrabold [&_ul]:ml-5 [&_ul]:list-disc"
      />
    </div>
  );
}

export function PublicEventPreview({ event, defaultMode = "card" }: { event: PreviewEventData; defaultMode?: "card" | "detail" }) {
  const [mode, setMode] = useState<"card" | "detail">(defaultMode);

  return (
    <aside className="w-full min-w-0 max-w-full overflow-hidden xl:sticky xl:top-6">
      <div className="mb-3 inline-flex rounded-md border-2 border-foreground bg-surface p-1">
        <button
          type="button"
          aria-pressed={mode === "card"}
          onClick={() => setMode("card")}
          className={`rounded-sm px-3 py-2 text-xs font-extrabold uppercase ${mode === "card" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
        >
          Tarjeta web
        </button>
        <button
          type="button"
          aria-pressed={mode === "detail"}
          onClick={() => setMode("detail")}
          className={`rounded-sm px-3 py-2 text-xs font-extrabold uppercase ${mode === "detail" ? "bg-primary text-primary-foreground" : "text-foreground"}`}
        >
          Detalle web
        </button>
      </div>

      {mode === "card" ? <PublicEventCard event={event} /> : <PublicEventDetail event={event} />}
    </aside>
  );
}

function PublicEventCard({ event }: { event: PreviewEventData }) {
  const day = formatShortDate(event, { day: "2-digit" });
  const month = formatShortDate(event, { month: "short" });
  const year = formatShortDate(event, { year: "numeric" });
  const pending = isDatePending(event);

  return (
    <article className="flex h-full max-w-[360px] flex-col overflow-hidden rounded-xl border-2 border-foreground bg-surface shadow-flat transition">
      <div
        className="relative flex h-[190px] items-center justify-center overflow-hidden"
        style={{ background: event.coverImageUrl ? undefined : event.category.bg, color: event.category.text }}
      >
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.3)_1.5px,transparent_1.5px)] bg-[length:16px_16px] opacity-50" />
            <Icon name={event.category.icon} size={40} className="relative z-[1]" />
          </>
        )}
        <div className="absolute left-3 top-3 z-[1] flex flex-col items-center rounded-sm border-2 border-foreground bg-background px-2 py-1 text-foreground">
          {pending || !day ? (
            <>
              <Icon name="bell" size={17} />
              <span className="text-[0.65rem] font-extrabold uppercase tracking-wide">Avisar</span>
            </>
          ) : (
            <>
              <strong className="font-display text-[1.05rem] leading-none">{day}</strong>
              <span className="text-[0.65rem] font-extrabold uppercase tracking-wide">{month}</span>
              <small className="mt-1 w-[calc(100%+0.5rem)] border-t border-border pt-0.5 text-center text-[0.7rem] font-extrabold">
                {year}
              </small>
            </>
          )}
        </div>
        {event.featured && (
          <span className="absolute right-3 top-3 z-[1] rounded-sm bg-foreground px-2.5 py-1 text-[0.72rem] font-extrabold uppercase tracking-wide text-background">
            Destacado
          </span>
        )}
        <span className="absolute bottom-3 right-3 z-[2] inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-foreground bg-background text-foreground">
          <Icon name="heart" size={18} />
        </span>
      </div>
      <div className="relative h-0 border-t-2 border-dashed border-foreground">
        <span className="absolute -left-[9px] -top-[9px] h-[18px] w-[18px] rounded-full border-2 border-foreground bg-background" />
        <span className="absolute -right-[9px] -top-[9px] h-[18px] w-[18px] rounded-full border-2 border-foreground bg-background" />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-5 py-5">
        <span className="text-xs font-extrabold uppercase tracking-[0.06em] text-primary">{event.category.label}</span>
        <div className="my-1 font-display text-xl font-bold leading-tight">{previewTitle(event)}</div>
        <p className="m-0 flex items-start gap-1.5 text-sm text-muted-foreground">
          <Icon name="pin" size={15} className="mt-1 shrink-0" />
          <span className="flex min-w-0 flex-col leading-snug">
            <strong className="font-bold text-foreground">{venueName(event)}</strong>
            <span>{venueCity(event)}</span>
          </span>
        </p>
        <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Icon name={pending ? "bell" : "clock"} size={14} /> {pending ? "Fecha por confirmar" : `${event.startTime || "00:00"}h`}
        </p>
        {event.durationMinutes && (
          <p className="m-0 flex items-center gap-1.5 text-sm text-muted-foreground">
            <Icon name="timer" size={14} /> {durationLabel(event.durationMinutes)}
          </p>
        )}
        <div
          className="mt-1 line-clamp-2 text-sm text-muted-foreground [&_p]:m-0 [&_ul]:m-0"
          dangerouslySetInnerHTML={{ __html: descriptionHtml(event.description) }}
        />
        <p className="mt-auto pt-3 font-display text-lg font-bold">{priceLabel(event)}</p>
      </div>
    </article>
  );
}

function PublicEventDetail({ event }: { event: PreviewEventData }) {
  const tiers = event.ticketTiers?.length
    ? event.ticketTiers
    : [{ id: "preview-general", name: "Entrada general", priceCents: 2500, description: "Acceso general" }];
  const [selectedTierId, setSelectedTierId] = useState(tiers[0]!.id);
  const [quantity, setQuantity] = useState(1);
  const selectedTier = tiers.find((tier) => tier.id === selectedTierId) ?? tiers[0]!;
  const gallery = event.gallery?.filter(Boolean) ?? [];
  const subEvents = event.subEvents ?? [];
  const pending = isDatePending(event);
  const zones = (event.planElements ?? []).filter((element) => element.type === "zone");
  const subtotalCents = selectedTier.priceCents * quantity;
  const feeCents = serviceFeeAmount(event, subtotalCents, quantity);
  const total = (subtotalCents + feeCents) / 100;

  return (
    <article className="w-full max-w-full overflow-hidden rounded-[18px] border-2 border-foreground bg-background p-4 shadow-flat-lg">
      <div
        className="relative mb-5 flex h-[220px] items-center justify-center overflow-hidden rounded-[18px] border-2 border-foreground shadow-flat-lg md:h-[260px]"
        style={{ background: event.coverImageUrl ? undefined : event.category.bg, color: event.category.text }}
      >
        {event.coverImageUrl ? (
          <img src={event.coverImageUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <>
            <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.3)_1.5px,transparent_1.5px)] bg-[length:20px_20px] opacity-50" />
            <Icon name={event.category.icon} size={72} className="relative z-[1]" />
          </>
        )}
      </div>

      {gallery.length > 0 && (
        <div className="mb-6 grid grid-cols-4 gap-2">
          {gallery.slice(0, 4).map((image, index) => (
            <img key={`${image}-${index}`} src={image} alt="" className="aspect-[4/3] rounded-md border-2 border-foreground object-cover" />
          ))}
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[1.6fr_1fr]">
        <main className="min-w-0">
          <span className="inline-flex items-center gap-1.5 rounded-sm border-2 border-foreground bg-surface px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide">
            <Icon name={event.category.icon} size={15} />
            {event.category.label}
          </span>
          <div className="mt-3 font-display text-4xl font-extrabold leading-none">{previewTitle(event)}</div>
          <p className={`mt-4 flex flex-wrap items-center gap-2 text-sm font-bold ${pending ? "text-primary" : "text-muted-foreground"}`}>
            <Icon name={pending ? "bell" : "calendar"} size={16} />
            {formatLongDate(event)}
            {!pending && event.startTime ? ` - ${event.startTime}h` : ""}
            {!pending && durationLabel(event.durationMinutes) ? ` (${durationLabel(event.durationMinutes)})` : ""}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm font-bold text-muted-foreground">
            <Icon name="pin" size={16} />
            {venueName(event)}, {venueCity(event)}
          </p>
          <div className="mt-4 inline-flex items-start gap-2 rounded-lg border border-dashed border-border bg-surface-alt px-3 py-2 text-sm font-semibold text-muted-foreground">
            <Icon name="pin" size={17} className="mt-0.5 shrink-0 text-[#0e6e5e]" />
            <span>
              {venueName(event)} - Mapa preparado - {venueCity(event)}
            </span>
          </div>

          {subEvents.length > 0 && (
            <>
              <h2 className="mt-8 font-display text-3xl font-bold">Sesiones</h2>
              <div className="mt-3 grid gap-2">
                {subEvents.map((subEvent) => (
                  <div key={subEvent.id} className="rounded-lg border-2 border-foreground bg-surface px-4 py-3 shadow-flat">
                    <p className="m-0 font-bold">{subEvent.name}</p>
                    <p className={`m-0 mt-1 flex items-center gap-2 text-sm font-semibold ${subEvent.startsAt ? "text-muted-foreground" : "text-primary"}`}>
                      <Icon name={subEvent.startsAt ? "calendar" : "bell"} size={15} />
                      {sessionDateLabel(subEvent)}
                    </p>
                    {subEvent.doorsOpenAt && (
                      <p className="m-0 mt-1 text-xs font-semibold text-muted-foreground">
                        Puertas: {new Date(subEvent.doorsOpenAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="mt-8 font-display text-3xl font-bold">Sobre este evento</h2>
          <div
            className="mt-3 text-base leading-7 text-foreground [&_p]:mb-3 [&_strong]:font-extrabold [&_ul]:ml-5 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: descriptionHtml(event.description) }}
          />

          <div className="mt-4 flex flex-wrap gap-2">
            {(event.tags?.length ? event.tags : [event.category.label, venueCity(event)]).map((tag) => (
              <span key={tag} className="rounded-sm border-2 border-foreground bg-surface px-3 py-1 text-sm font-bold">
                #{tag}
              </span>
            ))}
          </div>

          {!pending && zones.length > 0 && (
            <>
              <h2 className="mt-8 font-display text-3xl font-bold">Elige tu asiento</h2>
              <div className="mt-3 rounded-xl border-2 border-foreground bg-surface p-3 shadow-flat">
                <div className="relative aspect-[16/9] overflow-hidden rounded-lg border-2 border-foreground bg-background">
                  {zones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      className="absolute flex items-center justify-center overflow-hidden rounded-md border-2 border-foreground p-1 text-center text-[0.65rem] font-extrabold shadow-flat"
                      style={{
                        left: `${zone.x}%`,
                        top: `${zone.y}%`,
                        width: `${zone.width}%`,
                        height: `${zone.height}%`,
                        backgroundColor:
                          zone.color ?? event.ticketTiers?.find((tier) => tier.id === zone.ticketTypeGroupId)?.color ?? "hsl(var(--accent))"
                      }}
                    >
                      <span className="pointer-events-none absolute inset-1" aria-hidden="true">
                        {seatPositions(zone.capacity ?? 0, zone.width, zone.height).map((seat) => (
                          <span
                            key={seat.id}
                            className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground bg-background/80"
                            style={{ left: `${seat.x * 100}%`, top: `${seat.y * 100}%` }}
                          />
                        ))}
                      </span>
                      <span className="relative z-[1] rounded-sm bg-background/85 px-1.5 py-1">{zone.name ?? "Zona"}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs font-semibold text-muted-foreground">Selecciona una zona o asiento en el plano.</p>
              </div>
            </>
          )}
        </main>

        <section className="rounded-xl border-2 border-foreground bg-surface p-4 shadow-flat 2xl:sticky 2xl:top-24">
          <h2 className="font-display text-2xl font-bold">{pending ? "Recibir aviso" : "Comprar entradas"}</h2>
          {pending ? (
            <div className="mt-4 flex flex-col gap-3">
              <span className="inline-flex h-[62px] w-[62px] items-center justify-center rounded-full border-2 border-foreground bg-accent text-foreground shadow-flat">
                <Icon name="bell" size={28} />
              </span>
              <p className="m-0 font-display text-2xl font-extrabold">Fecha por confirmar</p>
              <p className="m-0 text-sm text-muted-foreground">
                La venta se abrira cuando el organizador confirme la sesion. Activa el aviso y lo dejaremos preparado.
              </p>
              <Button type="button" className="mt-2 w-full">
                <Icon name="bell" size={18} /> Avisar
              </Button>
            </div>
          ) : (
            <>
              <fieldset className="mt-4 flex flex-col gap-3 border-0 p-0">
                <legend className="sr-only">Tipo de entrada</legend>
                {tiers.map((tier) => (
                  <label
                    key={tier.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 ${
                      selectedTier.id === tier.id ? "border-foreground bg-surface-alt" : "border-border bg-surface"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={selectedTier.id === tier.id}
                      onChange={() => setSelectedTierId(tier.id)}
                      className="h-5 w-5 accent-primary"
                    />
                    <span className="flex flex-1 flex-col">
                      <span className="font-bold">{tier.name}</span>
                      <span className="text-sm text-muted-foreground">{tier.description || "Entrada para este evento"}</span>
                    </span>
                    <strong className="whitespace-nowrap">{tier.priceCents === 0 ? "Gratis" : `${(tier.priceCents / 100).toFixed(2).replace(".", ",")} EUR`}</strong>
                  </label>
                ))}
              </fieldset>

              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm font-bold">Cantidad</span>
                <div className="inline-flex items-center gap-2 rounded-md border-2 border-foreground bg-background p-1">
                  <button type="button" aria-label="Reducir cantidad" className="grid h-8 w-8 place-items-center" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>
                    <Icon name="minus" size={16} />
                  </button>
                  <span className="w-6 text-center text-sm font-extrabold">{quantity}</span>
                  <button type="button" aria-label="Aumentar cantidad" className="grid h-8 w-8 place-items-center" onClick={() => setQuantity((value) => Math.min(8, value + 1))}>
                    <Icon name="plus" size={16} />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">Maximo 8 entradas por compra.</p>

              <div className="mt-5 flex items-center justify-between border-t-2 border-dashed border-border pt-4 font-bold">
                <span>Entradas</span>
                <span>{subtotalCents === 0 ? "Gratis" : `${(subtotalCents / 100).toFixed(2).replace(".", ",")} EUR`}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm font-bold text-muted-foreground">
                <span>Gastos de gestion</span>
                <span>{serviceFeeCopy(event, feeCents)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t-2 border-dashed border-border pt-4 font-bold">
                <span>Total</span>
                <span className="font-display text-2xl text-primary">{total === 0 ? "Gratis" : `${total.toFixed(2).replace(".", ",")} EUR`}</span>
              </div>
              <Button type="button" className="mt-5 w-full">
                Seleccionar
              </Button>
            </>
          )}
        </section>
      </div>
    </article>
  );
}
