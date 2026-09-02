import { useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import type { DirectoryUser, RoleSlug } from "@entraditas/types";
import { SessionResponse, useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { useOrganizationsQuery } from "@/features/organizations/list/useOrganizationsQuery";
import { useUsersDirectoryQuery } from "./useUsersDirectoryQuery";

const ROLE_LABELS: Record<RoleSlug, string> = { superadmin: "Superadministrador", admin: "Administrador", user: "Usuario", subuser: "Subusuario" };
const STATUS_LABELS: Record<DirectoryUser["status"], string> = { active: "Activo", invited: "Invitado", disabled: "Deshabilitado" };
// Never connect to another superadmin (there's nothing to gain) or to an account that couldn't
// normally log in itself — matches the backend rule in POST /directory/users/:id/connect.
function isConnectable(user: DirectoryUser): boolean {
  return user.role !== "superadmin" && user.status === "active";
}

export function UsersListPage() {
  const token = useSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: users = [], isLoading } = useUsersDirectoryQuery();
  const { data: organizations = [] } = useOrganizationsQuery();
  const [search, setSearch] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [sorting, setSorting] = useState<SortingState>([]);
  const [error, setError] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) =>
      (!query || user.fullName.toLowerCase().includes(query) || user.email.toLowerCase().includes(query)) &&
      (!organizationId || user.organizationId === organizationId) &&
      (!role || user.role === role) &&
      (!status || user.status === status)
    );
  }, [users, search, organizationId, role, status]);

  async function connect(user: DirectoryUser) {
    setError(null);
    setConnectingId(user.id);
    try {
      const session = await apiClient.post<SessionResponse>(`/directory/users/${user.id}/connect`, undefined, { token: token! });
      // Navigate to a section everyone has access to and let React commit that (flushSync) BEFORE
      // swapping the session — see OrganizationsListPage's connect() for why flushSync matters.
      flushSync(() => navigate("/eventos"));
      useSessionStore.getState().connectAs(session);
      queryClient.clear();
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    } finally {
      setConnectingId(null);
    }
  }

  const columnHelper = useMemo(() => createColumnHelper<DirectoryUser>(), []);
  const columns = useMemo(
    () => [
      columnHelper.accessor("fullName", {
        header: "Nombre",
        cell: (info) => <Link to={`/usuarios/${info.row.original.id}`} className="font-semibold text-primary hover:underline">{info.getValue()}</Link>
      }),
      columnHelper.accessor("email", { header: "Email" }),
      columnHelper.accessor("organizationName", { header: "Organización", cell: (info) => info.getValue() ?? "—" }),
      columnHelper.accessor("role", { header: "Rol", cell: (info) => ROLE_LABELS[info.getValue()] }),
      columnHelper.accessor("status", { header: "Estado", cell: (info) => STATUS_LABELS[info.getValue()] }),
      columnHelper.display({
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            className="h-8 px-3 text-xs"
            disabled={!isConnectable(row.original) || connectingId === row.original.id}
            onClick={() => connect(row.original)}
          >
            {connectingId === row.original.id ? "Conectando…" : "Conectar"}
          </Button>
        )
      })
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnHelper, connectingId]
  );

  const table = useReactTable({
    data: filtered,
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
        <h1 className="font-display text-2xl font-semibold">Usuarios</h1>
        <p className="mt-1 text-sm text-muted-foreground">Directorio de todas las cuentas de todas las organizaciones. Al pulsar &quot;Conectar&quot; cambiarás a la sesión de esa persona; para volver, usa &quot;Volver a superadmin&quot; en el menú.</p>
      </header>
      {error && <p role="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="users-search-filter" className="sr-only">Buscar</label>
        <input id="users-search-filter" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre o email" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />

        <label htmlFor="users-organization-filter" className="sr-only">Organización</label>
        <select id="users-organization-filter" value={organizationId} onChange={(e) => setOrganizationId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todas las organizaciones</option>
          {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
        </select>

        <label htmlFor="users-role-filter" className="sr-only">Rol</label>
        <select id="users-role-filter" value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los roles</option>
          {(Object.keys(ROLE_LABELS) as RoleSlug[]).map((value) => <option key={value} value={value}>{ROLE_LABELS[value]}</option>)}
        </select>

        <label htmlFor="users-status-filter" className="sr-only">Estado</label>
        <select id="users-status-filter" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los estados</option>
          {(Object.keys(STATUS_LABELS) as DirectoryUser["status"][]).map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
        </select>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-muted-foreground">No hay usuarios que coincidan con los filtros.</p>
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
