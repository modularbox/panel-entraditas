import { useState } from "react";
import { Link } from "react-router-dom";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useOrganizationsQuery } from "@/features/organizations/list/useOrganizationsQuery";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { Donut, EmptyState, HorizontalBars, Kpi, LineChart, Section } from "@/shared/ui/charts";
import { useDashboardQuery } from "./useDashboardQuery";
import { DATE_RANGE_PRESETS, EMPTY_DASHBOARD_FILTERS, type DashboardFilters } from "./dashboardFilters";

const euro = { format: (value: number) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value / 100) };
const number = new Intl.NumberFormat("es-ES");
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
      setExportMessage(`Exportación ${format.toUpperCase()} descargada con datos de prueba.`);
    } catch (cause) { if (cause instanceof AppError) setExportError(cause.message); }
  }
  if (isLoading) return <p className="text-muted-foreground">Cargando métricas...</p>;
  if (isError || !data) return <p role="alert">No se pudieron cargar las métricas.</p>;
  const kpis = data.kpis;
  const refreshed = new Date(dataUpdatedAt || data.lastUpdated).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  const funnelBase = data.funnel[0]?.value ?? 1;
  const eventDate = (value: string | null) => value ? new Intl.DateTimeFormat("es-ES", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value)) : "Fecha por confirmar";
  return <div className="flex flex-col gap-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Resumen operativo</p><h1 className="mt-1 font-display text-3xl font-semibold">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Actualizado a las {refreshed} · sincronización automática cada 15 s</p></div><div className="flex items-center gap-2"><label htmlFor="report-format" className="sr-only">Formato de informe</label><select id="report-format" className="h-10 rounded-md border-2 border-foreground bg-surface px-3 text-sm"><option value="csv">CSV</option><option value="xlsx">XLSX</option><option value="pdf">PDF</option></select><Button onClick={() => exportReport((document.getElementById("report-format") as HTMLSelectElement).value)}>Exportar informe</Button></div></header>
    {exportMessage && <p role="status" className="border-2 border-success bg-success-bg px-4 py-3 text-sm font-semibold">{exportMessage}</p>}{exportError && <p role="alert">{exportError}</p>}
    <FilterBar filters={filters} onChange={setFilters} isSuperadmin={user?.role === "superadmin"} organizations={organizationsQuery.data ?? []} events={eventsQuery.data ?? []} />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Kpi label="Ingresos brutos" metric={kpis.grossRevenue} format={euro.format} /><Kpi label="Ingresos netos" metric={kpis.netRevenue} format={euro.format} /><Kpi label="Entradas vendidas" metric={kpis.ticketsSold} /><Kpi label="Ticket medio" metric={kpis.averageTicket} format={euro.format} /><Kpi label="Aforo ocupado" metric={kpis.occupancy} format={(value) => `${value}%`} /><Kpi label="Conversión" metric={kpis.conversion} format={(value) => `${value}%`} sample /><Kpi label="Asistencia" metric={kpis.attendance} format={(value) => `${value}%`} sample /><Kpi label="Reembolsos" metric={kpis.refunds} format={euro.format} /></div>
    <Section title="Detalle por evento" note="Datos del periodo actual"><div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="border-b-2 border-foreground"><tr><th className="px-3 py-3">Evento</th><th className="px-3 py-3">Fecha</th><th className="px-3 py-3">Ingresos brutos</th><th className="px-3 py-3">Ingresos netos</th><th className="px-3 py-3">Entradas vendidas</th><th className="px-3 py-3">Ticket medio</th><th className="px-3 py-3">Aforo</th><th className="px-3 py-3">Conversión</th><th className="px-3 py-3">Asistencia</th><th className="px-3 py-3">Reembolsos</th></tr></thead><tbody>{data.eventMetrics.map((event) => <tr key={event.id} className="border-b border-border last:border-0"><td className="px-3 py-3 font-semibold"><Link to={`/eventos/${event.id}`} className="hover:underline">{event.title}</Link><span className="mt-1 block text-xs font-normal text-muted-foreground">{event.status}</span></td><td className="whitespace-nowrap px-3 py-3">{eventDate(event.startsAt)}</td><td className="whitespace-nowrap px-3 py-3">{euro.format(event.grossRevenue)}</td><td className="whitespace-nowrap px-3 py-3">{euro.format(event.netRevenue)}</td><td className="px-3 py-3">{number.format(event.ticketsSold)}</td><td className="whitespace-nowrap px-3 py-3">{event.averageTicket === null ? "—" : euro.format(event.averageTicket)}</td><td className="px-3 py-3">{event.occupancy === null ? "—" : `${event.occupancy}%`}</td><td className="px-3 py-3">{event.conversion}%</td><td className="px-3 py-3">{event.attendance}%</td><td className="whitespace-nowrap px-3 py-3">{euro.format(event.refunds)}</td></tr>)}</tbody></table></div></Section>
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]"><Section title="Ventas acumuladas" note="Incluye proyección"><LineChart points={data.salesTimeline} /></Section><Section title="Ventas por tipo" note="Mix de producto">{data.ticketMix.length === 0 ? <EmptyState /> : <HorizontalBars items={data.ticketMix} />}</Section></div>
    <div className="grid gap-6 lg:grid-cols-2"><Section title="Aforo por evento" note="Vendidas / capacidad">{data.occupancy.length === 0 ? <EmptyState /> : <div className="flex flex-col gap-4">{data.occupancy.map((item) => <div key={item.label}><div className="mb-1 flex justify-between gap-3 text-xs"><span className="truncate">{item.label}</span><strong>{item.sold} / {item.capacity}</strong></div><div className="h-3 bg-muted"><div className="h-full bg-accent" style={{ width: `${Math.min((item.sold / item.capacity) * 100, 100)}%` }} /></div></div>)}</div>}</Section><Section title="Curva de entrada" note="Personas acumuladas"><LineChart points={data.attendanceCurve.map((point) => ({ label: point.label, actual: point.value }))} /></Section></div>
    <div className="grid gap-6 lg:grid-cols-3"><Section title="Canales de venta">{data.channels.length === 0 ? <EmptyState /> : <Donut channels={data.channels} />}</Section><Section title="Origen de compradores" note="Índice relativo" sample><HorizontalBars items={data.geoHeat} /></Section><Section title="Embudo de conversión" sample><HorizontalBars items={data.funnel.map((item) => ({ label: item.label, value: Math.round((item.value / funnelBase) * 100) }))} /></Section></div>
  </div>;
}
