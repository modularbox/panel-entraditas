export interface DashboardFilters {
  organizationId: string;
  eventId: string;
  from: string;
  to: string;
  // Which date-range preset is currently active, if any ("custom" once Desde/Hasta is edited by
  // hand). UI-only: the backend only ever looks at from/to, never at this field.
  datePreset: string;
}

export const EMPTY_DASHBOARD_FILTERS: DashboardFilters = { organizationId: "", eventId: "", from: "", to: "", datePreset: "all" };

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysAgoRange(days: number): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  return { from: toIsoDate(from), to: toIsoDate(to) };
}

function monthToDateRange(): { from: string; to: string } {
  const to = new Date();
  return { from: toIsoDate(new Date(to.getFullYear(), to.getMonth(), 1)), to: toIsoDate(to) };
}

// Each preset only ever touches the date range; organizationId/eventId are left as they are.
export const DATE_RANGE_PRESETS: { id: string; label: string; range: () => { from: string; to: string } }[] = [
  { id: "7d", label: "7 días", range: () => daysAgoRange(7) },
  { id: "30d", label: "30 días", range: () => daysAgoRange(30) },
  { id: "month", label: "Este mes", range: () => monthToDateRange() },
  { id: "all", label: "Todo", range: () => ({ from: "", to: "" }) }
];
