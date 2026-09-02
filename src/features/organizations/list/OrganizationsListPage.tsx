import { useState } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { OrganizationListItem } from "@entraditas/types";
import { SessionResponse, useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { useOrganizationsQuery } from "./useOrganizationsQuery";

const columnHelper = createColumnHelper<OrganizationListItem>();
const columns = [
  columnHelper.accessor("name", { header: "Organización" }),
  columnHelper.accessor("admin.fullName", {
    id: "admin",
    header: "Administrador",
    cell: (info) => {
      const admin = info.row.original.admin;
      return admin ? (
        <span className="flex flex-col leading-tight">
          <span>{admin.fullName}</span>
          <span className="text-xs text-muted-foreground">{admin.email}</span>
        </span>
      ) : "—";
    }
  })
];

export function OrganizationsListPage() {
  const token = useSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: organizations = [], isLoading } = useOrganizationsQuery();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  async function connect(organization: OrganizationListItem) {
    setError(null);
    setConnectingId(organization.id);
    try {
      const session = await apiClient.post<SessionResponse>(`/organizations/${organization.id}/connect`, undefined, { token: token! });
      // Navigate to a section everyone has access to and let React commit that (flushSync) BEFORE
      // swapping the session. navigate() alone only updates the browser's history synchronously —
      // React Router doesn't re-render to the new route until the next tick, so without flushSync
      // the still-mounted RequirePermission for THIS (superadmin-only) page would see the session
      // change first, lose its permission, and redirect to /sin-acceso ahead of our own navigation.
      flushSync(() => navigate("/eventos"));
      useSessionStore.getState().connectAs(session);
      queryClient.clear();
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    } finally {
      setConnectingId(null);
    }
  }

  const actionColumns = [
    columnHelper.display({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="outline"
          className="h-8 px-3 text-xs"
          disabled={connectingId === row.original.id}
          onClick={() => connect(row.original)}
        >
          {connectingId === row.original.id ? "Conectando…" : "Conectar"}
        </Button>
      )
    })
  ];

  const table = useReactTable({
    data: organizations,
    columns: [...columns, ...actionColumns],
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
        <p className="mt-1 text-sm text-muted-foreground">
          Al pulsar &quot;Conectar&quot; cambiarás a la sesión del administrador de esa organización. Para volver, usa &quot;Volver a superadmin&quot; en el menú.
        </p>
      </header>
      {error && <p role="alert">{error}</p>}
      {isLoading ? <p className="text-muted-foreground">Cargando…</p> : (
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
                      {header.column.getCanSort()
                        ? <SortableHeader header={header} />
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
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