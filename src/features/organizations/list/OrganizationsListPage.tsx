import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { OrganizationListItem } from "@entraditas/types";
import { SessionResponse, useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { useOrganizationsQuery } from "./useOrganizationsQuery";

export function formatCommissionRate(rate: number): string {
  const percent = Math.round(rate * 100);
  return `${percent}%`;
}

export function OrganizationsListPage() {
  const token = useSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: organizations = [], isLoading, error } = useOrganizationsQuery();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  async function connect(organization: OrganizationListItem) {
    setConnectError(null);
    setConnectingId(organization.id);
    try {
      const session = await apiClient.post<SessionResponse>(`/organizations/${organization.id}/connect`, undefined, { token: token! });
      // Navigate to a section everyone has access to and let React commit that (flushSync) BEFORE
      // swapping the session: without it, RequirePermission on a page the superadmin can't see
      // would react to the permission loss and redirect to /sin-acceso, racing this navigation.
      flushSync(() => navigate("/eventos"));
      useSessionStore.getState().connectAs(session);
      queryClient.clear();
    } catch (cause) {
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
          <Link to={`/organizaciones/${info.row.original.id}`} className="font-semibold text-primary hover:underline">{info.getValue()}</Link>
        )
      }),
      columnHelper.accessor("slug", { header: "Slug", cell: (info) => <span className="text-muted-foreground">{info.getValue()}</span> }),
      columnHelper.accessor("commissionRate", { header: "Comisión", cell: (info) => formatCommissionRate(info.getValue()) }),
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
          return (
            <Button
              type="button"
              variant="outline"
              className="h-8 px-3 text-xs"
              disabled={!organizer || connectingId === row.original.id}
              onClick={() => connect(row.original)}
            >
              {connectingId === row.original.id ? "Conectando…" : organizer ? "Conectar" : "Sin organizador"}
            </Button>
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
      <header>
        <h1 className="font-display text-2xl font-semibold">Organizaciones</h1>
        <p className="mt-1 text-sm text-muted-foreground">Organizadores que venden a través de Entraditas. Al pulsar &quot;Conectar&quot; pasarás a la sesión de su organizador; para volver, usa &quot;Volver a superadmin&quot; en el menú.</p>
      </header>
      {connectError && <p role="alert">{connectError}</p>}
      {error && <p role="alert">No se pudieron cargar las organizaciones.</p>}

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : organizations.length === 0 ? (
        <p className="text-muted-foreground">No hay organizaciones.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
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