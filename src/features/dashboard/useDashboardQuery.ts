import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { canReadFromApi, fetchApiMetrics } from "@/shared/lib/entraditasApi";
import { dashboardDesdeLaApi } from "./desdeLaApi";
import type { DashboardOverview } from "./dashboardTypes";
import type { DashboardFilters } from "./dashboardFilters";

/**
 * Los números del dashboard.
 *
 * Con sesión en la API se leen de la base de ventas de entraditas.com, que es la única que sabe lo
 * que se ha vendido de verdad. Sin ella (desarrollo y pruebas) se siguen leyendo de los datos de
 * ejemplo del panel, igual que el resto.
 *
 * Los filtros van a los dos sitios. Antes la franja de arriba los ignoraba: se filtraba por un
 * evento y las cifras de la web seguían siendo las de todo, sin decir por qué.
 */
export function useDashboardQuery(filters: DashboardFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.organizationId) params.set("organizationId", filters.organizationId);
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  const query = params.toString();
  const desdeApi = canReadFromApi();

  return useQuery({
    queryKey: ["dashboard", "overview", filters, desdeApi],
    queryFn: async (): Promise<DashboardOverview> => {
      if (desdeApi) {
        const metricas = await fetchApiMetrics({
          organizationId: filters.organizationId || undefined,
          eventId: filters.eventId || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined
        });
        // La API puede estar sirviendo desde ficheros: ahí no hay ventas que contar. Antes que
        // enseñar ceros como si fueran un dato, se cae a los datos de ejemplo del panel.
        if (metricas.disponible) return dashboardDesdeLaApi(metricas);
      }
      const datos = await apiClient.get<DashboardOverview>(`/dashboard/overview${query ? `?${query}` : ""}`, { token: token! });
      return { ...datos, esReal: false };
    },
    enabled: Boolean(token),
    refetchInterval: 15_000,
    // Keep showing the previous filter's data (and the filter bar itself) while a new combination
    // loads, instead of dropping back to the full-page loading state on every change.
    placeholderData: keepPreviousData
  });
}
