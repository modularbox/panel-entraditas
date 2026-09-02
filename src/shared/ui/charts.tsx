export interface MetricValue {
  value: number;
  change: number;
  trend: "up" | "down";
}

const number = new Intl.NumberFormat("es-ES");

// Shown on a metric a page can't actually derive from real data (no tracking/subsystem exists for
// it), so it doesn't read as trustworthy as the ones that are.
export function SampleDataBadge() {
  return <span className="inline-block rounded border border-dashed border-muted-foreground px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Datos de ejemplo</span>;
}

export function Kpi({ label, metric, format = (value: number) => number.format(value), sample = false }: { label: string; metric: MetricValue; format?: (value: number) => string; sample?: boolean }) {
  return <article className="border-2 border-foreground bg-surface p-4 shadow-flat"><p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}{sample && <SampleDataBadge />}</p><p className="mt-2 font-display text-2xl font-semibold">{format(metric.value)}</p><p className={`mt-1 text-xs font-semibold ${metric.trend === "up" ? "text-success" : "text-primary"}`}>{metric.change > 0 ? "+" : ""}{metric.change}% vs periodo anterior</p></article>;
}

export function Section({ title, note, sample = false, children }: { title: string; note?: string; sample?: boolean; children: React.ReactNode }) {
  return <section className="border-2 border-foreground bg-surface p-5 shadow-flat"><div className="mb-5 flex items-baseline justify-between gap-4"><h2 className="flex items-center gap-2 font-display text-xl font-semibold">{title}{sample && <SampleDataBadge />}</h2>{note && <span className="text-xs text-muted-foreground">{note}</span>}</div>{children}</section>;
}

export function LineChart({ points }: { points: { label: string; actual: number; projection?: number }[] }) {
  const max = Math.max(...points.map((point) => Math.max(point.actual, point.projection ?? 0)), 1);
  const coordinates = points.map((point, index) => `${(index / (points.length - 1)) * 100},${100 - (point.actual / max) * 82}`).join(" ");
  const projection = points.map((point, index) => `${(index / (points.length - 1)) * 100},${100 - ((point.projection ?? point.actual) / max) * 82}`).join(" ");
  return <div><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-44 w-full overflow-visible" role="img" aria-label="Ventas acumuladas y proyección"><line x1="0" y1="100" x2="100" y2="100" stroke="currentColor" strokeOpacity=".2" /><polyline points={projection} fill="none" stroke="#f2c14e" strokeDasharray="2 2" strokeWidth="1.5" /><polyline points={coordinates} fill="none" stroke="#e4572e" strokeWidth="2" /></svg><div className="mt-2 flex justify-between text-[11px] text-muted-foreground">{points.map((point) => <span key={point.label}>{point.label}</span>)}</div><div className="mt-3 flex gap-4 text-xs"><span><i className="mr-1 inline-block h-2 w-2 bg-primary" />Ventas</span><span><i className="mr-1 inline-block h-2 w-2 bg-accent" />Proyección</span></div></div>;
}

export function HorizontalBars({ items, suffix = "%" }: { items: { label: string; value: number }[]; suffix?: string }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="flex flex-col gap-3">{items.map((item) => <div key={item.label}><div className="mb-1 flex justify-between text-xs"><span>{item.label}</span><strong>{item.value}{suffix}</strong></div><div className="h-2 bg-muted"><div className="h-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} /></div></div>)}</div>;
}

export function EmptyState({ message = "No hay datos para estos filtros." }: { message?: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{message}</p>;
}

export function Donut({ channels }: { channels: { label: string; value: number; color: string }[] }) {
  let offset = 0;
  return <div className="flex items-center gap-5"><svg viewBox="0 0 42 42" className="h-32 w-32 -rotate-90" role="img" aria-label="Canales de venta"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#e8e5df" strokeWidth="7" />{channels.map((channel) => { const circle = <circle key={channel.label} cx="21" cy="21" r="15.9" fill="none" stroke={channel.color} strokeWidth="7" strokeDasharray={`${channel.value} ${100 - channel.value}`} strokeDashoffset={-offset} />; offset += channel.value; return circle; })}</svg><div className="flex flex-col gap-2 text-xs">{channels.map((channel) => <span key={channel.label}><i className="mr-2 inline-block h-2 w-2" style={{ backgroundColor: channel.color }} />{channel.label} <strong>{channel.value}%</strong></span>)}</div></div>;
}
