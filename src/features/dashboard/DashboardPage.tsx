import { useState } from "react";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useOrganizationsQuery } from "@/features/organizations/list/useOrganizationsQuery";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useDashboardQuery } from "./useDashboardQuery";
import { DATE_RANGE_PRESETS, EMPTY_DASHBOARD_FILTERS, type DashboardFilters } from "./dashboardFilters";
import type { DashboardOverview, MetricValue } from "./dashboardTypes";

const euro = { format: (value: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value / 100) };
const number = new Intl.NumberFormat("es-ES");
function Kpi({ label, metric, format = (value: number) => number.format(value) }: { label: string; metric: MetricValue; format?: (value: number) => string }) {
  return <article className="border-2 border-foreground bg-surface p-4 shadow-flat"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 font-display text-2xl font-semibold">{format(metric.value)}</p><p className={`mt-1 text-xs font-semibold ${metric.trend === "up" ? "text-success" : "text-primary"}`}>{metric.change > 0 ? "+" : ""}{metric.change}% vs periodo anterior</p></article>;
}
function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return <section className="border-2 border-foreground bg-surface p-5 shadow-flat"><div className="mb-5 flex items-baseline justify-between gap-4"><h2 className="font-display text-xl font-semibold">{title}</h2>{note && <span className="text-xs text-muted-foreground">{note}</span>}</div>{children}</section>;
}
function LineChart({ points }: { points: DashboardOverview["salesTimeline"] }) {
  const max = Math.max(...points.map((point) => Math.max(point.actual, point.projection ?? 0)), 1);
  const coordinates = points.map((point, index) => `${(index / (points.length - 1)) * 100},${100 - (point.actual / max) * 82}`).join(" ");
  const projection = points.map((point, index) => `${(index / (points.length - 1)) * 100},${100 - ((point.projection ?? point.actual) / max) * 82}`).join(" ");
  return <div><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-44 w-full overflow-visible" role="img" aria-label="Ventas acumuladas y proyección"><line x1="0" y1="100" x2="100" y2="100" stroke="currentColor" strokeOpacity=".2" /><polyline points={projection} fill="none" stroke="#f2c14e" strokeDasharray="2 2" strokeWidth="1.5" /><polyline points={coordinates} fill="none" stroke="#e4572e" strokeWidth="2" /></svg><div className="mt-2 flex justify-between text-[11px] text-muted-foreground">{points.map((point) => <span key={point.label}>{point.label}</span>)}</div><div className="mt-3 flex gap-4 text-xs"><span><i className="mr-1 inline-block h-2 w-2 bg-primary" />Ventas</span><span><i className="mr-1 inline-block h-2 w-2 bg-accent" />Proyección</span></div></div>;
}
function HorizontalBars({ items, suffix = "%" }: { items: { label: string; value: number }[]; suffix?: string }) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return <div className="flex flex-col gap-3">{items.map((item) => <div key={item.label}><div className="mb-1 flex justify-between text-xs"><span>{item.label}</span><strong>{item.value}{suffix}</strong></div><div className="h-2 bg-muted"><div className="h-full bg-primary" style={{ width: `${(item.value / max) * 100}%` }} /></div></div>)}</div>;
}
function Donut({ channels }: { channels: DashboardOverview["channels"] }) {
  let offset = 0;
  return <div className="flex items-center gap-5"><svg viewBox="0 0 42 42" className="h-32 w-32 -rotate-90" role="img" aria-label="Canales de venta"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#e8e5df" strokeWidth="7" />{channels.map((channel) => { const circle = <circle key={channel.label} cx="21" cy="21" r="15.9" fill="none" stroke={channel.color} strokeWidth="7" strokeDasharray={`${channel.value} ${100 - channel.value}`} strokeDashoffset={-offset} />; offset += channel.value; return circle; })}</svg><div className="flex flex-col gap-2 text-xs">{channels.map((channel) => <span key={channel.label}><i className="mr-2 inline-block h-2 w-2" style={{ backgroundColor: channel.color }} />{channel.label} <strong>{channel.value}%</strong></span>)}</div></div>;
}
const filterLabel = "mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground";
const filterControl = "h-10 rounded-md border-2 border-foreground bg-surface px-3 text-sm";
function FilterBar({ filters, onChange, isSuperadmin, organizations, events }: {
  filters: DashboardFilters;
  onChange: (filters: DashboardFilters) => void;
  isSuperadmin: boolean;
  organizations: { id: string; name: string }[];
  events: { id: string; title: string; organizationId: string }[];
}) {
  // Once an organization is picked, the event dropdown only offers that organization's events, so
  // the two filters can never point at inconsistent scopes.
  const eventOptions = filters.organizationId ? events.filter((event) => event.organizationId === filters.organizationId) : events;
  return <section className="border-2 border-foreground bg-surface p-4 shadow-flat"><div className="flex flex-wrap items-end gap-4">
    {isSuperadmin && <div><label htmlFor="dashboard-filter-organization" className={filterLabel}>Organización</label><select id="dashboard-filter-organization" className={filterControl} value={filters.organizationId} onChange={(event) => onChange({ ...filters, organizationId: event.target.value, eventId: "" })}><option value="">Todas las organizaciones</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div>}
    <div><label htmlFor="dashboard-filter-event" className={filterLabel}>Evento</label><select id="dashboard-filter-event" className={filterControl} value={filters.eventId} onChange={(event) => onChange({ ...filters, eventId: event.target.value })}><option value="">Todos los eventos</option>{eventOptions.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select></div>
    <div className="flex gap-2">{DATE_RANGE_PRESETS.map((preset) => <Button key={preset.id} type="button" variant={filters.datePreset === preset.id ? "default" : "outline"} aria-pressed={filters.datePreset === preset.id} onClick={() => onChange({ ...filters, ...preset.range(), datePreset: preset.id })}>{preset.label}</Button>)}</div>
    <div><label htmlFor="dashboard-filter-from" className={filterLabel}>Desde</label><input id="dashboard-filter-from" type="date" className={filterControl} value={filters.from} onChange={(event) => onChange({ ...filters, from: event.target.value, datePreset: "custom" })} /></div>
    <div><label htmlFor="dashboard-filter-to" className={filterLabel}>Hasta</label><input id="dashboard-filter-to" type="date" className={filterControl} value={filters.to} onChange={(event) => onChange({ ...filters, to: event.target.value, datePreset: "custom" })} /></div>
    <Button type="button" variant="outline" onClick={() => onChange(EMPTY_DASHBOARD_FILTERS)}>Limpiar filtros</Button>
  </div></section>;
}

export function DashboardPage() {
  const [filters, setFilters] = useState<DashboardFilters>(EMPTY_DASHBOARD_FILTERS);
  const { data, isLoading, isError, dataUpdatedAt } = useDashboardQuery(filters);
  const token = useSessionStore((state) => state.token);
  const user = useSessionStore((state) => state.user);
  const organizationsQuery = useOrganizationsQuery();
  const eventsQuery = useEventsQuery();
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  async function exportReport(format: string) {
    setExportMessage(null); setExportError(null);
    try {
      const result = await apiClient.post<{ filename: string; mimeType: string; content: string }>("/reports/export", { report: "dashboard", format, ...filters }, { token: token! });
      const blob = new Blob([result.content], { type: result.mimeType });
      if (typeof URL.createObjectURL === "function") {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        link.click();
        URL.revokeObjectURL(url);
      }
      setExportMessage(`Exportaci�n ${format.toUpperCase()} descargada con datos de prueba.`);
    } catch (cause) { if (cause instanceof AppError) setExportError(cause.message); }
  }
  if (isLoading) return <p className="text-muted-foreground">Cargando m�tricas...</p>;
  if (isError || !data) return <p role="alert">No se pudieron cargar las m�tricas.</p>;
  const kpis = data.kpis;
  const refreshed = new Date(dataUpdatedAt || data.lastUpdated).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const funnelBase = data.funnel[0]?.value ?? 1;
  const eventDate = (value: string | null) => value ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "Fecha por confirmar";
  return <div className="flex flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Resumen operativo</p><h1 className="mt-1 font-display text-3xl font-semibold">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Actualizado a las {refreshed} · sincronizaci�n automática cada 15 s</p></div><div className="flex items-center gap-2"><label htmlFor="report-format" className="sr-only">Formato de informe</label><select id="report-format" className="h-10 rounded-md border-2 border-foreground bg-surface px-3 text-sm"><option value="csv">CSV</option><option value="xlsx">XLSX</option><option value="pdf">PDF</option></select><Button onClick={() => exportReport((document.getElementById("report-format") as HTMLSelectElement).value)}>Exportar informe</Button></div></header>
    {exportMessage && <p role="status" className="border-2 border-success bg-success-bg px-4 py-3 text-sm font-semibold">{exportMessage}</p>}{exportError && <p role="alert">{exportError}</p>}
    <FilterBar filters={filters} onChange={setFilters} isSuperadmin={user?.role === "superadmin"} organizations={organizationsQuery.data ?? []} events={eventsQuery.data ?? []} />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Ingresos brutos" metric={kpis.grossRevenue} format={euro.format} /><Kpi label="Ingresos netos" metric={kpis.netRevenue} format={euro.format} /><Kpi label="Entradas vendidas" metric={kpis.ticketsSold} /><Kpi label="Ticket medio" metric={kpis.averageTicket} format={euro.format} /><Kpi label="Aforo ocupado" metric={kpis.occupancy} format={(value) => `${value}%`} /><Kpi label="Conversi�n" metric={kpis.conversion} format={(value) => `${value}%`} /><Kpi label="Asistencia" metric={kpis.attendance} format={(value) => `${value}%`} /><Kpi label="Reembolsos" metric={kpis.refunds} format={euro.format} /></div>
    <Section title="Detalle por evento" note="Datos del periodo actual"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b-2 border-foreground"><tr><th className="px-3 py-3">Evento</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Ingresos brutos</th><th className="px-3 py-3">Ingresos netos</th><th className="px-3 py-3">Entradas vendidas</th><th className="px-3 py-3">Ticket medio</th><th className="px-3 py-3">Aforo</th><th className="px-3 py-3">Conversi�n</th><th className="px-3 py-3">Asistencia</th><th className="px-3 py-3">Reembolsos</th></tr></thead><tbody>{data.eventMetrics.map((event) => <tr key={event.id} className="border-b border-border last:border-0"><td className="px-3 py-3 font-semibold">{event.title}<span className="mt-1 block text-xs font-normal text-muted-foreground">{event.status}</span></td><td className="whitespace-nowrap px-3 py-3">{eventDate(event.startsAt)}</td><td className="whitespace-nowrap px-3 py-3">{euro.format(event.grossRevenue)}</td><td className="whitespace-nowrap px-3 py-3">{euro.format(event.netRevenue)}</td><td className="px-3 py-3">{number.format(event.ticketsSold)}</td><td className="whitespace-nowrap px-3 py-3">{event.averageTicket === null ? "—" : euro.format(event.averageTicket)}</td><td className="px-3 py-3">{event.occupancy === null ? "—" : `${event.occupancy}%`}</td><td className="px-3 py-3">{event.conversion}%</td><td className="px-3 py-3">{event.attendance}%</td><td className="whitespace-nowrap px-3 py-3">{euro.format(event.refunds)}</td></tr>)}</tbody></table></div></Section>
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"><Section title="Ventas acumuladas" note="Incluye proyección"><LineChart points={data.salesTimeline} /></Section><Section title="Ventas por tipo" note="Mix de producto"><HorizontalBars items={data.ticketMix} /></Section></div>
    <div className="grid gap-6 lg:grid-cols-2"><Section title="Aforo por evento" note="Vendidas / capacidad"><div className="flex flex-col gap-4">{data.occupancy.map((item) => <div key={item.label}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{item.label}</span><strong>{item.sold} / {item.capacity}</strong></div><div className="h-3 bg-muted"><div className="h-full bg-accent" style={{ width: `${Math.min((item.sold / item.capacity) * 100, 100)}%` }} /></div></div>)}</div></Section><Section title="Curva de entrada" note="Personas acumuladas"><LineChart points={data.attendanceCurve.map((point) => ({ label: point.label, actual: point.value }))} /></Section></div>
    <div className="grid gap-6 lg:grid-cols-3"><Section title="Canales de venta"><Donut channels={data.channels} /></Section><Section title="Origen de compradores" note="�ndice relativo"><HorizontalBars items={data.geoHeat} /></Section><Section title="Embudo de conversi�n"><HorizontalBars items={data.funnel.map((item) => ({ label: item.label, value: Math.round((item.value / funnelBase) * 100) }))} /></Section></div>
  </div>;
}
