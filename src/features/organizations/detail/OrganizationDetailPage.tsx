import { useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { OrganizationDetail, OrganizationSubOrganizer } from "@entraditas/types";
import { useSessionStore, type SessionResponse } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/ui/BackButton";
import { Button } from "@/shared/ui/button";
import { EventStatusBadge } from "@/shared/ui/EventStatusBadge";

const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = useSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const { data: organization, isLoading, error } = useQuery({
    queryKey: ["organizations", id],
    queryFn: () => apiClient.get<OrganizationDetail>(`/organizations/${id}`, { token: token! }),
    enabled: Boolean(id && token),
    retry: false // a 404 here is a valid "not found" outcome, not a transient failure to retry
  });

  // "Conectar" cambia la sesión actual a la de un miembro de la organización (el organizador o un
  // suborganizador concreto). Se navega primero a /eventos (sección con acceso para todos) y luego
  // se intercambia la sesión; el botón "Volver a superadmin" del menú permite regresar.
  async function connectAs(subjectId: string) {
    setConnectError(null);
    setConnectingId(subjectId);
    try {
      const session = await apiClient.post<SessionResponse>(`/organizations/${organization?.id}/users/${subjectId}/connect`, undefined, { token: token! });
      flushSync(() => navigate("/eventos"));
      useSessionStore.getState().connectAs(session);
      queryClient.clear();
    } catch (cause) {
      if (cause instanceof AppError) setConnectError(cause.message);
    } finally {
      setConnectingId(null);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Organización no encontrada.</p>
      </div>
    );
  }
  if (!organization) return null;

  const organizer = organization.organizer;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-4">
        <BackButton fallback="/organizaciones" />
        <header>
          <h1 className="font-display text-2xl font-semibold">{organization.name}</h1>
        </header>
      </div>

      {connectError && <p role="alert">{connectError}</p>}

      {/* ORGANIZADOR */}
      <section aria-labelledby="organizador-heading">
        <h2 id="organizador-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">Organizador</h2>
        <div className="rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Nombre organizador</span>
              <span className="font-display text-lg font-semibold">
                {organizer ? organizer.fullName : <span className="text-muted-foreground">—</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                disabled={!organizer || connectingId === organizer.id}
                onClick={() => organizer && connectAs(organizer.id)}
              >
                {connectingId === organizer?.id ? "Conectando…" : organizer ? "CONECTAR" : "Sin organizador"}
              </Button>
            </div>
          </div>
          <dl className="grid gap-x-8 gap-y-3 px-4 py-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Correo</dt>
              <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{organizer?.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cuenta</dt>
              <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{organizer?.bankAccount ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* SUBORGANIZADORES */}
      <section aria-labelledby="suborganizadores-heading">
        <h2 id="suborganizadores-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">Suborganizadores</h2>
        {organization.subOrganizers.length === 0 ? (
          <p className="text-muted-foreground">Esta organización no tiene suborganizadores.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Correo</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Eventos</th>
                  <th className="px-4 py-3" aria-label="Acciones"></th>
                </tr>
              </thead>
              <tbody>
                {organization.subOrganizers.map((subOrganizer) => (
                  <SubOrganizerRow
                    key={subOrganizer.id}
                    subOrganizer={subOrganizer}
                    connecting={connectingId === subOrganizer.id}
                    onConnect={() => connectAs(subOrganizer.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* EVENTOS */}
      <section aria-labelledby="eventos-heading">
        <h2 id="eventos-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">Eventos</h2>
        {organization.events.length === 0 ? (
          <p className="text-muted-foreground">Esta organización no tiene eventos.</p>
        ) : (
          <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Título</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Usuarios con acceso</th>
                </tr>
              </thead>
              <tbody>
                {organization.events.map((event) => (
                  <tr key={event.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link to={`/eventos/${event.id}`} className="font-semibold text-primary hover:underline">{event.title}</Link>
                    </td>
                    <td className="px-4 py-3"><EventStatusBadge status={event.status} /></td>
                    <td className="px-4 py-3">{event.startsAt ? dateFormatter.format(new Date(event.startsAt)) : "Fecha por confirmar"}</td>
                    <td className="px-4 py-3">
                      {event.accessUsers.length === 0 ? (
                        <span className="text-muted-foreground">Sin usuarios</span>
                      ) : (
                        <span>{event.accessUsers.map((user) => user.fullName).join(", ")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SubOrganizerRow({ subOrganizer, connecting, onConnect }: { subOrganizer: OrganizationSubOrganizer; connecting: boolean; onConnect: () => void }) {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">{subOrganizer.fullName}</td>
      <td className="px-4 py-3 text-muted-foreground">{subOrganizer.email}</td>
      <td className="px-4 py-3">
        {subOrganizer.accessibleEvents.length === 0 ? (
          <span className="text-muted-foreground">Sin eventos</span>
        ) : (
          subOrganizer.accessibleEvents.map((event) => event.title).join(", ")
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" disabled={connecting} onClick={onConnect}>
          {connecting ? "Conectando…" : "CONECTAR"}
        </Button>
      </td>
    </tr>
  );
}