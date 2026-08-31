# Ventas · Asistentes (CRM) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the Asistentes (CRM) tab of Ventas — a list of customers derived from order history, with per-customer aggregate metrics and a detail page showing their full order history. This is the fourth and last Ventas sub-project; after this all 4 tabs are active.

**Architecture:** No new stored entity — `GET /customers` groups `db.orders` by `customerEmail` (scoped the same way as `orders.ts`) and computes `Customer` metrics on the fly from `paid`/`partially_refunded`/`refunded` orders only. `GET /customers/:email` returns the same aggregate plus the customer's full order history (any status). Two new pages (`AttendeesListPage`, `AttendeeDetailPage`) follow the exact `OrdersListPage`/`OrderDetailPage` patterns, reusing `orders:read` — no new permission.

**Tech Stack:** React 18, TypeScript, react-router-dom v6, @tanstack/react-query, @tanstack/react-table, msw, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-25-ventas-asistentes-design.md`

## Global Constraints

- Money values are integer cents, displayed via `(value / 100)` through `Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })`.
- Mock API responses use `{ data, meta: { requestId } }` / `{ error: { code, message, requestId } }`.
- Only orders with `status` in `paid`, `partially_refunded`, `refunded` count toward a customer's `ordersCount`/`ticketsCount`/`totalSpent`/`lastPurchaseAt`; `pending`/`cancelled`/`expired`/`reserved` orders never create or affect a customer record. `totalSpent` is net (`total - refundedAmount` summed across qualifying orders).
- `GET /customers` and `GET /customers/:email` require `orders:read` (no new permission) and use the same organization/`eventScopes` visibility as `orders.ts` (via the already-exported `canAccessOrder`).
- With the current Pedidos seed (10 orders), exactly 8 emails qualify: `marta.ruiz@example.com`, `javier.soto@example.com`, `diego.molina@example.com` (net spend 0 — order fully refunded), `sara.gomez@example.com`, `pablo.ibanez@example.com` (org-1, 5 total), `nuria.vidal@example.com`, `prensa@surlive.example` (net spend 0 — free courtesy), `hugo.serrano@example.com` (org-2, 3 total). `lucia.fernandez@example.com` (order-3, `pending`) and `elena.castro@example.com` (order-7, `cancelled`) never qualify.

---

### Task 1: `GET /customers` and `GET /customers/:email` mock handlers

**Files:**
- Create: `apps/panel/src/mocks/handlers/customers.ts`
- Modify: `apps/panel/src/mocks/handlers/index.ts`
- Test: `apps/panel/src/mocks/handlers/customers.test.ts`

**Interfaces:**
- Consumes: `canAccessOrder` (`@/mocks/handlers/orders.ts`, already exported); `Customer`, `Order`, `User` types.
- Produces: `customersHandlers: HttpHandler[]`, registered in `handlers/index.ts`. `GET /customers` → `Customer[]`. `GET /customers/:email` → `Customer & { orders: (Order & { eventTitle: string })[] }`.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/mocks/handlers/customers.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { resetDb } from "@/mocks/state";
import type { Customer, Order } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

type AttendeeDetail = Customer & { orders: (Order & { eventTitle: string })[] };

describe("customers handlers", () => {
  afterEach(() => resetDb());

  it("lists the 8 qualifying customers to a superadmin", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    expect(customers).toHaveLength(8);
    expect(customers.map((c) => c.email)).not.toContain("lucia.fernandez@example.com"); // pending-only
    expect(customers.map((c) => c.email)).not.toContain("elena.castro@example.com"); // cancelled-only
  });

  it("a fully refunded order still counts, with totalSpent 0", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    const diego = customers.find((c) => c.email === "diego.molina@example.com")!;
    expect(diego.ordersCount).toBe(1);
    expect(diego.totalSpent).toBe(0);
  });

  it("a free courtesy order still counts, with totalSpent 0", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    const prensa = customers.find((c) => c.email === "prensa@surlive.example")!;
    expect(prensa.ordersCount).toBe(1);
    expect(prensa.ticketsCount).toBe(1);
    expect(prensa.totalSpent).toBe(0);
  });

  it("an org-1 admin only sees their 5 customers", async () => {
    const token = await loginAs("admin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers", { token });
    expect(customers.map((c) => c.email).sort()).toEqual([
      "diego.molina@example.com", "javier.soto@example.com", "marta.ruiz@example.com", "pablo.ibanez@example.com", "sara.gomez@example.com"
    ]);
  });

  it("filters by eventId", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers?eventId=event-4", { token });
    expect(customers.map((c) => c.email).sort()).toEqual(["hugo.serrano@example.com", "nuria.vidal@example.com", "prensa@surlive.example"]);
  });

  it("filters by q (name or email)", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const customers = await apiClient.get<Customer[]>("/customers?q=hugo", { token });
    expect(customers.map((c) => c.email)).toEqual(["hugo.serrano@example.com"]);
  });

  it("returns FORBIDDEN for a subuser without orders:read", async () => {
    const token = await loginAs("subusuario@entraditas.com");
    await expect(apiClient.get("/customers", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("detail returns the aggregate metrics plus the full order history", async () => {
    const token = await loginAs("admin@entraditas.com");
    const attendee = await apiClient.get<AttendeeDetail>(
      `/customers/${encodeURIComponent("marta.ruiz@example.com")}`,
      { token }
    );
    expect(attendee.ordersCount).toBe(1);
    expect(attendee.orders).toHaveLength(1);
    expect(attendee.orders[0]!.orderNumber).toBe("PED-2026-0001");
    expect(attendee.orders[0]!.eventTitle).toBe("Noche de Jazz");
  });

  it("returns NOT_FOUND for an email with no qualifying orders", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.get(`/customers/${encodeURIComponent("lucia.fernandez@example.com")}`, { token })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND for an email outside the actor's organization", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(
      apiClient.get(`/customers/${encodeURIComponent("hugo.serrano@example.com")}`, { token }) // org-2
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/customers.test.ts`
Expected: FAIL — `/customers` is an unhandled request.

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/mocks/handlers/customers.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { Customer, Order, User } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";
import { canAccessOrder } from "./orders";

const BASE = "http://localhost:4000/api/v1";
const QUALIFYING_STATUSES = new Set<Order["status"]>(["paid", "partially_refunded", "refunded"]);

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}
function forbidden(requestId: string) {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message: "No tienes permiso para consultar compradores", requestId } }, { status: 403 });
}
function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Asistente no encontrado", requestId } }, { status: 404 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

function buildCustomer(email: string, orders: Order[]): Customer {
  const qualifying = orders.filter((order) => QUALIFYING_STATUSES.has(order.status));
  if (qualifying.length === 0) {
    return { id: email, name: "", email, ordersCount: 0, ticketsCount: 0, totalSpent: 0, lastPurchaseAt: "" };
  }
  const sorted = [...qualifying].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const latest = sorted[0]!;
  const ticketsCount = qualifying.reduce(
    (sum, order) => sum + db.orderItems.filter((item) => item.orderId === order.id).reduce((s, item) => s + item.quantity, 0),
    0
  );
  const totalSpent = qualifying.reduce((sum, order) => sum + (order.total - order.refundedAmount), 0);
  return {
    id: email,
    name: latest.customerName,
    email,
    ordersCount: qualifying.length,
    ticketsCount,
    totalSpent,
    lastPurchaseAt: latest.createdAt
  };
}

export const customersHandlers = [
  http.get(`${BASE}/customers`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_customers_list");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_customers_list");

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    const q = url.searchParams.get("q")?.trim().toLowerCase();

    const visibleOrders = db.orders.filter((order) => canAccessOrder(order, user) && (!eventId || order.eventId === eventId));
    const byEmail = new Map<string, Order[]>();
    for (const order of visibleOrders) byEmail.set(order.customerEmail, [...(byEmail.get(order.customerEmail) ?? []), order]);

    let customers = [...byEmail.entries()]
      .map(([email, orders]) => buildCustomer(email, orders))
      .filter((customer) => customer.ordersCount > 0);

    if (q) {
      customers = customers.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
    }
    customers = customers.sort((a, b) => b.lastPurchaseAt.localeCompare(a.lastPurchaseAt));

    return HttpResponse.json({ data: customers, meta: { requestId: "req_customers_list" } });
  }),

  http.get(`${BASE}/customers/:email`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_customers_get");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_customers_get");

    const email = decodeURIComponent(params.email as string);
    const allOrders = db.orders.filter((order) => order.customerEmail === email && canAccessOrder(order, user));
    const customer = buildCustomer(email, allOrders);
    if (customer.ordersCount === 0) return notFound("req_customers_get");

    const orders = [...allOrders]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((order) => ({ ...order, eventTitle: db.events.find((e) => e.id === order.eventId)?.title ?? "" }));

    return HttpResponse.json({ data: { ...customer, orders }, meta: { requestId: "req_customers_get" } });
  })
];
```

Register it in `apps/panel/src/mocks/handlers/index.ts`:

```ts
import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { customersHandlers } from "./customers";
import { dashboardHandlers } from "./dashboard";
import { eventsHandlers } from "./events";
import { invitationsHandlers } from "./invitations";
import { ordersHandlers } from "./orders";
import { refundsHandlers } from "./refunds";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { venuesHandlers } from "./venues";
import { usersHandlers } from "./users";

export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...usersHandlers, ...invitationsHandlers, ...dashboardHandlers, ...ordersHandlers, ...refundsHandlers, ...customersHandlers];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/customers.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/handlers/customers.ts apps/panel/src/mocks/handlers/customers.test.ts apps/panel/src/mocks/handlers/index.ts
git commit -m "feat(mocks): add customers list and detail endpoints"
```

---

### Task 2: Attendees list page

**Files:**
- Create: `apps/panel/src/features/sales/attendees/list/useCustomersQuery.ts`
- Create: `apps/panel/src/features/sales/attendees/list/AttendeesListPage.tsx`
- Test: `apps/panel/src/features/sales/attendees/list/AttendeesListPage.test.tsx`

**Interfaces:**
- Consumes: `GET /customers` (Task 1); `useEventsQuery` (`@/features/events/list/useEventsQuery`); `Customer` type.
- Produces: `AttendeesListPage` component (named export, no props), consumed by the router in Task 4. `useCustomersQuery(filters: { eventId?: string; q?: string })` hook, consumed only by `AttendeesListPage`.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/sales/attendees/list/AttendeesListPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AttendeesListPage } from "./AttendeesListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AttendeesListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AttendeesListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows all 8 qualifying attendees to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(9)); // header + 8 data rows
  });

  it("links each row to its attendee detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "Marta Ruiz" });
    expect(link).toHaveAttribute("href", `/ventas/asistentes/${encodeURIComponent("marta.ruiz@example.com")}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/features/sales/attendees/list/AttendeesListPage.test.tsx`
Expected: FAIL — `./AttendeesListPage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/features/sales/attendees/list/useCustomersQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { Customer } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface CustomersFilters {
  eventId?: string;
  q?: string;
}

export function useCustomersQuery(filters: CustomersFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return useQuery({
    queryKey: ["customers", filters],
    queryFn: () => apiClient.get<Customer[]>(`/customers${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}
```

Create `apps/panel/src/features/sales/attendees/list/AttendeesListPage.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Customer } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useCustomersQuery } from "./useCustomersQuery";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const columnHelper = createColumnHelper<Customer>();
const columns = [
  columnHelper.accessor("name", {
    header: "Nombre",
    cell: (info) => (
      <Link to={`/ventas/asistentes/${encodeURIComponent(info.row.original.email)}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("email", { header: "Email" }),
  columnHelper.accessor("ordersCount", { header: "Pedidos" }),
  columnHelper.accessor("ticketsCount", { header: "Entradas" }),
  columnHelper.accessor("totalSpent", { header: "Gastado", cell: (info) => euro.format(info.getValue() / 100) }),
  columnHelper.accessor("lastPurchaseAt", { header: "Última compra", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") })
];

export function AttendeesListPage() {
  const [eventId, setEventId] = useState("");
  const [q, setQ] = useState("");
  const { data: events = [] } = useEventsQuery();
  const { data: customers = [], isLoading } = useCustomersQuery({ eventId: eventId || undefined, q: q || undefined });
  const table = useReactTable({ data: customers, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Asistentes</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="attendee-event-filter" className="sr-only">Evento</label>
        <select id="attendee-event-filter" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los eventos</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>

        <label htmlFor="attendee-search-filter" className="sr-only">Buscar</label>
        <input id="attendee-search-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o email" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : customers.length === 0 ? (
        <p className="text-muted-foreground">No hay asistentes que coincidan con los filtros.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th key={header.id} className="px-4 py-3 font-medium text-muted-foreground">
                      {flexRender(header.column.columnDef.header, header.getContext())}
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/features/sales/attendees/list/AttendeesListPage.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/sales/attendees/list
git commit -m "feat(sales): add attendees list page"
```

---

### Task 3: Attendee detail page

**Files:**
- Create: `apps/panel/src/features/sales/attendees/detail/AttendeeDetailPage.tsx`
- Test: `apps/panel/src/features/sales/attendees/detail/AttendeeDetailPage.test.tsx`

**Interfaces:**
- Consumes: `GET /customers/:email` (Task 1); `Customer`, `Order` types.
- Produces: `AttendeeDetailPage` component (named export, reads `email` via `useParams`), consumed by the router in Task 4.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/sales/attendees/detail/AttendeeDetailPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AttendeeDetailPage } from "./AttendeeDetailPage";

function renderDetail(email: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/ventas/asistentes/${encodeURIComponent(email)}`]}>
        <Routes>
          <Route path="/ventas/asistentes/:email" element={<AttendeeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AttendeeDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the attendee's metrics and order history", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("diego.molina@example.com");
    expect(await screen.findByRole("heading", { name: "Diego Molina" })).toBeInTheDocument();
    expect(screen.getByText("0,00 €")).toBeInTheDocument(); // fully refunded, net spend 0
    expect(await screen.findByText("PED-2026-0004")).toBeInTheDocument();
  });

  it("shows a not-found message for an email with no qualifying orders", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("lucia.fernandez@example.com"); // only a pending order
    expect(await screen.findByText("Asistente no encontrado.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/features/sales/attendees/detail/AttendeeDetailPage.test.tsx`
Expected: FAIL — `./AttendeeDetailPage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/features/sales/attendees/detail/AttendeeDetailPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import type { Customer, Order } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";

type AttendeeDetail = Customer & { orders: (Order & { eventTitle: string })[] };

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

export function AttendeeDetailPage() {
  const { email } = useParams<{ email: string }>();
  const token = useSessionStore((s) => s.token);

  const { data: attendee, isLoading, error } = useQuery({
    queryKey: ["customer", email],
    queryFn: () => apiClient.get<AttendeeDetail>(`/customers/${encodeURIComponent(email!)}`, { token: token! }),
    enabled: Boolean(email && token),
    retry: false
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Asistente no encontrado.</p>
      </div>
    );
  }
  if (!attendee) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{attendee.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{attendee.email}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Pedidos</p>
          <p className="mt-2 font-display text-2xl font-semibold">{number.format(attendee.ordersCount)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Entradas</p>
          <p className="mt-2 font-display text-2xl font-semibold">{number.format(attendee.ticketsCount)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Gastado</p>
          <p className="mt-2 font-display text-2xl font-semibold">{euro.format(attendee.totalSpent / 100)}</p>
        </article>
        <article className="border-2 border-foreground bg-surface p-4 shadow-flat">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Última compra</p>
          <p className="mt-2 font-display text-2xl font-semibold">{new Date(attendee.lastPurchaseAt).toLocaleDateString("es-ES")}</p>
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
            {attendee.orders.map((order) => (
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/features/sales/attendees/detail/AttendeeDetailPage.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/sales/attendees/detail
git commit -m "feat(sales): add attendee detail page"
```

---

### Task 4: Enable the Asistentes tab and route

**Files:**
- Modify: `apps/panel/src/features/sales/VentasLayout.tsx`
- Modify: `apps/panel/src/app/router.tsx`
- Modify: `apps/panel/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `AttendeesListPage` (Task 2), `AttendeeDetailPage` (Task 3).
- Produces: routes `/ventas/asistentes` and `/ventas/asistentes/:email`, behind the same `RequirePermission permission="orders:read"` block as the rest of Ventas.

- [ ] **Step 1: Write the failing test**

Add to `apps/panel/src/app/router.test.tsx`, inside `describe("AppRoutes", ...)`, after the "shows the taquilla page under Ventas" test:

```tsx
  it("shows the attendees list under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas/asistentes"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Asistentes" })).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: FAIL — there is no route for `/ventas/asistentes` yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/features/sales/VentasLayout.tsx`, move "Asistentes (CRM)" from disabled to enabled (`DISABLED_TABS` becomes empty):

```ts
const ENABLED_TABS = [
  { to: "/ventas/pedidos", label: "Pedidos" },
  { to: "/ventas/reembolsos", label: "Reembolsos" },
  { to: "/ventas/taquilla", label: "Taquilla (POS)" },
  { to: "/ventas/asistentes", label: "Asistentes (CRM)" }
] as const;
const DISABLED_TABS: string[] = [];
```

In `apps/panel/src/app/router.tsx`, add the imports:

```ts
import { AttendeeDetailPage } from "@/features/sales/attendees/detail/AttendeeDetailPage";
import { AttendeesListPage } from "@/features/sales/attendees/list/AttendeesListPage";
```

And add the `asistentes` routes inside the existing `/ventas` block:

```tsx
        <Route element={<RequirePermission permission="orders:read" />}>
          <Route path="/ventas" element={<VentasLayout />}>
            <Route index element={<Navigate to="pedidos" replace />} />
            <Route path="pedidos" element={<OrdersListPage />} />
            <Route path="pedidos/:id" element={<OrderDetailPage />} />
            <Route path="reembolsos" element={<RefundsListPage />} />
            <Route path="taquilla" element={<TaquillaPage />} />
            <Route path="asistentes" element={<AttendeesListPage />} />
            <Route path="asistentes/:email" element={<AttendeeDetailPage />} />
          </Route>
        </Route>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Run the full panel test suite and type-check**

Run: `pnpm --filter panel exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter panel test -- --run`
Expected: every test file passes.

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/features/sales/VentasLayout.tsx apps/panel/src/app/router.tsx apps/panel/src/app/router.test.tsx
git commit -m "feat(sales): enable the Asistentes (CRM) tab and route"
```

---

## Plan Self-Review Notes

- **Spec coverage:** §3 (`GET /customers`, `GET /customers/:email`, aggregation rules) → Task 1. §4 (`AttendeesListPage`, `AttendeeDetailPage`, `VentasLayout`, router) → Tasks 2–4. §5 (testing) → a test file/case in every task.
- **Placeholder scan:** no TBD/TODO; every step has real code.
- **Type consistency:** `AttendeeDetail = Customer & { orders: (Order & { eventTitle: string })[] }` is used identically in Task 1's handler (implicit response shape), Task 1's test, and Task 3's `AttendeeDetailPage`. `CustomersFilters` shape matches between `useCustomersQuery` and its only caller `AttendeesListPage` (same task). Route paths (`/ventas/asistentes`, `/ventas/asistentes/:email`) match between Task 4's router wiring, `VentasLayout`'s tab `to`, and the `Link` targets in `AttendeesListPage`/`AttendeeDetailPage` (the latter linking back to `/ventas/pedidos/:id`, unchanged from the Pedidos plan).
