import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { RoleSlug, User } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { canAssignRole, capabilityKeysToOverrides, getConfigurableCapabilities, overridesToCapabilityKeys, SUBORGANIZADOR_ROLE } from "@/shared/auth/permissions";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/ui/BackButton";
import { Button } from "@/shared/ui/button";
import { useTeamQuery } from "../list/useTeamQuery";
import { teamMemberSchema, type TeamMemberFormValues } from "./teamMemberSchema";
import { LIMITES } from "@/shared/lib/formLimits";
import { Cargando } from "@/shared/ui/Cargando";

const ROLE_LABELS: Record<RoleSlug, string> = { superadmin: "Superadmin", organizador: "Organizador", suborganizador: "Suborganizador" };
const ALL_ROLES: RoleSlug[] = ["superadmin", "organizador", "suborganizador"];
const SCOPABLE_ROLES: RoleSlug[] = [SUBORGANIZADOR_ROLE];
const INPUT_CLASSES = "h-10 w-full rounded-md border-2 border-foreground bg-background px-3 text-sm outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60";

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
  const [creada, setCreada] = useState<{ email: string; nombre: string } | null>(null);
  const { register, handleSubmit, watch, reset, setValue, formState: { errors, isSubmitting } } = useForm<TeamMemberFormValues>({ resolver: zodResolver(teamMemberSchema), defaultValues: { email: "", fullName: "", password: "", role: defaultRole, capabilityKeys: [], eventScopes: [] } });
  const selectedRole = watch("role");

  useEffect(() => {
    if (existingMember) reset({ email: existingMember.email, fullName: existingMember.fullName, role: existingMember.role, capabilityKeys: overridesToCapabilityKeys(existingMember.role, existingMember.permissionOverrides), eventScopes: existingMember.eventScopes });
  }, [existingMember, reset]);

  const configurableCapabilities = getConfigurableCapabilities(selectedRole).filter((capability) => capability.permissions.every((permission) => actorEffective.has(permission)));
  const showEventScopes = SCOPABLE_ROLES.includes(selectedRole);
  async function onSubmit(values: TeamMemberFormValues) {
    setSubmitError(null);
    setCreada(null);
    const overrides = capabilityKeysToOverrides(values.role, values.capabilityKeys);
    try {
      if (isEdit) {
        await apiClient.patch(`/users/${id}`, { role: values.role, permissionOverrides: overrides, eventScopes: showEventScopes ? values.eventScopes : [] }, { token: token! });
        await queryClient.invalidateQueries({ queryKey: ["team"] });
        navigate("/equipo");
      } else {
        if (values.password.length < 8) {
          setSubmitError("La contraseña debe tener al menos 8 caracteres.");
          return;
        }
        const result = await apiClient.post<{ user: User }>("/users", { email: values.email, fullName: values.fullName, password: values.password, role: values.role, permissionOverrides: overrides, eventScopes: showEventScopes ? values.eventScopes : [] }, { token: token! });
        await queryClient.invalidateQueries({ queryKey: ["team"] });
        setCreada({ email: result.user.email, nombre: result.user.fullName });
      }
    } catch (cause) {
      if (cause instanceof AppError) setSubmitError(cause.message);
    }
  }
  if (isEdit && !existingMember) return <Cargando />;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <BackButton fallback="/equipo" />
        <h1 className="font-display text-2xl font-semibold">{isEdit ? "Editar persona" : "Crear cuenta de equipo"}</h1>
      </div>
      <div className="flex justify-center">
        <div className="w-full max-w-3xl rounded-lg border-2 border-foreground bg-surface p-8 shadow-flat">
          <p className="text-sm text-muted-foreground">
            {isEdit
              ? "Ajusta el rol, los permisos y el alcance por evento de esta persona."
              : "No hay invitaciones: el organizador crea la cuenta directamente con el correo, el nombre y una contraseña, y se la comunica a la persona cuando quiera."}
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium">Correo electrónico</label>
              <input id="email" type="email" maxLength={LIMITES.email} autoComplete="off" disabled={isEdit} className={INPUT_CLASSES} {...register("email")} />
              {errors.email && <span role="alert" className="text-sm text-destructive">{errors.email.message}</span>}
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="fullName" className="text-sm font-medium">Nombre completo</label>
              <input id="fullName" autoComplete="off" disabled={isEdit} className={INPUT_CLASSES} {...register("fullName")} />
              {errors.fullName && <span role="alert" className="text-sm text-destructive">{errors.fullName.message}</span>}
            </div>

            {!isEdit && (
              <div className="flex min-w-0 flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium">Contraseña</label>
                <input id="password" type="password" minLength={8} maxLength={LIMITES.contrasena} autoComplete="new-password" className={INPUT_CLASSES} {...register("password")} />
                <p className="text-xs text-muted-foreground">Mínimo 8 caracteres. La elige el organizador y se la comunica a la persona, que entrará al panel con ella.</p>
              </div>
            )}

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="role" className="text-sm font-medium">Rol</label>
              <select id="role" className={INPUT_CLASSES} {...register("role", { onChange: () => setValue("capabilityKeys", []) })}>
                {assignableRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role]}</option>)}
              </select>
            </div>

            {configurableCapabilities.length > 0 && (
                <fieldset className="col-span-full grid grid-cols-1 gap-2 rounded-lg border-2 border-border bg-surface p-4 sm:grid-cols-2">
                <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Permisos adicionales</legend>
                {configurableCapabilities.map((capability) => (
                  <label key={capability.key} className="flex min-w-0 items-center gap-2 text-sm">
                    <input type="checkbox" value={capability.key} {...register("capabilityKeys")} />
                    {capability.label}
                  </label>
                ))}
              </fieldset>
            )}

            {showEventScopes && (
                <fieldset className="col-span-full flex flex-col gap-2 rounded-lg border-2 border-border bg-surface p-4">
                <legend className="px-1 text-xs font-extrabold uppercase tracking-wide text-muted-foreground">Alcance por evento (vacío = todos los tuyos)</legend>
                {events.map((event) => (
                  <label key={event.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" value={event.id} {...register("eventScopes")} />
                    {event.title}
                  </label>
                ))}
              </fieldset>
            )}

            {submitError && <p role="alert" className="col-span-full text-sm text-destructive">{submitError}</p>}

            <Button type="submit" disabled={isSubmitting} className="col-span-full mt-2 self-start justify-self-start">
              {isEdit ? "Guardar cambios" : "Crear cuenta"}
            </Button>
          </form>

          {creada && (
            <p role="status" className="mt-6 rounded-md border-2 border-success bg-success-bg px-4 py-3 text-sm font-semibold">
              Cuenta de {creada.nombre} creada. Ya puede entrar en el panel con <code>{creada.email}</code> y la contraseña elegida.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}