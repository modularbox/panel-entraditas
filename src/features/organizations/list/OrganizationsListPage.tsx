import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { OrganizationListItem } from "@entraditas/types";
import { hydrateConnectedSession, useSessionStore, type SessionResponse } from "@/shared/auth/sessionStore";
import { abrirPestanaDeConexion } from "@/shared/auth/conectarEnPestana";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { useOrganizationsQuery } from "./useOrganizationsQuery";
import { Cargando } from "@/shared/ui/Cargando";
import { GestionOrganizacion } from "@/features/papelera/BotonesDeGestion";
import { EtiquetaBloqueado } from "@/shared/ui/EtiquetaBloqueado";

export function OrganizationsListPage() {
  const token = useSessionStore((state) => state.token);
  const { data: organizations = [], isLoading, error } = useOrganizationsQuery();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  async function connect(organization: OrganizationListItem) {
    setConnectError(null);
    setConnectingId(organization.id);
    // La pestana se pide de golpe, antes del primer `await`: el clic es lo unico que autoriza a
    // abrirla, y esa autorizacion se gasta en cuanto el codigo vuelve al hilo de peticiones.
    const pestana = abrirPestanaDeConexion();
    if (!pestana) {
      setConnectingId(null);
      setConnectError("El navegador no dejó abrir la pestaña nueva. Permite las ventanas emergentes para este sitio e inténtalo de nuevo.");
      return;
    }
    try {
      const response = await apiClient.post<SessionResponse>(`/organizations/${organization.id}/connect`, undefined, { token: token! });
      const session = await hydrateConnectedSession(response);
      // "Conectar" no cambia la sesion de quien le da al boton: la deja puesta en otra pestana. Aqui
      // no se navega ni se toca la store, asi que el superadmin sigue en esta pestana como estaba.
      pestana.conectar(session);
    } catch (cause) {
      // La conexion no llego: la pestana en blanco se cierra, que si no se queda ahi para siempre.
      pestana.cerrar();
      if (cause instanceof AppError) setConnectError(cause.message);
    } finally {
      setConnectingId(null);
    }
  }

  const columnHelper = useMemo(() => createColumnHelper<OrganizationListItem>(), []);
  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Nombre",
        cell: (info) => (
          <span className="flex flex-col items-start gap-1 whitespace-nowrap">
            <Link to={`/organizaciones/${info.row.original.id}`} className="font-semibold text-primary hover:underline">{info.getValue()}</Link>
            {info.row.original.status === "suspended" && <EtiquetaBloqueado femenino />}
          </span>
        )
      }),
      columnHelper.accessor("slug", { header: "Slug", cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span> }),
      columnHelper.accessor("organizer", {
        header: "Organizador",
        cell: (info) => {
          const organizer = info.getValue();
          return organizer ? (
            <div className="flex flex-col">
              <span>{organizer.fullName}</span>
              <span className="text-muted-foreground">{organizer.email}</span>
            </div>
          ) : (
            <span className="text-muted-foreground">Sin organizador</span>
          );
        }
      }),
      columnHelper.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => {
          const organizer = row.original.organizer;
          const bloqueada = row.original.status === "suspended";
          return (
            <div className="flex flex-nowrap items-start gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-8 px-3 text-xs"
                // Bloqueada, su equipo no puede entrar, tampoco desde aqui.
                disabled={!organizer || bloqueada || connectingId === row.original.id}
                onClick={() => connect(row.original)}
              >
                {connectingId === row.original.id ? "Conectando…" : organizer ? "Conectar" : "Sin organizador"}
              </Button>
              <GestionOrganizacion id={row.original.id} nombre={row.original.name} bloqueado={bloqueada} />
            </div>
          );
        }
      })
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnHelper, connectingId]
  );

  const table = useReactTable({
    data: organizations,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: false
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Organizaciones</h1>
          <p className="mt-1 text-sm text-muted-foreground">Organizadores que venden a través de Entraditas. Al pulsar &quot;Conectar&quot; se abre una pestaña nueva con la sesión de su organizador y aquí sigues con la tuya; para terminar su sesión, cierra esa pestaña. Una organización bloqueada no entra al panel ni vende en la web; eliminada, va a la Papelera con sus eventos y sus ventas.</p>
        </div>
        {/* Las altas nuevas entran por aqui: el formulario de la web deja una solicitud, y de ahi
            sale la organizacion. */}
        <Link to="/organizaciones/solicitudes">
          <Button type="button" variant="outline">Solicitudes de alta</Button>
        </Link>
      </header>
      {connectError && <p role="alert">{connectError}</p>}
      {error && <p role="alert">No se pudieron cargar las organizaciones.</p>}

      {isLoading ? (
        <Cargando />
      ) : organizations.length === 0 ? (
        <p className="text-muted-foreground">No hay organizaciones.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      aria-sort={header.column.getIsSorted() !== false ? (header.column.getIsSorted() === "asc" ? "ascending" : "descending") : undefined}
                      className="px-4 py-3 font-medium text-muted-foreground"
                    >
                      {header.column.getCanSort() ? <SortableHeader header={header} /> : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}