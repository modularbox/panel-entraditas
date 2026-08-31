import { Navigate, Outlet } from "react-router-dom";
import { usePermissions } from "./usePermissions";

export function RequirePermission({ permission }: { permission: string }) {
  const { has } = usePermissions();
  return has(permission) ? <Outlet /> : <Navigate to="/sin-acceso" replace />;
}
