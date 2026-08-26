# Ventas · Taquilla (POS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate the Taquilla (POS) tab of Ventas — sell one or more ticket types for an accessible event as a single paid, box-office order.

**Architecture:** Adds a new `orders:create` permission (+ a `sell_tickets` capability, reusing the existing generic capability-editor machinery), a `POST /orders` mock endpoint that validates stock and creates an `Order`/`OrderItem[]` pair while decrementing capacity, and a single-screen `TaquillaPage` (event → ticket-type cart → confirm) that calls it.

**Tech Stack:** React 18, TypeScript, react-router-dom v6, @tanstack/react-query, zod, msw, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-25-ventas-taquilla-design.md`

## Global Constraints

- Money values are integer cents, displayed via `(value / 100)` through `Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" })`.
- Mock API responses use `{ data, meta: { requestId } }` / `{ error: { code, message, requestId } }`.
- A box-office sale is created `status: "paid"`, `channel: "box_office"` immediately — no simulated payment step.
- `orders:create` is fixed for `admin`/`superadmin`, configurable for `user`/`subuser` (granted per person from Equipo, not in their base permission set).
- `POST /orders` validation/error order: unauthenticated → event not found/out of scope → missing `orders:create` → cart/customer validation → per-line stock check.

---

### Task 1: `orders:create` permission and `sell_tickets` capability

**Files:**
- Modify: `apps/panel/src/shared/auth/permissions.ts`
- Test: `apps/panel/src/shared/auth/permissions.test.ts`

**Interfaces:**
- Produces: `"orders:create"` added to the `PERMISSIONS` tuple (and therefore the `Permission` type); a new entry `{ key: "sell_tickets", ... }` in `CAPABILITIES`, read generically by `getConfigurableCapabilities`/`capabilityKeysToOverrides` (already used by `TeamMemberFormPage`, unchanged).

- [ ] **Step 1: Write the failing test**

Add to `apps/panel/src/shared/auth/permissions.test.ts`, extending the import line:

```ts
import { CAPABILITIES, hasPermission, resolveEffectivePermissions, ROLE_BASE_PERMISSIONS } from "./permissions";
```

Add a new `describe` block:

```ts
describe("sell_tickets capability", () => {
  it("is fixed for admin/superadmin and configurable for user/subuser", () => {
    const sellTickets = CAPABILITIES.find((c) => c.key === "sell_tickets")!;
    expect(sellTickets.accessByRole.superadmin).toBe("fixed_yes");
    expect(sellTickets.accessByRole.admin).toBe("fixed_yes");
    expect(sellTickets.accessByRole.user).toBe("configurable");
    expect(sellTickets.accessByRole.subuser).toBe("configurable");
  });

  it("admin and superadmin have orders:create in their base permissions, user does not", () => {
    expect(ROLE_BASE_PERMISSIONS.admin.includes("orders:create")).toBe(true);
    expect(ROLE_BASE_PERMISSIONS.superadmin.includes("orders:create")).toBe(true);
    expect((ROLE_BASE_PERMISSIONS.user as readonly string[]).includes("orders:create")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/shared/auth/permissions.test.ts`
Expected: FAIL — `CAPABILITIES.find(...)` returns `undefined`, so `.accessByRole` throws.

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/shared/auth/permissions.ts`, add `"orders:create"` to `PERMISSIONS` (right after `"orders:read"`):

```ts
export const PERMISSIONS = [
  "organizations:manage",
  "events:read", "events:create", "events:update", "events:delete", "events:publish",
  "subevents:read", "subevents:create", "subevents:update", "subevents:delete", "capacity:update",
  "tickettypes:read", "tickettypes:create", "tickettypes:update", "tickettypes:delete",
  "orders:read", "orders:create", "orders:refund", "orders:export", "guestlist:read", "guestlist:manage",
  "scan:validate", "scan:reverse", "reports:read", "reports:export", "finance:read", "finance:settle",
  "users:read", "users:manage", "roles:manage", "audit:read", "settings:manage"
] as const;
```

`ROLE_BASE_PERMISSIONS.user`/`.subuser` stay unchanged — `superadmin` (`= PERMISSIONS`) and `admin` (`= ALL_EXCEPT_ORG_MANAGE`) pick up `orders:create` automatically because they're derived from the full list.

Add the new capability to `CAPABILITIES`, right after the `refund_orders` entry:

```ts
  { key: "refund_orders", label: "Devolver dinero", permissions: ["orders:refund"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" } },
  { key: "sell_tickets", label: "Vender entradas en taquilla", permissions: ["orders:create"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "configurable" } },
  { key: "scan_tickets", label: "Escanear entradas en la puerta", permissions: ["scan:validate"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "fixed_yes" } },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/shared/auth/permissions.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/shared/auth/permissions.ts apps/panel/src/shared/auth/permissions.test.ts
git commit -m "feat(auth): add orders:create permission and sell_tickets capability"
```

---

### Task 2: `POST /orders` box-office sale endpoint

**Files:**
- Modify: `apps/panel/src/mocks/handlers/orders.ts`
- Test: `apps/panel/src/mocks/handlers/orders.test.ts`

**Interfaces:**
- Consumes: `canAccessEvent` (`@/mocks/handlers/events.ts`, already exported); `orders:create` from Task 1.
- Produces: `POST /orders` — body `{ eventId: string, customerName: string, customerEmail: string, items: { ticketTypeId: string, quantity: number }[] }`, `201` response `{ ...order, items: OrderItem[], refunds: [] }` (same shape `GET /orders/:id` already returns).

- [ ] **Step 1: Write the failing test**

In `apps/panel/src/mocks/handlers/orders.test.ts`, change the state import to also bring in `db`:

```ts
import { db, resetDb } from "@/mocks/state";
```

Add a new `describe` block at the end of the file:

```ts
describe("orders handlers - creating a box office sale", () => {
  afterEach(() => resetDb());

  it("creates a multi-line paid order and updates stock for each line", async () => {
    const token = await loginAs("admin@entraditas.com");
    const pistaBefore = db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!.quantitySold;
    const poolBefore = db.capacityPools.find((p) => p.id === "pool-2-pista")!.soldCount;

    const result = await apiClient.post<Order & { items: OrderItem[] }>(
      "/orders",
      {
        eventId: "event-2",
        customerName: "Cliente en taquilla",
        customerEmail: "taquilla@example.com",
        items: [
          { ticketTypeId: "tt-2-pista", quantity: 2 },
          { ticketTypeId: "tt-2-grada", quantity: 1 }
        ]
      },
      { token }
    );

    expect(result.status).toBe("paid");
    expect(result.channel).toBe("box_office");
    expect(result.total).toBe(2 * 3000 + 1 * 5000);
    expect(result.items).toHaveLength(2);
    expect(result.refunds).toEqual([]);

    expect(db.ticketTypes.find((tt) => tt.id === "tt-2-pista")!.quantitySold).toBe(pistaBefore + 2);
    expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.soldCount).toBe(poolBefore + 2);
  });

  it("rejects a sale that exceeds the remaining stock", async () => {
    const token = await loginAs("admin@entraditas.com");
    const tt1 = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    tt1.quantityTotal = tt1.quantitySold + 1; // only 1 left

    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-1", quantity: 2 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "INSUFFICIENT_CAPACITY" });
  });

  it("rejects a ticket type that doesn't belong to the given event", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-2-pista", quantity: 1 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("rejects an empty cart", async () => {
    const token = await loginAs("admin@entraditas.com");
    await expect(
      apiClient.post("/orders", { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [] }, { token })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("returns FORBIDDEN for a user without orders:create", async () => {
    const token = await loginAs("usuario@entraditas.com"); // role "user", orders:create not granted in seed
    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-1", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-1", quantity: 1 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns NOT_FOUND for an event outside the actor's organization", async () => {
    const token = await loginAs("admin@entraditas.com"); // org-1
    await expect(
      apiClient.post(
        "/orders",
        { eventId: "event-4", customerName: "Cliente", customerEmail: "cliente@example.com", items: [{ ticketTypeId: "tt-4-pass", quantity: 1 }] },
        { token }
      )
    ).rejects.toMatchObject({ code: "NOT_FOUND" }); // event-4 belongs to org-2
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/orders.test.ts`
Expected: FAIL — `POST /orders` is an unhandled request.

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/mocks/handlers/orders.ts`:

1. Extend imports:

```ts
import { http, HttpResponse } from "msw";
import type { Order, OrderItem, TicketType, User } from "@entraditas/types";
import { hasPermission, resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";
import { canAccessEvent } from "./events";
```

2. Make `forbidden` accept an optional message (default keeps the existing calls working), and add a `validationError` helper:

```ts
function forbidden(requestId: string, message = "No tienes permiso para consultar pedidos") {
  return HttpResponse.json({ error: { code: "FORBIDDEN", message, requestId } }, { status: 403 });
}
function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Pedido no encontrado", requestId } }, { status: 404 });
}
function validationError(requestId: string, message: string, code = "VALIDATION_ERROR") {
  return HttpResponse.json({ error: { code, message, requestId } }, { status: 422 });
}
```

3. Add the `POST /orders` handler to the `ordersHandlers` array (after the `GET /orders/:id` handler):

```ts
  http.post(`${BASE}/orders`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_orders_create");

    const body = (await request.json()) as {
      eventId?: string;
      customerName?: string;
      customerEmail?: string;
      items?: { ticketTypeId: string; quantity: number }[];
    };

    const event = body.eventId ? db.events.find((e) => e.id === body.eventId) : undefined;
    if (!event || !canAccessEvent(event, user)) return notFound("req_orders_create");

    const effective = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!effective.has("orders:create")) return forbidden("req_orders_create", "No tienes permiso para vender entradas");

    const items = body.items ?? [];
    if (items.length === 0) return validationError("req_orders_create", "Añade al menos una línea a la venta");
    if (!body.customerName?.trim() || !body.customerEmail?.trim()) {
      return validationError("req_orders_create", "El nombre y el email del comprador son obligatorios");
    }

    const lines: { ticketType: TicketType; quantity: number }[] = [];
    for (const line of items) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        return validationError("req_orders_create", "La cantidad debe ser un entero positivo");
      }
      const ticketType = db.ticketTypes.find((tt) => tt.id === line.ticketTypeId && tt.eventId === event.id);
      if (!ticketType) return validationError("req_orders_create", "Uno de los tipos de entrada no pertenece a este evento");
      lines.push({ ticketType, quantity: line.quantity });
    }

    for (const { ticketType, quantity } of lines) {
      if (ticketType.quantityTotal !== null && ticketType.quantityTotal - ticketType.quantitySold < quantity) {
        return validationError("req_orders_create", `No queda stock suficiente de "${ticketType.name}"`, "INSUFFICIENT_CAPACITY");
      }
    }

    const orderId = `order-${db.orders.length + 1}`;
    const orderNumber = `PED-2026-${String(db.orders.length + 1).padStart(4, "0")}`;
    const total = lines.reduce((sum, line) => sum + line.ticketType.basePrice * line.quantity, 0);

    const order: Order = {
      id: orderId,
      orderNumber,
      eventId: event.id,
      organizationId: event.organizationId,
      customerName: body.customerName.trim(),
      customerEmail: body.customerEmail.trim(),
      status: "paid",
      total,
      refundedAmount: 0,
      currency: "EUR",
      channel: "box_office",
      createdAt: new Date().toISOString()
    };
    db.orders.push(order);

    const newItems: OrderItem[] = lines.map((line, index) => ({
      id: `oi-${db.orderItems.length + 1 + index}`,
      orderId,
      ticketTypeId: line.ticketType.id,
      ticketTypeName: line.ticketType.name,
      quantity: line.quantity,
      unitPrice: line.ticketType.basePrice,
      subtotal: line.ticketType.basePrice * line.quantity
    }));
    db.orderItems.push(...newItems);

    for (const line of lines) {
      line.ticketType.quantitySold += line.quantity;
      if (line.ticketType.capacityPoolId) {
        const pool = db.capacityPools.find((p) => p.id === line.ticketType.capacityPoolId);
        if (pool) pool.soldCount += line.quantity;
      }
    }

    return HttpResponse.json(
      { data: { ...order, items: newItems, refunds: [] }, meta: { requestId: "req_orders_create" } },
      { status: 201 }
    );
  })
```

(This is the last item in the `ordersHandlers` array — add a comma after the previous handler's closing `})` and place this one before the closing `];`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/orders.test.ts`
Expected: PASS (all tests, previous + 6 new).

Also re-run the refunds tests, since `orders.ts`'s `forbidden` signature changed:

Run: `pnpm --filter panel test -- --run src/mocks/handlers/refunds.test.ts`
Expected: PASS (unaffected — `refunds.ts` has its own local `forbidden` helper).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/mocks/handlers/orders.ts apps/panel/src/mocks/handlers/orders.test.ts
git commit -m "feat(mocks): add POST /orders for box-office sales"
```

---

### Task 3: Taquilla page

**Files:**
- Create: `apps/panel/src/features/sales/taquilla/useEventTicketTypesQuery.ts`
- Create: `apps/panel/src/features/sales/taquilla/TaquillaPage.tsx`
- Test: `apps/panel/src/features/sales/taquilla/TaquillaPage.test.tsx`

**Interfaces:**
- Consumes: `POST /orders` (Task 2); `useEventsQuery` (`@/features/events/list/useEventsQuery`); `Can` (`@/shared/auth/Can`); `Button` (`@/shared/ui/button`).
- Produces: `TaquillaPage` component (named export, no props), consumed by the router in Task 4. `useEventTicketTypesQuery(eventId: string | null)` hook, consumed only by `TaquillaPage`.

- [ ] **Step 1: Write the failing test**

Create `apps/panel/src/features/sales/taquilla/TaquillaPage.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { TaquillaPage } from "./TaquillaPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TaquillaPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("TaquillaPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a permission notice instead of the form for a user without orders:create", async () => {
    await useSessionStore.getState().login("usuario@entraditas.com", "demo1234");
    renderPage();
    expect(await screen.findByText("No tienes permiso para vender entradas.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Evento")).not.toBeInTheDocument();
  });

  it("builds a multi-line cart and confirms the sale", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderPage();

    fireEvent.change(await screen.findByLabelText("Evento"), { target: { value: "event-2" } });
    fireEvent.change(await screen.findByLabelText("Cantidad de Pista"), { target: { value: "2" } });
    fireEvent.change(await screen.findByLabelText("Cantidad de Grada VIP"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Nombre del comprador"), { target: { value: "Cliente en taquilla" } });
    fireEvent.change(screen.getByLabelText("Email del comprador"), { target: { value: "taquilla@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirmar venta" }));

    expect(await screen.findByText(/confirmada/)).toBeInTheDocument();
  });

  it("disables the quantity input and shows Agotado for a sold-out ticket type", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const tt1 = db.ticketTypes.find((tt) => tt.id === "tt-1")!;
    tt1.quantityTotal = tt1.quantitySold; // 0 remaining
    renderPage();

    fireEvent.change(await screen.findByLabelText("Evento"), { target: { value: "event-1" } });
    expect(await screen.findByText("Agotado")).toBeInTheDocument();
    expect(screen.getByLabelText("Cantidad de General")).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/features/sales/taquilla/TaquillaPage.test.tsx`
Expected: FAIL — `./TaquillaPage` does not exist.

- [ ] **Step 3: Write minimal implementation**

Create `apps/panel/src/features/sales/taquilla/useEventTicketTypesQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useEventTicketTypesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: () => apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}
```

Create `apps/panel/src/features/sales/taquilla/TaquillaPage.tsx`:

```tsx
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { Order, OrderItem, TicketType } from "@entraditas/types";
import { Can } from "@/shared/auth/Can";
import { Button } from "@/shared/ui/button";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { useEventsQuery } from "@/features/events/list/useEventsQuery";
import { useEventTicketTypesQuery } from "./useEventTicketTypesQuery";

const euro = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

function remainingStock(ticketType: TicketType): number | null {
  return ticketType.quantityTotal === null ? null : ticketType.quantityTotal - ticketType.quantitySold;
}

export function TaquillaPage() {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const [eventId, setEventId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{ orderId: string; orderNumber: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const { data: events = [] } = useEventsQuery();
  const { data: ticketTypes = [] } = useEventTicketTypesQuery(eventId || null);

  function setQuantity(ticketTypeId: string, quantity: number) {
    setQuantities((prev) => ({ ...prev, [ticketTypeId]: quantity }));
  }

  const cartLines = ticketTypes
    .map((tt) => ({ ticketType: tt, quantity: quantities[tt.id] ?? 0 }))
    .filter((line) => line.quantity > 0);
  const total = cartLines.reduce((sum, line) => sum + line.ticketType.basePrice * line.quantity, 0);

  async function confirmSale() {
    setError(null);
    setConfirmation(null);
    setSubmitting(true);
    try {
      const order = await apiClient.post<Order & { items: OrderItem[] }>(
        "/orders",
        {
          eventId,
          customerName,
          customerEmail,
          items: cartLines.map((line) => ({ ticketTypeId: line.ticketType.id, quantity: line.quantity }))
        },
        { token: token! }
      );
      setConfirmation({ orderId: order.id, orderNumber: order.orderNumber });
      setQuantities({});
      setCustomerName("");
      setCustomerEmail("");
      queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (cause) {
      if (cause instanceof AppError) setError(cause.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Taquilla</h1>
      </header>

      <Can
        do="orders:create"
        fallback={
          <p className="rounded-lg border-2 border-dashed border-border bg-surface-alt p-6 text-sm text-muted-foreground">
            No tienes permiso para vender entradas.
          </p>
        }
      >
        <div className="flex flex-col gap-6">
          <div>
            <label htmlFor="taquilla-event" className="block text-xs font-medium text-muted-foreground">Evento</label>
            <select
              id="taquilla-event"
              value={eventId}
              onChange={(e) => {
                setEventId(e.target.value);
                setQuantities({});
                setConfirmation(null);
                setError(null);
              }}
              className="mt-1 h-9 w-full max-w-md rounded-md border-2 border-foreground bg-surface px-2 text-sm"
            >
              <option value="">Selecciona un evento</option>
              {events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}
            </select>
          </div>

          {eventId && (
            <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-alt">
                  <tr>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Tipo de entrada</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Precio</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Disponibles</th>
                    <th className="px-4 py-3 font-medium text-muted-foreground">Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketTypes.map((ticketType) => {
                    const remaining = remainingStock(ticketType);
                    const soldOut = remaining !== null && remaining <= 0;
                    const max = remaining === null ? ticketType.maxPerOrder : Math.min(remaining, ticketType.maxPerOrder);
                    return (
                      <tr key={ticketType.id} className="border-t border-border">
                        <td className="px-4 py-3">{ticketType.name}</td>
                        <td className="px-4 py-3">{euro.format(ticketType.basePrice / 100)}</td>
                        <td className="px-4 py-3">{soldOut ? "Agotado" : remaining === null ? "Ilimitado" : remaining}</td>
                        <td className="px-4 py-3">
                          <label htmlFor={`qty-${ticketType.id}`} className="sr-only">Cantidad de {ticketType.name}</label>
                          <input
                            id={`qty-${ticketType.id}`}
                            type="number"
                            min={0}
                            max={max}
                            disabled={soldOut}
                            value={quantities[ticketType.id] ?? 0}
                            onChange={(e) => setQuantity(ticketType.id, Math.max(0, Number(e.target.value)))}
                            className="h-9 w-20 rounded-md border-2 border-foreground bg-surface px-2 text-sm disabled:opacity-50"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {cartLines.length > 0 && (
            <div className="rounded-lg border-2 border-foreground bg-surface p-5 shadow-flat">
              <h2 className="font-display text-lg font-semibold">Resumen de la venta</h2>
              <ul className="mt-3 flex flex-col gap-1 text-sm">
                {cartLines.map((line) => (
                  <li key={line.ticketType.id} className="flex justify-between">
                    <span>{line.ticketType.name} × {line.quantity}</span>
                    <span>{euro.format((line.ticketType.basePrice * line.quantity) / 100)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex justify-between border-t border-border pt-3 font-semibold">
                <span>Total</span>
                <span>{euro.format(total / 100)}</span>
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <div>
                  <label htmlFor="taquilla-customer-name" className="block text-xs font-medium text-muted-foreground">Nombre del comprador</label>
                  <input
                    id="taquilla-customer-name"
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="mt-1 h-9 w-56 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="taquilla-customer-email" className="block text-xs font-medium text-muted-foreground">Email del comprador</label>
                  <input
                    id="taquilla-customer-email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="mt-1 h-9 w-56 rounded-md border-2 border-foreground bg-surface px-2 text-sm"
                  />
                </div>
              </div>

              <Button
                type="button"
                className="mt-4"
                disabled={submitting || !customerName.trim() || !customerEmail.trim()}
                onClick={confirmSale}
              >
                Confirmar venta
              </Button>
            </div>
          )}

          {error && <p role="alert">{error}</p>}
          {confirmation && (
            <p role="status" className="border-2 border-success bg-success-bg px-4 py-3 text-sm font-semibold">
              Venta {confirmation.orderNumber} confirmada. <Link to={`/ventas/pedidos/${confirmation.orderId}`} className="underline">Ver pedido</Link>
            </p>
          )}
        </div>
      </Can>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/features/sales/taquilla/TaquillaPage.test.tsx`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/sales/taquilla
git commit -m "feat(sales): add the Taquilla (POS) page"
```

---

### Task 4: Enable the Taquilla tab and route

**Files:**
- Modify: `apps/panel/src/features/sales/VentasLayout.tsx`
- Modify: `apps/panel/src/app/router.tsx`
- Modify: `apps/panel/src/app/router.test.tsx`

**Interfaces:**
- Consumes: `TaquillaPage` (Task 3).
- Produces: route `/ventas/taquilla`, behind the same `RequirePermission permission="orders:read"` block as `/ventas/pedidos` and `/ventas/reembolsos`.

- [ ] **Step 1: Write the failing test**

Add to `apps/panel/src/app/router.test.tsx`, inside `describe("AppRoutes", ...)`, after the "shows the refunds list under Ventas" test:

```tsx
  it("shows the taquilla page under Ventas to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["orders:read"]),
      eventScopes: []
    });
    renderApp(["/ventas/taquilla"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Taquilla" })).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: FAIL — there is no route for `/ventas/taquilla` yet.

- [ ] **Step 3: Write minimal implementation**

In `apps/panel/src/features/sales/VentasLayout.tsx`, move "Taquilla (POS)" from disabled to enabled:

```ts
const ENABLED_TABS = [
  { to: "/ventas/pedidos", label: "Pedidos" },
  { to: "/ventas/reembolsos", label: "Reembolsos" },
  { to: "/ventas/taquilla", label: "Taquilla (POS)" }
] as const;
const DISABLED_TABS = ["Asistentes (CRM)"];
```

In `apps/panel/src/app/router.tsx`, add the import:

```ts
import { TaquillaPage } from "@/features/sales/taquilla/TaquillaPage";
```

And add the `taquilla` route inside the existing `/ventas` block:

```tsx
        <Route element={<RequirePermission permission="orders:read" />}>
          <Route path="/ventas" element={<VentasLayout />}>
            <Route index element={<Navigate to="pedidos" replace />} />
            <Route path="pedidos" element={<OrdersListPage />} />
            <Route path="pedidos/:id" element={<OrderDetailPage />} />
            <Route path="reembolsos" element={<RefundsListPage />} />
            <Route path="taquilla" element={<TaquillaPage />} />
          </Route>
        </Route>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter panel test -- --run src/app/router.test.tsx`
Expected: PASS (all 7 tests).

- [ ] **Step 5: Run the full panel test suite and type-check**

Run: `pnpm --filter panel exec tsc --noEmit`
Expected: no errors.

Run: `pnpm --filter panel test -- --run`
Expected: every test file passes.

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/features/sales/VentasLayout.tsx apps/panel/src/app/router.tsx apps/panel/src/app/router.test.tsx
git commit -m "feat(sales): enable the Taquilla (POS) tab and route"
```

---

## Plan Self-Review Notes

- **Spec coverage:** §3 (`orders:create` permission, `sell_tickets` capability) → Task 1. §4 (`POST /orders` validations and effects) → Task 2. §5 (`TaquillaPage`, `useEventTicketTypesQuery`, `VentasLayout`, router) → Tasks 3–4. §6 (testing) → a test file/case in every task.
- **Placeholder scan:** no TBD/TODO; every step has real code.
- **Type consistency:** the `POST /orders` body shape (`eventId`, `customerName`, `customerEmail`, `items: { ticketTypeId, quantity }[]`) in Task 2's handler matches exactly what `TaquillaPage`'s `confirmSale` (Task 3) sends. The `201` response shape (`Order & { items: OrderItem[]; refunds: Refund[] }`) matches the `Order & { items: OrderItem[] }` type `TaquillaPage` reads `id`/`orderNumber` from. Route path `/ventas/taquilla` matches between Task 4's router wiring, `VentasLayout`'s tab `to`, and the confirmation `Link` in `TaquillaPage` (`/ventas/pedidos/:id`, unchanged from the Pedidos plan).
