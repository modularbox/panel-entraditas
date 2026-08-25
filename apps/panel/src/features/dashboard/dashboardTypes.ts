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
  lastUpdated: string;
}
