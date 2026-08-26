# Ventas · Reembolsos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the Reembolsos tab of Ventas — refund a paid order (fully or partially) directly from its detail page, and list the resulting refund history.

**Architecture:** Extends the Pedidos work: `Order` gains a `refundedAmount` field, a new `Refund[]` array is seeded, a `POST /orders/:id/refund` endpoint validates and processes refunds (releasing capacity only on full refund), `GET /orders/:id` now also returns the order's refund history, a new `GET /refunds` endpoint powers a read-only `RefundsListPage`, and `OrderDetailPage` gains a refund history section plus a gated refund form.

**Tech Stack:** React 18, TypeScript, react-router-dom v6, @tanstack/react-query, @tanstack/react-table, zod, msw, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-25-ventas-reembolsos-design.md`

## Global Constraints

- Money values are integer cents, displayed via `(value / 100)` through `Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })` — same convention as Pedidos.
- Mock API responses use `{ data, meta: { requestId } }` / `{ error: { code, message, requestId } }`.
- A refund is created `processed` immediately — no `requested`/`rejected` states are produced by this ticket.
- Viewing refund history (`GET /orders/:id`'s `refunds`, `GET /refunds`) requires `orders:read`; creating a refund (`POST /orders/:id/refund`) requires `orders:refund`. Both use the same organization/`eventScopes` visibility rule as Pedidos (`canAccessOrder`).
- Capacity (`ticketType.quantitySold`, `capacityPool.soldCount`) is only released when a refund brings the order to fully `refunded` — a partial refund never touches capacity.

---

### Task 1: `Order.refundedAmount` field

**Files:**
- Modify: `packages/types/src/schemas.ts`
- Test: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Produces: `OrderSchema` (and the inferred `Order` type) requires a new field `refundedAmount: number` (nonnegative int), exported from `@entraditas/types`.

- [ ] **Step 1: Write the failing test**

Add `OrderSchema` to the existing import line at the top of `packages/types/src/schemas.test.ts`:

```ts
import { EventSchema, InvitationSchema, OrderItemSchema, OrderSchema, TicketTypeSchema, UserSchema } from "./schemas";
```

Add a new `describe` block (next to the `OrderItemSchema` one):

```ts
describe("OrderSchema", () => {
  const validOrder = {
    id: "order-1", orderNumber: "PED-2026-0001", eventId: "event-1", organizationId: "org-1",
    customerName: "Marta Ruiz", customerEmail: "marta.ruiz@example.com", status: "paid",
    total: 5000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-05T10:00:00.000Z"
  };

  it("accepts a valid paid order with refundedAmount", () => {
    expect(() => OrderSchema.parse(validOrder)).not.toThrow();
  });

  it("rejects an order missing refundedAmount", () => {
    const { refundedAmount, ...withoutField } = validOrder;
    expect(() => OrderSchema.parse(withoutField)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @entraditas/types test`
Expected: FAIL — "rejects an order missing refundedAmount" fails because the current schema parses it fine (extra/missing loosely-typed field isn't required yet).

- [ ] **Step 3: Write minimal implementation**

In `packages/types/src/schemas.ts`, update `OrderSchema`:

```ts
export const OrderSchema = z.object({
  id: z.string(), orderNumber: z.string(), eventId: z.string(), organizationId: z.string(), customerName: z.string(), customerEmail: z.string().email(),
  status: z.enum(["pending", "reserved", "paid", "cancelled", "expired", "refunded", "partially_refunded"]),
  total: z.number().int().nonnegative(), refundedAmount: z.number().int().nonnegative(), currency: z.string().length(3), channel: z.enum(["web", "panel", "box_office", "courtesy"]), createdAt: z.string()
});
export type Order = z.infer<typeof OrderSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @entraditas/types test`
Expected: PASS (all tests in the package).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/schemas.ts packages/types/src/schemas.test.ts
git commit -m "feat(types): add Order.refundedAmount"
```

---

### Task 2: Seed `refunds` and backfill `refundedAmount`

**Files:**
- Modify: `apps/panel/src/mocks/db.ts`
- Test: `apps/panel/src/mocks/db.test.ts`

**Interfaces:**
- Consumes: `Order.refundedAmount` (Task 1); existing `Refund`/`RefundSchema` (already in `@entraditas/types`, unchanged).
- Produces: `Database.refunds: Refund[]` (2 items, ids `refund-1`, `refund-2`), and every seeded `Order` now carries `refundedAmount`. Later tasks (handlers) read `db.refunds`.

- [ ] **Step 1: Write the failing test**

Extend the import line in `apps/panel/src/mocks/db.test.ts`:

```ts
import { EventSchema, OrderItemSchema, OrderSchema, RefundSchema, TicketTypeSchema, UserSchema } from "@entraditas/types";
```

Add a new test at the end of the `describe("createSeedDatabase", ...)` block:

```ts
  it("seeds 2 refunds consistent with the 2 orders that already carry a refundedAmount", () => {
    const db = createSeedDatabase();
    expect(db.refunds).toHaveLength(2);
    for (const refund of db.refunds) expect(() => RefundSchema.parse(refund)).not.toThrow();

    const order4 = db.orders.find((o) => o.id === "order-4")!;
    expect(order4.refundedAmount).toBe(5000);
    const refundsForOrder4 = db.refunds.filter((r) => r.orderId === "order-4");
    expect(refundsForOrder4.reduce((sum, r) => sum + r.amount, 0)).toBe(order4.refundedAmount);

    const order10 = db.orders.find((o) => o.id === "order-10")!;
    expect(order10.refundedAmount).toBe(9000);

    const order1 = db.orders.find((o) => o.id === "order-1")!;
    expect(order1.refundedAmount).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/mocks/db.test.ts`
Expected: FAIL — `db.refunds` is `undefined`, and the seeded orders don't yet have `refundedAmount` (this also breaks the existing `OrderSchema.parse` assertion added implicitly by Task 1's schema change — that's expected and gets fixed by this task).

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/mocks/db.ts`:

1. Extend the type import:

```ts
import type {
  CapacityPool, Event, Invitation, Order, OrderItem, Organization, Refund, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
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
  refunds: Refund[];
}
```

3. Replace the `orders` array (add `refundedAmount` to every entry — `5000` for `order-4`, `9000` for `order-10`, `0` for the other 8):

```ts
  const orders: Order[] = [
    { id: "order-1", orderNumber: "PED-2026-0001", eventId: event1.id, organizationId: org1.id, customerName: "Marta Ruiz", customerEmail: "marta.ruiz@example.com", status: "paid", total: 5000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-05T10:00:00.000Z" },
    { id: "order-2", orderNumber: "PED-2026-0002", eventId: event1.id, organizationId: org1.id, customerName: "Javier Soto", customerEmail: "javier.soto@example.com", status: "paid", total: 7500, refundedAmount: 0, currency: "EUR", channel: "panel", createdAt: "2026-08-07T11:30:00.000Z" },
    { id: "order-3", orderNumber: "PED-2026-0003", eventId: event1.id, organizationId: org1.id, customerName: "Lucía Fernández", customerEmail: "lucia.fernandez@example.com", status: "pending", total: 2500, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-10T09:15:00.000Z" },
    { id: "order-4", orderNumber: "PED-2026-0004", eventId: event1.id, organizationId: org1.id, customerName: "Diego Molina", customerEmail: "diego.molina@example.com", status: "refunded", total: 5000, refundedAmount: 5000, currency: "EUR", channel: "web", createdAt: "2026-08-02T16:45:00.000Z" },
    { id: "order-5", orderNumber: "PED-2026-0005", eventId: event2.id, organizationId: org1.id, customerName: "Sara Gómez", customerEmail: "sara.gomez@example.com", status: "paid", total: 22000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-11T18:20:00.000Z" },
    { id: "order-6", orderNumber: "PED-2026-0006", eventId: event2.id, organizationId: org1.id, customerName: "Pablo Ibáñez", customerEmail: "pablo.ibanez@example.com", status: "paid", total: 6000, refundedAmount: 0, currency: "EUR", channel: "box_office", createdAt: "2026-08-12T20:05:00.000Z" },
    { id: "order-7", orderNumber: "PED-2026-0007", eventId: event2.id, organizationId: org1.id, customerName: "Elena Castro", customerEmail: "elena.castro@example.com", status: "cancelled", total: 5000, refundedAmount: 0, currency: "EUR", channel: "web", createdAt: "2026-08-06T13:10:00.000Z" },
    { id: "order-8", orderNumber: "PED-2026-0008", eventId: event4.id, organizationId: org2.id, customerName: "Nuria Vidal", customerEmail: "nuria.vidal@example.com", status: "paid", total: 18000, refundedAmount: 0, currency: "EUR", channel: "box_office", createdAt: "2026-07-10T12:00:00.000Z" },
    { id: "order-9", orderNumber: "PED-2026-0009", eventId: event4.id, organizationId: org2.id, customerName: "Prensa Sur", customerEmail: "prensa@surlive.example", status: "paid", total: 0, refundedAmount: 0, currency: "EUR", channel: "courtesy", createdAt: "2026-07-08T09:00:00.000Z" },
    { id: "order-10", orderNumber: "PED-2026-0010", eventId: event4.id, organizationId: org2.id, customerName: "Hugo Serrano", customerEmail: "hugo.serrano@example.com", status: "partially_refunded", total: 18000, refundedAmount: 9000, currency: "EUR", channel: "web", createdAt: "2026-07-05T17:30:00.000Z" }
  ];
```

4. Immediately after the `orderItems` array (before the final `return`), add:

```ts
  const refunds: Refund[] = [
    { id: "refund-1", orderId: "order-4", orderNumber: "PED-2026-0004", customerName: "Diego Molina", amount: 5000, reason: "Cliente no pudo asistir al evento.", status: "processed", createdAt: "2026-08-03T09:00:00.000Z" },
    { id: "refund-2", orderId: "order-10", orderNumber: "PED-2026-0010", customerName: "Hugo Serrano", amount: 9000, reason: "Devolución parcial: 1 entrada no utilizada.", status: "processed", createdAt: "2026-07-06T10:00:00.000Z" }
  ];
```

5. Add `refunds` to the object returned by `createSeedDatabase()`:

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
    orderItems,
    refunds
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/mocks/db.test.ts`
Expected: PASS (all `createSeedDatabase` tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/db.ts apps/panel/src/mocks/db.test.ts
git commit -m "feat(mocks): seed refunds and backfill Order.refundedAmount"
```

---

### Task 3: `POST /orders/:id/refund` and `GET /refunds` mock handlers

**Files:**
- Modify: `apps/panel/src/mocks/handlers/orders.ts`
- Create: `apps/panel/src/mocks/handlers/refunds.ts`
- Modify: `apps/panel/src/mocks/handlers/index.ts`
- Test: `apps/panel/src/mocks/handlers/refunds.test.ts`

**Interfaces:**
- Consumes: `db.orders`, `db.orderItems`, `db.refunds`, `db.ticketTypes`, `db.capacityPools`, `db.users`; `getSessionUserId`; `resolveEffectivePermissions`; `Refund`, `User` types.
- Produces: `canAccessOrder` becomes an **exported** function from `orders.ts` (same signature as before), reused by `refunds.ts`. `refundsHandlers: HttpHandler[]`, registered in `handlers/index.ts`. `GET /orders/:id` response gains a `refunds: Refund[]` field.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/mocks/handlers/refunds.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { Order, OrderItem, Refund } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

type OrderDetail = Order & { items: OrderItem[]; refunds: Refund[] };

describe("refunds handlers", () => {
  afterEach(() => resetDb());

  it("a full refund marks the order refunded and releases capacity", async () => {
    const token = await loginAs("admin@entraditas.com");
    const result = await apiClient.post<OrderDetail>(
      "/orders/order-6/refund",
      { amount: 6000, reason: "Duplicado" },
      { token }
    );
    expect(result.status).toBe("refunded");
    expect(result.refundedAmount).toBe(6000);
    expect(result.refunds).toHaveLength(1);

    const pista = db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!;
    expect(pista.quantitySold).toBe(4); // was 6, order-6 had 2
    const pool = db.capacityPools.find((p) => p.id === "pool-2-pista")!;
    expect(pool.soldCount).toBe(4);
  });

  it("a partial refund leaves the order partially_refunded and does not touch capacity", async () => {
    const token = await loginAs("admin@entraditas.com");
    const result = await apiClient.post<OrderDetail>(
      "/orders/order-1/refund",
      { amount: 2000, reason: "Reembolso parcial" },
      { token }
    );
    expect(result.status).toBe("partially_refunded");
    expect(result.refundedAmount).toBe(2000);

    const general = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    expect(general.quantitySold).toBe(5); // unchanged
  });

  it("two successive partial refunds that add up to the total release capacity on the second one", async () => {
    const token = await loginAs("admin@entraditas.com");
    await apiClient.post<OrderDetail>("/orders/order-2/refund", { amount: 2500, reason: "Primera parte" }, { token });
    const general = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    expect(general.quantitySold).toBe(5); // still unaffected after the first partial refund

    const second = await apiClient.post<OrderDetail>("/orders/order-2/refund", { amount: 5000, reason: "Segunda parte" }, { token });
    expect(second.status).toBe("refunded");
    expect(db.ticketTypes.find((tt) => tt.id === "tt-1")!.quantitySold).toBe(2); // 5 - 3 (order-2's quantity)
  });

  it("rejects an amount greater than the pending balance", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders/order-1/refund", { amount: 6000, reason: "Demasiado" }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects refunding an order in a non-refundable status", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders/order-3/refund", { amount: 100, reason: "No debería procesarse" }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" }); // order-3 is "pending"
  });

  it("rejects an empty reason", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders/order-1/refund", { amount: 1000, reason: "   " }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns FORBIDDEN for a user with orders:read but no orders:refund", async () => {
    const token = await loginAs("usuario@entraditas.com"); // role "user", orders:refund not granted in seed
    await expect(
      apiClient.post("/orders/order-1/refund", { amount: 1000, reason: "Sin permiso" }, { token })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns NOT_FOUND for an order outside the actor's organization", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(
      apiClient.post("/orders/order-8/refund", { amount: 100, reason: "Fuera de alcance" }, { token }) // order-8 is org-2
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("GET /refunds respects organization scoping and supports eventId/q filters", async () => {
    const superadminToken = await loginAs("superadmin@entraditas.com");
    const all = await apiClient.get<Refund[]>("/refunds", { token: superadminToken });
    expect(all).toHaveLength(2);

    const adminToken = await loginAs("admin@entraditas.com"); // org-1
    const orgScoped = await apiClient.get<Refund[]>("/refunds", { token: adminToken });
    expect(orgScoped.map((r) => r.id)).toEqual(["refund-1"]); // refund-2 belongs to org-2's order-10

    const byEvent = await apiClient.get<Refund[]>("/refunds?eventId=event-1", { token: superadminToken });
    expect(byEvent.map((r) => r.id)).toEqual(["refund-1"]);

    const byQuery = await apiClient.get<Refund[]>("/refunds?q=hugo", { token: superadminToken });
    expect(byQuery.map((r) => r.id)).toEqual(["refund-2"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/refunds.test.ts`
Expected: FAIL — `POST /orders/:id/refund` and `GET /refunds` are unhandled requests.

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/mocks/handlers/orders.ts`, export `canAccessOrder` (change `function canAccessOrder` to `export function canAccessOrder`) and add `refunds` to the detail response:

```ts
  http.get(`${BASE}/orders/:id`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_orders_get");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_orders_get");

    const order = db.orders.find((o) => o.id === params.id);
    if (!order || !canAccessOrder(order, user)) return notFound("req_orders_get");

    const items = db.orderItems.filter((item) => item.orderId === order.id);
    const refunds = db.refunds.filter((r) => r.orderId === order.id);
    return HttpResponse.json({ data: { ...order, items, refunds }, meta: { requestId: "req_orders_get" } });
  })
```

Create `apps/panel/src/mocks/handlers/refunds.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { Refund, User } from "@entraditas/types";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";
import { canAccessOrder } from "./orders";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}
function forbidden(requestId: string, message: string) {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message, requestId } }, { status: 403 });
}
function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Pedido no encontrado", requestId } }, { status: 404 });
}
function validationError(requestId: string, message: string) {
  return HttpResponse.json({ error: { code: "VALIDATION_ERROR", message, requestId } }, { status: 422 });
}

function requireUser(request: Request): User | null {
  const userId = getSessionUserId(request);
  if (!userId) return null;
  return db.users.find((u) => u.id === userId) ?? null;
}

export const refundsHandlers = [
  http.post(`${BASE}/orders/:id/refund`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_refund_create");

    const order = db.orders.find((o) => o.id === params.id);
    if (!order || !canAccessOrder(order, user)) return notFound("req_refund_create");

    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:refund")) return forbidden("req_refund_create", "No tienes permiso para reembolsar pedidos");

    if (order.status !== "paid" && order.status !== "partially_refunded") {
      return validationError("req_refund_create", "Este pedido no admite reembolsos");
    }

    const body = (await request.json()) as { amount?: number; reason?: string };
    const reason = body.reason?.trim();
    if (!reason) return validationError("req_refund_create", "El motivo es obligatorio");

    const remaining = order.total - order.refundedAmount;
    const amount = body.amount;
    if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || amount > remaining) {
      return validationError("req_refund_create", "El importe supera lo pendiente de reembolso");
    }

    const refund: Refund = {
      id: `refund-${db.refunds.length + 1}`,
      orderId: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      amount,
      reason,
      status: "processed",
      createdAt: new Date().toISOString()
    };
    db.refunds.push(refund);

    order.refundedAmount += amount;
    order.status = order.refundedAmount >= order.total ? "refunded" : "partially_refunded";

    if (order.status === "refunded") {
      const items = db.orderItems.filter((item) => item.orderId === order.id);
      for (const item of items) {
        const ticketType = db.ticketTypes.find((tt) => tt.id === item.ticketTypeId);
        if (!ticketType) continue;
        ticketType.quantitySold = Math.max(0, ticketType.quantitySold - item.quantity);
        if (ticketType.capacityPoolId) {
          const pool = db.capacityPools.find((p) => p.id === ticketType.capacityPoolId);
          if (pool) pool.soldCount = Math.max(0, pool.soldCount - item.quantity);
        }
      }
    }

    const items = db.orderItems.filter((item) => item.orderId === order.id);
    const refunds = db.refunds.filter((r) => r.orderId === order.id);
    return HttpResponse.json({ data: { ...order, items, refunds }, meta: { requestId: "req_refund_create" } });
  }),

  http.get(`${BASE}/refunds`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_refunds_list");
    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:read")) return forbidden("req_refunds_list", "No tienes permiso para consultar reembolsos");

    const url = new URL(request.url);
    const eventId = url.searchParams.get("eventId");
    const q = url.searchParams.get("q")?.trim().toLowerCase();

    let refunds = db.refunds.filter((refund) => {
      const order = db.orders.find((o) => o.id === refund.orderId);
      return order ? canAccessOrder(order, user) : false;
    });
    if (eventId) {
      refunds = refunds.filter((refund) => db.orders.find((o) => o.id === refund.orderId)?.eventId === eventId);
    }
    if (q) {
      refunds = refunds.filter((refund) =>
        refund.orderNumber.toLowerCase().includes(q) || refund.customerName.toLowerCase().includes(q)
      );
    }
    refunds = [...refunds].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return HttpResponse.json({ data: refunds, meta: { requestId: "req_refunds_list" } });
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
import { refundsHandlers } from "./refunds";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { venuesHandlers } from "./venues";
import { usersHandlers } from "./users";

export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...usersHandlers, ...invitationsHandlers, ...dashboardHandlers, ...ordersHandlers, ...refundsHandlers];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/refunds.test.ts`
Expected: PASS (all 9 tests).

Also re-run the Pedidos handler tests, since `orders.ts` changed:

Run: `pnpm --filter panel test -- --run src/mocks/handlers/orders.test.ts`
Expected: PASS (unaffected — the added `refunds` field doesn't change any existing assertion).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/handlers/orders.ts apps/panel/src/mocks/handlers/refunds.ts apps/panel/src/mocks/handlers/refunds.test.ts apps/panel/src/mocks/handlers/index.ts
git commit -m "feat(mocks): add refund creation and refunds list endpoints"
```

---

### Task 4: Refund history and form on the order detail page

**Files:**
- Modify: `apps/panel/src/features/sales/orders/detail/OrderDetailPage.tsx`
- Test: `apps/panel/src/features/sales/orders/detail/OrderDetailPage.test.tsx`

**Interfaces:**
- Consumes: `POST /orders/:id/refund`, `GET /orders/:id` (now returning `refunds`) from Task 3; `Can` (`@/shared/auth/Can`); `Button` (`@/shared/ui/button`); `Refund` type.
- Produces: no new exports — same `OrderDetailPage` component, now rendering refund history + a gated refund form.

- [ ] **Step 1: Write the failing test**

Add to `apps/panel/src/features/sales/orders/detail/OrderDetailPage.test.tsx` (needs `fireEvent` added to the existing `@testing-library/react` import):

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
```

Add 3 new tests inside the existing `describe("OrderDetailPage", ...)` block:

```tsx
  it("shows the refund history for an already-refunded order", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-4");
    expect(await screen.findByText("Cliente no pudo asistir al evento.")).toBeInTheDocument();
  });

  it("hides the refund form for a user without orders:refund", async () => {
    await useSessionStore.getState().login("usuario@entraditas.com", "demo1234"); // role "user", scoped to event-1/event-2
    renderDetail("order-1");
    await screen.findByRole("heading", { name: "PED-2026-0001" });
    expect(screen.queryByLabelText("Importe a reembolsar (€)")).not.toBeInTheDocument();
  });

  it("submits a full refund and updates the order status shown on the page", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("order-6");
    const amountInput = await screen.findByLabelText("Importe a reembolsar (€)");
    fireEvent.change(amountInput, { target: { value: "60.00" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Duplicado" } });
    fireEvent.click(screen.getByRole("button", { name: "Reembolsar" }));
    expect(await screen.findByText(/Reembolsado/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/features/sales/orders/detail/OrderDetailPage.test.tsx`
Expected: FAIL — no refund history section or form exists yet.

- [ ] **Step 3: Write minimal implementation**

Replace the full contents of `apps/panel/src/features/sales/orders/detail/OrderDetailPage.tsx` with:

```tsx
import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import type { Order, OrderItem, Refund } from "@entraditas/types";
import { Can } from "@/shared/auth/Can";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";

type OrderDetail = Order & { items: OrderItem[]; refunds: Refund[] };

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

function RefundForm({
  orderId,
  remaining,
  token,
  onRefunded
}: {
  orderId: string;
  remaining: number;
  token: string;
  onRefunded: () => void;
}) {
  const [amountEuros, setAmountEuros] = useState((remaining / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiClient.post(
        `/orders/${orderId}/refund`,
        { amount: Math.round(Number(amountEuros) * 100), reason },
        { token }
      );
      setReason("");
      onRefunded();
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
      <div>
        <label htmlFor="refund-amount" className="block text-xs font-medium text-muted-foreground">Importe a reembolsar (€)</label>
        <input
          id="refund-amount"
          type="number"
          min="0.01"
          max={(remaining / 100).toFixed(2)}
          step="0.01"
          value={amountEuros}
          onChange={(e) => setAmountEuros(e.target.value)}
          className="mt-1 h-9 w-32 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
        />
      </div>
      <div className="flex-1">
        <label htmlFor="refund-reason" className="block text-xs font-medium text-muted-foreground">Motivo</label>
        <input
          id="refund-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 h-9 w-full rounded-md border-2 border-foreground bg-surface px-2 text-sm"
        />
      </div>
      <Button type="submit" disabled={submitting}>Reembolsar</Button>
      {error && <p role="alert" className="w-full text-sm text-destructive">{error}</p>}
    </form>
  );
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id!;
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();

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

  const remaining = order.total - order.refundedAmount;

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

      <section className="rounded-lg border-2 border-foreground bg-surface p-5 shadow-flat">
        <h2 className="font-display text-lg font-semibold">Reembolsos</h2>
        {order.refunds.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">Este pedido no tiene reembolsos.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {order.refunds.map((refund) => (
              <li key={refund.id} className="border-t border-border pt-2 first:border-t-0 first:pt-0">
                <span className="font-semibold">{euro.format(refund.amount / 100)}</span> · {refund.reason}
                <span className="block text-xs text-muted-foreground">{new Date(refund.createdAt).toLocaleDateString("es-ES")}</span>
              </li>
            ))}
          </ul>
        )}

        {remaining > 0 && (order.status === "paid" || order.status === "partially_refunded") && (
          <Can do="orders:refund">
            <RefundForm
              orderId={order.id}
              remaining={remaining}
              token={token!}
              onRefunded={() => queryClient.invalidateQueries({ queryKey: ["order", orderId] })}
            />
          </Can>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/features/sales/orders/detail/OrderDetailPage.test.tsx`
Expected: PASS (all 5 tests — the 2 from Task 5 of the Pedidos plan, plus the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/sales/orders/detail/OrderDetailPage.tsx apps/panel/src/features/sales/orders/detail/OrderDetailPage.test.tsx
git commit -m "feat(sales): add refund history and form to the order detail page"
```

---

### Task 5: Refunds list page

**Files:**
- Create: `apps/panel/src/features/sales/refunds/list/useRefundsQuery.ts`
- Create: `apps/panel/src/features/sales/refunds/list/RefundsListPage.tsx`
- Test: `apps/panel/src/features/sales/refunds/list/RefundsListPage.test.tsx`

**Interfaces:**
- Consumes: `GET /refunds` (Task 3); `useEventsQuery` (`@/features/events/list/useEventsQuery`); `Refund` type.
- Produces: `RefundsListPage` component (named export, no props), consumed by the router in Task 6. `useRefundsQuery(filters: { eventId?: string; q?: string })` hook, consumed only by `RefundsListPage`.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/sales/refunds/list/RefundsListPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { RefundsListPage } from "./RefundsListPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <RefundsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("RefundsListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the 2 seeded refunds to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3)); // header + 2 refunds
  });

  it("links each row to its order detail", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "demo1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "PED-2026-0004" });
    expect(link).toHaveAttribute("href", "/ventas/pedidos/order-4");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/features/sales/refunds/list/RefundsListPage.test.tsx`
Expected: FAIL — `./RefundsListPage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/features/sales/refunds/list/useRefundsQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { Refund } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface RefundsFilters {
  eventId?: string;
  q?: string;
}

export function useRefundsQuery(filters: RefundsFilters) {
  const token = useSessionStore((state) => state.token);
  const params = new URLSearchParams();
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.q) params.set("q", filters.q);
  const query = params.toString();

  return useQuery({
    queryKey: ["refunds", filters],
    queryFn: () => apiClient.get<Refund[]>(`/refunds${query ? `?${query}` : ""}`, { token: token! }),
    enabled: Boolean(token)
  });
}
```

Create `apps/panel/src/features/sales/refunds/list/RefundsListPage.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import type { Refund } from "@entraditas/types";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useRefundsQuery } from "./useRefundsQuery";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const columnHelper = createColumnHelper<Refund>();
const columns = [
  columnHelper.accessor("orderNumber", {
    header: "Nº pedido",
    cell: (info) => (
      <Link to={`/ventas/pedidos/${info.row.original.orderId}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("customerName", { header: "Comprador" }),
  columnHelper.accessor("amount", { header: "Importe", cell: (info) => euro.format(info.getValue() / 100) }),
  columnHelper.accessor("reason", { header: "Motivo" }),
  columnHelper.accessor("createdAt", { header: "Fecha", cell: (info) => new Date(info.getValue()).toLocaleDateString("es-ES") })
];

export function RefundsListPage() {
  const [eventId, setEventId] = useState("");
  const [q, setQ] = useState("");
  const { data: events = [] } = useEventsQuery();
  const { data: refunds = [], isLoading } = useRefundsQuery({ eventId: eventId || undefined, q: q || undefined });
  const table = useReactTable({ data: refunds, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Reembolsos</h1>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="refund-event-filter" className="sr-only">Evento</label>
        <select id="refund-event-filter" value={eventId} onChange={(e) => setEventId(e.target.value)} className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm">
          <option value="">Todos los eventos</option>
          {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
        </select>

        <label htmlFor="refund-search-filter" className="sr-only">Buscar</label>
        <input id="refund-search-filter" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nº pedido o comprador" className="h-9 rounded-md border-2 border-foreground bg-surface px-2 text-sm" />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : refunds.length === 0 ? (
        <p className="text-muted-foreground">No hay reembolsos que coincidan con los filtros.</p>
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

Run: `pnpm --filter panel test -- --run src/features/sales/refunds/list/RefundsListPage.test.tsx`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/sales/refunds/list
git commit -m "feat(sales): add refunds list page"
```

---

### Task 6: Enable the Reembolsos tab and route

**Files:**
- Modify: `apps/panel/src/features/sales/VentasLayout.tsx`
- Modify: `apps/panel/src/app/router.tsx`
- Modify: `apps/panel/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `RefundsListPage` (Task 5).
- Produces: route `/ventas/reembolsos`, behind the same `RequirePermission permission="orders:read"` block as `/ventas/pedidos`.

- [ ] **Step 1: Write the failing test**

Add to `apps/panel/src/app/router.test.tsx`, inside `describe("AppRoutes", ...)`, after the "shows the orders list under Ventas" test:

```tsx
  it("shows the refunds list under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas/reembolsos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Reembolsos" })).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: FAIL — there is no route for `/ventas/reembolsos` yet (renders nothing under `VentasLayout`'s `<Outlet />`).

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/features/sales/VentasLayout.tsx`, move "Reembolsos" from disabled to enabled:

```ts
const ENABLED_TABS = [
  { to: "/ventas/pedidos", label: "Pedidos" },
  { to: "/ventas/reembolsos", label: "Reembolsos" }
] as const;
const DISABLED_TABS = ["Taquilla (POS)", "Asistentes (CRM)"];
```

In `apps/panel/src/app/router.tsx`, add the import:

```ts
import { RefundsListPage } from "@/features/sales/refunds/list/RefundsListPage";
```

And add the `reembolsos` route inside the existing `/ventas` block:

```tsx
        <Route element={<RequirePermission permission="orders:read" />}>
          <Route path="/ventas" element={<VentasLayout />}>
            <Route index element={<Navigate to="pedidos" replace />} />
            <Route path="pedidos" element={<OrdersListPage />} />
            <Route path="pedidos/:id" element={<OrderDetailPage />} />
            <Route path="reembolsos" element={<RefundsListPage />} />
          </Route>
        </Route>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Run the full panel test suite and type-check**

Run: `pnpm --filter panel exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter panel test -- --run`
Expected: every test file passes.

Run: `pnpm --filter @entraditas/types test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/features/sales/VentasLayout.tsx apps/panel/src/app/router.tsx apps/panel/src/app/router.test.tsx
git commit -m "feat(sales): enable the Reembolsos tab and route"
```

---

## Plan Self-Review Notes

- **Spec coverage:** §3.1 (`refundedAmount`) → Task 1. §3.2 (seed `refunds`, backfill) → Task 2. §4.1–4.3 (endpoints, validations, capacity release) → Task 3. §5 (`OrderDetailPage` refund UI, `RefundsListPage`, `VentasLayout`, router) → Tasks 4–6. §6 (testing) → a test file/case in every task.
- **Placeholder scan:** no TBD/TODO; every step has real code.
- **Type consistency:** `OrderDetail` (`Order & { items: OrderItem[]; refunds: Refund[] }`) is used identically in Task 3's handler comment context, Task 4's `OrderDetailPage`, and matches what `RefundsListPage` (Task 5) independently expects from `GET /refunds` (`Refund[]`, no `items`/`refunds` wrapper). `RefundsFilters` shape matches between `useRefundsQuery` and its only caller `RefundsListPage` (same task). Route path `/ventas/reembolsos` matches between Task 6's router wiring, `VentasLayout`'s tab `to`, and the `Link` targets used in `RefundsListPage`/`OrdersListPage` (`/ventas/pedidos/:id`, unchanged from the Pedidos plan).
