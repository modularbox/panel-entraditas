import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { RoleSlug, User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useTeamQuery } from "./useTeamQuery";

const ROLE_LABELS: Record<RoleSlug, string> = { superadmin: "Superadministrador", admin: "Administrador", user: "Usuario", subuser: "Subusuario" };
const STATUS_LABELS: Record<User["status"], string> = { active: "Activo", invited: "Invitado", disabled: "Desactivado" };

export function TeamListPage() {
  const token = useSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  const { data: members = [], isLoading } = useTeamQuery();
  const [error, setError] = useState<string | null>(null);
  const [resentLinks, setResentLinks] = useState<Record<string, string>>({});

  async function toggleStatus(member: User) {
    setError(null);
    try {
      await apiClient.post(`/users/${member.id}/${member.status === "disabled" ? "enable" : "disable"}`, undefined, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["team"] });
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    }
  }

  async function resendInvite(member: User) {
    setError(null);
    try {
      const result = await apiClient.post<{ inviteUrl: string }>(`/users/${member.id}/resend-invite`, undefined, { token: token! });
      setResentLinks((previous) => ({ ...previous, [member.id]: result.inviteUrl }));
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold">Equipo</h1>
        <Link to="/equipo/invitar"><Button>Invitar persona</Button></Link>
      </header>
      {error && <p role="alert">{error}</p>}
      {isLoading ? <p className="text-muted-foreground">Cargando…</p> : (
        <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt"><tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Nombre</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Correo</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Rol</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Acciones</th>
            </tr></thead>
            <tbody>{members.map((member) => (
              <tr key={member.id} className="border-t border-border">
                <td className="px-4 py-3">{member.fullName}</td><td className="px-4 py-3">{member.email}</td>
                <td className="px-4 py-3">{ROLE_LABELS[member.role]}</td><td className="px-4 py-3">{STATUS_LABELS[member.status]}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap gap-2">
                  <Link to={`/equipo/${member.id}/editar`}><Button type="button" variant="outline" className="h-8 px-2 text-xs">Editar</Button></Link>
                  <Button type="button" variant={member.status === "disabled" ? "outline" : "destructive"} className="h-8 px-2 text-xs" onClick={() => toggleStatus(member)}>{member.status === "disabled" ? "Activar" : "Desactivar"}</Button>
                  {member.status === "invited" && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => resendInvite(member)}>Reenviar invitación</Button>}
                </div>{resentLinks[member.id] && <p className="mt-1 text-xs text-muted-foreground">Enlace: <code>{resentLinks[member.id]}</code></p>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
