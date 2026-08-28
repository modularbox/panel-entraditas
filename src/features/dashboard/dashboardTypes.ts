export interface MetricValue {
  value: number;
  change: number;
  trend: "up" | "down";
}

export interface DashboardOverview {
  kpis: {
    grossRevenue: MetricValue;
    netRevenue: MetricValue;
    ticketsSold: MetricValue;
    averageTicket: MetricValue;
    occupancy: MetricValue;
    conversion: MetricValue;
    attendance: MetricValue;
    refunds: MetricValue;
  };
  salesTimeline: { label: string; actual: number; projection?: number }[];
  ticketMix: { label: string; value: number; color: string }[];
  occupancy: { label: string; sold: number; capacity: number }[];
  attendanceCurve: { label: string; value: number }[];
  channels: { label: string; value: number; color: string }[];
  geoHeat: { label: string; value: number }[];
  funnel: { label: string; value: number }[];
  eventMetrics: {
    id: string;
    title: string;
    status: string;
    startsAt: string;
    grossRevenue: number;
    netRevenue: number;
    ticketsSold: number;
    averageTicket: number | null;
    occupancy: number | null;
    conversion: number;
    attendance: number;
    refunds: number;
  }[];
  lastUpdated: string;
}
