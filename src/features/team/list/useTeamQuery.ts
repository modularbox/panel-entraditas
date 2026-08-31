import { useQuery } from "@tanstack/react-query";
import type { User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useTeamQuery() {
  const token = useSessionStore((state) => state.token);
  return useQuery({ queryKey: ["team"], queryFn: () => apiClient.get<User[]>("/users", { token: token! }), enabled: Boolean(token) });
}
