import { hasPermission } from "./permissions";
import { useSessionStore } from "./sessionStore";

export function usePermissions() {
  const effectivePermissions = useSessionStore((s) => s.effectivePermissions);
  const eventScopes = useSessionStore((s) => s.eventScopes);
  return {
    has: (permission: string, opts?: { eventId?: string }) =>
      hasPermission(effectivePermissions, permission, { eventId: opts?.eventId, eventScopes })
  };
}
