import { useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DirectoryUserDetail, RoleSlug } from "@entraditas/types";
import { SessionResponse, useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";

const ROLE_LABELS: Record<RoleSlug, string> = { superadmin: "Superadministrador", admin: "Administrador", user: "Usuario", subuser: "Subusuario" };
const STATUS_LABELS: Record<DirectoryUserDetail["status"], string> = { active: "Activo", invited: "Invitado", disabled: "Deshabilitado" };
// Mirrors the backend rule in POST /directory/users/:id/connect: never another superadmin, never
// an account that couldn't normally log in itself.
function isConnectable(user: DirectoryUserDetail): boolean {
  return user.role !== "superadmin" && user.status === "active";
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = useSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const { data: user, isLoading, error: queryError } = useQuery({
    queryKey: ["directory", "users", id],
    queryFn: () => apiClient.get<DirectoryUserDetail>(`/directory/users/${id}`, { token: token! }),
    enabled: Boolean(id && token),
    retry: false // a 404 here is a valid "not found" outcome, not a transient failure to retry
  });

  async function connect() {
    if (!user) return;
    setError(null);
    setConnecting(true);
    try {
      const session = await apiClient.post<SessionResponse>(`/directory/users/${user.id}/connect`, undefined, { token: token! });
      // Navigate to a section everyone has access to and let React commit that (flushSync) BEFORE
      // swapping the session — see OrganizationsListPage's connect() for why flushSync matters.
      flushSync(() => navigate("/eventos"));
      useSessionStore.getState().connectAs(session);
      queryClient.clear();
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    } finally {
      setConnecting(false);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (queryError instanceof AppError && queryError.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Usuario no encontrado.</p>
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/usuarios" className="text-sm font-semibold text-primary hover:underline">← Volver al directorio</Link>
      {error && <p role="alert">{error}</p>}

      <section className="divide-y divide-border border-2 border-foreground bg-surface shadow-flat">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5">
          <div>
            <h1 className="font-display text-2xl font-semibold">{user.fullName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button type="button" disabled={!isConnectable(user) || connecting} onClick={connect}>
            {connecting ? "Conectando…" : "Conectar"}
          </Button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Organización</p>
            <p className="mt-1 font-display text-lg font-semibold">{user.organizationName ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Rol</p>
            <p className="mt-1 font-display text-lg font-semibold">{ROLE_LABELS[user.role]}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Estado</p>
            <p className="mt-1 font-display text-lg font-semibold">{STATUS_LABELS[user.status]}</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Eventos con alcance</p>
            <p className="mt-1 font-display text-lg font-semibold">
              {user.eventScopes.length > 0
                ? user.eventScopes.length
                // "Sin restricción" for an org-scoped role still only reaches their own
                // organization's events (see visibleEvents-style scoping across the handlers) — a
                // bare "Todos" would misleadingly read as system-wide, so name the organization.
                : user.organizationName
                  ? `Todos los de ${user.organizationName}`
                  : "Todos"}
            </p>
          </div>
        </div>

        <div className="p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Permisos efectivos</h2>
          <ul className="flex flex-wrap gap-2">
            {user.effectivePermissions.map((permission) => (
              <li key={permission} className="rounded border border-border bg-surface-alt px-2 py-1 font-mono text-xs">{permission}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
