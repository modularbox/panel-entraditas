# Puertas y control de acceso Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el apartado "Puertas" de la ficha de evento (hoy una pestaña deshabilitada en `EventDetailPage`), permitiendo crear, listar, activar/desactivar y eliminar puertas de control de acceso asociadas a un evento, y asignarles como operadores a subusuarios ya existentes de la organización.

**Architecture:** Recurso a nivel de evento (`eventId`), con el mismo patrón CRUD ya usado para códigos de descuento (`discountCodes.ts`/`DiscountCodesSection.tsx`): handler mock con `requireEvent`/`requireGate`, y una sección React con lista arriba + formulario de creación abajo, reutilizada desde `EventDetailPage`. Qué tipos de entrada admite una puerta se modela como un array de `groupId` (o `null` = todos), igual que `appliesTo` en `DiscountCode`.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query, MSW, zod, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-26-puertas-design.md`

## Global Constraints

- No hay subsistema de Pedidos/Tickets/Scans en este panel: no se construyen `POST /scan/validate`, `/scan/batch`, `/scan/manual`, `/scan/:scanId/reverse`, `GET /events/:eventId/scans` ni `GET /events/:eventId/attendance/live`.
- No hay PWA de escaneo (`apps/scan`) — queda fuera de este repo.
- No se implementa emparejamiento de dispositivos (`device_token`, `pairing-code`, `/auth/device/pair`).
- No se construye el subsistema "Equipo" completo (invitar, editar rol, permisos) — solo se añade un endpoint de lectura mínimo, `GET /events/:eventId/team`, que devuelve los `subuser` de la organización del evento, para poder asignarlos como operadores.
- `isActive` es un interruptor manual del organizador; ningún proceso automático lo cambia.
- `opensAt`/`closesAt` son solo informativos en esta fase — no se validan contra nada en tiempo de ejecución.
- `allowedTicketTypeGroupIds`: array de `groupId` de tipos de entrada, o `null` (= todos), mismo criterio que `appliesTo` en `DiscountCode`.
- `operatorUserIds`: `[]` por defecto; a diferencia de `subEventId`/`allowedTicketTypeGroupIds`, vacío no significa "todos", significa "nadie asignado todavía".
- `code` único dentro de un mismo evento, comparado sin distinguir mayúsculas/minúsculas.
- Sin restricciones de negocio en `DELETE` (no hay `scans` que lo impidan en esta fase).
- `GateSchema` ya existe en `packages/types/src/schemas.ts` (añadida en un commit previo) — Task 1 solo añade su cobertura de tests, no la propia definición.
- El repo es de estructura plana (`src/...`, sin prefijo `apps/panel/`); usa `npm`, no `pnpm`. Todos los comandos de test se ejecutan desde la raíz del repo con `npm run test -- <ruta>` (incluida la ruta a `packages/types/src/...` para los tests del paquete de tipos) — `cd packages/types && npm test` falla, porque el `vite.config.ts` raíz resuelve `setupFiles` relativo al cwd, no al directorio del propio config.
- Las contraseñas demo son por usuario (`DEMO_PASSWORD_BY_EMAIL` en `src/mocks/state.ts`), no una única `demo1234`. Para `admin@entraditas.com` es `N8@kP4!wY6#sD2&`.

---

### Task 1: `GateSchema` test coverage

**Files:**
- Modify: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Consumes: `GateSchema` (already exported from `packages/types/src/schemas.ts:217-233`, `Gate` type at line 233).

- [ ] **Step 1: Write the failing tests**

In `packages/types/src/schemas.test.ts`, update the import at the top of the file to also pull in `GateSchema`:

```ts
import {
  DiscountCodeSchema, EventSchema, GateSchema, InvitationSchema, OrderItemSchema, OrderSchema, TicketTypeSchema, UserSchema, ZoneSchema
} from "./schemas";
```

Append this new `describe` block at the end of the file:

```ts
describe("GateSchema", () => {
  it("accepts a valid gate open to every sub-event and ticket type", () => {
    const result = GateSchema.parse({
      id: "gate-1",
      eventId: "event-2",
      subEventId: null,
      name: "Puerta Norte",
      code: "NORTE",
      zoneId: "zone-pista",
      direction: "in",
      allowReentry: false,
      maxScansPerTicket: 1,
      allowedTicketTypeGroupIds: null,
      opensAt: null,
      closesAt: null,
      operatorUserIds: ["user-subuser"],
      isActive: true
    });
    expect(result.code).toBe("NORTE");
  });

  it("accepts a gate scoped to a specific sub-event and ticket-type groups", () => {
    const result = GateSchema.parse({
      id: "gate-2",
      eventId: "event-2",
      subEventId: "sub-event-2",
      name: "Puerta Sur",
      code: "SUR",
      zoneId: null,
      direction: "both",
      allowReentry: true,
      maxScansPerTicket: 3,
      allowedTicketTypeGroupIds: ["tt-2-pista"],
      opensAt: "2026-11-05T19:00:00.000Z",
      closesAt: "2026-11-05T23:00:00.000Z",
      operatorUserIds: [],
      isActive: true
    });
    expect(result.allowedTicketTypeGroupIds).toEqual(["tt-2-pista"]);
  });

  it("rejects an unknown direction", () => {
    expect(() =>
      GateSchema.parse({
        id: "gate-3", eventId: "event-2", subEventId: null, name: "Puerta X", code: "X", zoneId: null,
        direction: "sideways", allowReentry: false, maxScansPerTicket: 1, allowedTicketTypeGroupIds: null,
        opensAt: null, closesAt: null, operatorUserIds: [], isActive: true
      })
    ).toThrow();
  });

  it("rejects a non-positive maxScansPerTicket", () => {
    expect(() =>
      GateSchema.parse({
        id: "gate-4", eventId: "event-2", subEventId: null, name: "Puerta X", code: "X", zoneId: null,
        direction: "in", allowReentry: false, maxScansPerTicket: 0, allowedTicketTypeGroupIds: null,
        opensAt: null, closesAt: null, operatorUserIds: [], isActive: true
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test -- packages/types/src/schemas.test.ts`
Expected: PASS — `GateSchema` already exists, so this step only adds coverage; nothing to implement. If any test unexpectedly fails, re-read `GateSchema` at `packages/types/src/schemas.ts:217-233` before changing it (it should already match the field shapes used above).

- [ ] **Step 3: Commit**

```bash
git add packages/types/src/schemas.test.ts
git commit -m "test: add GateSchema coverage"
```

---

### Task 2: Seed data for gates

**Files:**
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/data/db.seed.json`
- Modify: `src/mocks/state.ts`
- Modify: `src/mocks/db.test.ts`

**Interfaces:**
- Consumes: `Gate` type from `@entraditas/types` (Task 1).
- Produces: `Database.gates: Gate[]`, seeded with one gate `gate-2-norte` on `event-2` (venue `venue-1`, which already has zones `zone-pista`/`zone-grada`), with `operatorUserIds: ["user-subuser"]` (the only seeded subuser, already scoped to `event-1` — but `operatorUserIds` isn't an access-control scope, just a UI assignment, so this is fine). Later tasks' tests rely on this exact id and on `event-2` having at least one pre-existing gate.

- [ ] **Step 1: Add the field to `Database` and to the seed JSON**

In `src/mocks/db.ts`, update the type import at the top of the file:

```ts
import type {
  CapacityPool, DiscountCode, Event, Gate, Invitation, Order, OrderItem, Organization, Refund, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
} from "@entraditas/types";
```

Add `gates: Gate[];` to the `Database` interface, after `discountCodes: DiscountCode[];`:

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
  discountCodes: DiscountCode[];
  gates: Gate[];
  invitations: Invitation[];
  orders: Order[];
  orderItems: OrderItem[];
  refunds: Refund[];
}
```

In `src/mocks/data/db.seed.json`, add a `"gates"` array right after the `"discountCodes"` array (before `"invitations"`):

```json
  "gates": [
    {
      "id": "gate-2-norte",
      "eventId": "event-2",
      "subEventId": null,
      "name": "Puerta Norte",
      "code": "NORTE",
      "zoneId": "zone-pista",
      "direction": "in",
      "allowReentry": false,
      "maxScansPerTicket": 1,
      "allowedTicketTypeGroupIds": null,
      "opensAt": null,
      "closesAt": null,
      "operatorUserIds": ["user-subuser"],
      "isActive": true
    }
  ],
```

(Remember to add a trailing comma after the `]` that closes `"discountCodes"`, since `"gates"` now follows it.)

- [ ] **Step 2: Register `gates` in the snapshot type guard**

In `src/mocks/state.ts`, add a check for `gates` to `isDatabase`, right after the `discountCodes` check:

```ts
    Array.isArray(candidate.discountCodes) &&
    Array.isArray(candidate.gates) &&
    Array.isArray(candidate.invitations) &&
```

- [ ] **Step 3: Write the failing test**

In `src/mocks/db.test.ts`, add `GateSchema` to the import from `@entraditas/types`:

```ts
import { EventSchema, GateSchema, OrderItemSchema, OrderSchema, RefundSchema, TicketTypeSchema, UserSchema } from "@entraditas/types";
```

Append this test at the end of the `describe("createSeedDatabase", ...)` block:

```ts
  it("seeds one schema-valid gate on event-2 with its operator already assigned", () => {
    const db = createSeedDatabase();
    expect(db.gates).toHaveLength(1);
    for (const gate of db.gates) expect(() => GateSchema.parse(gate)).not.toThrow();
    const gate = db.gates[0]!;
    expect(gate.eventId).toBe("event-2");
    expect(gate.operatorUserIds).toContain(DEMO_SUBUSER_ID);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/mocks/db.test.ts`
Expected: PASS (the new test, plus every existing test in the file — this task only adds a field/seed, it doesn't change any existing seeded event/ticket-type/zone).

Run: `npm run test -- src/mocks/state.test.ts`
Expected: PASS (unaffected by this change; confirms `isDatabase` still parses correctly with the new field present).

- [ ] **Step 5: Commit**

```bash
git add src/mocks/db.ts src/mocks/data/db.seed.json src/mocks/state.ts src/mocks/db.test.ts
git commit -m "feat: seed a gate on event-2"
```

---

### Task 3: Gates mock handler (+ minimal event-team endpoint)

**Files:**
- Create: `src/mocks/handlers/gates.ts`
- Create: `src/mocks/handlers/gates.test.ts`
- Modify: `src/mocks/handlers/index.ts`

**Interfaces:**
- Consumes: `db.gates` (Task 2), `canAccessEvent` from `./events`, `getSessionUserId` from `../authContext`, `db` from `../state`.
- Produces: `gatesHandlers` (array of MSW `http.*` handlers), registered in the root `handlers` array. Endpoints: `GET /events/:eventId/gates`, `POST /events/:eventId/gates`, `PATCH /gates/:id`, `DELETE /gates/:id`, `GET /events/:eventId/team`.

- [ ] **Step 1: Write the failing tests**

Create `src/mocks/handlers/gates.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import type { Gate, User } from "@entraditas/types";

describe("gates handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    return useSessionStore.getState().token!;
  }

  it("lists gates for an event", async () => {
    const token = await login();
    const gates = await apiClient.get<Gate[]>("/events/event-2/gates", { token });
    expect(gates).toHaveLength(1);
    expect(gates[0]!.code).toBe("NORTE");
  });

  it("creates a gate open to every sub-event and ticket type, with no operators", async () => {
    const token = await login();
    const created = await apiClient.post<Gate>(
      "/events/event-2/gates",
      {
        name: "Puerta Sur",
        code: "SUR",
        subEventId: null,
        zoneId: null,
        direction: "in",
        allowReentry: false,
        maxScansPerTicket: 1,
        allowedTicketTypeGroupIds: null,
        opensAt: null,
        closesAt: null
      },
      { token }
    );
    expect(created.isActive).toBe(true);
    expect(created.operatorUserIds).toEqual([]);
    expect(db.gates.some((g) => g.code === "SUR")).toBe(true);
  });

  it("rejects a duplicate code within the same event (case-insensitive)", async () => {
    const token = await login();
    await expect(
      apiClient.post(
        "/events/event-2/gates",
        {
          name: "Duplicada", code: "norte", subEventId: null, zoneId: null, direction: "in",
          allowReentry: false, maxScansPerTicket: 1, allowedTicketTypeGroupIds: null, opensAt: null, closesAt: null
        },
        { token }
      )
    ).rejects.toThrow(AppError);
    expect(db.gates.filter((g) => g.eventId === "event-2")).toHaveLength(1);
  });

  it("patches a gate's isActive flag", async () => {
    const token = await login();
    const updated = await apiClient.patch<Gate>("/gates/gate-2-norte", { isActive: false }, { token });
    expect(updated.isActive).toBe(false);
    expect(db.gates.find((g) => g.id === "gate-2-norte")!.isActive).toBe(false);
  });

  it("patches a gate's operatorUserIds", async () => {
    const token = await login();
    const updated = await apiClient.patch<Gate>("/gates/gate-2-norte", { operatorUserIds: [] }, { token });
    expect(updated.operatorUserIds).toEqual([]);
  });

  it("deletes a gate", async () => {
    const token = await login();
    await apiClient.delete("/gates/gate-2-norte", { token });
    expect(db.gates.some((g) => g.id === "gate-2-norte")).toBe(false);
  });

  it("GET /events/:eventId/team returns only the subusers of the event's organization", async () => {
    const token = await login();
    const members = await apiClient.get<User[]>("/events/event-2/team", { token });
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe("subuser");
    expect(members[0]!.fullName).toBe("Personal de puerta");
  });

  it("rejects access to an out-of-scope event's gates", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "T6#bW8@cL2!pZ9&"); // scoped to event-1 only
    const token = useSessionStore.getState().token!;
    await expect(apiClient.get("/events/event-2/gates", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/mocks/handlers/gates.test.ts`
Expected: FAIL — none of these routes are handled yet (MSW's unhandled-request error / 404s).

- [ ] **Step 3: Implement the handler**

Create `src/mocks/handlers/gates.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { Gate } from "@entraditas/types";
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
  if (!userId) return { error: unauthenticated("req_gates") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_gates") };
  return { event };
}

function requireGate(request: Request, id: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_gates") };
  const user = db.users.find((u) => u.id === userId);
  const gate = db.gates.find((g) => g.id === id);
  const event = gate ? db.events.find((e) => e.id === gate.eventId) : null;
  if (!user || !gate || !event || !canAccessEvent(event, user)) return { error: notFound("req_gates") };
  return { gate };
}

interface CreateGateBody {
  name: string;
  code: string;
  subEventId: string | null;
  zoneId: string | null;
  direction: Gate["direction"];
  allowReentry: boolean;
  maxScansPerTicket: number;
  allowedTicketTypeGroupIds: string[] | null;
  opensAt: string | null;
  closesAt: string | null;
  operatorUserIds?: string[];
}

export const gatesHandlers = [
  http.get(`${BASE}/events/:eventId/gates`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const gates = db.gates.filter((g) => g.eventId === result.event.id);
    return HttpResponse.json({ data: gates, meta: { page: 1, perPage: gates.length, total: gates.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/gates`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as CreateGateBody;
    const duplicate = db.gates.some(
      (g) => g.eventId === result.event.id && g.code.toLowerCase() === body.code.toLowerCase()
    );
    if (duplicate) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Ya existe una puerta con ese código en este evento", requestId: "req_gates_create" } },
        { status: 422 }
      );
    }
    const created: Gate = {
      id: `gate-${db.gates.length + 1}`,
      eventId: result.event.id,
      subEventId: body.subEventId,
      name: body.name,
      code: body.code,
      zoneId: body.zoneId,
      direction: body.direction,
      allowReentry: body.allowReentry,
      maxScansPerTicket: body.maxScansPerTicket,
      allowedTicketTypeGroupIds: body.allowedTicketTypeGroupIds,
      opensAt: body.opensAt,
      closesAt: body.closesAt,
      operatorUserIds: body.operatorUserIds ?? [],
      isActive: true
    };
    db.gates.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_gates_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/gates/:id`, async ({ request, params }) => {
    const result = requireGate(request, params.id as string);
    if ("error" in result) return result.error;
    Object.assign(result.gate, await request.json());
    return HttpResponse.json({ data: result.gate, meta: { requestId: "req_gates_patch" } });
  }),

  http.delete(`${BASE}/gates/:id`, ({ request, params }) => {
    const result = requireGate(request, params.id as string);
    if ("error" in result) return result.error;
    db.gates = db.gates.filter((g) => g.id !== result.gate.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_gates_delete" } });
  }),

  http.get(`${BASE}/events/:eventId/team`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const members = db.users.filter((u) => u.organizationId === result.event.organizationId && u.role === "subuser");
    return HttpResponse.json({ data: members, meta: { page: 1, perPage: members.length, total: members.length, nextCursor: null } });
  })
];
```

- [ ] **Step 4: Register the handler**

In `src/mocks/handlers/index.ts`, add the import and spread it into `handlers`:

```ts
import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { customersHandlers } from "./customers";
import { dashboardHandlers } from "./dashboard";
import { discountCodesHandlers } from "./discountCodes";
import { eventsHandlers } from "./events";
import { gatesHandlers } from "./gates";
import { invitationsHandlers } from "./invitations";
import { ordersHandlers } from "./orders";
import { organizationsHandlers } from "./organizations";
import { refundsHandlers } from "./refunds";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { venuesHandlers } from "./venues";
import { usersHandlers } from "./users";

export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...discountCodesHandlers, ...usersHandlers, ...invitationsHandlers, ...dashboardHandlers, ...ordersHandlers, ...refundsHandlers, ...customersHandlers, ...organizationsHandlers, ...gatesHandlers];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/mocks/handlers/gates.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Commit**

```bash
git add src/mocks/handlers/gates.ts src/mocks/handlers/gates.test.ts src/mocks/handlers/index.ts
git commit -m "feat: add gates mock CRUD endpoints and a minimal event-team endpoint"
```

---

### Task 4: `GatesSection` component

**Files:**
- Create: `src/features/events/wizard/steps/GatesSection.tsx`
- Create: `src/features/events/wizard/steps/GatesSection.test.tsx`

**Interfaces:**
- Consumes: `Gate`, `Event`, `TicketType`, `User` types from `@entraditas/types`; `groupTicketTypes` from `./Step4TicketTypes`; `useSubEventsQuery` from `./useSubEventsQuery`; `useZonesQuery` from `./useZonesQuery`; `apiClient`/`AppError` from `@/shared/lib/apiClient`; `useSessionStore` from `@/shared/auth/sessionStore`; `Button` from `@/shared/ui/button`.
- Produces: `GatesSection` component with props `{ eventId: string | null }` — same prop shape as `DiscountCodesSection`, consumed by Task 5.

- [ ] **Step 1: Write the failing test for the placeholder state**

Create `src/features/events/wizard/steps/GatesSection.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { GatesSection } from "./GatesSection";

function renderSection(eventId: string | null) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <GatesSection eventId={eventId} />
    </QueryClientProvider>
  );
}

async function loginAsAdmin() {
  await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
}

describe("GatesSection", () => {
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

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: FAIL — `./GatesSection` does not exist.

- [ ] **Step 3: Implement the placeholder and the base component shell**

Create `src/features/events/wizard/steps/GatesSection.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import type { Event, Gate, TicketType, User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { groupTicketTypes } from "./Step4TicketTypes";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";

export interface GatesSectionProps {
  eventId: string | null;
}

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useGatesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["gates", eventId],
    queryFn: () => apiClient.get<Gate[]>(`/events/${eventId}/gates`, { token: token! }),
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

function useTeamQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event-team", eventId],
    queryFn: () => apiClient.get<User[]>(`/events/${eventId}/team`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

export function GatesSection({ eventId }: GatesSectionProps) {
  const { data: event } = useEventQuery(eventId);
  const { data: gates = [] } = useGatesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const { data: zones = [] } = useZonesQuery(event?.venueId);
  const { data: team = [] } = useTeamQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">Guarda la información del evento para poder gestionar puertas.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <ul aria-label="Puertas" className="flex flex-col gap-2">
        {gates.map((gate) => (
          <li key={gate.id}>{gate.name} — {gate.code}</li>
        ))}
      </ul>
    </div>
  );
}
```

(`subEvents`, `zones`, `team`, and `groups` are unused for now — they'll be consumed starting Step 9. This intermediate state will show an "unused variable" TS warning; that's expected and resolved in Step 9, not a blocker for the tests below.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: PASS.

- [ ] **Step 5: Write the failing test for listing the existing gate and its operator**

Add to the `describe` block in `GatesSection.test.tsx`:

```tsx
  it("renders the event's already-created gate", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // seeded with one gate: Puerta Norte / NORTE
    expect(await screen.findByText("Puerta Norte — NORTE")).toBeInTheDocument();
  });
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: This one already PASSES with the Step 3 implementation. Confirm it passes; proceed to Step 7 — no extra implementation needed for this step.

- [ ] **Step 7: Write the failing test for creating a gate with every default (all sub-events, no zone, all ticket types, no operators)**

Add to `GatesSection.test.tsx`:

```tsx
  it("creates a gate open to every sub-event and ticket type, with no operators, using the default fields", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByText("Puerta Norte — NORTE");

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Puerta Sur" } });
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "SUR" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear puerta" }));

    await waitFor(() => expect(screen.getByText("Puerta Sur — SUR")).toBeInTheDocument());
    const created = db.gates.find((g) => g.code === "SUR")!;
    expect(created.subEventId).toBeNull();
    expect(created.zoneId).toBeNull();
    expect(created.direction).toBe("in");
    expect(created.allowReentry).toBe(false);
    expect(created.maxScansPerTicket).toBe(1);
    expect(created.allowedTicketTypeGroupIds).toBeNull();
    expect(created.operatorUserIds).toEqual([]);
  });
```

- [ ] **Step 8: Run test to verify it fails**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: FAIL — there is no "Nombre"/"Código" input nor "Crear puerta" button yet.

- [ ] **Step 9: Implement the full create form and the list's basic fields**

Replace the full contents of `GatesSection.tsx` with:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event, Gate, TicketType, User } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { groupTicketTypes } from "./Step4TicketTypes";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";

export interface GatesSectionProps {
  eventId: string | null;
}

const timeFormatter = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

const DIRECTION_LABEL: Record<Gate["direction"], string> = { in: "Entrada", out: "Salida", both: "Ambas" };

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useGatesQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["gates", eventId],
    queryFn: () => apiClient.get<Gate[]>(`/events/${eventId}/gates`, { token: token! }),
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

function useTeamQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event-team", eventId],
    queryFn: () => apiClient.get<User[]>(`/events/${eventId}/team`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function formatWindow(gate: Pick<Gate, "opensAt" | "closesAt">): string {
  if (!gate.opensAt && !gate.closesAt) return "Sin restricción horaria";
  if (gate.opensAt && gate.closesAt) {
    return `${timeFormatter.format(new Date(gate.opensAt))}–${timeFormatter.format(new Date(gate.closesAt))}`;
  }
  if (gate.opensAt) return `Desde ${timeFormatter.format(new Date(gate.opensAt))}`;
  return `Hasta ${timeFormatter.format(new Date(gate.closesAt!))}`;
}

export function GatesSection({ eventId }: GatesSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const { data: gates = [] } = useGatesQuery(eventId);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const { data: zones = [] } = useZonesQuery(event?.venueId);
  const { data: team = [] } = useTeamQuery(eventId);
  const groups = groupTicketTypes(ticketTypes);

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [subEventMode, setSubEventMode] = useState<"all" | "specific">("all");
  const [selectedSubEventId, setSelectedSubEventId] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [direction, setDirection] = useState<Gate["direction"]>("in");
  const [allowReentry, setAllowReentry] = useState(false);
  const [maxScansInput, setMaxScansInput] = useState("1");
  const [ticketTypesMode, setTicketTypesMode] = useState<"all" | "specific">("all");
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [selectedOperatorIds, setSelectedOperatorIds] = useState<string[]>([]);

  const canCreate = name.trim() !== "" && code.trim() !== "";

  async function createGate() {
    setError(null);
    try {
      await apiClient.post(
        `/events/${eventId}/gates`,
        {
          name,
          code,
          subEventId: subEventMode === "all" ? null : selectedSubEventId,
          zoneId: zoneId === "" ? null : zoneId,
          direction,
          allowReentry,
          maxScansPerTicket: Number(maxScansInput),
          allowedTicketTypeGroupIds: ticketTypesMode === "all" ? null : selectedGroupIds,
          opensAt: opensAt === "" ? null : new Date(opensAt).toISOString(),
          closesAt: closesAt === "" ? null : new Date(closesAt).toISOString(),
          operatorUserIds: selectedOperatorIds
        },
        { token: token! }
      );
      setName("");
      setCode("");
      setSubEventMode("all");
      setSelectedSubEventId("");
      setZoneId("");
      setDirection("in");
      setAllowReentry(false);
      setMaxScansInput("1");
      setTicketTypesMode("all");
      setSelectedGroupIds([]);
      setOpensAt("");
      setClosesAt("");
      setSelectedOperatorIds([]);
      await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">Guarda la información del evento para poder gestionar puertas.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Puertas" className="flex flex-col gap-2">
        {gates.map((gate) => {
          const subEventName = gate.subEventId
            ? subEvents.find((s) => s.id === gate.subEventId)?.name ?? ""
            : "Todos los subeventos";
          const zoneName = gate.zoneId ? zones.find((z) => z.id === gate.zoneId)?.name ?? "" : "Sin zona";
          const typesLabel =
            gate.allowedTicketTypeGroupIds === null
              ? "Todos los tipos de entrada"
              : groups.filter((g) => gate.allowedTicketTypeGroupIds!.includes(g.groupId)).map((g) => g.name).join(", ");
          return (
            <li key={gate.id} className="flex flex-col gap-2 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm">
              <span className="font-semibold">{gate.name} — {gate.code}</span>
              <p className="text-xs text-muted-foreground">
                {subEventName} · {zoneName} · {DIRECTION_LABEL[gate.direction]} · Reentrada: {gate.allowReentry ? "Sí" : "No"} ·{" "}
                {typesLabel} · {formatWindow(gate)}
              </p>
            </li>
          );
        })}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend>Nueva puerta</legend>

        <label htmlFor="gate-name">Nombre</label>
        <input id="gate-name" value={name} onChange={(e) => setName(e.target.value)} />

        <label htmlFor="gate-code">Código</label>
        <input id="gate-code" value={code} onChange={(e) => setCode(e.target.value)} />

        {subEvents.length > 0 && (
          <>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="gate-subevent-mode" checked={subEventMode === "all"} onChange={() => setSubEventMode("all")} />
                Todos los subeventos
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="gate-subevent-mode"
                  checked={subEventMode === "specific"}
                  onChange={() => setSubEventMode("specific")}
                />
                Subevento concreto
              </label>
            </div>
            {subEventMode === "specific" && (
              <select aria-label="Subevento" value={selectedSubEventId} onChange={(e) => setSelectedSubEventId(e.target.value)}>
                <option value="">Selecciona un subevento</option>
                {subEvents.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            )}
          </>
        )}

        <label htmlFor="gate-zone">Zona</label>
        <select id="gate-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
          <option value="">Sin zona</option>
          {zones.map((z) => (
            <option key={z.id} value={z.id}>{z.name}</option>
          ))}
        </select>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="gate-direction" checked={direction === "in"} onChange={() => setDirection("in")} />
            Entrada
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="gate-direction" checked={direction === "out"} onChange={() => setDirection("out")} />
            Salida
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="gate-direction" checked={direction === "both"} onChange={() => setDirection("both")} />
            Ambas
          </label>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={allowReentry} onChange={(e) => setAllowReentry(e.target.checked)} />
          Permite reentrada
        </label>

        <label htmlFor="gate-max-scans">Escaneos máximos por ticket</label>
        <input
          id="gate-max-scans"
          type="number"
          min="1"
          value={maxScansInput}
          onChange={(e) => setMaxScansInput(e.target.value)}
        />

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="radio" name="gate-types-mode" checked={ticketTypesMode === "all"} onChange={() => setTicketTypesMode("all")} />
            Todos los tipos de entrada
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="gate-types-mode"
              checked={ticketTypesMode === "specific"}
              onChange={() => setTicketTypesMode("specific")}
            />
            Tipos concretos
          </label>
        </div>
        {ticketTypesMode === "specific" && (
          <fieldset>
            <legend>Selecciona los tipos de entrada</legend>
            <div className="flex flex-col gap-1.5">
              {groups.map((g) => (
                <label key={g.groupId} className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.groupId)}
                    onChange={(e) =>
                      setSelectedGroupIds((prev) => (e.target.checked ? [...prev, g.groupId] : prev.filter((id) => id !== g.groupId)))
                    }
                  />
                  {g.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <label htmlFor="gate-opens-at">Abre</label>
        <input id="gate-opens-at" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} />

        <label htmlFor="gate-closes-at">Cierra</label>
        <input id="gate-closes-at" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} />

        <fieldset>
          <legend>Operadores</legend>
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay subusuarios en esta organización</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {team.map((member) => (
                <label key={member.id} className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={selectedOperatorIds.includes(member.id)}
                    onChange={(e) =>
                      setSelectedOperatorIds((prev) =>
                        e.target.checked ? [...prev, member.id] : prev.filter((id) => id !== member.id)
                      )
                    }
                  />
                  {member.fullName}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <Button type="button" onClick={createGate} disabled={!canCreate} className="mt-4">
          Crear puerta
        </Button>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 10: Run tests to verify they pass**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: PASS (all tests so far).

- [ ] **Step 11: Write the failing test for the "Crear puerta" disabled state**

Add to `GatesSection.test.tsx`:

```tsx
  it("disables Crear puerta until Nombre and Código are filled", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByText("Puerta Norte — NORTE");
    expect(screen.getByRole("button", { name: "Crear puerta" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Puerta Sur" } });
    expect(screen.getByRole("button", { name: "Crear puerta" })).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "SUR" } });
    expect(screen.getByRole("button", { name: "Crear puerta" })).toBeEnabled();
  });
```

- [ ] **Step 12: Run test to verify it passes**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: PASS — `canCreate` was already implemented in Step 9, so this confirms existing behavior; no new implementation needed.

- [ ] **Step 13: Write the failing test for a gate scoped to a specific sub-event, zone, ticket types, window and operator**

Add to `GatesSection.test.tsx`:

```tsx
  it("creates a gate scoped to a specific sub-event, zone, ticket types, time window and operator", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // sub-event: sub-event-2 ("Función única"); zones: Pista, Grada; ticket-type group: Pista (tt-2-pista)
    await screen.findByText("Puerta Norte — NORTE");
    // Scoped to the create-form fieldset: once per-row operator checkboxes exist too (Step 21),
    // "Personal de puerta" would otherwise match both the seeded row's checkbox and this one.
    const createForm = screen.getByRole("group", { name: "Nueva puerta" });

    fireEvent.change(within(createForm).getByLabelText("Nombre"), { target: { value: "Puerta Grada" } });
    fireEvent.change(within(createForm).getByLabelText("Código"), { target: { value: "GRADA" } });
    fireEvent.click(within(createForm).getByLabelText("Subevento concreto"));
    fireEvent.change(within(createForm).getByLabelText("Subevento"), { target: { value: "sub-event-2" } });
    fireEvent.change(within(createForm).getByLabelText("Zona"), { target: { value: "zone-grada" } });
    fireEvent.click(within(createForm).getByLabelText("Ambas"));
    fireEvent.click(within(createForm).getByLabelText("Permite reentrada"));
    fireEvent.change(within(createForm).getByLabelText("Escaneos máximos por ticket"), { target: { value: "3" } });
    fireEvent.click(within(createForm).getByLabelText("Tipos concretos"));
    fireEvent.click(within(createForm).getByLabelText("Pista"));
    fireEvent.change(within(createForm).getByLabelText("Abre"), { target: { value: "2026-11-05T19:00" } });
    fireEvent.change(within(createForm).getByLabelText("Cierra"), { target: { value: "2026-11-05T23:00" } });
    fireEvent.click(within(createForm).getByLabelText("Personal de puerta"));
    fireEvent.click(within(createForm).getByRole("button", { name: "Crear puerta" }));

    await waitFor(() => expect(screen.getByText("Puerta Grada — GRADA")).toBeInTheDocument());
    const created = db.gates.find((g) => g.code === "GRADA")!;
    expect(created.subEventId).toBe("sub-event-2");
    expect(created.zoneId).toBe("zone-grada");
    expect(created.direction).toBe("both");
    expect(created.allowReentry).toBe(true);
    expect(created.maxScansPerTicket).toBe(3);
    expect(created.allowedTicketTypeGroupIds).toEqual(["tt-2-pista"]);
    expect(created.opensAt).toBe(new Date("2026-11-05T19:00").toISOString());
    expect(created.closesAt).toBe(new Date("2026-11-05T23:00").toISOString());
    expect(created.operatorUserIds).toEqual(["user-subuser"]);
  });
```

- [ ] **Step 14: Run test to verify it passes**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: PASS — every field this test exercises was already implemented in Step 9; this confirms the full create form works end to end. If it fails, check the exact `<label>` text/`htmlFor` pairs against the JSX in Step 9 rather than adding new code.

- [ ] **Step 15: Write the failing test for activating/deactivating an existing gate**

Add to `GatesSection.test.tsx`:

```tsx
  it("toggles a gate's active state", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // Puerta Norte starts active
    await screen.findByText("Puerta Norte — NORTE");

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));

    await waitFor(() => expect(db.gates.find((g) => g.id === "gate-2-norte")!.isActive).toBe(false));
    expect(await screen.findByRole("button", { name: "Activar" })).toBeInTheDocument();
  });
```

- [ ] **Step 16: Run test to verify it fails**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: FAIL — there is no "Desactivar"/"Activar" button yet.

- [ ] **Step 17: Implement the active toggle and the delete button**

In `GatesSection.tsx`:

1. After `createGate`, add:
   ```ts
   async function toggleActive(gate: Gate) {
     setError(null);
     try {
       await apiClient.patch(`/gates/${gate.id}`, { isActive: !gate.isActive }, { token: token! });
       await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
     } catch (e) {
       if (e instanceof AppError) setError(e.message);
     }
   }

   async function deleteGate(id: string) {
     setError(null);
     try {
       await apiClient.delete(`/gates/${id}`, { token: token! });
       await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
     } catch (e) {
       if (e instanceof AppError) setError(e.message);
     }
   }
   ```
2. In the gates `<ul>`'s `.map`, replace the `<li>` (the one starting `<li key={gate.id} className="flex flex-col gap-2...`) with:
   ```tsx
   <li key={gate.id} className="flex flex-col gap-2 rounded-md border-2 border-border bg-surface px-3 py-2 text-sm">
     <div className="flex items-center gap-3">
       <span className="flex-1 font-semibold">{gate.name} — {gate.code}</span>
       <Button type="button" variant="outline" onClick={() => toggleActive(gate)} className="h-8 px-2 text-xs">
         {gate.isActive ? "Desactivar" : "Activar"}
       </Button>
       <Button type="button" variant="destructive" onClick={() => deleteGate(gate.id)} className="h-8 px-2 text-xs">
         Eliminar
       </Button>
     </div>
     <p className="text-xs text-muted-foreground">
       {subEventName} · {zoneName} · {DIRECTION_LABEL[gate.direction]} · Reentrada: {gate.allowReentry ? "Sí" : "No"} ·{" "}
       {typesLabel} · {formatWindow(gate)}
     </p>
   </li>
   ```
   (`subEventName`, `zoneName`, `typesLabel` are the `const`s already computed above this `return` inside the `.map` callback from Step 9 — keep them as-is.)

- [ ] **Step 18: Run tests to verify they pass**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: PASS (all tests so far).

- [ ] **Step 19: Write the failing test for editing operators from an existing gate's row**

Add to `GatesSection.test.tsx`:

```tsx
  it("unassigns an operator from an existing gate via its row checkbox", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // Puerta Norte starts with Personal de puerta assigned
    await screen.findByText("Puerta Norte — NORTE");
    // Scoped to the "Puertas" list: the create form below also has a "Personal de puerta"
    // checkbox (its own, unchecked, operator picker), so an unscoped query would be ambiguous.
    const gatesList = screen.getByRole("list", { name: "Puertas" });

    const operatorCheckbox = within(gatesList).getByRole("checkbox", { name: "Personal de puerta" });
    expect(operatorCheckbox).toBeChecked();
    fireEvent.click(operatorCheckbox);

    await waitFor(() => expect(db.gates.find((g) => g.id === "gate-2-norte")!.operatorUserIds).toEqual([]));
  });
```

- [ ] **Step 20: Run test to verify it fails**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: FAIL — the gate row doesn't render an operator checkbox yet (only the create-form's operator checkboxes exist, and this test targets one already checked, which only a row's own checkbox would be — the create form's checkboxes always start unchecked).

- [ ] **Step 21: Add the per-row operator checkboxes**

In `GatesSection.tsx`:

1. After `deleteGate`, add:
   ```ts
   async function updateOperators(gate: Gate, operatorUserIds: string[]) {
     setError(null);
     try {
       await apiClient.patch(`/gates/${gate.id}`, { operatorUserIds }, { token: token! });
       await queryClient.invalidateQueries({ queryKey: ["gates", eventId] });
     } catch (e) {
       if (e instanceof AppError) setError(e.message);
     }
   }
   ```
2. In the `<li>` from Step 17, right after the `<p className="text-xs text-muted-foreground">...</p>` block and before the closing `</li>`, add:
   ```tsx
   <fieldset>
     <legend className="text-xs font-semibold">Operadores</legend>
     {team.length === 0 ? (
       <p className="text-xs text-muted-foreground">No hay subusuarios en esta organización</p>
     ) : (
       <div className="flex flex-wrap gap-3">
         {team.map((member) => (
           <label key={member.id} className="flex items-center gap-1.5 text-xs font-medium">
             <input
               type="checkbox"
               checked={gate.operatorUserIds.includes(member.id)}
               onChange={(e) =>
                 updateOperators(
                   gate,
                   e.target.checked
                     ? [...gate.operatorUserIds, member.id]
                     : gate.operatorUserIds.filter((id) => id !== member.id)
                 )
               }
             />
             {member.fullName}
           </label>
         ))}
       </div>
     )}
   </fieldset>
   ```

- [ ] **Step 22: Run tests to verify they pass**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: PASS (all tests so far, including Step 13's and Step 19's tests — both already scope their "Personal de puerta" queries with `within(...)`, since from this step onward there are two such checkboxes on screen: one in the gate row and one in the create form).

- [ ] **Step 23: Write the failing test for deleting a gate**

Add to `GatesSection.test.tsx`:

```tsx
  it("deletes a gate", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByText("Puerta Norte — NORTE");

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("Puerta Norte — NORTE")).not.toBeInTheDocument());
    expect(db.gates.some((g) => g.id === "gate-2-norte")).toBe(false);
  });
```

- [ ] **Step 24: Run all tests to verify they pass**

Run: `npm run test -- src/features/events/wizard/steps/GatesSection.test.tsx`
Expected: PASS (all tests — the delete button was already implemented in Step 17).

- [ ] **Step 25: Commit**

```bash
git add src/features/events/wizard/steps/GatesSection.tsx src/features/events/wizard/steps/GatesSection.test.tsx
git commit -m "feat: add GatesSection component"
```

---

### Task 5: Integrate into `EventDetailPage`

**Files:**
- Modify: `src/features/events/detail/EventDetailPage.tsx`
- Modify: `src/features/events/detail/EventDetailPage.test.tsx`

**Interfaces:**
- Consumes: `GatesSection` from `../wizard/steps/GatesSection` (Task 4).

- [ ] **Step 1: Write the failing test, and update the test that currently asserts "Puertas" is disabled**

In `EventDetailPage.test.tsx`, replace the existing test:

```tsx
  it("disables out-of-scope sections with an explanatory tooltip", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderDetail("event-3");
    const gatesButton = await screen.findByRole("button", { name: "Puertas" });
    expect(gatesButton).toBeDisabled();
    expect(gatesButton).toHaveAttribute("title", "Disponible en una fase posterior");
  });
```

with (pointing at "Invitados" instead, since "Puertas" is no longer disabled — this mirrors what the spec calls out explicitly):

```tsx
  it("disables out-of-scope sections with an explanatory tooltip", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderDetail("event-3");
    const invitadosButton = await screen.findByRole("button", { name: "Invitados" });
    expect(invitadosButton).toBeDisabled();
    expect(invitadosButton).toHaveAttribute("title", "Disponible en una fase posterior");
  });
```

Then add this new test, after the "switches to the Códigos de descuento tab..." test:

```tsx
  it("switches to the Puertas tab and shows its already-created gate", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderDetail("event-2"); // seeded with the Puerta Norte gate
    fireEvent.click(await screen.findByRole("button", { name: "Puertas" }));

    expect(await screen.findByText("Puerta Norte — NORTE")).toBeInTheDocument();
    expect(screen.getByLabelText("Código")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/features/events/detail/EventDetailPage.test.tsx`
Expected: FAIL — "Puertas" is currently a `disabled` button (in `DISABLED_TABS`), so clicking it does nothing and the new test's assertions time out; the updated "disables out-of-scope" test fails too since "Invitados" isn't queried as disabled yet in the old markup (it is, in fact, already disabled — this failure is really about the new "Puertas" test; the updated assertion itself should already pass against current markup, confirming the rename is safe).

- [ ] **Step 3: Move the tab from disabled to enabled**

In `src/features/events/detail/EventDetailPage.tsx`:

1. Add the import: `import { GatesSection } from "../wizard/steps/GatesSection";`
2. Change `ENABLED_TABS` (add the new entry after `"descuentos"`, matching the order in `docs/README.md` §4.3, where "Puertas y control de acceso" follows "Códigos de descuento"):
   ```ts
   const ENABLED_TABS = [
     { key: "general", label: "Información general" },
     { key: "subeventos", label: "Subeventos" },
     { key: "plano", label: "Plano de asientos" },
     { key: "tipos", label: "Tipos de entrada" },
     { key: "descuentos", label: "Códigos de descuento" },
     { key: "puertas", label: "Puertas" }
   ] as const;
   ```
3. Remove `"Puertas"` from `DISABLED_TABS`:
   ```ts
   const DISABLED_TABS = ["Invitados", "Pedidos", "Métricas"];
   ```
4. Add the render branch, after the `{activeTab === "descuentos" && ...}` line:
   ```tsx
   {activeTab === "puertas" && <GatesSection eventId={eventId} />}
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/features/events/detail/EventDetailPage.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/events/detail/EventDetailPage.tsx src/features/events/detail/EventDetailPage.test.tsx
git commit -m "feat: enable the Puertas tab in EventDetailPage"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite (panel + types package)**

Run: `npm run test`
Expected: all test files pass — this single root run already covers `packages/types/src/schemas.test.ts` too (confirmed: the root `vitest` config has no `include`/`exclude` scoping that would skip it).

- [ ] **Step 2: Type-check the panel app**

Run: `npx tsc -b --noEmit`
Expected: clean (no output). If the project reference build cache interferes, `npx tsc --noEmit -p tsconfig.json` is an acceptable fallback.

- [ ] **Step 3: Manually cross-check the spec**

Re-read `docs/superpowers/specs/2026-08-26-puertas-design.md` and confirm every item in its "Testing" section has a corresponding passing test, and every item in "Fuera de alcance de esta spec" was genuinely not built (no real scan validation, no PWA, no device pairing, no scan log, no live capacity, no full team management beyond the read-only `/events/:eventId/team`, and none of the other 3 pending nav sections — Invitados, Pedidos, Métricas — were touched).
