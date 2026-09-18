import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { canReadFromApi, fetchApiOrganizationCustomers, fetchApiOrganizations } from "@/shared/lib/entraditasApi";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const fecha = new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" });

/**
 * Los clientes que le han comprado a esta organización, y en qué eventos.
 *
 * Se lee de api.entraditas.com y no de los mocks del panel porque es la única fuente que sabe quién
 * ha comprado de verdad. Sin sesión en la API no se enseña una tabla vacía —que se leería como
 * "esta organización no ha vendido nada"— sino que se dice que falta la sesión.
 */
export function OrganizationCustomers({ organizationId }: { organizationId: string }) {
  const desdeApi = canReadFromApi();

  const { data: clientes = [], isLoading, error } = useQuery({
    queryKey: ["organization-customers", organizationId],
    queryFn: () => fetchApiOrganizationCustomers(organizationId),
    enabled: desdeApi,
    retry: false
  });

  /**
   * Si esta organización existe de verdad en entraditas.com.
   *
   * Hace falta para no mentir con la tabla vacía: el listado de Organizaciones todavía sale de los
   * datos de ejemplo del panel, así que sus ids no son los de la base real. Sin esta comprobación,
   * una organización de ejemplo diría "todavía no le ha comprado nadie", que suena a dato y no lo es.
   */
  const { data: organizacionesReales } = useQuery({
    queryKey: ["api-organizations"],
    queryFn: fetchApiOrganizations,
    enabled: desdeApi,
    retry: false
  });
  const esDeEjemplo = organizacionesReales !== undefined
    && !organizacionesReales.some((organizacion) => organizacion.id === organizationId);

  return (
    <section aria-labelledby="clientes-org-heading">
      <h2 id="clientes-org-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">
        Clientes
      </h2>

      {!desdeApi && (
        <p className="text-muted-foreground">
          Sin sesión en entraditas.com no se puede saber quién le ha comprado. Vuelve a entrar en el panel.
        </p>
      )}

      {desdeApi && isLoading && <p className="text-muted-foreground">Cargando…</p>}

      {desdeApi && error && (
        <p className="text-destructive">
          No se pudieron cargar los clientes: {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {desdeApi && !isLoading && !error && clientes.length === 0 && (
        <p className="text-muted-foreground">
          {esDeEjemplo
            ? "Esta organización solo existe en los datos de ejemplo del panel, así que no tiene ventas reales que enseñar."
            : "Todavía no le ha comprado nadie."}
        </p>
      )}

      {desdeApi && clientes.length > 0 && (
        <div className="overflow-x-auto rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              <tr>
                <th className="px-4 py-3 font-medium text-muted-foreground">Nombre</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Correo</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Eventos</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Pedidos</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Entradas</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Gastado</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Última compra</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((cliente) => (
                <tr key={cliente.email} className="border-t border-border">
                  <td className="px-4 py-3">
                    <Link
                      to={`/clientes/${encodeURIComponent(cliente.email)}`}
                      className="font-semibold text-primary hover:underline"
                    >
                      {cliente.name || cliente.email}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{cliente.email}</td>
                  {/* Los eventos que le ha comprado A ESTA organización, no todos los suyos. */}
                  <td className="px-4 py-3">
                    {cliente.events.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      cliente.events.join(", ")
                    )}
                  </td>
                  <td className="px-4 py-3">{cliente.ordersCount}</td>
                  <td className="px-4 py-3">{cliente.ticketsCount}</td>
                  <td className="px-4 py-3">{euro.format(cliente.totalSpent / 100)}</td>
                  <td className="px-4 py-3">
                    {cliente.lastPurchaseAt ? fecha.format(new Date(cliente.lastPurchaseAt)) : "Sin compras"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
