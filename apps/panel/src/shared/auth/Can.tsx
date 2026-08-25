import type { ReactNode } from "react";
import { usePermissions } from "./usePermissions";

interface CanProps {
  do: string;
  on?: { eventId?: string };
  children: ReactNode;
  fallback?: ReactNode;
}

export function Can({ do: action, on, children, fallback = null }: CanProps) {
  const { has } = usePermissions();
  return <>{has(action, on) ? children : fallback}</>;
}
