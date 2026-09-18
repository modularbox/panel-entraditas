import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Customer, Order } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { canReadFromApi, fetchApiCustomer, type ApiCustomerDetail } from "@/shared/lib/entraditasApi";
import { BackButton } from "@/shared/ui/BackButton";

type CustomerDetail = Customer & { orders: (Order & { eventTitle: string })[] };

/**
 * La ficha tal y como la devuelve api.entraditas.com, con la forma que pinta esta pantalla.
 *
 * Hace falta porque la LISTA de clientes ya se leia de la API y la ficha se pedia a los mocks del
 * panel: son dos poblaciones distintas, asi que un comprador de entraditas.com no existia ahi y
 * entrar en cualquiera de ellos daba siempre "Error 404. Cliente no encontrado".
 */
function desdeLaApi(ficha: ApiCustomerDetail): CustomerDetail {
  return {
    id: ficha.email,
    name: ficha.name || ficha.email,
    email: ficha.email,
    phone: ficha.phone || null,
    acceptsAdvertising: ficha.acceptsAdvertising,
    createdAt: ficha.createdAt ?? undefined,
    ordersCount: ficha.ordersCount,
    ticketsCount: ficha.ticketsCount,
    totalSpent: ficha.totalSpent,
    lastPurchaseAt: ficha.lastPurchaseAt ?? "",
    orders: ficha.orders.map((pedido) => ({
      id: pedido.id,
      orderNumber: pedido.orderNumber,
      eventTitle: pedido.eventTitle,
      status: pedido.status as Order["status"],
      channel: pedido.channel as Order["channel"],
      total: pedido.total,
      createdAt: pedido.createdAt ?? ""
    })) as CustomerDetail["orders"]
  };
}

const STATUS_LABELS: Record<Order["status"], string> = {
  pending: "Pendiente",
  reserved: "Reservado",
  paid: "Pagado",
  cancelled: "Cancelado",
  expired: "Expirado",
  refunded: "Reembolsado",
  partially_refunded: "Reembolso parcial"
};

const CHANNEL_LABELS: Record<Order["channel"], string> = {
  web: "Web",
  panel: "Panel",
  box_office: "Taquilla",
  courtesy: "Cortesía"
};

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const number = new Intl.NumberFormat("es-ES");

export interface CustomerDetailPageProps {
  /** Label used by the not-found state, e.g. "Asistente" inside the Ventas CRM. */
  notFoundLabel?: string;
}

export function CustomerDetailPage({ notFoundLabel = "Cliente" }: CustomerDetailPageProps) {
  const { email } = useParams<{ email: string }>();
  const token = useSessionStore((s) => s.token);
  const isSuperadmin = useSessionStore((s) => s.user?.role === "superadmin");

  const desdeApi = canReadFromApi();

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ["customer", email, desdeApi],
    // De donde salio la lista tiene que salir la ficha. Si no, los dos lados hablan de gente
    // distinta y entrar en cualquier cliente acaba en un 404.
    queryFn: async () => (desdeApi
      ? (await fetchApiCustomer(email!).then((ficha) => (ficha ? desdeLaApi(ficha) : null)))
      : apiClient.get<CustomerDetail>(`/customers/${encodeURIComponent(email!)}`, { token: token! })),
    enabled: Boolean(email && token),
    retry: false // a 404 here is a valid "not found" outcome, not a transient failure to retry
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (customer === null || (error instanceof AppError && error.code === "NOT_FOUND")) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">{notFoundLabel} no encontrado.</p>
      </div>
    );
  }
  // Cualquier otro fallo se dice, en vez de dejar la pantalla en blanco sin explicacion.
  if (error) {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="font-display text-lg font-semibold">No se pudo cargar la ficha.</p>
        <p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }
  if (!customer) return null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <BackButton fallback="/clientes" />
        <header>
          <h1 className="font-display text-2xl font-semibold">{customer.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{customer.email}</p>
        </header>
      </div>

      {/* DATOS DEL CLIENTE */}
      <section aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="mb-3 font-display text-lg font-semibold uppercase tracking-wide">Datos del cliente</h2>
        <dl className="grid gap-x-8 gap-y-3 rounded-lg border-2 border-foreground bg-surface px-4 py-3 shadow-flat sm:grid-cols-3">
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Nombre y apellidos</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{customer.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Correo</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{customer.email}</dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Teléfono</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{customer.phone ?? "—"}</dd>
          </div>
          {isSuperadmin && (
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Contraseña</dt>
              <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">{customer.password ?? "—"}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Acepta publicidad</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">
              {customer.acceptsAdvertising === undefined ? "—" : customer.acceptsAdvertising ? "Sí" : "No"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Fecha de alta</dt>
            <dd className="mt-1 rounded-md border-2 border-border bg-background px-3 py-2 text-sm">
              {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString("es-ES") : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pedidos</p>
          <p className="mt-2 font-display text-2xl font-semibold">{number.format(customer.ordersCount)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Entradas</p>
          <p className="mt-2 font-display text-2xl font-semibold">{number.format(customer.ticketsCount)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Gastado</p>
          <p className="mt-2 font-display text-2xl font-semibold">{euro.format(customer.totalSpent / 100)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Última compra</p>
          {/* Sin compras la fecha viene vacia: "Sin compras" en vez de un "Invalid Date". */}
          <p className="mt-2 font-display text-2xl font-semibold">
            {customer.lastPurchaseAt ? new Date(customer.lastPurchaseAt).toLocaleDateString("es-ES") : "Sin compras"}
          </p>
        </article>
      </div>

      <section className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Nº pedido</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Evento</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Canal</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {customer.orders.length === 0 && (
              <tr className="border-t border-border">
                <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                  Todavía no ha comprado nada.
                </td>
              </tr>
            )}
            {customer.orders.map((order) => (
              <tr key={order.id} className="border-t border-border">
                <td className="px-4 py-3">
                  <Link to={`/ventas/pedidos/${order.id}`} className="font-semibold text-primary hover:underline">{order.orderNumber}</Link>
                </td>
                <td className="px-4 py-3">{order.eventTitle}</td>
                <td className="px-4 py-3">{STATUS_LABELS[order.status]}</td>
                <td className="px-4 py-3">{CHANNEL_LABELS[order.channel]}</td>
                <td className="px-4 py-3">{euro.format(order.total / 100)}</td>
                <td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString("es-ES")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}