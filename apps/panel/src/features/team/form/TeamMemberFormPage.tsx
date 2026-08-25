import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { RoleSlug, User } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { canAssignRole, capabilityKeysToOverrides, getConfigurableCapabilities, overridesToCapabilityKeys } from "@/shared/auth/permissions";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useTeamQuery } from "../list/useTeamQuery";
import { teamMemberSchema, type TeamMemberFormValues } from "./teamMemberSchema";

const ROLE_LABELS: Record<RoleSlug, string> = { superadmin: "Superadministrador", admin: "Administrador", user: "Usuario", subuser: "Subusuario" };
const ALL_ROLES: RoleSlug[] = ["superadmin", "admin", "user", "subuser"];
const SCOPABLE_ROLES: RoleSlug[] = ["user", "subuser"];

export function TeamMemberFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useSessionStore((state) => state.token);
  const actor = useSessionStore((state) => state.user)!;
  const actorEffective = useSessionStore((state) => state.effectivePermissions);
  const { data: members = [] } = useTeamQuery();
  const existingMember: User | undefined = isEdit ? members.find((member) => member.id === id) : undefined;
  const { data: events = [] } = useEventsQuery();
  const assignableRoles = ALL_ROLES.filter((role) => canAssignRole(actor.role, role));
  const defaultRole = assignableRoles[assignableRoles.length - 1] ?? actor.role;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm<TeamMemberFormValues>({ resolver: zodResolver(teamMemberSchema), defaultValues: { email: "", fullName: "", role: defaultRole, capabilityKeys: [], eventScopes: [] } });
  const selectedRole = watch("role");

  useEffect(() => {
    if (existingMember) reset({ email: existingMember.email, fullName: existingMember.fullName, role: existingMember.role, capabilityKeys: overridesToCapabilityKeys(existingMember.role, existingMember.permissionOverrides), eventScopes: existingMember.eventScopes });
  }, [existingMember, reset]);

  const configurableCapabilities = getConfigurableCapabilities(selectedRole).filter((capability) => capability.permissions.every((permission) => actorEffective.has(permission)));
  const showEventScopes = SCOPABLE_ROLES.includes(selectedRole);
  async function onSubmit(values: TeamMemberFormValues) {
    setSubmitError(null);
    const overrides = capabilityKeysToOverrides(values.role, values.capabilityKeys);
    try {
      if (isEdit) {
        await apiClient.patch(`/users/${id}`, { role: values.role, permissionOverrides: overrides, eventScopes: showEventScopes ? values.eventScopes : [] }, { token: token! });
        await queryClient.invalidateQueries({ queryKey: ["team"] });
        navigate("/equipo");
      } else {
        const result = await apiClient.post<{ user: User; inviteUrl: string }>("/users/invite", { email: values.email, fullName: values.fullName, role: values.role, permissionOverrides: overrides, eventScopes: showEventScopes ? values.eventScopes : [] }, { token: token! });
        await queryClient.invalidateQueries({ queryKey: ["team"] });
        setInviteUrl(result.inviteUrl);
      }
    } catch (cause) {
      if (cause instanceof AppError) setSubmitError(cause.message);
    }
  }
  if (isEdit && !existingMember) return <p className="text-muted-foreground">Cargando…</p>;
  return <div className="flex flex-col gap-6">
    <h1 className="font-display text-2xl font-semibold">{isEdit ? "Editar persona" : "Invitar persona"}</h1>
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-lg flex-col gap-4">
      <div className="flex flex-col gap-1.5"><label htmlFor="email">Correo electrónico</label><input id="email" type="email" disabled={isEdit} className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm disabled:opacity-60" {...register("email")} />{errors.email && <span role="alert">{errors.email.message}</span>}</div>
      <div className="flex flex-col gap-1.5"><label htmlFor="fullName">Nombre completo</label><input id="fullName" disabled={isEdit} className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm disabled:opacity-60" {...register("fullName")} />{errors.fullName && <span role="alert">{errors.fullName.message}</span>}</div>
      <div className="flex flex-col gap-1.5"><label htmlFor="role">Rol</label><select id="role" className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm" {...register("role", { onChange: () => setValue("capabilityKeys", []) })}>{assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}</select></div>
      {configurableCapabilities.length > 0 && <fieldset className="flex flex-col gap-1.5"><legend>Permisos adicionales</legend>{configurableCapabilities.map((capability) => <label key={capability.key} className="flex items-center gap-2 text-sm"><input type="checkbox" value={capability.key} {...register("capabilityKeys")} />{capability.label}</label>)}</fieldset>}
      {showEventScopes && <fieldset className="flex flex-col gap-1.5"><legend>Alcance por evento (vacío = todos los tuyos)</legend>{events.map((event) => <label key={event.id} className="flex items-center gap-2 text-sm"><input type="checkbox" value={event.id} {...register("eventScopes")} />{event.title}</label>)}</fieldset>}
      {submitError && <p role="alert">{submitError}</p>}<Button type="submit" disabled={isSubmitting} className="self-start">{isEdit ? "Guardar cambios" : "Invitar persona"}</Button>
    </form>
    {inviteUrl && <div role="status" className="rounded-md border-2 border-foreground bg-surface-alt p-4 text-sm"><p className="font-semibold">Invitación creada. Comparte este enlace:</p><code className="mt-2 block break-all">{inviteUrl}</code></div>}
  </div>;
}
