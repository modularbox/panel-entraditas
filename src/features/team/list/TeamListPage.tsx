import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { RoleSlug, User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { useTeamQuery } from "./useTeamQuery";

const ROLE_LABELS: Record<RoleSlug, string> = { superadmin: "Superadministrador", admin: "Administrador", user: "Usuario", subuser: "Subusuario" };
const STATUS_LABELS: Record<User["status"], string> = { active: "Activo", invited: "Invitado", disabled: "Desactivado" };
const ROLE_ORDER: RoleSlug[] = ["superadmin", "admin", "user", "subuser"];

const columnHelper = createColumnHelper<User>();
const columns = [
  columnHelper.accessor("fullName", { header: "Nombre" }),
  columnHelper.accessor("email", { header: "Correo" }),
  columnHelper.accessor("role", {
    header: "Rol",
    cell: (info) => ROLE_LABELS[info.getValue()],
    sortingFn: (rowA, rowB, columnId) => ROLE_ORDER.indexOf(rowA.getValue<RoleSlug>(columnId)) - ROLE_ORDER.indexOf(rowB.getValue<RoleSlug>(columnId))
  }),
  columnHelper.accessor("status", { header: "Estado", enableSorting: false, cell: (info) => STATUS_LABELS[info.getValue()] })
];

export function TeamListPage() {
  const token = useSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  const { data: members = [], isLoading } = useTeamQuery();
  const [sorting, setSorting] = useState<SortingState>([]);
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

  const actionColumns = [
    columnHelper.display({
      id: "actions",
      header: "Acciones",
      enableSorting: false,
      cell: ({ row }) => (
        <>
          <div className="flex flex-wrap gap-2">
            <Link to={`/equipo/${row.original.id}/editar`}><Button type="button" variant="outline" className="h-8 px-2 text-xs">Editar</Button></Link>
            <Button type="button" variant={row.original.status === "disabled" ? "outline" : "destructive"} className="h-8 px-2 text-xs" onClick={() => toggleStatus(row.original)}>{row.original.status === "disabled" ? "Activar" : "Desactivar"}</Button>
            {row.original.status === "invited" && <Button type="button" variant="outline" className="h-8 px-2 text-xs" onClick={() => resendInvite(row.original)}>Reenviar invitación</Button>}
          </div>
          {resentLinks[row.original.id] && <p className="mt-1 text-xs text-muted-foreground">Enlace: <code>{resentLinks[row.original.id]}</code></p>}
        </>
      )
    })
  ];

  const table = useReactTable({
    data: members,
    columns: [...columns, ...actionColumns],
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: false
  });

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