import { useQuery } from "@tanstack/react-query";
import type { DirectoryUser } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useUsersDirectoryQuery() {
  const token = useSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["directory", "users"],
    queryFn: () => apiClient.get<DirectoryUser[]>("/directory/users", { token: token! }),
    enabled: Boolean(token)
  });
}
