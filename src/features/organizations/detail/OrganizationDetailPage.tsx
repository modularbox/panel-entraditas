import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { ApiOrganizationDetail, ApiOrganizationTeamMember } from "@/shared/lib/entraditasApi";
import { hydrateConnectedSession, useSessionStore, type SessionResponse } from "@/shared/auth/sessionStore";
import { abrirPestanaDeConexion } from "@/shared/auth/conectarEnPestana";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { BackButton } from "@/shared/ui/BackButton";
import { Button } from "@/shared/ui/button";
import { OrganizationCustomers } from "./OrganizationCustomers";
import { Cargando } from "@/shared/ui/Cargando";
import { GestionOrganizacion } from "@/features/papelera/BotonesDeGestion";
import { EtiquetaBloqueado } from "@/shared/ui/EtiquetaBloqueado";

// En UTC, como la lista de eventos: la hora guardada es la que tecleo el organizador.
const dateFormatter = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

/** Etiquetas de los estados reales del evento. El badge compartido solo conoce los de los mocks;
 *  aqui los estados que salen de la base van con etiqueta propia y segura. */
const ESTADO_DE_EVENTO: Record<string, string> = {
  draft: "Borrador",
  pending_review: "Pendiente de revisión",
  in_review: "En revisión",
  published: "Publicado",
  on_sale: "A la venta",
  sold_out: "Agotado",
  paused: "En pausa",
  finished: "Finalizado",
  cancelled: "Cancelado",
  rejected: "Rechazado"
};

function EstadoDeEvento({ estado }: { estado: string }) {
  return (
    <span className="inline-block whitespace-nowrap rounded-pill border-2 border-foreground px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide">
      {ESTADO_DE_EVENTO[estado] ?? estado}
    </span>
  );
}

export function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const token = useSessionStore((state) => state.token);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const { data: organization, isLoading, error } = useQuery({
    queryKey: ["organizations", id],
    queryFn: () => apiClient.get<ApiOrganizationDetail>(`/organizations/${id}`, { token: token! }),
    enabled: Boolean(id && token),
    retry: false // a 404 here is a valid "not found" outcome, not a transient failure to retry
  });

  // "Conectar" no cambia la sesion de quien le da al boton: se la pasa a una pestana nueva. Quien
  // sigue aqui sigue siendo el superadmin de siempre; el conectado entra en su propia pestana, y
  // al cerrarla se acaba su sesion.
  async function conectarEnPestana(subjectId: string) {
    setConnectError(null);
    setConnectingId(subjectId);
    // La pestana se pide de golpe, antes del primer `await`: el clic es lo unico que autoriza a
    // abrirla, y esa autorizacion se gasta en cuanto el codigo vuelve al hilo de peticiones.
    const pestana = abrirPestanaDeConexion();
    if (!pestana) {
      setConnectingId(null);
      setConnectError("El navegador no dejó abrir la pestaña nueva. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.");
      return;
    }
    try {
      const response = await apiClient.post<SessionResponse>(`/organizations/${organization?.id}/users/${subjectId}/connect`, undefined, { token: token! });
      const session = await hydrateConnectedSession(response);
      pestana.conectar(session);
    } catch (cause) {
      // La conexion no llego: la pestana en blanco se cierra, que si no se queda ahi para siempre.
      pestana.cerrar();
      if (cause instanceof AppError) setConnectError(cause.message);
    } finally {
      setConnectingId(null);
    }
  }

  if (isLoading) return <Cargando />;
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
  // Bloqueada, nadie de su equipo puede entrar, tampoco con "Conectar" (la API lo rechaza igual).
  const bloqueada = organization.status === "suspended";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <BackButton fallback="/organizaciones" />
          <header>
            <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-semibold">
              {organization.name}
              {organization.status === "suspended" && <EtiquetaBloqueado femenino />}
            </h1>
          </header>
        </div>
        <GestionOrganizacion
          id={organization.id}
          nombre={organization.name}
          bloqueado={organization.status === "suspended"}
          compacto={false}
        />
      </div>

      {connectError && <p role="alert">{connectError}</p>}

      {/* ORGANIZADOR */}
      <section aria-labelledby="admin-heading">
        <h2 id="admin-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">Organizador</h2>
        <div className="rounded-lg border-2 border-foreground bg-surface shadow-flat">
          {/* flex-wrap: en el móvil el nombre y "Conectar" no caben en una fila y el botón se salía
              de la pantalla (tanda 18). */}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Nombre del organizador</span>
              <span className="font-display text-lg font-semibold">
                {organizer ? organizer.fullName : <span className="text-muted-foreground">—</span>}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                disabled={!organizer || bloqueada || connectingId === organizer.id}
                onClick={() => organizer && conectarEnPestana(organizer.id)}
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
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Teléfono</dt>
              <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{organizer?.phone ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </section>

      {/* DATOS FISCALES Y CONTACTO */}
      <section aria-labelledby="fiscal-heading">
        <h2 id="fiscal-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">Datos fiscales y contacto</h2>
        <dl className="grid gap-x-8 gap-y-3 rounded-lg border-2 border-foreground bg-surface px-4 py-3 shadow-flat sm:grid-cols-3">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">CIF / NIF</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{organization.taxId ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Comisión</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">
              {Math.round((organization.commissionRate ?? 0) * 100)} %
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Estado</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">
              {organization.status === "suspended" ? "Bloqueada" : "Activa"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Correo de contacto</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{organization.contactEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Teléfono de contacto</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{organization.contactPhone ?? "—"}</dd>
          </div>
        </dl>
      </section>

      {/* EQUIPO */}
      <section aria-labelledby="team-heading">
        <h2 id="team-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">Equipo</h2>
        {organization.team.length === 0 ? (
          <p className="text-muted-foreground">Esta organización no tiene miembros de equipo.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border-2 border-foreground bg-surface shadow-flat">
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
                {organization.team.map((member) => (
                  <SubOrganizerRow
                    key={member.id}
                    member={member}
                    connecting={connectingId === member.id}
                    bloqueada={bloqueada}
                    onConnect={() => conectarEnPestana(member.id)}
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
          <div className="overflow-x-auto rounded-lg border-2 border-foreground bg-surface shadow-flat">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-alt">
                <tr>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Título</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Entradas</th>
                  <th className="px-4 py-3 font-medium text-muted-foreground">Usadas</th>
                </tr>
              </thead>
              <tbody>
                {organization.events.map((event) => (
                  <tr key={event.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <Link to={`/eventos/${event.id}`} className="font-semibold text-primary hover:underline">{event.title}</Link>
                    </td>
                    <td className="px-4 py-3"><EstadoDeEvento estado={event.status} /></td>
                    <td className="px-4 py-3">{event.startsAt ? dateFormatter.format(new Date(event.startsAt)) : "Fecha por confirmar"}</td>
                    <td className="px-4 py-3">{event.ticketsCount}</td>
                    <td className="px-4 py-3">{event.usedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* CLIENTES */}
      <OrganizationCustomers organizationId={organization.id} />
    </div>
  );
}

function SubOrganizerRow({ member, connecting, bloqueada, onConnect }: { member: ApiOrganizationTeamMember; connecting: boolean; bloqueada: boolean; onConnect: () => void }) {
  return (
    <tr className="border-t border-border">
      <td className="px-4 py-3">{member.fullName}</td>
      <td className="px-4 py-3 text-muted-foreground">{member.email}</td>
      <td className="px-4 py-3">
        {member.accessibleEvents.length === 0 ? (
          <span className="text-muted-foreground">Todos los eventos</span>
        ) : (
          member.accessibleEvents.map((event) => event.title).join(", ")
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <Button type="button" variant="outline" className="h-8 px-3 text-xs" disabled={connecting || bloqueada} onClick={onConnect}>
          {connecting ? "Conectando…" : "CONECTAR"}
        </Button>
      </td>
    </tr>
  );
}