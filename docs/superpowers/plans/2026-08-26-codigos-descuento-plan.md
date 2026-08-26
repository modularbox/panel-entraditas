# Códigos de descuento Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el apartado "Códigos de descuento" de la ficha de evento con gestión CRUD completa (crear, listar, activar/desactivar, eliminar).

**Architecture:** Recurso a nivel de evento (`eventId`) con el mismo patrón CRUD ya usado para tipos de entrada: schema Zod en `packages/types`, handler mock con helpers `requireEvent`/`requireDiscountCode` (mismo estilo que `ticketTypes.ts`), y una sección React con lista arriba + formulario de creación abajo, reutilizada desde `EventDetailPage`.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query, MSW, zod, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-26-codigos-descuento-design.md`

## Global Constraints

- No hay subsistema de Pedidos: `usedCount` se inicializa a `0` y nunca se incrementa en esta fase; no existe `POST /public/discount-codes/validate`.
- No se implementa `bulk-generate`.
- `validFrom`/`validTo` y `status` son solo informativos: ningún proceso automático los aplica.
- `value`: entero — si `type === "percent"`, 0–100; si `type === "fixed"`, céntimos (mismo criterio que `TicketType.basePrice`).
- `appliesTo`: array de `groupId` de tipos de entrada, o `null` (= todos).
- `code` es único dentro de un mismo evento, comparado sin distinguir mayúsculas/minúsculas.
- Sin restricciones de negocio en `DELETE` (a diferencia de zonas/tipos de entrada): `usedCount` siempre es `0` en esta fase.

---

### Task 1: `DiscountCode` schema

**Files:**
- Modify: `packages/types/src/schemas.ts`
- Test: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Produces: `DiscountCodeSchema` (zod), `DiscountCode` type — ambos re-exportados automáticamente vía `packages/types/src/index.ts` (`export * from "./schemas"`).

- [ ] **Step 1: Write the failing tests**

Añade al final de `packages/types/src/schemas.test.ts` (después del último `describe` existente):

```ts
describe("DiscountCodeSchema", () => {
  it("accepts a valid discount code", () => {
    const result = DiscountCodeSchema.parse({
      id: "dc-1",
      eventId: "event-1",
      code: "VERANO10",
      type: "percent",
      value: 10,
      maxUses: 100,
      usedCount: 0,
      maxUsesPerCustomer: 1,
      appliesTo: null,
      validFrom: null,
      validTo: null,
      status: "active"
    });
    expect(result.code).toBe("VERANO10");
  });

  it("accepts appliesTo as a list of ticket-type group ids", () => {
    const result = DiscountCodeSchema.parse({
      id: "dc-2",
      eventId: "event-1",
      code: "VIPONLY",
      type: "fixed",
      value: 500,
      maxUses: null,
      usedCount: 0,
      maxUsesPerCustomer: null,
      appliesTo: ["tt-1", "tt-2"],
      validFrom: "2026-01-01T00:00:00.000Z",
      validTo: "2026-02-01T00:00:00.000Z",
      status: "inactive"
    });
    expect(result.appliesTo).toEqual(["tt-1", "tt-2"]);
  });

  it("rejects an unknown type", () => {
    expect(() =>
      DiscountCodeSchema.parse({
        id: "dc-3",
        eventId: "event-1",
        code: "BAD",
        type: "bogus",
        value: 10,
        maxUses: null,
        usedCount: 0,
        maxUsesPerCustomer: null,
        appliesTo: null,
        validFrom: null,
        validTo: null,
        status: "active"
      })
    ).toThrow();
  });
});
```

Add the import at the top of the file alongside the other schema imports (it already imports from `"./schemas"` — add `DiscountCodeSchema` to that existing import line).

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/types && pnpm exec vitest run src/schemas.test.ts`
Expected: FAIL — `DiscountCodeSchema` is not exported from `./schemas`.

- [ ] **Step 3: Add the schema**

In `packages/types/src/schemas.ts`, add after `TicketTypeSchema`/`export type TicketType = ...` (right before `TicketTypePriceSchema`):

```ts
export const DiscountCodeSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  code: z.string(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().nonnegative(),
  maxUses: z.number().int().positive().nullable(),
  usedCount: z.number().int().nonnegative(),
  maxUsesPerCustomer: z.number().int().positive().nullable(),
  appliesTo: z.array(z.string()).nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: z.enum(["active", "inactive"])
});
export type DiscountCode = z.infer<typeof DiscountCodeSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/types && pnpm exec vitest run src/schemas.test.ts`
Expected: PASS (all tests in the file, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/schemas.ts packages/types/src/schemas.test.ts
git commit -m "feat: add DiscountCode schema"
```

---

### Task 2: Seed data for discount codes

**Files:**
- Modify: `apps/panel/src/mocks/db.ts`

**Interfaces:**
- Consumes: `DiscountCode` type from `@entraditas/types` (Task 1).
- Produces: `Database.discountCodes: DiscountCode[]`, seeded with one example code `dc-2-earlybird` on `event-2` (id `"event-2"`, which already has ticket-type groups `tt-2-pista`/`tt-2-grada`) — later tasks' tests rely on this exact id and on `event-2` having at least one pre-existing discount code.

- [ ] **Step 1: Add the field and seed to `db.ts`**

In `apps/panel/src/mocks/db.ts`:

1. Add `DiscountCode` to the type-only import at the top of the file (line 1-3): change
   ```ts
   import type {
     CapacityPool, Event, Organization, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
   } from "@entraditas/types";
   ```
   to
   ```ts
   import type {
     CapacityPool, DiscountCode, Event, Organization, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
   } from "@entraditas/types";
   ```
2. Add `discountCodes: DiscountCode[];` to the `Database` interface, after `ticketTypePrices: TicketTypePrice[];`.
3. Right after the declaration of `event2TicketTypeGrada` (around line 95, just before the `// Event 3:` comment), add:
   ```ts
   const event2DiscountCode: DiscountCode = {
     id: "dc-2-earlybird", eventId: event2.id, code: "EARLYBIRD", type: "percent", value: 15,
     maxUses: 100, usedCount: 0, maxUsesPerCustomer: 1, appliesTo: null,
     validFrom: null, validTo: null, status: "active"
   };
   ```
4. In the object returned at the end of `createSeedDatabase`, add `discountCodes: [event2DiscountCode],` after `ticketTypePrices: []`.

- [ ] **Step 2: Verify the panel app still type-checks and its existing tests pass**

Run: `cd apps/panel && pnpm exec tsc --noEmit`
Expected: clean (no output).

Run: `cd apps/panel && pnpm exec vitest run src/mocks/db.test.ts`
Expected: PASS — this task only adds a field/seed, it doesn't change any existing seeded event/ticket-type/zone, so the existing assertions in `db.test.ts` keep passing unmodified.

- [ ] **Step 3: Commit**

```bash
git add apps/panel/src/mocks/db.ts
git commit -m "feat: seed a discount code on event-2"
```

---

### Task 3: Discount-codes mock handler

**Files:**
- Create: `apps/panel/src/mocks/handlers/discountCodes.ts`
- Create: `apps/panel/src/mocks/handlers/discountCodes.test.ts`
- Modify: `apps/panel/src/mocks/handlers/index.ts`

**Interfaces:**
- Consumes: `db.discountCodes` (Task 2), `canAccessEvent` from `./events`, `getSessionUserId` from `../authContext`, `db` from `../state`.
- Produces: `discountCodesHandlers` (array of MSW `http.*` handlers), registered in the root `handlers` array. Endpoints: `GET /events/:eventId/discount-codes`, `POST /events/:eventId/discount-codes`, `PATCH /discount-codes/:id`, `DELETE /discount-codes/:id`.

- [ ] **Step 1: Write the failing tests**

Create `apps/panel/src/mocks/handlers/discountCodes.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import type { DiscountCode } from "@entraditas/types";

describe("discountCodes handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    return useSessionStore.getState().token!;
  }

  it("lists discount codes for an event", async () => {
    const token = await login();
    const codes = await apiClient.get<DiscountCode[]>("/events/event-2/discount-codes", { token });
    expect(codes).toHaveLength(1);
    expect(codes[0]!.code).toBe("EARLYBIRD");
  });

  it("creates a discount code", async () => {
    const token = await login();
    const created = await apiClient.post<DiscountCode>(
      "/events/event-2/discount-codes",
      {
        code: "VIP20",
        type: "percent",
        value: 20,
        maxUses: null,
        maxUsesPerCustomer: null,
        appliesTo: null,
        validFrom: null,
        validTo: null
      },
      { token }
    );
    expect(created.status).toBe("active");
    expect(created.usedCount).toBe(0);
    expect(db.discountCodes.some((c) => c.code === "VIP20")).toBe(true);
  });

  it("rejects a duplicate code within the same event (case-insensitive)", async () => {
    const token = await login();
    await expect(
      apiClient.post(
        "/events/event-2/discount-codes",
        {
          code: "earlybird",
          type: "percent",
          value: 5,
          maxUses: null,
          maxUsesPerCustomer: null,
          appliesTo: null,
          validFrom: null,
          validTo: null
        },
        { token }
      )
    ).rejects.toThrow(AppError);
    expect(db.discountCodes.filter((c) => c.eventId === "event-2")).toHaveLength(1);
  });

  it("patches a discount code's status", async () => {
    const token = await login();
    const updated = await apiClient.patch<DiscountCode>(
      "/discount-codes/dc-2-earlybird",
      { status: "inactive" },
      { token }
    );
    expect(updated.status).toBe("inactive");
    expect(db.discountCodes.find((c) => c.id === "dc-2-earlybird")!.status).toBe("inactive");
  });

  it("deletes a discount code", async () => {
    const token = await login();
    await apiClient.delete("/discount-codes/dc-2-earlybird", { token });
    expect(db.discountCodes.some((c) => c.id === "dc-2-earlybird")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/panel && pnpm exec vitest run src/mocks/handlers/discountCodes.test.ts`
Expected: FAIL — all requests 404, since no handler exists yet for these paths (MSW's unhandled-request warning, and `apiClient` throwing on the non-JSON/network-level response, or an explicit "not found" test failure).

- [ ] **Step 3: Implement the handler**

Create `apps/panel/src/mocks/handlers/discountCodes.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { DiscountCode } from "@entraditas/types";
import { db } from "../state";
import { getSessionUserId } from "../authContext";
import { canAccessEvent } from "./events";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

function requireEvent(request: Request, eventId: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_dc") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_dc") };
  return { event };
}

function requireDiscountCode(request: Request, id: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_dc") };
  const user = db.users.find((u) => u.id === userId);
  const discountCode = db.discountCodes.find((c) => c.id === id);
  const event = discountCode ? db.events.find((e) => e.id === discountCode.eventId) : null;
  if (!user || !discountCode || !event || !canAccessEvent(event, user)) return { error: notFound("req_dc") };
  return { discountCode };
}

interface CreateDiscountCodeBody {
  code: string;
  type: DiscountCode["type"];
  value: number;
  maxUses: number | null;
  maxUsesPerCustomer: number | null;
  appliesTo: string[] | null;
  validFrom: string | null;
  validTo: string | null;
}

export const discountCodesHandlers = [
  http.get(`${BASE}/events/:eventId/discount-codes`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const codes = db.discountCodes.filter((c) => c.eventId === result.event.id);
    return HttpResponse.json({ data: codes, meta: { page: 1, perPage: codes.length, total: codes.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/discount-codes`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as CreateDiscountCodeBody;
    const duplicate = db.discountCodes.some(
      (c) => c.eventId === result.event.id && c.code.toLowerCase() === body.code.toLowerCase()
    );
    if (duplicate) {
      return HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Ya existe un código de descuento con ese nombre en este evento",
            requestId: "req_dc_create"
          }
        },
        { status: 422 }
      );
    }
    const created: DiscountCode = {
      id: `dc-${db.discountCodes.length + 1}`,
      eventId: result.event.id,
      code: body.code,
      type: body.type,
      value: body.value,
      maxUses: body.maxUses,
      usedCount: 0,
      maxUsesPerCustomer: body.maxUsesPerCustomer,
      appliesTo: body.appliesTo,
      validFrom: body.validFrom,
      validTo: body.validTo,
      status: "active"
    };
    db.discountCodes.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_dc_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/discount-codes/:id`, async ({ request, params }) => {
    const result = requireDiscountCode(request, params.id as string);
    if ("error" in result) return result.error;
    Object.assign(result.discountCode, await request.json());
    return HttpResponse.json({ data: result.discountCode, meta: { requestId: "req_dc_patch" } });
  }),

  http.delete(`${BASE}/discount-codes/:id`, ({ request, params }) => {
    const result = requireDiscountCode(request, params.id as string);
    if ("error" in result) return result.error;
    db.discountCodes = db.discountCodes.filter((c) => c.id !== result.discountCode.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_dc_delete" } });
  })
];
```

- [ ] **Step 4: Register the handler**

In `apps/panel/src/mocks/handlers/index.ts`, add the import and spread it into `handlers`:

```ts
import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { discountCodesHandlers } from "./discountCodes";
import { eventsHandlers } from "./events";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { venuesHandlers } from "./venues";

export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...discountCodesHandlers];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/panel && pnpm exec vitest run src/mocks/handlers/discountCodes.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/panel/src/mocks/handlers/discountCodes.ts apps/panel/src/mocks/handlers/discountCodes.test.ts apps/panel/src/mocks/handlers/index.ts
git commit -m "feat: add discount-codes mock CRUD endpoints"
```

---

### Task 4: `DiscountCodesSection` component

**Files:**
- Create: `apps/panel/src/features/events/wizard/steps/DiscountCodesSection.tsx`
- Create: `apps/panel/src/features/events/wizard/steps/DiscountCodesSection.test.tsx`

**Interfaces:**
- Consumes: `DiscountCode` type from `@entraditas/types`; `groupTicketTypes`, `TicketTypeGroup` exported from `./Step4TicketTypes`; `apiClient`/`AppError` from `@/shared/lib/apiClient`; `useSessionStore` from `@/shared/auth/sessionStore`; `Button` from `@/shared/ui/button`.
- Produces: `DiscountCodesSection` component with props `{ eventId: string | null }` — same prop shape as `SeatingPlanSection`, consumed by Task 5.

- [ ] **Step 1: Write the failing test for the placeholder state**

Create `apps/panel/src/features/events/wizard/steps/DiscountCodesSection.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { DiscountCodesSection } from "./DiscountCodesSection";

function renderSection(eventId: string | null) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <DiscountCodesSection eventId={eventId} />
    </QueryClientProvider>
  );
}

describe("DiscountCodesSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la información del evento/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Código")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: FAIL — `./DiscountCodesSection` does not exist.

- [ ] **Step 3: Implement the placeholder and the base component shell**

Create `apps/panel/src/features/events/wizard/steps/DiscountCodesSection.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscountCode, TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { groupTicketTypes } from "./Step4TicketTypes";

export interface DiscountCodesSectionProps {
  eventId: string | null;
}

function useDiscountCodesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["discount-codes", eventId],
    queryFn: () => apiClient.get<DiscountCode[]>(`/events/${eventId}/discount-codes`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useTicketTypesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: () => apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

export function DiscountCodesSection({ eventId }: DiscountCodesSectionProps) {
  const { data: codes = [] } = useDiscountCodesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la información del evento para poder gestionar códigos de descuento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Códigos de descuento" className="flex flex-col gap-2">
        {codes.map((c) => (
          <li key={c.id}>{c.code}</li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for listing existing codes**

Add to the `describe` block in `DiscountCodesSection.test.tsx`:

```tsx
  it("renders the event's already-created discount codes", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2"); // seeded with one code: EARLYBIRD
    expect(await screen.findByText("EARLYBIRD")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: This one actually already PASSES with the Step 3 implementation (the list rendering was included). Confirm it passes; if it does, proceed directly to Step 7 — no extra implementation needed for this step.

- [ ] **Step 7: Write the failing test for creating a code that applies to all ticket types**

Add to `DiscountCodesSection.test.tsx`:

```tsx
  it("creates a discount code that applies to all ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2");
    await screen.findByText("EARLYBIRD");

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "VIP20" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));

    await waitFor(() => expect(screen.getByText("VIP20")).toBeInTheDocument());
    const created = db.discountCodes.find((c) => c.code === "VIP20")!;
    expect(created.type).toBe("percent");
    expect(created.value).toBe(20);
    expect(created.appliesTo).toBeNull();
  });
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: FAIL — there is no "Código"/"Valor" input nor "Crear código" button yet.

- [ ] **Step 9: Implement the create form (without the "aplica a" picker yet)**

Replace the body of `DiscountCodesSection.tsx` (the whole file) with:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DiscountCode, TicketType } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { groupTicketTypes } from "./Step4TicketTypes";

export interface DiscountCodesSectionProps {
  eventId: string | null;
}

function useDiscountCodesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["discount-codes", eventId],
    queryFn: () => apiClient.get<DiscountCode[]>(`/events/${eventId}/discount-codes`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useTicketTypesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["ticket-types", eventId],
    queryFn: () => apiClient.get<TicketType[]>(`/events/${eventId}/ticket-types`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function formatValue(code: Pick<DiscountCode, "type" | "value">): string {
  return code.type === "percent" ? `${code.value}%` : `${(code.value / 100).toFixed(2)} €`;
}

export function DiscountCodesSection({ eventId }: DiscountCodesSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: codes = [] } = useDiscountCodesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [type, setType] = useState<DiscountCode["type"]>("percent");
  const [valueInput, setValueInput] = useState("");
  const [maxUsesInput, setMaxUsesInput] = useState("");
  const [maxUsesPerCustomerInput, setMaxUsesPerCustomerInput] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");

  const canCreate = code.trim() !== "" && valueInput.trim() !== "";

  async function createDiscountCode() {
    setError(null);
    try {
      await apiClient.post(
        `/events/${eventId}/discount-codes`,
        {
          code,
          type,
          value: Number(valueInput),
          maxUses: maxUsesInput === "" ? null : Number(maxUsesInput),
          maxUsesPerCustomer: maxUsesPerCustomerInput === "" ? null : Number(maxUsesPerCustomerInput),
          appliesTo: null,
          validFrom: validFrom === "" ? null : new Date(validFrom).toISOString(),
          validTo: validTo === "" ? null : new Date(validTo).toISOString()
        },
        { token: token! }
      );
      setCode("");
      setType("percent");
      setValueInput("");
      setMaxUsesInput("");
      setMaxUsesPerCustomerInput("");
      setValidFrom("");
      setValidTo("");
      await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la información del evento para poder gestionar códigos de descuento.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Códigos de descuento" className="flex flex-col gap-2">
        {codes.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm">
            <span className="flex-1 font-semibold">
              {c.code} — {formatValue(c)}
            </span>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend>Nuevo código de descuento</legend>

        <label htmlFor="dc-code">Código</label>
        <input id="dc-code" value={code} onChange={(e) => setCode(e.target.value)} />

        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="dc-type" checked={type === "percent"} onChange={() => setType("percent")} />
            Porcentaje
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="dc-type" checked={type === "fixed"} onChange={() => setType("fixed")} />
            Importe fijo
          </label>
        </div>

        <label htmlFor="dc-value">Valor</label>
        <input
          id="dc-value"
          type="number"
          min="0"
          value={valueInput}
          onChange={(e) => setValueInput(e.target.value)}
        />

        <label htmlFor="dc-max-uses">Usos máximos</label>
        <input
          id="dc-max-uses"
          type="number"
          min="0"
          value={maxUsesInput}
          onChange={(e) => setMaxUsesInput(e.target.value)}
          placeholder="Ilimitado"
        />

        <label htmlFor="dc-max-uses-per-customer">Usos máximos por cliente</label>
        <input
          id="dc-max-uses-per-customer"
          type="number"
          min="0"
          value={maxUsesPerCustomerInput}
          onChange={(e) => setMaxUsesPerCustomerInput(e.target.value)}
          placeholder="Ilimitado"
        />

        <label htmlFor="dc-valid-from">Válido desde</label>
        <input id="dc-valid-from" type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />

        <label htmlFor="dc-valid-to">Válido hasta</label>
        <input id="dc-valid-to" type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />

        <Button type="button" onClick={createDiscountCode} disabled={!canCreate} className="mt-4">
          Crear código
        </Button>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: PASS (all tests so far).

- [ ] **Step 11: Write the failing test for the "Crear código" disabled state**

Add to `DiscountCodesSection.test.tsx`:

```tsx
  it("disables Crear código until Código and Valor are filled", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2");
    await screen.findByText("EARLYBIRD");
    expect(screen.getByRole("button", { name: "Crear código" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "VIP20" } });
    expect(screen.getByRole("button", { name: "Crear código" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "20" } });
    expect(screen.getByRole("button", { name: "Crear código" })).toBeEnabled();
  });
```

- [ ] **Step 12: Run test to verify it passes**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: PASS — `canCreate` was already implemented in Step 9, so this confirms existing behavior; no new implementation needed.

- [ ] **Step 13: Write the failing test for applying to specific ticket types**

Add to `DiscountCodesSection.test.tsx`:

```tsx
  it("creates a discount code that applies only to selected ticket types", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2"); // ticket-type groups: tt-2-pista (Pista), tt-2-grada (Grada VIP)
    await screen.findByText("EARLYBIRD");

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "PISTAONLY" } });
    fireEvent.change(screen.getByLabelText("Valor"), { target: { value: "10" } });
    fireEvent.click(screen.getByLabelText("Tipos concretos"));
    fireEvent.click(screen.getByLabelText("Pista"));
    fireEvent.click(screen.getByRole("button", { name: "Crear código" }));

    await waitFor(() => expect(screen.getByText("PISTAONLY")).toBeInTheDocument());
    const created = db.discountCodes.find((c) => c.code === "PISTAONLY")!;
    expect(created.appliesTo).toEqual(["tt-2-pista"]);
  });
```

- [ ] **Step 14: Run test to verify it fails**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: FAIL — there is no "Tipos concretos" radio nor per-group checkboxes yet.

- [ ] **Step 15: Add the "aplica a" picker**

In `DiscountCodesSection.tsx`:

1. Add state, right after `const [validTo, setValidTo] = useState("");`:
   ```ts
   const [appliesToMode, setAppliesToMode] = useState<"all" | "specific">("all");
   const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
   ```
2. In `createDiscountCode`, change the `appliesTo: null,` line to:
   ```ts
   appliesTo: appliesToMode === "all" ? null : selectedGroupIds,
   ```
3. In the same function's reset block (after `setValidTo("")`), add:
   ```ts
   setAppliesToMode("all");
   setSelectedGroupIds([]);
   ```
4. In the JSX, right after the "Válido hasta" `<input>` and before the `<Button>`, add:
   ```tsx
   <div className="mt-2 flex flex-wrap gap-4">
     <label className="flex items-center gap-2 text-sm font-medium">
       <input type="radio" name="dc-applies-to" checked={appliesToMode === "all"} onChange={() => setAppliesToMode("all")} />
       Todos los tipos de entrada
     </label>
     <label className="flex items-center gap-2 text-sm font-medium">
       <input
         type="radio"
         name="dc-applies-to"
         checked={appliesToMode === "specific"}
         onChange={() => setAppliesToMode("specific")}
       />
       Tipos concretos
     </label>
   </div>

   {appliesToMode === "specific" && (
     <fieldset>
       <legend>Selecciona los tipos de entrada</legend>
       <div className="flex flex-col gap-1.5">
         {groups.map((g) => (
           <label key={g.groupId} className="flex items-center gap-2 text-sm font-medium">
             <input
               type="checkbox"
               checked={selectedGroupIds.includes(g.groupId)}
               onChange={(e) =>
                 setSelectedGroupIds((prev) =>
                   e.target.checked ? [...prev, g.groupId] : prev.filter((id) => id !== g.groupId)
                 )
               }
             />
             {g.name}
           </label>
         ))}
       </div>
     </fieldset>
   )}
   ```

- [ ] **Step 16: Run tests to verify they pass**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: PASS (all tests so far).

- [ ] **Step 17: Write the failing test for activating/deactivating a code**

Add to `DiscountCodesSection.test.tsx`:

```tsx
  it("toggles a discount code's status between active and inactive", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2"); // EARLYBIRD starts active
    await screen.findByText("EARLYBIRD");

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(db.discountCodes.find((c) => c.id === "dc-2-earlybird")!.status).toBe("inactive"));
    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
  });
```

- [ ] **Step 18: Run test to verify it fails**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: FAIL — there is no "Desactivar"/"Activar" button yet.

- [ ] **Step 19: Implement the status toggle**

In `DiscountCodesSection.tsx`:

1. After `createDiscountCode`, add:
   ```ts
   async function toggleStatus(discountCode: DiscountCode) {
     setError(null);
     try {
       await apiClient.patch(
         `/discount-codes/${discountCode.id}`,
         { status: discountCode.status === "active" ? "inactive" : "active" },
         { token: token! }
       );
       await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
     } catch (e) {
       if (e instanceof AppError) setError(e.message);
     }
   }
   ```
2. Replace the `<li>` in the list `.map` with:
   ```tsx
   <li key={c.id} className="flex items-center gap-3 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm">
     <span className="flex-1 font-semibold">
       {c.code} — {formatValue(c)}
     </span>
     <Button type="button" variant="outline" onClick={() => toggleStatus(c)} className="h-8 px-2 text-xs">
       {c.status === "active" ? "Desactivar" : "Activar"}
     </Button>
   </li>
   ```

- [ ] **Step 20: Run tests to verify they pass**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: PASS (all tests so far).

- [ ] **Step 21: Write the failing test for deleting a code**

Add to `DiscountCodesSection.test.tsx`:

```tsx
  it("deletes a discount code", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2");
    await screen.findByText("EARLYBIRD");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("EARLYBIRD")).not.toBeInTheDocument());
    expect(db.discountCodes.some((c) => c.id === "dc-2-earlybird")).toBe(false);
  });
```

- [ ] **Step 22: Run test to verify it fails**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: FAIL — there is no "Eliminar" button yet.

- [ ] **Step 23: Implement delete**

In `DiscountCodesSection.tsx`:

1. After `toggleStatus`, add:
   ```ts
   async function deleteDiscountCode(id: string) {
     setError(null);
     try {
       await apiClient.delete(`/discount-codes/${id}`, { token: token! });
       await queryClient.invalidateQueries({ queryKey: ["discount-codes", eventId] });
     } catch (e) {
       if (e instanceof AppError) setError(e.message);
     }
   }
   ```
2. In the `<li>`, after the "Activar"/"Desactivar" `<Button>`, add:
   ```tsx
   <Button type="button" variant="destructive" onClick={() => deleteDiscountCode(c.id)} className="h-8 px-2 text-xs">
     Eliminar
   </Button>
   ```

- [ ] **Step 24: Run all tests to verify they pass**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/wizard/steps/DiscountCodesSection.test.tsx`
Expected: PASS (9 tests total: placeholder, list, create-all, disabled-button, create-specific, toggle, delete — some steps above reused earlier assertions rather than adding a distinct test, so the final count depends on how many `it(...)` blocks exist; every one must be green).

- [ ] **Step 25: Commit**

```bash
git add apps/panel/src/features/events/wizard/steps/DiscountCodesSection.tsx apps/panel/src/features/events/wizard/steps/DiscountCodesSection.test.tsx
git commit -m "feat: add DiscountCodesSection component"
```

---

### Task 5: Integrate into `EventDetailPage`

**Files:**
- Modify: `apps/panel/src/features/events/detail/EventDetailPage.tsx`
- Modify: `apps/panel/src/features/events/detail/EventDetailPage.test.tsx`

**Interfaces:**
- Consumes: `DiscountCodesSection` from `../wizard/steps/DiscountCodesSection` (Task 4).

- [ ] **Step 1: Write the failing test**

Add to the `describe("EventDetailPage", ...)` block in `EventDetailPage.test.tsx`, after the existing "switches to the Subeventos tab..." test:

```tsx
  it("switches to the Códigos de descuento tab and shows its create form", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderDetail("event-2"); // seeded with the EARLYBIRD discount code
    fireEvent.click(await screen.findByRole("button", { name: "Códigos de descuento" }));

    expect(await screen.findByText("EARLYBIRD")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/detail/EventDetailPage.test.tsx`
Expected: FAIL — "Códigos de descuento" is currently rendered as a `disabled` button (in `DISABLED_TABS`), so `findByRole("button", { name: "Códigos de descuento" })` resolves to a disabled button and clicking it does nothing; the subsequent assertions time out.

- [ ] **Step 3: Move the tab from disabled to enabled**

In `apps/panel/src/features/events/detail/EventDetailPage.tsx`:

1. Add the import: `import { DiscountCodesSection } from "../wizard/steps/DiscountCodesSection";`
2. Change `ENABLED_TABS` (add the new entry after `"plano"` and before `"tipos"`, matching the order in `docs/README.md` §4.3):
   ```ts
   const ENABLED_TABS = [
     { key: "general", label: "Información general" },
     { key: "subeventos", label: "Subeventos" },
     { key: "plano", label: "Plano de asientos" },
     { key: "tipos", label: "Tipos de entrada" },
     { key: "descuentos", label: "Códigos de descuento" }
   ] as const;
   ```
3. Remove `"Códigos de descuento"` from `DISABLED_TABS`:
   ```ts
   const DISABLED_TABS = ["Puertas", "Invitados", "Pedidos", "Métricas"];
   ```
4. Add the render branch, after the `{activeTab === "tipos" && ...}` line:
   ```tsx
   {activeTab === "descuentos" && <DiscountCodesSection eventId={eventId} />}
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/panel && pnpm exec vitest run src/features/events/detail/EventDetailPage.test.tsx`
Expected: PASS (all tests, including the existing "disables out-of-scope sections" test — it asserts on the "Puertas" button specifically, which is unaffected by this change).

- [ ] **Step 5: Commit**

```bash
git add apps/panel/src/features/events/detail/EventDetailPage.tsx apps/panel/src/features/events/detail/EventDetailPage.test.tsx
git commit -m "feat: enable the Códigos de descuento tab in EventDetailPage"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full panel test suite**

Run: `cd apps/panel && pnpm exec vitest run --run`
Expected: all test files pass.

- [ ] **Step 2: Run the full types-package test suite**

Run: `cd packages/types && pnpm exec vitest run`
Expected: all test files pass.

- [ ] **Step 3: Type-check both packages**

Run: `cd apps/panel && pnpm exec tsc --noEmit`
Run: `cd packages/types && pnpm exec tsc --noEmit`
Expected: both clean (no output).

- [ ] **Step 4: Manually cross-check the spec**

Re-read `docs/superpowers/specs/2026-08-26-codigos-descuento-design.md` and confirm every item in its "Testing" section has a corresponding passing test, and every item in "Fuera de alcance" was genuinely not built (no `bulk-generate` route, no `/public/discount-codes/validate` route, no automatic status/validity enforcement).
