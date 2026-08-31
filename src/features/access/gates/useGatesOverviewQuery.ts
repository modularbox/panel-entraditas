import { useQuery } from "@tanstack/react-query";
import type { Gate } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface GateOverviewItem extends Gate {
  eventTitle: string;
  zoneName: string | null;
  operatorNames: string[];
}

export function useGatesOverviewQuery() {
  const token = useSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["gates-overview"],
    queryFn: () => apiClient.get<GateOverviewItem[]>("/gates", { token: token! }),
    enabled: Boolean(token)
  });
}
