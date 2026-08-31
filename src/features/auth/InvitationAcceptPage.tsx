import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { invitationAcceptSchema, type InvitationAcceptFormValues } from "./invitationAcceptSchema";

interface InvitationDetails { email: string; fullName: string; organizationName: string; role: string }
interface AcceptedSession { accessToken: string; user: { id: string; email: string; fullName: string; role: "superadmin" | "admin" | "user" | "subuser"; organizationId: string | null }; effectivePermissions: string[]; eventScopes: string[] }

export function InvitationAcceptPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const setSession = useSessionStore((state) => state.setSession);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const { data: details, error, isLoading } = useQuery({ queryKey: ["invitation", token], queryFn: () => apiClient.get<InvitationDetails>(`/invitations/${token}`), retry: false });
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<InvitationAcceptFormValues>({ resolver: zodResolver(invitationAcceptSchema) });
  async function onSubmit(values: InvitationAcceptFormValues) {
    setAcceptError(null);
    try {
      const result = await apiClient.post<AcceptedSession>(`/invitations/${token}/accept`, { password: values.password });
      setSession(result);
      navigate("/eventos");
    } catch (cause) {
      if (cause instanceof AppError) setAcceptError(cause.message);
    }
  }
  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error instanceof AppError) return <div className="flex min-h-screen items-center justify-center px-4"><div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-surface p-8 text-center shadow-flat"><p className="font-display text-2xl font-semibold">Invitación no disponible</p><p className="mt-2 text-sm text-muted-foreground">{error.message}</p></div></div>;
  if (!details) return null;
  return <div className="flex min-h-screen items-center justify-center px-4"><div className="w-full max-w-sm rounded-lg border-2 border-foreground bg-surface p-8 shadow-flat"><p className="font-display text-2xl font-semibold text-primary">entraditas</p><h1 className="mt-1 text-sm text-muted-foreground">Te han invitado a unirte a {details.organizationName}, {details.fullName}</h1><form onSubmit={handleSubmit(onSubmit)} className="mt-6 flex flex-col gap-4"><div className="flex flex-col gap-1.5"><label htmlFor="password">Contraseña</label><input id="password" type="password" className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm" {...register("password")} />{errors.password && <span role="alert">{errors.password.message}</span>}</div><div className="flex flex-col gap-1.5"><label htmlFor="confirmPassword">Confirma la contraseña</label><input id="confirmPassword" type="password" className="h-10 rounded-md border-2 border-foreground bg-background px-3 text-sm" {...register("confirmPassword")} />{errors.confirmPassword && <span role="alert">{errors.confirmPassword.message}</span>}</div>{acceptError && <p role="alert">{acceptError}</p>}<Button type="submit" disabled={isSubmitting}>Activar mi cuenta</Button></form></div></div>;
}
