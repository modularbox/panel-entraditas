import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/shared/ui/button";
import {
  approveApiOrganizerApplication,
  canReadFromApi,
  fetchApiOrganizerApplications,
  rejectApiOrganizerApplication,
  type ApiOrganizerApplication
} from "@/shared/lib/entraditasApi";

/**
 * Solicitudes de alta como organizador, enviadas desde el formulario de entraditas.com.
 *
 * Estas solicitudes llegan a la base de datos de la web, no a los mocks del panel: por eso esta
 * pantalla lee de la API y no de `apiClient`. Sin sesion abierta en la API no hay nada que
 * ensenar, y se dice en vez de pintar una lista vacia que pareceria "no hay solicitudes".
 *
 * Aprobar crea la organizacion y la cuenta de su administrador; rechazar solo marca la solicitud.
 * Las dos cosas las hace la API, que es quien tiene la base de datos delante.
 */

const ESTADOS: { id: string; label: string }[] = [
  { id: "pending", label: "Pendientes" },
  { id: "approved", label: "Aprobadas" },
  { id: "rejected", label: "Rechazadas" },
  { id: "", label: "Todas" }
];

const fecha = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" });

function Ficha({
  solicitud,
  onAprobar,
  onRechazar,
  trabajando
}: {
  solicitud: ApiOrganizerApplication;
  onAprobar: () => void;
  onRechazar: () => void;
  trabajando: boolean;
}) {
  return (
    <li className="flex flex-col gap-3 rounded-lg border-2 border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{solicitud.organizationName}</h2>
          <p className="text-sm text-muted-foreground">
            {solicitud.legalName} · {solicitud.taxId} · {solicitud.reference}
          </p>
        </div>
        <span className="rounded-pill border-2 border-foreground px-2.5 py-0.5 text-xs font-bold uppercase">
          {ESTADOS.find((estado) => estado.id === solicitud.status)?.label ?? solicitud.status}
        </span>
      </div>

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="inline font-semibold">Contacto: </dt>
          <dd className="inline">{solicitud.contactName}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Correo: </dt>
          <dd className="inline">{solicitud.email}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Teléfono: </dt>
          <dd className="inline">{solicitud.phone}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Eventos al año: </dt>
          <dd className="inline">{solicitud.estimatedEvents}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Tipo: </dt>
          <dd className="inline">{solicitud.eventType}</dd>
        </div>
        <div>
          <dt className="inline font-semibold">Localidades: </dt>
          <dd className="inline">{solicitud.localities}</dd>
        </div>
        {solicitud.website && (
          <div className="sm:col-span-2">
            <dt className="inline font-semibold">Web: </dt>
            <dd className="inline">{solicitud.website}</dd>
          </div>
        )}
        {solicitud.createdAt && (
          <div className="sm:col-span-2">
            <dt className="inline font-semibold">Enviada: </dt>
            <dd className="inline">{fecha.format(new Date(solicitud.createdAt))}</dd>
          </div>
        )}
      </dl>

      <p className="rounded-md border-2 border-border bg-surface-alt p-3 text-sm">{solicitud.message}</p>

      {solicitud.status === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onAprobar} disabled={trabajando}>
            Aprobar y crear organización
          </Button>
          <Button type="button" variant="outline" onClick={onRechazar} disabled={trabajando}>
            Rechazar
          </Button>
        </div>
      ) : solicitud.organizationId ? (
        <p className="text-sm">
          Organización creada:{" "}
          <Link to={`/organizaciones/${solicitud.organizationId}`} className="font-semibold text-primary hover:underline">
            ver ficha
          </Link>
        </p>
      ) : null}
    </li>
  );
}

export function OrganizerApplicationsPage() {
  const [estado, setEstado] = useState("pending");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const hayApi = canReadFromApi();

  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ["organizer-applications", estado],
    queryFn: () => fetchApiOrganizerApplications(estado || undefined),
    enabled: hayApi
  });

  async function refrescar() {
    await queryClient.invalidateQueries({ queryKey: ["organizer-applications"] });
  }

  const aprobar = useMutation({
    mutationFn: (id: string) => approveApiOrganizerApplication(id),
    onSuccess: async (resultado) => {
      setError(null);
      setMensaje(
        `Aprobada. Se ha creado la organización y la cuenta de ${resultado.organizer.email}, que todavía no tiene contraseña: tendrá que estrenarla desde "he olvidado mi contraseña".`
      );
      await refrescar();
    },
    onError: (causa) => setError(causa instanceof Error ? causa.message : "No se pudo aprobar la solicitud.")
  });

  const rechazar = useMutation({
    mutationFn: (id: string) => rejectApiOrganizerApplication(id),
    onSuccess: async () => {
      setError(null);
      setMensaje("Solicitud rechazada.");
      await refrescar();
    },
    onError: (causa) => setError(causa instanceof Error ? causa.message : "No se pudo rechazar la solicitud.")
  });

  const trabajando = aprobar.isPending || rechazar.isPending;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Solicitudes de organizador</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lo que llega del formulario de entraditas.com. Al aprobar una solicitud nace su organización y la cuenta de
          quien la va a administrar.{" "}
          <Link to="/organizaciones" className="font-semibold text-primary hover:underline">
            Ver organizaciones
          </Link>
        </p>
      </header>

      {!hayApi ? (
        <p role="alert" className="rounded-md border-2 border-primary bg-primary/10 px-4 py-3 text-sm font-semibold">
          Las solicitudes viven en la base de datos de entraditas.com y este panel no tiene sesión abierta en ella.
          Vuelve a iniciar sesión para verlas.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-sm font-bold">Estado</span>
            {ESTADOS.map((opcion) => (
              <button
                key={opcion.id || "todas"}
                type="button"
                aria-pressed={estado === opcion.id}
                onClick={() => setEstado(opcion.id)}
                className={`rounded-md border-2 px-3 py-2 text-xs font-extrabold uppercase ${
                  estado === opcion.id
                    ? "border-foreground bg-primary text-primary-foreground shadow-flat"
                    : "border-border bg-surface text-foreground"
                }`}
              >
                {opcion.label}
              </button>
            ))}
          </div>

          {mensaje && (
            <p role="status" className="rounded-md border-2 border-success bg-success-bg px-4 py-3 text-sm font-semibold">
              {mensaje}
            </p>
          )}
          {error && <p role="alert">{error}</p>}

          {isLoading ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : solicitudes.length === 0 ? (
            <p className="text-muted-foreground">No hay solicitudes con ese estado.</p>
          ) : (
            <ul aria-label="Solicitudes de organizador" className="flex flex-col gap-4">
              {solicitudes.map((solicitud) => (
                <Ficha
                  key={solicitud.id}
                  solicitud={solicitud}
                  trabajando={trabajando}
                  onAprobar={() => aprobar.mutate(solicitud.id)}
                  onRechazar={() => rechazar.mutate(solicitud.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
