export interface MetricValue {
  value: number;
  /**
   * Variación respecto al periodo anterior. `null` cuando no se puede calcular.
   *
   * En los datos de ejemplo viene un número escrito a mano. Con datos reales viene `null`: para
   * saber si algo sube hace falta compararlo con el periodo anterior, y eso todavía no se calcula.
   * Enseñar un "+12,4%" inventado al lado de unos ingresos que sí son ciertos es peor que no
   * enseñar nada.
   */
  change: number | null;
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
    startsAt: string | null;
    grossRevenue: number;
    netRevenue: number;
    ticketsSold: number;
    averageTicket: number | null;
    occupancy: number | null;
    /** `null` con datos reales: no hay de dónde sacar la conversión sin medir visitas. */
    conversion: number | null;
    /** Porcentaje de entradas escaneadas. `null` cuando no se han emitido entradas todavía. */
    attendance: number | null;
    refunds: number;
  }[];
  lastUpdated: string;
  /**
   * Si esto sale de la base de datos de entraditas.com o de los datos de ejemplo del panel.
   *
   * Cambia lo que se puede enseñar: con datos reales se ocultan las secciones que hoy no se pueden
   * calcular (origen de compradores, embudo, curva de entrada), en vez de pintarlas con números
   * puestos a mano junto a los que sí son ciertos.
   */
  esReal: boolean;
  /** La API recortó el filtro de organización al propio de quien pregunta. */
  recortadoAlPropio?: boolean;
}
