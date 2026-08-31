# Ventas · Pedidos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real tab of the Ventas section — Pedidos — as a read-only order list + detail view, replacing the current `PlaceholderPage` at `/ventas`.

**Architecture:** Follows the existing `apps/panel` conventions end to end: a new `OrderItem` Zod schema in `packages/types`, a hand-written seed of `orders`/`orderItems` in the mock `Database`, a new MSW handler pair (`GET /orders`, `GET /orders/:id`) scoped by organization/`eventScopes` the same way `events.ts` does, a `@tanstack/react-table` list page + `@tanstack/react-query` detail page (mirroring `EventsListPage`/`EventDetailPage`), and a new `VentasLayout` that gives the Ventas section real tab routes (Pedidos active; Reembolsos/Taquilla (POS)/Asistentes (CRM) disabled placeholders for later tickets).

**Tech Stack:** React 18, TypeScript, react-router-dom v6, @tanstack/react-query, @tanstack/react-table, zod, msw (mock backend), vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-25-ventas-pedidos-design.md`

## Global Constraints

- Money values are integer cents (e.g. `2500` = 25,00 €), displayed via `(value / 100)` through an `Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })` formatter — same convention as `Step4TicketTypes.tsx`.
- Mock API responses use `{ data, meta: { requestId } }` on success and `{ error: { code, message, requestId } }` on failure, matching every existing handler in `apps/panel/src/mocks/handlers/`.
- Visibility scoping for orders: superadmin sees everything; everyone else only sees orders whose `organizationId` matches their own, and if the actor has a non-empty `eventScopes`, only orders whose `eventId` is in that list — same rule as `canAccessEvent` in `events.ts`.
- No write actions on orders in this ticket (no cancel, no refund) — read-only list + detail only.
- Seed data is hand-written, not randomized, so tests stay deterministic.

---

### Task 1: `OrderItem` schema

**Files:**
- Modify: `packages/types/src/schemas.ts`
- Test: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Produces: `OrderItemSchema` (zod schema) and `OrderItem` type, exported from `@entraditas/types`, shape `{ id: string; orderId: string; ticketTypeId: string; ticketTypeName: string; quantity: number; unitPrice: number; subtotal: number }`.

- [ ] **Step 1: Write the failing test**

Add to `packages/types/src/schemas.test.ts` (new `describe` block, alongside the existing `InvitationSchema` one):

```ts
import { OrderItemSchema } from "./schemas";
```

(add `OrderItemSchema` to the existing `import { ... } from "./schemas";` line at the top of the file)

```ts
describe("OrderItemSchema", () => {
  it("accepts a valid order item", () => {
    expect(() => OrderItemSchema.parse({
      id: "oi-1", orderId: "order-1", ticketTypeId: "tt-1", ticketTypeName: "General",
      quantity: 2, unitPrice: 2500, subtotal: 5000
    })).not.toThrow();
  });

  it("rejects a zero quantity", () => {
    expect(() => OrderItemSchema.parse({
      id: "oi-1", orderId: "order-1", ticketTypeId: "tt-1", ticketTypeName: "General",
      quantity: 0, unitPrice: 2500, subtotal: 0
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @entraditas/types test`
Expected: FAIL — `OrderItemSchema` is not exported from `./schemas`.

- [ ] **Step 3: Write minimal implementation**

In `packages/types/src/schemas.ts`, add after `RefundSchema` (which already exists, right after `OrderSchema`):

```ts
export const OrderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  ticketTypeId: z.string(),
  ticketTypeName: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative()
});
export type OrderItem = z.infer<typeof OrderItemSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @entraditas/types test`
Expected: PASS (all tests in the package, including the 2 new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/schemas.ts packages/types/src/schemas.test.ts
git commit -m "feat(types): add OrderItem schema"
```

---

### Task 2: Seed `orders` and `orderItems` in the mock database

**Files:**
- Modify: `apps/panel/src/mocks/db.ts`
- Test: `apps/panel/src/mocks/db.test.ts`

**Interfaces:**
- Consumes: `OrderItemSchema`/`OrderItem` from Task 1 (`@entraditas/types`); existing `Order`/`OrderSchema` (already in `@entraditas/types`); existing seed variables `event1`, `event2`, `event4`, `org1`, `org2`, `event1TicketType`, `event1Pool`, `event2TicketTypePista`, `event2PoolPista`, `event2TicketTypeGrada`, `event2PoolGrada`, `event4PassTicketType` (all defined earlier in `createSeedDatabase()`).
- Produces: `Database.orders: Order[]` (10 items, ids `order-1`..`order-10`) and `Database.orderItems: OrderItem[]` (ids `oi-1`..`oi-11`), returned by `createSeedDatabase()`. Later tasks (handlers) read `db.orders` / `db.orderItems` from `apps/panel/src/mocks/state.ts`.

- [ ] **Step 1: Write the failing test**

Add to `apps/panel/src/mocks/db.test.ts`. First, extend the existing import line:

```ts
import { EventSchema, OrderItemSchema, OrderSchema, TicketTypeSchema, UserSchema } from "@entraditas/types";
```

Then add a new test at the end of the `describe("createSeedDatabase", ...)` block:

```ts
  it("seeds 10 schema-valid orders with schema-valid line items, and keeps sold counts consistent with paid quantities", () => {
    const db = createSeedDatabase();
    expect(db.orders).toHaveLength(10);
    for (const order of db.orders) expect(() => OrderSchema.parse(order)).not.toThrow();
    for (const item of db.orderItems) expect(() => OrderItemSchema.parse(item)).not.toThrow();

    const tt1 = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    expect(tt1.quantitySold).toBe(5);
    const pool1 = db.capacityPools.find((p) => p.id === "pool-1")!;
    expect(pool1.soldCount).toBe(5);

    const ttPista = db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!;
    expect(ttPista.quantitySold).toBe(6);
    const ttGrada = db.ticketTypes.find((tt) => tt.id === "tt-2-grada")!;
    expect(ttGrada.quantitySold).toBe(2);

    const ttPass = db.ticketTypes.find((tt) => tt.id === "tt-4-pass")!;
    expect(ttPass.quantitySold).toBe(5);

    const order5Items = db.orderItems.filter((item) => item.orderId === "order-5");
    expect(order5Items).toHaveLength(2);
    expect(order5Items.reduce((sum, item) => sum + item.subtotal, 0)).toBe(22000);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/mocks/db.test.ts`
Expected: FAIL — `db.orders` is `undefined` (property doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/mocks/db.ts`:

1. Extend the type import at the top of the file:

```ts
import type {
  CapacityPool, Event, Invitation, Order, OrderItem, Organization, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
} from "@entraditas/types";
```

2. Extend the `Database` interface:

```ts
export interface Database {
  organizations: Organization[];
  users: User[];
  venues: Venue[];
  zones: Zone[];
  events: Event[];
  subEvents: SubEvent[];
  capacityPools: CapacityPool[];
  ticketTypes: TicketType[];
  ticketTypePrices: TicketTypePrice[];
  invitations: Invitation[];
  orders: Order[];
  orderItems: OrderItem[];
}
```

3. Update the 6 existing seed literals so sold counts reflect the paid orders seeded below (change only the numeric field named, leave every other field as-is):

- `event1Pool` (`id: "pool-1"`): `soldCount: 0` → `soldCount: 5`
- `event1TicketType` (`id: "tt-1"`): `quantitySold: 0` → `quantitySold: 5`
- `event2PoolPista` (`id: "pool-2-pista"`): `soldCount: 0` → `soldCount: 6`
- `event2TicketTypePista` (`id: "tt-2-pista"`): `quantitySold: 0` → `quantitySold: 6`
- `event2PoolGrada` (`id: "pool-2-grada"`): `soldCount: 0` → `soldCount: 2`
- `event2TicketTypeGrada` (`id: "tt-2-grada"`): `quantitySold: 0` → `quantitySold: 2`
- `event4PassTicketType` (`id: "tt-4-pass"`): `quantitySold: 0` → `quantitySold: 5`

4. Immediately before the final `return { ... };` statement of `createSeedDatabase()`, add:

```ts
  const orders: Order[] = [
    { id: "order-1", orderNumber: "PED-2026-0001", eventId: event1.id, organizationId: org1.id, customerName: "Marta Ruiz", customerEmail: "marta.ruiz@example.com", status: "paid", total: 5000, currency: "EUR", channel: "web", createdAt: "2026-08-05T10:00:00.000Z" },
    { id: "order-2", orderNumber: "PED-2026-0002", eventId: event1.id, organizationId: org1.id, customerName: "Javier Soto", customerEmail: "javier.soto@example.com", status: "paid", total: 7500, currency: "EUR", channel: "panel", createdAt: "2026-08-07T11:30:00.000Z" },
    { id: "order-3", orderNumber: "PED-2026-0003", eventId: event1.id, organizationId: org1.id, customerName: "Lucía Fernández", customerEmail: "lucia.fernandez@example.com", status: "pending", total: 2500, currency: "EUR", channel: "web", createdAt: "2026-08-10T09:15:00.000Z" },
    { id: "order-4", orderNumber: "PED-2026-0004", eventId: event1.id, organizationId: org1.id, customerName: "Diego Molina", customerEmail: "diego.molina@example.com", status: "refunded", total: 5000, currency: "EUR", channel: "web", createdAt: "2026-08-02T16:45:00.000Z" },
    { id: "order-5", orderNumber: "PED-2026-0005", eventId: event2.id, organizationId: org1.id, customerName: "Sara Gómez", customerEmail: "sara.gomez@example.com", status: "paid", total: 22000, currency: "EUR", channel: "web", createdAt: "2026-08-11T18:20:00.000Z" },
    { id: "order-6", orderNumber: "PED-2026-0006", eventId: event2.id, organizationId: org1.id, customerName: "Pablo Ibáñez", customerEmail: "pablo.ibanez@example.com", status: "paid", total: 6000, currency: "EUR", channel: "box_office", createdAt: "2026-08-12T20:05:00.000Z" },
    { id: "order-7", orderNumber: "PED-2026-0007", eventId: event2.id, organizationId: org1.id, customerName: "Elena Castro", customerEmail: "elena.castro@example.com", status: "cancelled", total: 5000, currency: "EUR", channel: "web", createdAt: "2026-08-06T13:10:00.000Z" },
    { id: "order-8", orderNumber: "PED-2026-0008", eventId: event4.id, organizationId: org2.id, customerName: "Nuria Vidal", customerEmail: "nuria.vidal@example.com", status: "paid", total: 18000, currency: "EUR", channel: "box_office", createdAt: "2026-07-10T12:00:00.000Z" },
    { id: "order-9", orderNumber: "PED-2026-0009", eventId: event4.id, organizationId: org2.id, customerName: "Prensa Sur", customerEmail: "prensa@surlive.example", status: "paid", total: 0, currency: "EUR", channel: "courtesy", createdAt: "2026-07-08T09:00:00.000Z" },
    { id: "order-10", orderNumber: "PED-2026-0010", eventId: event4.id, organizationId: org2.id, customerName: "Hugo Serrano", customerEmail: "hugo.serrano@example.com", status: "partially_refunded", total: 18000, currency: "EUR", channel: "web", createdAt: "2026-07-05T17:30:00.000Z" }
  ];

  const orderItems: OrderItem[] = [
    { id: "oi-1", orderId: "order-1", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 2, unitPrice: 2500, subtotal: 5000 },
    { id: "oi-2", orderId: "order-2", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 3, unitPrice: 2500, subtotal: 7500 },
    { id: "oi-3", orderId: "order-3", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 1, unitPrice: 2500, subtotal: 2500 },
    { id: "oi-4", orderId: "order-4", ticketTypeId: event1TicketType.id, ticketTypeName: event1TicketType.name, quantity: 2, unitPrice: 2500, subtotal: 5000 },
    { id: "oi-5", orderId: "order-5", ticketTypeId: event2TicketTypePista.id, ticketTypeName: event2TicketTypePista.name, quantity: 4, unitPrice: 3000, subtotal: 12000 },
    { id: "oi-6", orderId: "order-5", ticketTypeId: event2TicketTypeGrada.id, ticketTypeName: event2TicketTypeGrada.name, quantity: 2, unitPrice: 5000, subtotal: 10000 },
    { id: "oi-7", orderId: "order-6", ticketTypeId: event2TicketTypePista.id, ticketTypeName: event2TicketTypePista.name, quantity: 2, unitPrice: 3000, subtotal: 6000 },
    { id: "oi-8", orderId: "order-7", ticketTypeId: event2TicketTypeGrada.id, ticketTypeName: event2TicketTypeGrada.name, quantity: 1, unitPrice: 5000, subtotal: 5000 },
    { id: "oi-9", orderId: "order-8", ticketTypeId: event4PassTicketType.id, ticketTypeName: event4PassTicketType.name, quantity: 2, unitPrice: 9000, subtotal: 18000 },
    { id: "oi-10", orderId: "order-9", ticketTypeId: event4PassTicketType.id, ticketTypeName: event4PassTicketType.name, quantity: 1, unitPrice: 0, subtotal: 0 },
    { id: "oi-11", orderId: "order-10", ticketTypeId: event4PassTicketType.id, ticketTypeName: event4PassTicketType.name, quantity: 2, unitPrice: 9000, subtotal: 18000 }
  ];
```

5. Add `orders` and `orderItems` to the object returned by `createSeedDatabase()`:

```ts
  return {
    organizations: [org1, org2],
    users,
    venues: [venue1, venue2, venue3],
    zones: [zonePista, zoneGrada],
    events: [event1, event2, event3, event4, event5],
    subEvents: [event1SubEvent, event2SubEvent, ...event3SubEvents, ...event4SubEvents, event5SubEvent],
    capacityPools: [event1Pool, event2PoolPista, event2PoolGrada],
    ticketTypes: [event1TicketType, event2TicketTypePista, event2TicketTypeGrada, event3TicketType, event4PassTicketType],
    ticketTypePrices: [],
    invitations: [],
    orders,
    orderItems
  };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/mocks/db.test.ts`
Expected: PASS (all `createSeedDatabase` tests, including the new one).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/db.ts apps/panel/src/mocks/db.test.ts
git commit -m "feat(mocks): seed orders and order items"
```

---

### Task 3: `GET /orders` and `GET /orders/:id` mock handlers

**Files:**
- Create: `apps/panel/src/mocks/handlers/orders.ts`
- Modify: `apps/panel/src/mocks/handlers/index.ts`
- Test: `apps/panel/src/mocks/handlers/orders.test.ts`

**Interfaces:**
- Consumes: `db.orders`, `db.orderItems`, `db.users` (`apps/panel/src/mocks/state.ts`); `getSessionUserId` (`apps/panel/src/mocks/authContext.ts`); `hasPermission`, `resolveEffectivePermissions` (`apps/panel/src/shared/auth/permissions.ts`); `Order`, `User` types (`@entraditas/types`).
- Produces: `ordersHandlers: HttpHandler[]`, exported from `apps/panel/src/mocks/handlers/orders.ts`, registered in `apps/panel/src/mocks/handlers/index.ts`. Endpoints: `GET /orders` (query params `eventId`, `status`, `channel`, `q`) and `GET /orders/:id` (response `{ ...order, items: OrderItem[] }`).

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/mocks/handlers/orders.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { resetDb } from "@/mocks/state";
import type { Order, OrderItem } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

describe("orders handlers", () => {
  afterEach(() => resetDb());

  it("superadmin sees all 10 seeded orders", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders", { token });
    expect(orders).toHaveLength(10);
  });

  it("an org-1 admin only sees orders for their organization's events", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders", { token });
    expect(orders).toHaveLength(7);
    expect(orders.every((o) => o.organizationId === "org-1")).toBe(true);
  });

  it("filters by eventId", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders?eventId=event-1", { token });
    expect(orders.map((o) => o.id).sort()).toEqual(["order-1", "order-2", "order-3", "order-4"]);
  });

  it("filters by status", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders?status=cancelled", { token });
    expect(orders.map((o) => o.id)).toEqual(["order-7"]);
  });

  it("filters by channel", async () => {
    const token = await loginAs("admin@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders?channel=box_office", { token });
    expect(orders.map((o) => o.id)).toEqual(["order-6"]);
  });

  it("searches by customer name, email, or order number, case-insensitively", async () => {
    const token = await loginAs("admin@entraditas.com");
    const byName = await apiClient.get<Order[]>("/orders?q=sara", { token });
    expect(byName.map((o) => o.id)).toEqual(["order-5"]);
    const byNumber = await apiClient.get<Order[]>("/orders?q=ped-2026-0002", { token });
    expect(byNumber.map((o) => o.id)).toEqual(["order-2"]);
  });

  it("a user scoped to event-1 and event-2 never sees event-4 orders", async () => {
    const token = await loginAs("usuario@entraditas.com");
    const orders = await apiClient.get<Order[]>("/orders", { token });
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((o) => o.eventId === "event-1" || o.eventId === "event-2")).toBe(true);
  });

  it("returns FORBIDDEN for a subuser, who has no orders:read by default", async () => {
    const token = await loginAs("subusuario@entraditas.com");
    await expect(apiClient.get("/orders", { token })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("detail returns the order together with its line items", async () => {
    const token = await loginAs("admin@entraditas.com");
    const order = await apiClient.get<Order & { items: OrderItem[] }>("/orders/order-5", { token });
    expect(order.orderNumber).toBe("PED-2026-0005");
    expect(order.items).toHaveLength(2);
    expect(order.items.reduce((sum, item) => sum + item.subtotal, 0)).toBe(22000);
  });

  it("returns NOT_FOUND for a nonexistent order", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(apiClient.get("/orders/order-999", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("returns NOT_FOUND (not FORBIDDEN) for an order outside the actor's organization, to avoid leaking existence", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(apiClient.get("/orders/order-8", { token })).rejects.toMatchObject({ code: "NOT_FOUND" }); // order-8 belongs to org-2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/orders.test.ts`
Expected: FAIL — every request errors out because no `/orders` handler is registered yet (unhandled request).

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/mocks/handlers/orders.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { Order, User } from "@entraditas/types";
import { hasPermission, resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}
function forbidden(requestId: string) {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message: "No tienes permiso para consultar pedidos", requestId } }, { status: 403 });
}
function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Pedido no encontrado", requestId } }, { status: 404 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

function canAccessOrder(order: Order, user: User): boolean {
  if (user.role !== "superadmin" && order.organizationId !== user.organizationId) return false;
  const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
  return hasPermission(effective, "orders:read", { eventId: order.eventId, eventScopes: user.eventScopes });
}

export const ordersHandlers = [
  http.get(`${BASE}/orders`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_orders_list");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_orders_list");

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    const status = url.searchParams.get("status");
    const channel = url.searchParams.get("channel");
    const q = url.searchParams.get("q")?.trim().toLowerCase();

    let orders = db.orders.filter((order) => canAccessOrder(order, user));
    if (eventId) orders = orders.filter((order) => order.eventId === eventId);
    if (status) orders = orders.filter((order) => order.status === status);
    if (channel) orders = orders.filter((order) => order.channel === channel);
    if (q) {
      orders = orders.filter((order) =>
        order.orderNumber.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.customerEmail.toLowerCase().includes(q)
      );
    }
    orders = [...orders].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return HttpResponse.json({ data: orders, meta: { requestId: "req_orders_list" } });
  }),

  http.get(`${BASE}/orders/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_orders_get");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_orders_get");

    const order = db.orders.find((o) => o.id === params.id);
    if (!order || !canAccessOrder(order, user)) return notFound("req_orders_get");

    const items = db.orderItems.filter((item) => item.orderId === order.id);
    return HttpResponse.json({ data: { ...order, items }, meta: { requestId: "req_orders_get" } });
  })
];
```

Register it in `apps/panel/src/mocks/handlers/index.ts`:

```ts
import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { dashboardHandlers } from "./dashboard";
import { eventsHandlers } from "./events";
import { invitationsHandlers } from "./invitations";
import { ordersHandlers } from "./orders";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { venuesHandlers } from "./venues";
import { usersHandlers } from "./users";

export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...usersHandlers, ...invitationsHandlers, ...dashboardHandlers, ...ordersHandlers];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/orders.test.ts`
Expected: PASS (all 11 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/handlers/orders.ts apps/panel/src/mocks/handlers/orders.test.ts apps/panel/src/mocks/handlers/index.ts
git commit -m "feat(mocks): add orders list and detail endpoints"
```

---

### Task 4: Orders list page

**Files:**
- Create: `apps/panel/src/features/sales/orders/list/useOrdersQuery.ts`
- Create: `apps/panel/src/features/sales/orders/list/OrdersListPage.tsx`
- Test: `apps/panel/src/features/sales/orders/list/OrdersListPage.test.tsx`

**Interfaces:**
- Consumes: `GET /orders` (Task 3); `useEventsQuery` (`apps/panel/src/features/events/list/useEventsQuery.ts`); `useSessionStore`, `apiClient` (existing shared modules); `Order` type (`@entraditas/types`).
- Produces: `OrdersListPage` component (default export style: named export `OrdersListPage`, no props), consumed by the router in Task 6. `useOrdersQuery(filters: { eventId?: string; status?: string; channel?: string; q?: string })` hook, consumed only by `OrdersListPage`.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/sales/orders/list/OrdersListPage.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrdersListPage } from "./OrdersListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OrdersListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrdersListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows all 10 orders to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(11)); // 1 header row + 10 data rows
  });

  it("filters by status", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(11));
    fireEvent.change(screen.getByLabelText("Estado"), { target: { value: "cancelled" } });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header + order-7
  });

  it("links each row to its order detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "PED-2026-0005" });
    expect(link).toHaveAttribute("href", "/ventas/pedidos/order-5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/features/sales/orders/list/OrdersListPage.test.tsx`
Expected: FAIL — `./OrdersListPage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/features/sales/orders/list/useOrdersQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { Order } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface OrdersFilters {
  eventId?: string;
  status?: string;
  channel?: string;
  q?: string;
}

export function useOrdersQuery(filters: OrdersFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.status) params.set("status", filters.status);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return useQuery({
    queryKey: ["orders", filters],
    queryFn: () => apiClient.get<Order[]>(`/orders${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}
```

Create `apps/panel/src/features/sales/orders/list/OrdersListPage.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Order } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useOrdersQuery } from "./useOrdersQuery";

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
const columnHelper = createColumnHelper<Order>();
const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Nº pedido",
    cell: (info) => (
      <Link to={`/ventas/pedidos/${info.row.original.id}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("customerName", { header: "Comprador" }),
  columnHelper.accessor("channel", { header: "Canal", cell: (info) => CHANNEL_LABELS[info.getValue()] }),
  columnHelper.accessor("status", { header: "Estado", cell: (info) => STATUS_LABELS[info.getValue()] }),
  columnHelper.accessor("total", { header: "Total", cell: (info) => euro.format(info.getValue() / 100) }),
  columnHelper.accessor("createdAt", { header: "Fecha", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") })
];

export function OrdersListPage() {
  const [eventId, setEventId] = useState("");
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");
  const [q, setQ] = useState("");
  const { data: events = [] } = useEventsQuery();
  const { data: orders = [], isLoading } = useOrdersQuery({
    eventId: eventId || undefined,
    status: status || undefined,
    channel: channel || undefined,
    q: q || undefined
  });
  const table = useReactTable({ data: orders, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Pedidos</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="event-filter" className="sr-only">Evento</label>
        <select id="event-filter" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los eventos</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>

        <label htmlFor="status-filter" className="sr-only">Estado</label>
        <select id="status-filter" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <label htmlFor="channel-filter" className="sr-only">Canal</label>
        <select id="channel-filter" value={channel} onChange={(e) => setChannel(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los canales</option>
          {Object.entries(CHANNEL_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <label htmlFor="search-filter" className="sr-only">Buscar</label>
        <input id="search-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº pedido, nombre o email" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : orders.length === 0 ? (
        <p className="text-muted-foreground">No hay pedidos que coincidan con los filtros.</p>
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

Note: `select#status-filter` carries both a visually-hidden `<label>` (for the accessible name used by the "shows all 10 orders" style tests elsewhere in the app) and an explicit `aria-label="Estado"` so `getByLabelText("Estado")` resolves unambiguously in the test above.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/features/sales/orders/list/OrdersListPage.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/sales/orders/list
git commit -m "feat(sales): add orders list page"
```

---

### Task 5: Order detail page

**Files:**
- Create: `apps/panel/src/features/sales/orders/detail/OrderDetailPage.tsx`
- Test: `apps/panel/src/features/sales/orders/detail/OrderDetailPage.test.tsx`

**Interfaces:**
- Consumes: `GET /orders/:id` (Task 3); `useSessionStore`, `apiClient`, `AppError` (existing shared modules); `Order`, `OrderItem` types (`@entraditas/types`).
- Produces: `OrderDetailPage` component (named export, reads `id` via `useParams`), consumed by the router in Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/sales/orders/detail/OrderDetailPage.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrderDetailPage } from "./OrderDetailPage";

function renderDetail(orderId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/ventas/pedidos/${orderId}`]}>
        <Routes>
          <Route path="/ventas/pedidos/:id" element={<OrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrderDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the order header, customer, and its line items with the total", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-5");
    expect(await screen.findByRole("heading", { name: "PED-2026-0005" })).toBeInTheDocument();
    expect(screen.getByText("Sara Gómez")).toBeInTheDocument();
    expect(screen.getByText("Pista")).toBeInTheDocument();
    expect(screen.getByText("Grada VIP")).toBeInTheDocument();
    expect(screen.getByText("220,00 €")).toBeInTheDocument();
  });

  it("shows a not-found message for a nonexistent order", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-999");
    expect(await screen.findByText("Pedido no encontrado.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/features/sales/orders/detail/OrderDetailPage.test.tsx`
Expected: FAIL — `./OrderDetailPage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/features/sales/orders/detail/OrderDetailPage.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Order, OrderItem } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";

type OrderDetail = Order & { items: OrderItem[] };

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

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id!;
  const token = useSessionStore((s) => s.token);

  const { data: order, isLoading, error } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => apiClient.get<OrderDetail>(`/orders/${orderId}`, { token: token! }),
    enabled: Boolean(token),
    retry: false
  });

  if (isLoading) return <p className="text-muted-foreground">Cargando…</p>;
  if (error instanceof AppError && error.code === "NOT_FOUND") {
    return (
      <div className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-10 text-center">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Error 404</p>
        <p className="mt-2 font-display text-2xl font-semibold">Pedido no encontrado.</p>
      </div>
    );
  }
  if (!order) return null;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{order.orderNumber}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {STATUS_LABELS[order.status]} · {CHANNEL_LABELS[order.channel]} · {new Date(order.createdAt).toLocaleDateString("es-ES")}
        </p>
      </header>

      <section className="rounded-lg border-2 border-foreground bg-surface p-5 shadow-flat">
        <h2 className="font-display text-lg font-semibold">Comprador</h2>
        <p className="mt-2 text-sm">{order.customerName}</p>
        <p className="text-sm text-muted-foreground">{order.customerEmail}</p>
      </section>

      <section className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-alt">
            <tr>
              <th className="px-4 py-3 font-medium text-muted-foreground">Tipo de entrada</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Cantidad</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Precio unitario</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-3">{item.ticketTypeName}</td>
                <td className="px-4 py-3">{item.quantity}</td>
                <td className="px-4 py-3">{euro.format(item.unitPrice / 100)}</td>
                <td className="px-4 py-3">{euro.format(item.subtotal / 100)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-foreground">
              <td colSpan={3} className="px-4 py-3 text-right font-semibold">Total</td>
              <td className="px-4 py-3 font-semibold">{euro.format(order.total / 100)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/features/sales/orders/detail/OrderDetailPage.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/sales/orders/detail
git commit -m "feat(sales): add order detail page"
```

---

### Task 6: Wire up the Ventas section (layout, tabs, routes)

**Files:**
- Create: `apps/panel/src/features/sales/VentasLayout.tsx`
- Modify: `apps/panel/src/app/router.tsx`
- Modify: `apps/panel/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `OrdersListPage` (Task 4), `OrderDetailPage` (Task 5), `cn` (`@/shared/lib/cn`), existing `RequirePermission`, `NAV_ITEMS`.
- Produces: routes `/ventas` (redirects to `pedidos`), `/ventas/pedidos`, `/ventas/pedidos/:id`, all behind `RequirePermission permission="orders:read"`.

- [ ] **Step 1: Write the failing test**

Add to `apps/panel/src/app/router.test.tsx`, inside the existing `describe("AppRoutes", ...)` block, after the "shows the team list to an authenticated admin" test:

```tsx
  it("shows the orders list under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: FAIL — `/ventas` still renders the generic `PlaceholderPage` ("Ventas" heading), not "Pedidos".

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/features/sales/VentasLayout.tsx`:

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/shared/lib/cn";

const ENABLED_TABS = [{ to: "/ventas/pedidos", label: "Pedidos" }] as const;
const DISABLED_TABS = ["Reembolsos", "Taquilla (POS)", "Asistentes (CRM)"];

export function VentasLayout() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Ventas</p>

      <nav aria-label="Secciones de ventas">
        <ul className="flex flex-wrap gap-2">
          {ENABLED_TABS.map((tab) => (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                className={({ isActive }) =>
                  cn(
                    "inline-block rounded-md border-2 border-foreground px-3 py-1.5 text-sm font-bold uppercase tracking-wide transition-colors",
                    isActive ? "bg-foreground text-background" : "bg-surface text-foreground hover:bg-muted"
                  )
                }
              >
                {tab.label}
              </NavLink>
            </li>
          ))}
          {DISABLED_TABS.map((label) => (
            <li key={label}>
              <button
                type="button"
                disabled
                title="Disponible en una fase posterior"
                className="rounded-md border-2 border-border px-3 py-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground opacity-60"
              >
                {label}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <Outlet />
    </div>
  );
}
```

In `apps/panel/src/app/router.tsx`:

1. Add imports (alongside the other feature imports):

```ts
import { OrderDetailPage } from "@/features/sales/orders/detail/OrderDetailPage";
import { OrdersListPage } from "@/features/sales/orders/list/OrdersListPage";
import { VentasLayout } from "@/features/sales/VentasLayout";
```

2. Add `/ventas` to `PLACEHOLDER_PATHS`:

```ts
const PLACEHOLDER_PATHS = new Set(["/eventos", "/equipo", "/dashboard", "/ventas"]);
```

3. Add the new route block. Insert it after the existing `/equipo` block (after the closing `</Route>` of the `users:manage` block) and before the `/sin-acceso` route:

```tsx
        <Route element={<RequirePermission permission="orders:read" />}>
          <Route path="/ventas" element={<VentasLayout />}>
            <Route index element={<Navigate to="pedidos" replace />} />
            <Route path="pedidos" element={<OrdersListPage />} />
            <Route path="pedidos/:id" element={<OrderDetailPage />} />
          </Route>
        </Route>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: PASS (all 5 tests, including the new one).

- [ ] **Step 5: Run the full panel test suite and type-check**

Run: `pnpm --filter panel exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter panel test -- --run`
Expected: every test file passes (this now includes the `orders`/`sales` tests from Tasks 2–6 plus every pre-existing test, since `/ventas` is no longer a generic placeholder).

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/features/sales/VentasLayout.tsx apps/panel/src/app/router.tsx apps/panel/src/app/router.test.tsx
git commit -m "feat(sales): wire up the Ventas section with a Pedidos tab"
```

---

## Plan Self-Review Notes

- **Spec coverage:** §3.1 (OrderItem schema) → Task 1. §3.2 (db seed, sold-count consistency) → Task 2. §4 (endpoints) → Task 3. §5 (VentasLayout, OrdersListPage, OrderDetailPage, router wiring) → Tasks 4–6. §6 (testing) → a test file/case in every task.
- **Placeholder scan:** no TBD/TODO; every step has real code.
- **Type consistency:** `OrderItem` fields (`ticketTypeId`, `ticketTypeName`, `quantity`, `unitPrice`, `subtotal`) are used identically in the Task 1 schema, the Task 2 seed, and the Task 5 detail page. `OrdersFilters` shape matches between `useOrdersQuery` (Task 4) and its only caller, `OrdersListPage` (same task). Route paths (`/ventas`, `/ventas/pedidos`, `/ventas/pedidos/:id`) match between Task 6's router wiring and the `Link`/`NavLink` targets used in Tasks 4–6.
