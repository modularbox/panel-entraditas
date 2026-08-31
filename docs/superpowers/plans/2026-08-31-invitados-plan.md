# Lista de invitados y cortesías Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el apartado "Invitados" de la ficha de evento: listas de invitados nombradas por evento (con cupo opcional), y añadir/gestionar/eliminar invitados dentro de cada lista.

**Architecture:** Dos recursos a nivel de evento (`GuestList`, `GuestListEntry`), con el mismo patrón CRUD ya usado para puertas (`gates.ts`/`GatesSection.tsx`): schemas Zod, handler mock con `requireEvent`/`requireGuestList`/`requireEntry`, y una sección React (`GuestlistSection.tsx`) que muestra las listas con sus invitados anidados dentro de cada una.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query, MSW, zod, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-31-invitados-design.md`

## Global Constraints

- Sin importación CSV, sin envío de email/SMS, sin enlaces de RRPP/comisiones, sin check-in real sin QR, sin emisión de tickets/cortesías reales.
- `status` de un invitado: solo `"pending"` / `"checked_in"` (no `sent`/`cancelled` del modelo completo) — se alterna con un botón, igual patrón que `Gate.isActive`.
- `quota`: si no es `null`, es **bloqueante** — `POST /guest-lists/:id/entries` rechaza con `422 VALIDATION_ERROR` ("Esta lista ha alcanzado su cupo") al superarlo.
- Eliminar una lista (`DELETE /guest-lists/:id`) borra en cascada sus invitados.
- El repo es de estructura plana (`src/...`); usa `npm`, no `pnpm`. Todos los comandos de test se ejecutan desde la raíz con `npm run test -- <ruta>` (incluida la ruta a `packages/types/src/...`).
- Las contraseñas demo son por usuario (`DEMO_PASSWORD_BY_EMAIL` en `src/mocks/state.ts`): `admin@entraditas.com` → `N8@kP4!wY6#sD2&`.
- Los datos semilla viven en `src/mocks/data/db.seed.json` (no inline en `db.ts`).

---

### Task 1: Schemas `GuestList` y `GuestListEntry`

**Files:**
- Modify: `packages/types/src/schemas.ts`
- Modify: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Produces: `GuestListSchema`, `GuestList`, `GuestListEntrySchema`, `GuestListEntry` — re-exportados vía `packages/types/src/index.ts` (`export * from "./schemas"`).

- [ ] **Step 1: Write the failing tests**

En `packages/types/src/schemas.test.ts`, añade `GuestListEntrySchema, GuestListSchema` al import existente de `"./schemas"` (orden alfabético):

```ts
import {
  DiscountCodeSchema, EventSchema, GateSchema, GuestListEntrySchema, GuestListSchema, InvitationSchema, OrderItemSchema, OrderSchema, TicketTypeSchema, UserSchema, ZoneSchema
} from "./schemas";
```

Añade al final del archivo:

```ts
describe("GuestListSchema", () => {
  it("accepts a valid guest list with a quota", () => {
    const result = GuestListSchema.parse({
      id: "gl-1", eventId: "event-2", subEventId: null, name: "Prensa", quota: 5
    });
    expect(result.quota).toBe(5);
  });

  it("accepts a guest list without a quota (unlimited)", () => {
    const result = GuestListSchema.parse({
      id: "gl-2", eventId: "event-2", subEventId: "sub-event-2", name: "Patrocinadores", quota: null
    });
    expect(result.quota).toBeNull();
  });
});

describe("GuestListEntrySchema", () => {
  it("accepts a valid pending entry", () => {
    const result = GuestListEntrySchema.parse({
      id: "gle-1", guestListId: "gl-1", fullName: "Marta López", email: "marta@example.com",
      phone: null, companions: 0, status: "pending", notes: null
    });
    expect(result.status).toBe("pending");
  });

  it("accepts a checked-in entry with companions and notes", () => {
    const result = GuestListEntrySchema.parse({
      id: "gle-2", guestListId: "gl-1", fullName: "Carlos Ruiz", email: null,
      phone: "600111222", companions: 1, status: "checked_in", notes: "Fotógrafo acreditado"
    });
    expect(result.companions).toBe(1);
  });

  it("rejects an unknown status", () => {
    expect(() =>
      GuestListEntrySchema.parse({
        id: "gle-3", guestListId: "gl-1", fullName: "X", email: null, phone: null,
        companions: 0, status: "sent", notes: null
      })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- packages/types/src/schemas.test.ts`
Expected: FAIL — `GuestListSchema`/`GuestListEntrySchema` no existen.

- [ ] **Step 3: Add the schemas**

En `packages/types/src/schemas.ts`, añade al final del archivo (después de `export type Gate = z.infer<typeof GateSchema>;`):

```ts
export const GuestListSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(),
  name: z.string(),
  quota: z.number().int().positive().nullable()
});
export type GuestList = z.infer<typeof GuestListSchema>;

export const GuestListEntrySchema = z.object({
  id: z.string(),
  guestListId: z.string(),
  fullName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  companions: z.number().int().nonnegative(),
  status: z.enum(["pending", "checked_in"]),
  notes: z.string().nullable()
});
export type GuestListEntry = z.infer<typeof GuestListEntrySchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- packages/types/src/schemas.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add packages/types/src/schemas.ts packages/types/src/schemas.test.ts
git commit -m "feat: add GuestList and GuestListEntry schemas"
```

---

### Task 2: Datos semilla

**Files:**
- Modify: `src/mocks/db.ts`
- Modify: `src/mocks/data/db.seed.json`
- Modify: `src/mocks/state.ts`
- Modify: `src/mocks/db.test.ts`

**Interfaces:**
- Consumes: `GuestList`, `GuestListEntry` (Task 1).
- Produces: `Database.guestLists: GuestList[]`, `Database.guestListEntries: GuestListEntry[]`, seeded con una lista `gl-2-prensa` ("Prensa", `eventId: "event-2"`, `quota: 5`) y dos invitados (`gle-1` pendiente, `gle-2` registrado) — usados por las Tareas 3 y 4.

- [ ] **Step 1: Write the failing test**

En `src/mocks/db.test.ts`, añade `GuestListEntrySchema, GuestListSchema` al import de `@entraditas/types`:

```ts
import { EventSchema, GateSchema, GuestListEntrySchema, GuestListSchema, OrderItemSchema, OrderSchema, RefundSchema, TicketTypeSchema, UserSchema } from "@entraditas/types";
```

Añade al final del `describe("createSeedDatabase", ...)`:

```ts
  it("seeds one guest list on event-2 with 2 schema-valid entries", () => {
    const db = createSeedDatabase();
    expect(db.guestLists).toHaveLength(1);
    const guestList = db.guestLists[0]!;
    expect(() => GuestListSchema.parse(guestList)).not.toThrow();
    expect(guestList.eventId).toBe("event-2");
    expect(guestList.quota).toBe(5);

    const entries = db.guestListEntries.filter((e) => e.guestListId === guestList.id);
    expect(entries).toHaveLength(2);
    for (const entry of entries) expect(() => GuestListEntrySchema.parse(entry)).not.toThrow();
    expect(entries.some((e) => e.status === "pending")).toBe(true);
    expect(entries.some((e) => e.status === "checked_in")).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/mocks/db.test.ts`
Expected: FAIL — `db.guestLists` es `undefined`.

- [ ] **Step 3: Add the fields and the seed data**

En `src/mocks/db.ts`, actualiza el import de tipos:

```ts
import type {
  CapacityPool, DiscountCode, Event, Gate, GuestList, GuestListEntry, Invitation, Order, OrderItem, Organization, Refund, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
} from "@entraditas/types";
```

Añade a la interfaz `Database`, después de `gates: Gate[];`:

```ts
  guestLists: GuestList[];
  guestListEntries: GuestListEntry[];
```

En `src/mocks/data/db.seed.json`, añade después del array `"gates"` (antes de `"invitations"`):

```json
  "guestLists": [
    { "id": "gl-2-prensa", "eventId": "event-2", "subEventId": null, "name": "Prensa", "quota": 5 }
  ],
  "guestListEntries": [
    {
      "id": "gle-1",
      "guestListId": "gl-2-prensa",
      "fullName": "Marta López",
      "email": "marta.lopez@example.com",
      "phone": null,
      "companions": 0,
      "status": "pending",
      "notes": null
    },
    {
      "id": "gle-2",
      "guestListId": "gl-2-prensa",
      "fullName": "Carlos Ruiz",
      "email": null,
      "phone": "600111222",
      "companions": 1,
      "status": "checked_in",
      "notes": "Fotógrafo acreditado"
    }
  ],
```

En `src/mocks/state.ts`, añade a `isDatabase`, después de `Array.isArray(candidate.gates) &&`:

```ts
    Array.isArray(candidate.guestLists) &&
    Array.isArray(candidate.guestListEntries) &&
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/mocks/db.test.ts`
Expected: PASS.

Run: `npm run test -- src/mocks/state.test.ts`
Expected: PASS (sin cambios de comportamiento, confirma que `isDatabase` sigue parseando bien con los campos nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/mocks/db.ts src/mocks/data/db.seed.json src/mocks/state.ts src/mocks/db.test.ts
git commit -m "feat: seed a guest list with two entries on event-2"
```

---

### Task 3: Handler mock `guestLists.ts`

**Files:**
- Create: `src/mocks/handlers/guestLists.ts`
- Create: `src/mocks/handlers/guestLists.test.ts`
- Modify: `src/mocks/handlers/index.ts`

**Interfaces:**
- Consumes: `db.guestLists`, `db.guestListEntries` (Task 2), `canAccessEvent` (de `./events`), `getSessionUserId` (de `../authContext`).
- Produces: `guestListsHandlers`, registrado en `handlers`. Endpoints: `GET/POST /events/:eventId/guest-lists`, `DELETE /guest-lists/:id`, `GET/POST /guest-lists/:id/entries`, `PATCH/DELETE /guest-list-entries/:id`.

- [ ] **Step 1: Write the failing tests**

Create `src/mocks/handlers/guestLists.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import type { GuestList, GuestListEntry } from "@entraditas/types";

describe("guestLists handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    return useSessionStore.getState().token!;
  }

  it("lists guest lists for an event", async () => {
    const token = await login();
    const guestLists = await apiClient.get<GuestList[]>("/events/event-2/guest-lists", { token });
    expect(guestLists).toHaveLength(1);
    expect(guestLists[0]!.name).toBe("Prensa");
  });

  it("creates a guest list without a quota", async () => {
    const token = await login();
    const created = await apiClient.post<GuestList>(
      "/events/event-2/guest-lists",
      { name: "Patrocinadores", subEventId: null, quota: null },
      { token }
    );
    expect(created.quota).toBeNull();
    expect(db.guestLists.some((g) => g.name === "Patrocinadores")).toBe(true);
  });

  it("lists entries for a guest list", async () => {
    const token = await login();
    const entries = await apiClient.get<GuestListEntry[]>("/guest-lists/gl-2-prensa/entries", { token });
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.fullName).sort()).toEqual(["Carlos Ruiz", "Marta López"]);
  });

  it("adds an entry to a guest list under its quota", async () => {
    const token = await login();
    const created = await apiClient.post<GuestListEntry>(
      "/guest-lists/gl-2-prensa/entries",
      { fullName: "Nuevo Invitado", email: null, phone: null, companions: 0, notes: null },
      { token }
    );
    expect(created.status).toBe("pending");
    expect(db.guestListEntries.some((e) => e.fullName === "Nuevo Invitado")).toBe(true);
  });

  it("rejects adding an entry once the guest list's quota is reached", async () => {
    const token = await login();
    db.guestLists.push({ id: "gl-full", eventId: "event-2", subEventId: null, name: "Lleno", quota: 1 });
    db.guestListEntries.push({
      id: "gle-full-1", guestListId: "gl-full", fullName: "Ya Está", email: null, phone: null,
      companions: 0, status: "pending", notes: null
    });
    await expect(
      apiClient.post(
        "/guest-lists/gl-full/entries",
        { fullName: "Otro Más", email: null, phone: null, companions: 0, notes: null },
        { token }
      )
    ).rejects.toThrow(AppError);
    expect(db.guestListEntries.filter((e) => e.guestListId === "gl-full")).toHaveLength(1);
  });

  it("patches an entry's status", async () => {
    const token = await login();
    const updated = await apiClient.patch<GuestListEntry>("/guest-list-entries/gle-1", { status: "checked_in" }, { token });
    expect(updated.status).toBe("checked_in");
  });

  it("deletes an entry", async () => {
    const token = await login();
    await apiClient.delete("/guest-list-entries/gle-1", { token });
    expect(db.guestListEntries.some((e) => e.id === "gle-1")).toBe(false);
  });

  it("deletes a guest list and cascades to its entries", async () => {
    const token = await login();
    await apiClient.delete("/guest-lists/gl-2-prensa", { token });
    expect(db.guestLists.some((g) => g.id === "gl-2-prensa")).toBe(false);
    expect(db.guestListEntries.some((e) => e.guestListId === "gl-2-prensa")).toBe(false);
  });

  it("rejects access to an out-of-scope event's guest lists", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "T6#bW8@cL2!pZ9&"); // scoped to event-1 only
    const token = useSessionStore.getState().token!;
    await expect(apiClient.get("/events/event-2/guest-lists", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/mocks/handlers/guestLists.test.ts`
Expected: FAIL — ninguna de estas rutas está manejada todavía.

- [ ] **Step 3: Implement the handler**

Create `src/mocks/handlers/guestLists.ts`:

```ts
import { http, HttpResponse } from "msw";
import type { GuestList, GuestListEntry } from "@entraditas/types";
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
  if (!userId) return { error: unauthenticated("req_guestlists") };
  const user = db.users.find((u) => u.id === userId);
  const event = db.events.find((e) => e.id === eventId);
  if (!user || !event || !canAccessEvent(event, user)) return { error: notFound("req_guestlists") };
  return { event };
}

function requireGuestList(request: Request, id: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_guestlists") };
  const user = db.users.find((u) => u.id === userId);
  const guestList = db.guestLists.find((g) => g.id === id);
  const event = guestList ? db.events.find((e) => e.id === guestList.eventId) : null;
  if (!user || !guestList || !event || !canAccessEvent(event, user)) return { error: notFound("req_guestlists") };
  return { guestList };
}

function requireEntry(request: Request, id: string) {
  const userId = getSessionUserId(request);
  if (!userId) return { error: unauthenticated("req_guestlists") };
  const user = db.users.find((u) => u.id === userId);
  const entry = db.guestListEntries.find((e) => e.id === id);
  const guestList = entry ? db.guestLists.find((g) => g.id === entry.guestListId) : null;
  const event = guestList ? db.events.find((e) => e.id === guestList.eventId) : null;
  if (!user || !entry || !guestList || !event || !canAccessEvent(event, user)) return { error: notFound("req_guestlists") };
  return { entry };
}

interface CreateGuestListBody {
  name: string;
  subEventId: string | null;
  quota: number | null;
}

interface CreateEntryBody {
  fullName: string;
  email: string | null;
  phone: string | null;
  companions: number;
  notes: string | null;
}

export const guestListsHandlers = [
  http.get(`${BASE}/events/:eventId/guest-lists`, ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const guestLists = db.guestLists.filter((g) => g.eventId === result.event.id);
    return HttpResponse.json({ data: guestLists, meta: { page: 1, perPage: guestLists.length, total: guestLists.length, nextCursor: null } });
  }),

  http.post(`${BASE}/events/:eventId/guest-lists`, async ({ request, params }) => {
    const result = requireEvent(request, params.eventId as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as CreateGuestListBody;
    const created: GuestList = {
      id: `gl-${db.guestLists.length + 1}`,
      eventId: result.event.id,
      subEventId: body.subEventId,
      name: body.name,
      quota: body.quota
    };
    db.guestLists.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_guestlists_create" } }, { status: 201 });
  }),

  http.delete(`${BASE}/guest-lists/:id`, ({ request, params }) => {
    const result = requireGuestList(request, params.id as string);
    if ("error" in result) return result.error;
    db.guestListEntries = db.guestListEntries.filter((e) => e.guestListId !== result.guestList.id);
    db.guestLists = db.guestLists.filter((g) => g.id !== result.guestList.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_guestlists_delete" } });
  }),

  http.get(`${BASE}/guest-lists/:id/entries`, ({ request, params }) => {
    const result = requireGuestList(request, params.id as string);
    if ("error" in result) return result.error;
    const entries = db.guestListEntries.filter((e) => e.guestListId === result.guestList.id);
    return HttpResponse.json({ data: entries, meta: { page: 1, perPage: entries.length, total: entries.length, nextCursor: null } });
  }),

  http.post(`${BASE}/guest-lists/:id/entries`, async ({ request, params }) => {
    const result = requireGuestList(request, params.id as string);
    if ("error" in result) return result.error;
    const existingCount = db.guestListEntries.filter((e) => e.guestListId === result.guestList.id).length;
    if (result.guestList.quota !== null && existingCount >= result.guestList.quota) {
      return HttpResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Esta lista ha alcanzado su cupo", requestId: "req_guestlists_entry_create" } },
        { status: 422 }
      );
    }
    const body = (await request.json()) as CreateEntryBody;
    const created: GuestListEntry = {
      id: `gle-${db.guestListEntries.length + 1}`,
      guestListId: result.guestList.id,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      companions: body.companions,
      status: "pending",
      notes: body.notes
    };
    db.guestListEntries.push(created);
    return HttpResponse.json({ data: created, meta: { requestId: "req_guestlists_entry_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/guest-list-entries/:id`, async ({ request, params }) => {
    const result = requireEntry(request, params.id as string);
    if ("error" in result) return result.error;
    Object.assign(result.entry, await request.json());
    return HttpResponse.json({ data: result.entry, meta: { requestId: "req_guestlists_entry_patch" } });
  }),

  http.delete(`${BASE}/guest-list-entries/:id`, ({ request, params }) => {
    const result = requireEntry(request, params.id as string);
    if ("error" in result) return result.error;
    db.guestListEntries = db.guestListEntries.filter((e) => e.id !== result.entry.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_guestlists_entry_delete" } });
  })
];
```

- [ ] **Step 4: Register the handler**

En `src/mocks/handlers/index.ts`, añade el import (orden alfabético, junto a `gatesHandlers`):

```ts
import { guestListsHandlers } from "./guestLists";
```

Y añádelo al array `handlers`:

```ts
export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...discountCodesHandlers, ...usersHandlers, ...invitationsHandlers, ...dashboardHandlers, ...ordersHandlers, ...refundsHandlers, ...customersHandlers, ...organizationsHandlers, ...gatesHandlers, ...guestListsHandlers];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/mocks/handlers/guestLists.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/mocks/handlers/guestLists.ts src/mocks/handlers/guestLists.test.ts src/mocks/handlers/index.ts
git commit -m "feat: add guest-lists mock CRUD endpoints"
```

---

### Task 4: `GuestlistSection` component

**Files:**
- Create: `src/features/events/wizard/steps/GuestlistSection.tsx`
- Create: `src/features/events/wizard/steps/GuestlistSection.test.tsx`

**Interfaces:**
- Consumes: `GuestList`, `GuestListEntry` de `@entraditas/types`; `useSubEventsQuery` (de `./useSubEventsQuery`); `apiClient`/`AppError`, `useSessionStore`, `Button` (ya existentes).
- Produces: `GuestlistSection` con props `{ eventId: string | null }` — consumido por la Tarea 5.

- [ ] **Step 1: Write the failing tests**

Create `src/features/events/wizard/steps/GuestlistSection.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { GuestlistSection } from "./GuestlistSection";

function renderSection(eventId: string | null) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <GuestlistSection eventId={eventId} />
    </QueryClientProvider>
  );
}

async function loginAsAdmin() {
  await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
}

describe("GuestlistSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la información del evento/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre")).not.toBeInTheDocument();
  });

  it("renders the event's already-created guest list with its two entries", async () => {
    await loginAsAdmin();
    renderSection("event-2"); // seeded: "Prensa" (cupo 5), Marta López (pending), Carlos Ruiz (checked_in)
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    await within(card).findByText("Marta López", { exact: false }); // wait for the card's own entries fetch to resolve

    expect(within(card).getByText(/2 \/ 5/)).toBeInTheDocument();
    expect(within(card).getByText("Carlos Ruiz", { exact: false })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Pendiente" })).toBeInTheDocument(); // Carlos Ruiz ya está registrado
    expect(within(card).getByRole("button", { name: "Registrado" })).toBeInTheDocument(); // Marta López está pendiente
  });

  it("disables Crear lista until Nombre is filled", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByRole("listitem", { name: "Prensa" });
    const createForm = screen.getByRole("group", { name: "Nueva lista" });
    expect(within(createForm).getByRole("button", { name: "Crear lista" })).toBeDisabled();

    fireEvent.change(within(createForm).getByLabelText("Nombre"), { target: { value: "Patrocinadores" } });
    expect(within(createForm).getByRole("button", { name: "Crear lista" })).toBeEnabled();
  });

  it("creates a new guest list without a quota", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    await screen.findByRole("listitem", { name: "Prensa" });
    const createForm = screen.getByRole("group", { name: "Nueva lista" });

    fireEvent.change(within(createForm).getByLabelText("Nombre"), { target: { value: "Patrocinadores" } });
    fireEvent.click(within(createForm).getByRole("button", { name: "Crear lista" }));

    const card = await screen.findByRole("listitem", { name: "Patrocinadores" });
    expect(within(card).getByText("Sin límite", { exact: false })).toBeInTheDocument();
    expect(db.guestLists.some((g) => g.name === "Patrocinadores" && g.quota === null)).toBe(true);
  });

  it("adds a guest to an existing list", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    const addForm = within(card).getByRole("group", { name: "Añadir invitado" });

    fireEvent.change(within(addForm).getByLabelText("Nombre"), { target: { value: "Nuevo Invitado" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Añadir" }));

    await waitFor(() => expect(within(card).getByText("Nuevo Invitado", { exact: false })).toBeInTheDocument());
    expect(db.guestListEntries.some((e) => e.fullName === "Nuevo Invitado")).toBe(true);
  });

  it("shows an error when the guest list has reached its quota", async () => {
    await loginAsAdmin();
    db.guestLists.push({ id: "gl-full", eventId: "event-2", subEventId: null, name: "Lleno", quota: 1 });
    db.guestListEntries.push({
      id: "gle-full-1", guestListId: "gl-full", fullName: "Ya Está", email: null, phone: null,
      companions: 0, status: "pending", notes: null
    });
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Lleno" });
    const addForm = within(card).getByRole("group", { name: "Añadir invitado" });

    fireEvent.change(within(addForm).getByLabelText("Nombre"), { target: { value: "Otro Más" } });
    fireEvent.click(within(addForm).getByRole("button", { name: "Añadir" }));

    expect(await within(card).findByRole("alert")).toHaveTextContent("cupo");
  });

  it("toggles a guest's status between pending and checked in", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    await within(card).findByText("Marta López", { exact: false });

    fireEvent.click(within(card).getByRole("button", { name: "Registrado" })); // Marta López: pending -> checked_in

    await waitFor(() => expect(db.guestListEntries.find((e) => e.id === "gle-1")!.status).toBe("checked_in"));
  });

  it("deletes a guest from a list", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });
    await within(card).findByText("Marta López", { exact: false });

    fireEvent.click(within(card).getAllByRole("button", { name: "Eliminar" })[0]!);

    await waitFor(() => expect(db.guestListEntries).toHaveLength(1));
  });

  it("deletes an entire guest list along with its entries", async () => {
    await loginAsAdmin();
    renderSection("event-2");
    const card = await screen.findByRole("listitem", { name: "Prensa" });

    fireEvent.click(within(card).getByRole("button", { name: "Eliminar lista" }));

    await waitFor(() => expect(screen.queryByRole("listitem", { name: "Prensa" })).not.toBeInTheDocument());
    expect(db.guestLists.some((g) => g.id === "gl-2-prensa")).toBe(false);
    expect(db.guestListEntries.some((e) => e.guestListId === "gl-2-prensa")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/features/events/wizard/steps/GuestlistSection.test.tsx`
Expected: FAIL — `./GuestlistSection` no existe.

- [ ] **Step 3: Implement the component**

Create `src/features/events/wizard/steps/GuestlistSection.tsx`:

```tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { GuestList, GuestListEntry, SubEvent } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface GuestlistSectionProps {
  eventId: string | null;
}

function useGuestListsQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["guest-lists", eventId],
    queryFn: () => apiClient.get<GuestList[]>(`/events/${eventId}/guest-lists`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useGuestListEntriesQuery(guestListId: string) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["guest-list-entries", guestListId],
    queryFn: () => apiClient.get<GuestListEntry[]>(`/guest-lists/${guestListId}/entries`, { token: token! }),
    enabled: Boolean(token)
  });
}

function quotaLabel(guestList: GuestList, count: number): string {
  return guestList.quota === null ? `${count} · Sin límite` : `${count} / ${guestList.quota}`;
}

function GuestListCard({
  guestList,
  subEvents,
  onDeleted
}: {
  guestList: GuestList;
  subEvents: SubEvent[];
  onDeleted: () => void;
}) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: entries = [] } = useGuestListEntriesQuery(guestList.id);

  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [companionsInput, setCompanionsInput] = useState("0");
  const [notes, setNotes] = useState("");

  const canAdd = fullName.trim() !== "";

  async function addEntry() {
    setError(null);
    try {
      await apiClient.post(
        `/guest-lists/${guestList.id}/entries`,
        {
          fullName,
          email: email === "" ? null : email,
          phone: phone === "" ? null : phone,
          companions: Number(companionsInput),
          notes: notes === "" ? null : notes
        },
        { token: token! }
      );
      setFullName("");
      setEmail("");
      setPhone("");
      setCompanionsInput("0");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["guest-list-entries", guestList.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function toggleStatus(entry: GuestListEntry) {
    setError(null);
    try {
      await apiClient.patch(
        `/guest-list-entries/${entry.id}`,
        { status: entry.status === "pending" ? "checked_in" : "pending" },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["guest-list-entries", guestList.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteEntry(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/guest-list-entries/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["guest-list-entries", guestList.id] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteList() {
    setError(null);
    try {
      await apiClient.delete(`/guest-lists/${guestList.id}`, { token: token! });
      onDeleted();
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  const subEventName = guestList.subEventId
    ? subEvents.find((s) => s.id === guestList.subEventId)?.name ?? ""
    : "Todos los subeventos";

  return (
    <li aria-label={guestList.name} className="flex flex-col gap-3 rounded-md border-2 border-border bg-surface px-4 py-3 text-sm">
      {error && <p role="alert">{error}</p>}
      <div className="flex items-center gap-3">
        <span className="flex-1 font-semibold">{guestList.name}</span>
        <span className="text-xs text-muted-foreground">{subEventName} · {quotaLabel(guestList, entries.length)}</span>
        <Button type="button" variant="destructive" onClick={deleteList} className="h-8 px-2 text-xs">
          Eliminar lista
        </Button>
      </div>

      <ul aria-label={`Invitados de ${guestList.name}`} className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-center gap-3 rounded-md border-2 border-border bg-surface-alt px-3 py-2">
            <span className="flex-1">
              <span className="font-semibold">{entry.fullName}</span>
              {" — "}
              {entry.email ?? entry.phone ?? "—"}
              {entry.companions > 0 ? ` · +${entry.companions}` : ""}
              {entry.notes ? ` · ${entry.notes}` : ""}
            </span>
            <Button type="button" variant="outline" onClick={() => toggleStatus(entry)} className="h-8 px-2 text-xs">
              {entry.status === "pending" ? "Registrado" : "Pendiente"}
            </Button>
            <Button type="button" variant="destructive" onClick={() => deleteEntry(entry.id)} className="h-8 px-2 text-xs">
              Eliminar
            </Button>
          </li>
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend>Añadir invitado</legend>
        <label htmlFor={`gle-name-${guestList.id}`}>Nombre</label>
        <input id={`gle-name-${guestList.id}`} value={fullName} onChange={(e) => setFullName(e.target.value)} />

        <label htmlFor={`gle-email-${guestList.id}`}>Email</label>
        <input id={`gle-email-${guestList.id}`} value={email} onChange={(e) => setEmail(e.target.value)} />

        <label htmlFor={`gle-phone-${guestList.id}`}>Teléfono</label>
        <input id={`gle-phone-${guestList.id}`} value={phone} onChange={(e) => setPhone(e.target.value)} />

        <label htmlFor={`gle-companions-${guestList.id}`}>Acompañantes</label>
        <input
          id={`gle-companions-${guestList.id}`}
          type="number"
          min="0"
          value={companionsInput}
          onChange={(e) => setCompanionsInput(e.target.value)}
        />

        <label htmlFor={`gle-notes-${guestList.id}`}>Notas</label>
        <input id={`gle-notes-${guestList.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <Button type="button" onClick={addEntry} disabled={!canAdd} className="mt-2">
          Añadir
        </Button>
      </fieldset>
    </li>
  );
}

export function GuestlistSection({ eventId }: GuestlistSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: guestLists = [] } = useGuestListsQuery(eventId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);

  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [subEventMode, setSubEventMode] = useState<"all" | "specific">("all");
  const [selectedSubEventId, setSelectedSubEventId] = useState("");
  const [quotaInput, setQuotaInput] = useState("");

  const canCreate = name.trim() !== "";

  async function createGuestList() {
    setError(null);
    try {
      await apiClient.post(
        `/events/${eventId}/guest-lists`,
        {
          name,
          subEventId: subEventMode === "all" ? null : selectedSubEventId,
          quota: quotaInput === "" ? null : Number(quotaInput)
        },
        { token: token! }
      );
      setName("");
      setSubEventMode("all");
      setSelectedSubEventId("");
      setQuotaInput("");
      await queryClient.invalidateQueries({ queryKey: ["guest-lists", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  if (!eventId) {
    return <p className="text-sm text-muted-foreground">Guarda la información del evento para poder gestionar invitados.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <ul aria-label="Listas de invitados" className="flex flex-col gap-3">
        {guestLists.map((guestList) => (
          <GuestListCard
            key={guestList.id}
            guestList={guestList}
            subEvents={subEvents}
            onDeleted={() => queryClient.invalidateQueries({ queryKey: ["guest-lists", eventId] })}
          />
        ))}
      </ul>

      <fieldset className="flex flex-col gap-2">
        <legend>Nueva lista</legend>
        <label htmlFor="gl-name">Nombre</label>
        <input id="gl-name" value={name} onChange={(e) => setName(e.target.value)} />

        {subEvents.length > 0 && (
          <>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="radio" name="gl-subevent-mode" checked={subEventMode === "all"} onChange={() => setSubEventMode("all")} />
                Todos los subeventos
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="radio"
                  name="gl-subevent-mode"
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

        <label htmlFor="gl-quota">Cupo</label>
        <input id="gl-quota" type="number" min="1" value={quotaInput} onChange={(e) => setQuotaInput(e.target.value)} placeholder="Sin límite" />

        <Button type="button" onClick={createGuestList} disabled={!canCreate} className="mt-4">
          Crear lista
        </Button>
      </fieldset>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/features/events/wizard/steps/GuestlistSection.test.tsx`
Expected: PASS (9 tests). If the "deletes a guest from a list" test is ambiguous because `getAllByRole("button", { name: "Eliminar" })` also matches "Eliminar lista", note that button's accessible name is "Eliminar lista" (different text), so `{ name: "Eliminar" }` should already only match the per-entry buttons — but React Testing Library's `name` matcher does substring-normalize by default only when passed a regex; a plain string requires an exact (whitespace-trimmed) match, so "Eliminar" and "Eliminar lista" do not collide. If it does fail here, double-check both button labels are spelled exactly as in this file before changing anything else.

- [ ] **Step 5: Commit**

```bash
git add src/features/events/wizard/steps/GuestlistSection.tsx src/features/events/wizard/steps/GuestlistSection.test.tsx
git commit -m "feat: add GuestlistSection component"
```

---

### Task 5: Integrar en `EventDetailPage`

**Files:**
- Modify: `src/features/events/detail/EventDetailPage.tsx`
- Modify: `src/features/events/detail/EventDetailPage.test.tsx`

**Interfaces:**
- Consumes: `GuestlistSection` de `../wizard/steps/GuestlistSection` (Task 4).

- [ ] **Step 1: Write the failing test, and update the test that currently asserts "Invitados" is disabled**

En `EventDetailPage.test.tsx`, sustituye:

```tsx
  it("disables out-of-scope sections with an explanatory tooltip", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderDetail("event-3");
    const invitadosButton = await screen.findByRole("button", { name: "Invitados" });
    expect(invitadosButton).toBeDisabled();
    expect(invitadosButton).toHaveAttribute("title", "Disponible en una fase posterior");
  });
```

por:

```tsx
  it("disables out-of-scope sections with an explanatory tooltip", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderDetail("event-3");
    const pedidosButton = await screen.findByRole("button", { name: "Pedidos" });
    expect(pedidosButton).toBeDisabled();
    expect(pedidosButton).toHaveAttribute("title", "Disponible en una fase posterior");
  });
```

Y añade, después del test `"switches to the Puertas tab and shows its already-created gate"`:

```tsx
  it("switches to the Invitados tab and shows its already-created guest list", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderDetail("event-2"); // seeded with the "Prensa" guest list
    fireEvent.click(await screen.findByRole("button", { name: "Invitados" }));

    expect(await screen.findByRole("listitem", { name: "Prensa" })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/features/events/detail/EventDetailPage.test.tsx`
Expected: FAIL — "Invitados" sigue siendo un botón `disabled`, así que el nuevo test no encuentra la lista; el test actualizado a "Pedidos" ya debería pasar contra el markup actual (confirma que el cambio de destino es seguro).

- [ ] **Step 3: Move the tab from disabled to enabled**

En `src/features/events/detail/EventDetailPage.tsx`:

1. Añade el import: `import { GuestlistSection } from "../wizard/steps/GuestlistSection";`
2. Cambia `ENABLED_TABS` (añade la nueva entrada después de `"puertas"`):
   ```ts
   const ENABLED_TABS = [
     { key: "general", label: "Información general" },
     { key: "subeventos", label: "Subeventos" },
     { key: "plano", label: "Plano de asientos" },
     { key: "tipos", label: "Tipos de entrada" },
     { key: "descuentos", label: "Códigos de descuento" },
     { key: "puertas", label: "Puertas" },
     { key: "invitados", label: "Invitados" }
   ] as const;
   ```
3. Quita `"Invitados"` de `DISABLED_TABS`:
   ```ts
   const DISABLED_TABS = ["Pedidos", "Métricas"];
   ```
4. Añade la rama de render, después de `{activeTab === "puertas" && ...}`:
   ```tsx
   {activeTab === "invitados" && <GuestlistSection eventId={eventId} />}
   ```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/features/events/detail/EventDetailPage.test.tsx`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/events/detail/EventDetailPage.tsx src/features/events/detail/EventDetailPage.test.tsx
git commit -m "feat: enable the Invitados tab in EventDetailPage"
```

---

### Task 6: Verificación completa

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: todos los archivos de test en verde (incluye `packages/types`).

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: limpio (sin salida).

- [ ] **Step 3: Repaso manual contra el spec**

Vuelve a leer `docs/superpowers/specs/2026-08-31-invitados-design.md` y confirma: no hay importación CSV ni envío de email/SMS, el cupo bloquea correctamente al superarse, eliminar una lista borra sus invitados, y los otros 2 apartados pendientes (Pedidos, Métricas) siguen sin construir.
