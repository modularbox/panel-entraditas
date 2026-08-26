# Rediseño del asistente de creación de eventos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nota del proyecto:** no se ejecutan comandos `git` como parte de este plan (ni `git add`, ni `git commit`) — el usuario gestiona el control de versiones por su cuenta. Cada tarea termina en cuanto sus tests pasan.

**Goal:** Convertir `EventWizardPage` de un asistente de 5 pasos con navegación por pestañas a una única página con secciones apiladas, con el estilo y los campos de la web de referencia (https://entraditas.com/organizador/nuevo), sin perder ninguna funcionalidad avanzada existente (múltiples funciones, aforo por zonas).

**Architecture:** Los componentes de cada paso actual se reutilizan tal cual para su lógica de datos (hooks, llamadas a la API); solo cambia cómo se componen dentro de `EventWizardPage` (apilados en vez de navegados) y qué props reciben (se elimina `goNext`, ya no hay "paso siguiente"). Se añaden campos nuevos al esquema de `Event` y `TicketType`, un helper de resolución de recinto por nombre/ciudad en el mock, y un componente nuevo para el plano de asientos.

**Tech Stack:** React 18, TypeScript, react-hook-form + zod, @tanstack/react-query, zustand, MSW, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-26-evento-creacion-rediseno-design.md`

## Global Constraints

- Toda la interfaz nueva está en español, siguiendo el tono ya usado en el resto del panel.
- No se introduce backend real de almacenamiento de archivos — el plano de asientos solo guarda el nombre del archivo (`seatingPlanFileName`), no el binario.
- No se introduce ningún estado de moderación/revisión — "Publicar evento" sigue publicando directamente.
- Todos los campos nuevos del esquema son obligatorios en el tipo pero llevan valores por defecto (`false`/`null`) en los datos ya sembrados, para no romper eventos existentes.
- Sigue el patrón TDD ya usado en el resto del proyecto: test que falla → implementación → test en verde.

---

### Task 1: Extender los esquemas `Event` y `TicketType`

**Files:**
- Modify: `packages/types/src/schemas.ts:52-70` (`EventSchema`), `packages/types/src/schemas.ts:95-114` (`TicketTypeSchema`)
- Test: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Produces: `Event.isCompetition: boolean`, `Event.hasNumberedSeating: boolean`, `Event.seatingPlanFileName: string | null`, `TicketType.color: string | null` — usados por todas las tareas siguientes.

- [ ] **Step 1: Escribir el test que falla**

Edita `packages/types/src/schemas.test.ts`: añade los tres campos nuevos a `validEvent`, y añade un test nuevo para `color` en `TicketTypeSchema`.

```ts
const validEvent = {
  id: "11111111-1111-1111-1111-111111111111",
  organizationId: "org-1",
  venueId: null,
  slug: "concierto-de-prueba",
  title: "Concierto de prueba",
  description: "Descripción",
  category: "concierto",
  status: "draft",
  visibility: "public",
  startsAt: "2026-10-01T20:00:00.000Z",
  endsAt: "2026-10-01T23:00:00.000Z",
  salesStartAt: null,
  salesEndAt: null,
  hasSubEvents: false,
  isCompetition: false,
  hasNumberedSeating: false,
  seatingPlanFileName: null,
  createdAt: "2026-08-01T00:00:00.000Z"
};
```

Y añade, dentro de `describe("TicketTypeSchema", ...)`:

```ts
it("accepts a ticket type with a color and one without", () => {
  const base = {
    id: "tt-1",
    groupId: "tt-1",
    eventId: "11111111-1111-1111-1111-111111111111",
    subEventId: null,
    name: "Abono festival",
    kind: "pass" as const,
    basePrice: 4500,
    currency: "EUR",
    quantityTotal: 200,
    quantitySold: 0,
    minPerOrder: 1,
    maxPerOrder: 4,
    visibility: "public" as const,
    isTransferable: true,
    isRefundable: true,
    sortOrder: 0
  };
  expect(() => TicketTypeSchema.parse({ ...base, color: "#3b82f6" })).not.toThrow();
  expect(() => TicketTypeSchema.parse({ ...base, color: null })).not.toThrow();
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter @entraditas/types test -- --run`
Expected: FAIL — `validEvent` no cumple `EventSchema` (faltan `isCompetition`/`hasNumberedSeating`/`seatingPlanFileName`) y el nuevo test de `color` falla porque el campo no existe en el esquema.

- [ ] **Step 3: Añadir los campos al esquema**

En `packages/types/src/schemas.ts`, dentro de `EventSchema`:

```ts
export const EventSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  venueId: z.string().nullable(),
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  status: z.enum(["draft", "published", "on_sale", "sold_out", "paused", "finished", "cancelled"]),
  visibility: z.enum(["public", "unlisted", "private"]),
  startsAt: z.string(),
  endsAt: z.string(),
  salesStartAt: z.string().nullable(),
  salesEndAt: z.string().nullable(),
  hasSubEvents: z.boolean(),
  isCompetition: z.boolean(),
  hasNumberedSeating: z.boolean(),
  seatingPlanFileName: z.string().nullable(),
  createdAt: z.string(),
  publishedAt: z.string().nullable().optional()
});
export type Event = z.infer<typeof EventSchema>;
```

Y dentro de `TicketTypeSchema`, añade `color: z.string().nullable()` justo después de `sortOrder: z.number().int()`:

```ts
export const TicketTypeSchema = z.object({
  id: z.string(),
  groupId: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(),
  capacityPoolId: z.string().nullable().optional(),
  name: z.string(),
  kind: z.enum(["paid", "free", "courtesy", "promo", "pass"]),
  basePrice: z.number().int().nonnegative(),
  currency: z.string().length(3),
  quantityTotal: z.number().int().nonnegative().nullable(),
  quantitySold: z.number().int().nonnegative(),
  minPerOrder: z.number().int().positive(),
  maxPerOrder: z.number().int().positive(),
  visibility: z.enum(["public", "hidden", "code_only"]),
  isTransferable: z.boolean(),
  isRefundable: z.boolean(),
  sortOrder: z.number().int(),
  color: z.string().nullable()
});
export type TicketType = z.infer<typeof TicketTypeSchema>;
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter @entraditas/types test -- --run`
Expected: PASS

---

### Task 2: Actualizar los datos sembrados del mock (`db.ts`)

**Files:**
- Modify: `apps/panel/src/mocks/db.ts`

**Interfaces:**
- Consumes: `Event.isCompetition/hasNumberedSeating/seatingPlanFileName`, `TicketType.color` (Task 1).

- [ ] **Step 1: Ejecutar el type-check para confirmar que falla**

Run: `pnpm --filter panel exec tsc --noEmit`
Expected: FAIL — los objetos `event1`..`event5` y los `TicketType` sembrados no cumplen los esquemas ampliados (faltan propiedades obligatorias).

- [ ] **Step 2: Añadir los campos por defecto a los 5 eventos sembrados**

En `apps/panel/src/mocks/db.ts`, añade `isCompetition: false, hasNumberedSeating: false, seatingPlanFileName: null,` a cada uno de los 5 objetos `Event` (`event1` a `event5`), justo después de `hasSubEvents: ...`. Por ejemplo, para `event1`:

```ts
const event1: Event = {
  id: "event-1", organizationId: org1.id, venueId: venue2.id, slug: "noche-de-jazz",
  title: "Noche de Jazz", description: "Una noche de jazz en el Teatro Circo.", category: "concierto",
  status: "published", visibility: "public", startsAt: "2026-10-10T21:00:00.000Z", endsAt: "2026-10-10T23:30:00.000Z",
  salesStartAt: "2026-08-01T00:00:00.000Z", salesEndAt: "2026-10-10T20:00:00.000Z",
  hasSubEvents: false, isCompetition: false, hasNumberedSeating: false, seatingPlanFileName: null,
  createdAt: "2026-07-01T00:00:00.000Z", publishedAt: "2026-07-05T00:00:00.000Z"
};
```

Repite el mismo patrón (`isCompetition: false, hasNumberedSeating: false, seatingPlanFileName: null,` tras `hasSubEvents: ...,`) para `event2`, `event3`, `event4` y `event5`.

- [ ] **Step 3: Añadir `color: null` a los 5 tipos de entrada sembrados**

Añade `color: null` como última propiedad de cada uno de `event1TicketType`, `event2TicketTypePista`, `event2TicketTypeGrada`, `event3TicketType`, `event4PassTicketType`. Por ejemplo:

```ts
const event1TicketType: TicketType = {
  id: "tt-1", groupId: "tt-1", eventId: event1.id, subEventId: event1SubEvent.id, capacityPoolId: event1Pool.id,
  name: "General", kind: "paid", basePrice: 2500, currency: "EUR", quantityTotal: 400, quantitySold: 0,
  minPerOrder: 1, maxPerOrder: 6, visibility: "public", isTransferable: true, isRefundable: true, sortOrder: 0,
  color: null
};
```

- [ ] **Step 4: Ejecutar el type-check y los tests del mock**

Run: `pnpm --filter panel exec tsc --noEmit && pnpm --filter panel test -- --run src/mocks/db.test.ts`
Expected: PASS

---

### Task 3: Extraer `useVenuesQuery` como hook compartido

**Files:**
- Create: `apps/panel/src/features/events/wizard/steps/useVenuesQuery.ts`
- Modify: `apps/panel/src/features/events/wizard/steps/Step3Capacity.tsx:24-31` (elimina la función local `useVenuesQuery`, importa la nueva)
- Test: `apps/panel/src/features/events/wizard/steps/Step3Capacity.test.tsx` (sin cambios — verifica que sigue en verde)

**Interfaces:**
- Produces: `useVenuesQuery(): UseQueryResult<Venue[]>` — consumido por `Step3Capacity` (ya) y `Step1BasicInfo` (Task 6).

- [ ] **Step 1: Crear el hook compartido**

```ts
// apps/panel/src/features/events/wizard/steps/useVenuesQuery.ts
import { useQuery } from "@tanstack/react-query";
import type { Venue } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useVenuesQuery() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["venues"],
    queryFn: () => apiClient.get<Venue[]>("/venues", { token: token! }),
    enabled: Boolean(token)
  });
}
```

- [ ] **Step 2: Quitar la definición local de `Step3Capacity.tsx` y usar la importada**

En `apps/panel/src/features/events/wizard/steps/Step3Capacity.tsx`, elimina estas líneas (la función local):

```ts
function useVenuesQuery() {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["venues"],
    queryFn: () => apiClient.get<Venue[]>("/venues", { token: token! }),
    enabled: Boolean(token)
  });
}
```

Y añade el import junto a los demás de la parte superior del archivo:

```ts
import { useVenuesQuery } from "./useVenuesQuery";
```

- [ ] **Step 3: Ejecutar los tests de `Step3Capacity` y el type-check**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/Step3Capacity.test.tsx && pnpm --filter panel exec tsc --noEmit`
Expected: PASS (comportamiento sin cambios, solo se movió el hook)

---

### Task 4: Resolución de recinto por nombre/ciudad + primera función automática en `events.ts`

**Files:**
- Modify: `apps/panel/src/mocks/handlers/events.ts`
- Test: `apps/panel/src/mocks/handlers/events.test.ts`

**Interfaces:**
- Consumes: `Venue` (`packages/types`), `db.venues`, `db.subEvents`.
- Produces: `POST /events` y `PATCH /events/:id` aceptan opcionalmente `city`, `venueName`, `date` (`YYYY-MM-DD`), `time` (`HH:MM`), `isCompetition` en el body. Usado por `Step1BasicInfo` (Task 6).

- [ ] **Step 1: Escribir los tests que fallan**

Añade a `apps/panel/src/mocks/handlers/events.test.ts`:

```ts
it("reuses an existing venue when the name and city match, case-insensitively", async () => {
  const token = await loginAs("admin@entraditas.com");
  const created = await apiClient.post<Event>(
    "/events",
    { title: "Evento en Apolo", category: "concierto", venueName: "sala apolo", city: "MADRID" },
    { token }
  );
  expect(created.venueId).toBe("venue-1");
  expect(db.venues).toHaveLength(3); // no se crea un recinto nuevo
});

it("creates a new venue with an unbounded default capacity when no match exists", async () => {
  const token = await loginAs("admin@entraditas.com");
  const created = await apiClient.post<Event>(
    "/events",
    { title: "Evento nuevo recinto", category: "concierto", venueName: "Nuevo Recinto", city: "Bilbao" },
    { token }
  );
  const venue = db.venues.find((v) => v.id === created.venueId)!;
  expect(venue).toMatchObject({ name: "Nuevo Recinto", city: "Bilbao", totalCapacity: 999999 });
});

it("creates the first sub-event from date and time for a single-function event", async () => {
  const token = await loginAs("admin@entraditas.com");
  const created = await apiClient.post<Event>(
    "/events",
    { title: "Evento con fecha", category: "concierto", hasSubEvents: false, date: "2026-12-05", time: "21:00" },
    { token }
  );
  const subEvents = db.subEvents.filter((s) => s.eventId === created.id);
  expect(subEvents).toHaveLength(1);
  expect(subEvents[0]).toMatchObject({ startsAt: "2026-12-05T21:00:00.000Z", endsAt: "2026-12-06T00:00:00.000Z" });
});

it("does not auto-create a sub-event when the event has multiple functions", async () => {
  const token = await loginAs("admin@entraditas.com");
  const created = await apiClient.post<Event>(
    "/events",
    { title: "Evento multi-función", category: "concierto", hasSubEvents: true, date: "2026-12-05", time: "21:00" },
    { token }
  );
  expect(db.subEvents.filter((s) => s.eventId === created.id)).toHaveLength(0);
});

it("updates the first sub-event's date and time on PATCH", async () => {
  const token = await loginAs("admin@entraditas.com");
  await apiClient.patch<Event>("/events/event-1", { date: "2026-10-15", time: "22:00" }, { token });
  const updated = db.subEvents.find((s) => s.id === "sub-event-1")!;
  expect(updated.startsAt).toBe("2026-10-15T22:00:00.000Z");
  expect(updated.endsAt).toBe("2026-10-16T01:00:00.000Z");
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/events.test.ts`
Expected: FAIL — `venueName`/`city`/`date`/`time` no se procesan todavía.

- [ ] **Step 3: Implementar `findOrCreateVenue` y las llamadas a fecha/hora**

En `apps/panel/src/mocks/handlers/events.ts`, añade el import de `Venue` y `SubEvent`, y estos helpers justo debajo de `slugify`:

```ts
import type { Event, SubEvent, User, Venue } from "@entraditas/types";
// ...

function findOrCreateVenue(user: User, name: string, city: string): Venue {
  const trimmedName = name.trim();
  const trimmedCity = city.trim();
  const existing = db.venues.find(
    (v) =>
      v.organizationId === user.organizationId &&
      v.name.toLowerCase() === trimmedName.toLowerCase() &&
      v.city.toLowerCase() === trimmedCity.toLowerCase()
  );
  if (existing) return existing;
  const venue: Venue = {
    id: `venue-created-${db.venues.length + 1}`,
    organizationId: user.organizationId!,
    name: trimmedName,
    city: trimmedCity,
    totalCapacity: 999999
  };
  db.venues.push(venue);
  return venue;
}

function combineDateTime(date: string, time: string): string {
  return `${date}T${time}:00.000Z`;
}

function addMinutesToIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

type EventFieldsBody = Partial<Event> & {
  city?: string;
  venueName?: string;
  date?: string;
  time?: string;
};
```

Sustituye el handler `POST /events` completo por:

```ts
http.post(`${BASE}/events`, async ({ request }) => {
  const user = requireUser(request);
  if (!user) return unauthenticated("req_events_create");
  const body = (await request.json()) as EventFieldsBody & { title: string };
  const venueId =
    body.venueName && body.city ? findOrCreateVenue(user, body.venueName, body.city).id : body.venueId ?? null;
  const event: Event = {
    id: `event-created-${db.events.length + 1}`,
    organizationId: user.organizationId ?? (body.organizationId as string),
    venueId,
    slug: slugify(body.title),
    title: body.title,
    description: body.description ?? "",
    category: body.category ?? "otros",
    status: "draft",
    visibility: body.visibility ?? "private",
    startsAt: body.startsAt ?? new Date().toISOString(),
    endsAt: body.endsAt ?? new Date().toISOString(),
    salesStartAt: null,
    salesEndAt: null,
    hasSubEvents: body.hasSubEvents ?? false,
    isCompetition: body.isCompetition ?? false,
    hasNumberedSeating: false,
    seatingPlanFileName: null,
    createdAt: new Date().toISOString()
  };
  db.events.push(event);

  if (!event.hasSubEvents && body.date && body.time) {
    const startsAt = combineDateTime(body.date, body.time);
    const subEvent: SubEvent = {
      id: `sub-event-${event.id}`,
      eventId: event.id,
      name: "Función única",
      startsAt,
      endsAt: addMinutesToIso(startsAt, 180),
      doorsOpenAt: null,
      status: "scheduled",
      sortOrder: 0
    };
    db.subEvents.push(subEvent);
  }

  return HttpResponse.json({ data: event, meta: { requestId: "req_events_create" } }, { status: 201 });
}),
```

Y sustituye el handler `PATCH /events/:id` completo por:

```ts
http.patch(`${BASE}/events/:id`, async ({ request, params }) => {
  const user = requireUser(request);
  if (!user) return unauthenticated("req_events_patch");
  const event = db.events.find((e) => e.id === params.id);
  if (!event || !canAccessEvent(event, user)) return notFound("req_events_patch");
  const body = (await request.json()) as EventFieldsBody;
  const { city, venueName, date, time, ...eventFields } = body;
  if (venueName && city) {
    eventFields.venueId = findOrCreateVenue(user, venueName, city).id;
  }
  Object.assign(event, eventFields);

  if (!event.hasSubEvents && date && time) {
    const firstSubEvent = db.subEvents
      .filter((s) => s.eventId === event.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (firstSubEvent) {
      const startsAt = combineDateTime(date, time);
      firstSubEvent.startsAt = startsAt;
      firstSubEvent.endsAt = addMinutesToIso(startsAt, 180);
    }
  }

  return HttpResponse.json({ data: event, meta: { requestId: "req_events_patch" } });
}),
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/events.test.ts`
Expected: PASS

- [ ] **Step 5: Ejecutar la suite completa del mock y el type-check**

Run: `pnpm --filter panel test -- --run src/mocks && pnpm --filter panel exec tsc --noEmit`
Expected: PASS

---

### Task 5: Simplificar `wizardStore` (sin navegación por pasos)

**Files:**
- Modify: `apps/panel/src/features/events/wizard/wizardStore.ts`
- Test: `apps/panel/src/features/events/wizard/wizardStore.test.ts`

**Interfaces:**
- Produces: `useWizardStore(): { eventId: string | null; setEventId(id: string): void; reset(): void }` — consumido por `EventWizardPage` (Task 10).

- [ ] **Step 1: Escribir el test que falla**

Sustituye el contenido de `apps/panel/src/features/events/wizard/wizardStore.test.ts` por:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useWizardStore } from "./wizardStore";

describe("useWizardStore", () => {
  beforeEach(() => useWizardStore.setState({ eventId: null }));

  it("setEventId stores the id", () => {
    useWizardStore.getState().setEventId("event-1");
    expect(useWizardStore.getState().eventId).toBe("event-1");
  });

  it("reset clears eventId", () => {
    useWizardStore.setState({ eventId: "event-1" });
    useWizardStore.getState().reset();
    expect(useWizardStore.getState().eventId).toBeNull();
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/wizardStore.test.ts`
Expected: FAIL — `currentStep` sigue existiendo, el store no coincide con el test nuevo (o compila mal si `setState({ eventId: null })` ya no incluye `currentStep` requerido).

- [ ] **Step 3: Simplificar el store**

Sustituye `apps/panel/src/features/events/wizard/wizardStore.ts` por:

```ts
import { create } from "zustand";

interface WizardState {
  eventId: string | null;
  setEventId: (id: string) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  eventId: null,
  setEventId: (id) => set({ eventId: id }),
  reset: () => set({ eventId: null })
}));
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/wizardStore.test.ts`
Expected: PASS

---

### Task 6: Ampliar `step1Schema` y `Step1BasicInfo` con los campos de la referencia

**Files:**
- Modify: `apps/panel/src/features/events/wizard/steps/step1Schema.ts`
- Modify: `apps/panel/src/features/events/wizard/steps/Step1BasicInfo.tsx`
- Test: `apps/panel/src/features/events/wizard/steps/Step1BasicInfo.test.tsx`

**Interfaces:**
- Consumes: `useVenuesQuery` (Task 3), `useSubEventsQuery` (existente), `POST /events` / `PATCH /events/:id` ampliados (Task 4).
- Produces: `Step1BasicInfoProps = { eventId: string | null; onSaved: (id: string) => void }` (sin `goNext`) — consumido por `EventWizardPage` (Task 10).

- [ ] **Step 1: Escribir los tests que fallan**

Sustituye `apps/panel/src/features/events/wizard/steps/Step1BasicInfo.test.tsx` por:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step1BasicInfo, type Step1BasicInfoProps } from "./Step1BasicInfo";

function renderStep1(props: Step1BasicInfoProps) {
  const queryClient = new QueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Step1BasicInfo {...props} />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Concierto de prueba" } });
  fireEvent.change(screen.getByLabelText("Descripción"), { target: { value: "Una descripción válida" } });
  fireEvent.change(screen.getByLabelText("Ciudad"), { target: { value: "Madrid" } });
  fireEvent.change(screen.getByLabelText("Recinto"), { target: { value: "Sala Apolo" } });
  fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-12-10" } });
  fireEvent.change(screen.getByLabelText("Hora"), { target: { value: "21:00" } });
}

describe("Step1BasicInfo", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a validation error when the title is too short", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("al menos 3 caracteres"));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("creates a draft event on first submit", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.any(String)));
  });

  it("saves city, venue, date, time and the competition flag on the created event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.click(screen.getByLabelText(/Es una competición/));
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.any(String)));
    const created = db.events.find((e) => e.id === onSaved.mock.calls[0]![0])!;
    expect(created.venueId).toBe("venue-1"); // reutiliza "Sala Apolo" / Madrid ya sembrado
    expect(created.isCompetition).toBe(true);
    const firstSubEvent = db.subEvents.find((s) => s.eventId === created.id)!;
    expect(firstSubEvent.startsAt).toBe("2026-12-10T21:00:00.000Z");
  });

  it("patches the existing draft when eventId is already set", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const onSaved = vi.fn();
    renderStep1({ eventId: "event-5", onSaved });

    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveValue("Evento sin configurar"));
    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("event-5"));
  });

  it("pre-fills the form from the existing event, its venue and its first sub-event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderStep1({ eventId: "event-3", onSaved: vi.fn() });

    await waitFor(() => expect(screen.getByLabelText("Título")).toHaveValue("La Casa de Bernarda Alba"));
    expect(screen.getByLabelText("Descripción")).toHaveValue("Obra de teatro con funciones semanales.");
    expect(screen.getByLabelText("Ciudad")).toHaveValue("Barcelona");
    expect(screen.getByLabelText("Recinto")).toHaveValue("Teatro Circo");
    expect(screen.getByLabelText("Fecha")).toHaveValue("2026-09-05");
    expect(screen.getByLabelText("Hora")).toHaveValue("20:00");
  });

  it("keeps in-progress edits when the pre-fill fetch resolves after the user has started typing", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    const { queryClient } = renderStep1({ eventId: "event-3", onSaved: vi.fn() });

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Editado antes de que cargue" } });

    await waitFor(() => {
      expect(queryClient.getQueryState(["event", "event-3"])?.status).toBe("success");
    });

    expect(screen.getByLabelText("Título")).toHaveValue("Editado antes de que cargue");
  });

  it("shows an alert and does not call onSaved when saving fails", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    server.use(
      http.post("http://localhost:4000/api/v1/events", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudo guardar el evento", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    const onSaved = vi.fn();
    renderStep1({ eventId: null, onSaved });

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar el evento"));
    expect(onSaved).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/Step1BasicInfo.test.tsx`
Expected: FAIL — los campos "Ciudad"/"Recinto"/"Fecha"/"Hora" y el checkbox de competición no existen todavía.

- [ ] **Step 3: Ampliar `step1Schema`**

Sustituye `apps/panel/src/features/events/wizard/steps/step1Schema.ts` por:

```ts
import { z } from "zod";

export const step1Schema = z.object({
  title: z.string().min(3, "El título debe tener al menos 3 caracteres"),
  category: z.string().min(1, "La categoría es obligatoria"),
  city: z.string().min(1, "La ciudad es obligatoria"),
  venueName: z.string().min(1, "El recinto es obligatorio"),
  date: z.string().min(1, "La fecha es obligatoria"),
  time: z.string().min(1, "La hora es obligatoria"),
  description: z.string().min(1, "La descripción es obligatoria"),
  isCompetition: z.boolean(),
  hasSubEvents: z.boolean()
});

export type Step1FormValues = z.infer<typeof step1Schema>;
```

- [ ] **Step 4: Ampliar `Step1BasicInfo`**

Sustituye `apps/panel/src/features/events/wizard/steps/Step1BasicInfo.tsx` por:

```tsx
import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { Button } from "@/shared/ui/button";
import { step1Schema, type Step1FormValues } from "./step1Schema";
import { useVenuesQuery } from "./useVenuesQuery";
import { useSubEventsQuery } from "./useSubEventsQuery";

export interface Step1BasicInfoProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}

export function Step1BasicInfo({ eventId, onSaved }: Step1BasicInfoProps) {
  const token = useSessionStore((s) => s.token);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { data: existingEvent, isError: hasLoadError } = useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
  const { data: venues = [] } = useVenuesQuery();
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty }
  } = useForm<Step1FormValues>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      title: "", category: "concierto", city: "", venueName: "", date: "", time: "",
      description: "", isCompetition: false, hasSubEvents: false
    }
  });

  // Resuming an existing draft (fresh wizard mount after a refresh, or the
  // event detail page reusing this component) pre-fills from the fetched event —
  // but only while the user hasn't started editing yet, so a fetch that resolves
  // after the user has already typed something doesn't clobber their edits (and,
  // on submit, doesn't silently overwrite real server data with untouched defaults).
  useEffect(() => {
    if (existingEvent && !isDirty) {
      const venue = venues.find((v) => v.id === existingEvent.venueId);
      const firstSubEvent = [...subEvents].sort((a, b) => a.sortOrder - b.sortOrder)[0];
      reset({
        title: existingEvent.title,
        category: existingEvent.category,
        city: venue?.city ?? "",
        venueName: venue?.name ?? "",
        date: firstSubEvent ? firstSubEvent.startsAt.slice(0, 10) : "",
        time: firstSubEvent ? firstSubEvent.startsAt.slice(11, 16) : "",
        description: existingEvent.description,
        isCompetition: existingEvent.isCompetition,
        hasSubEvents: existingEvent.hasSubEvents
      });
    }
  }, [existingEvent, venues, subEvents, isDirty, reset]);

  async function onSubmit(values: Step1FormValues) {
    setSaveError(null);
    try {
      const event = eventId
        ? await apiClient.patch<Event>(`/events/${eventId}`, values, { token: token! })
        : await apiClient.post<Event>("/events", values, { token: token! });
      onSaved(event.id);
    } catch (error) {
      setSaveError(error instanceof AppError ? error.message : "No se pudo guardar el evento");
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <label htmlFor="title">Título</label>
      <input id="title" {...register("title")} />
      {errors.title && <span role="alert">{errors.title.message}</span>}

      <label htmlFor="category">Categoría</label>
      <select id="category" {...register("category")}>
        <option value="concierto">Concierto</option>
        <option value="teatro">Teatro</option>
        <option value="festival">Festival</option>
        <option value="deporte">Deporte</option>
        <option value="conferencia">Conferencia</option>
      </select>

      <label htmlFor="city">Ciudad</label>
      <input id="city" {...register("city")} />
      {errors.city && <span role="alert">{errors.city.message}</span>}

      <label htmlFor="venueName">Recinto</label>
      <input id="venueName" {...register("venueName")} />
      {errors.venueName && <span role="alert">{errors.venueName.message}</span>}

      <label htmlFor="date">Fecha</label>
      <input id="date" type="date" {...register("date")} />
      {errors.date && <span role="alert">{errors.date.message}</span>}

      <label htmlFor="time">Hora</label>
      <input id="time" type="time" {...register("time")} />
      {errors.time && <span role="alert">{errors.time.message}</span>}

      <label htmlFor="description">Descripción</label>
      <textarea id="description" {...register("description")} />
      {errors.description && <span role="alert">{errors.description.message}</span>}

      <label className="mt-4 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" {...register("isCompetition")} />
        ¿Es una competición? (partido o evento con equipos o participantes)
      </label>

      <label className="mt-2 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" {...register("hasSubEvents")} />
        Este evento tiene varias funciones o fechas
      </label>

      {hasLoadError && <p role="alert">No se pudo cargar el evento.</p>}
      {saveError && <p role="alert">{saveError}</p>}

      <Button type="submit" disabled={isSubmitting} className="mt-6 self-start">
        Guardar y continuar
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/Step1BasicInfo.test.tsx`
Expected: PASS

---

### Task 7: Cantidad y color en `Step3TicketTypes`

**Files:**
- Modify: `apps/panel/src/mocks/handlers/ticketTypes.ts:36-48,58-87` (`CreateTicketTypeBody`, handler `POST /events/:eventId/ticket-types`)
- Modify: `apps/panel/src/features/events/wizard/steps/Step3TicketTypes.tsx`
- Test: `apps/panel/src/mocks/handlers/ticketTypes.test.ts`, `apps/panel/src/features/events/wizard/steps/Step3TicketTypes.test.tsx`

**Interfaces:**
- Consumes: `TicketType.color` (Task 1).
- Produces: `Step4TicketTypesProps = { eventId: string | null; onSaved: (id: string) => void }` (sin `goNext`) — consumido por `EventWizardPage` (Task 10).

- [ ] **Step 1: Escribir el test que falla para el handler del mock**

Añade a `apps/panel/src/mocks/handlers/ticketTypes.test.ts`, reutilizando el `loginAs` y el `baseBody` ya definidos en la parte superior del archivo:

```ts
it("stores the color sent when creating an event-scoped ticket type", async () => {
  const token = await loginAs("admin@entraditas.com");
  const created = await apiClient.post<TicketType[]>(
    "/events/event-5/ticket-types",
    { ...baseBody, color: "#3b82f6", scope: "event" },
    { token }
  );
  expect(created[0]!.color).toBe("#3b82f6");
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/ticketTypes.test.ts`
Expected: FAIL — `color` no se persiste todavía (el tipo `TicketType` lo requiere pero el handler no lo lee del body).

- [ ] **Step 3: Añadir `color` al handler del mock**

En `apps/panel/src/mocks/handlers/ticketTypes.ts`, añade `color: string | null;` a `CreateTicketTypeBody`:

```ts
interface CreateTicketTypeBody {
  name: string;
  kind: TicketType["kind"];
  basePrice: number;
  currency: string;
  quantityTotal: number | null;
  color: string | null;
  minPerOrder: number;
  maxPerOrder: number;
  visibility: TicketType["visibility"];
  isTransferable: boolean;
  isRefundable: boolean;
  scope: "event" | { subEventIds: string[] };
}
```

Y añade `color: body.color ?? null,` dentro del objeto `shared` del handler `POST /events/:eventId/ticket-types`:

```ts
const shared = {
  groupId,
  eventId: result.event.id,
  capacityPoolId: null,
  name: body.name,
  kind: body.kind,
  basePrice: body.basePrice,
  currency: body.currency,
  quantityTotal: body.quantityTotal,
  color: body.color ?? null,
  quantitySold: 0,
  minPerOrder: body.minPerOrder,
  maxPerOrder: body.maxPerOrder,
  visibility: body.visibility,
  isTransferable: body.isTransferable,
  isRefundable: body.isRefundable,
  sortOrder
};
```

- [ ] **Step 4: Ejecutar el test del handler y comprobar que pasa**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/ticketTypes.test.ts`
Expected: PASS

- [ ] **Step 5: Escribir el test que falla para el componente**

Añade a `apps/panel/src/features/events/wizard/steps/Step3TicketTypes.test.tsx`:

```tsx
it("creates a ticket type with a quantity limit and a color", async () => {
  await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
  renderStep("event-5"); // seeded with zero ticket types
  await waitFor(() => expect(screen.queryAllByRole("listitem")).toHaveLength(0));

  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "VIP" } });
  fireEvent.change(screen.getByLabelText("Precio (€)"), { target: { value: "50.00" } });
  fireEvent.change(screen.getByLabelText("Cantidad"), { target: { value: "20" } });
  fireEvent.click(screen.getByLabelText("#3b82f6"));
  fireEvent.click(screen.getByRole("button", { name: "Crear tipo de entrada" }));

  await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
  const created = db.ticketTypes.find((t) => t.name === "VIP")!;
  expect(created.quantityTotal).toBe(20);
  expect(created.color).toBe("#3b82f6");
});
```

También quita `goNext={() => {}}` de la función `renderStep` en la parte superior del archivo (ya no forma parte de las props):

```tsx
function renderStep(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Step3TicketTypes eventId={eventId} onSaved={() => {}} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 6: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/Step3TicketTypes.test.tsx`
Expected: FAIL — no existe el campo "Cantidad" ni el selector de color; `goNext` ya no está en las props del componente (error de tipos).

- [ ] **Step 7: Ampliar `Step3TicketTypes`**

En `apps/panel/src/features/events/wizard/steps/Step3TicketTypes.tsx`:

Añade el import de `cn` junto a los demás imports:

```ts
import { cn } from "@/shared/lib/cn";
```

Quita `goNext` de `Step4TicketTypesProps` y de la firma de la función:

```ts
export interface Step4TicketTypesProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}
```

```ts
export function Step3TicketTypes({ eventId }: Step4TicketTypesProps) {
```

Añade la constante de colores fija justo antes de `export function Step3TicketTypes`:

```ts
const TICKET_TYPE_COLORS = ["#22c55e", "#3b82f6", "#ef4444", "#a855f7", "#f97316", "#64748b"];
```

Dentro del componente, añade el estado de cantidad y color junto a los demás `useState`:

```ts
const [quantityInput, setQuantityInput] = useState("");
const [color, setColor] = useState<string | null>(null);
```

Actualiza `createTicketType` para enviar ambos campos y resetearlos tras crear:

```ts
async function createTicketType() {
  setError(null);
  try {
    await apiClient.post(
      `/events/${eventId}/ticket-types`,
      {
        name,
        kind: "paid",
        basePrice: Math.round(Number(priceEuros) * 100),
        currency: "EUR",
        quantityTotal: quantityInput === "" ? null : Number(quantityInput),
        color,
        minPerOrder: 1,
        maxPerOrder: 6,
        visibility: "public",
        isTransferable: true,
        isRefundable: true,
        scope: scopeMode === "event" ? "event" : { subEventIds: selectedSubEventIds }
      },
      { token: token! }
    );
    setName("");
    setPriceEuros("0.00");
    setQuantityInput("");
    setColor(null);
    setSelectedSubEventIds([]);
    await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
  } catch (e) {
    if (e instanceof AppError) setError(e.message);
  }
}
```

Añade los campos "Cantidad" y "Color" en el JSX, justo después del bloque del precio y antes del bloque `scopeMode`:

```tsx
<label htmlFor="tt-quantity">Cantidad</label>
<input
  id="tt-quantity"
  type="number"
  min="0"
  inputMode="numeric"
  value={quantityInput}
  onChange={(e) => setQuantityInput(e.target.value)}
  placeholder="Ilimitada"
  className="h-10 w-28 rounded-md border-2 border-foreground bg-surface px-3 text-sm text-foreground"
/>

<fieldset className="mt-3">
  <legend>Color</legend>
  <div role="radiogroup" aria-label="Color" className="flex gap-2">
    {TICKET_TYPE_COLORS.map((hex) => (
      <button
        key={hex}
        type="button"
        role="radio"
        aria-checked={color === hex}
        aria-label={hex}
        onClick={() => setColor(hex)}
        style={{ backgroundColor: hex }}
        className={cn(
          "h-7 w-7 rounded-full border-2",
          color === hex ? "border-foreground ring-2 ring-offset-2 ring-foreground" : "border-transparent"
        )}
      />
    ))}
  </div>
</fieldset>
```

Por último, elimina el botón "Continuar" del final del componente:

```tsx
<Button type="button" onClick={goNext} className="mt-4 self-start">
  Continuar
</Button>
```

- [ ] **Step 8: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/Step3TicketTypes.test.tsx`
Expected: PASS

---

### Task 8: Quitar `goNext` y el botón "Continuar" de `Step2Schedule`, `Step3Capacity` y `Step5Publish`

**Files:**
- Modify: `apps/panel/src/features/events/wizard/steps/Step2Schedule.tsx`
- Modify: `apps/panel/src/features/events/wizard/steps/Step3Capacity.tsx`
- Modify: `apps/panel/src/features/events/wizard/steps/Step5Publish.tsx`
- Test: `apps/panel/src/features/events/wizard/steps/Step2Schedule.test.tsx`, `apps/panel/src/features/events/wizard/steps/Step3Capacity.test.tsx`, `apps/panel/src/features/events/wizard/steps/Step5Publish.test.tsx`

**Interfaces:**
- Produces: `Step2ScheduleProps`, `Step3CapacityProps`, `Step5PublishProps` sin `goNext` — consumidos por `EventWizardPage` (Task 10).

- [ ] **Step 1: Actualizar los tests para dejar de pasar `goNext`**

En `Step2Schedule.test.tsx`, `Step3Capacity.test.tsx` y `Step5Publish.test.tsx`, en cada `renderStep`, quita `goNext={() => {}}` del elemento renderizado. Por ejemplo, en `Step2Schedule.test.tsx`:

```tsx
function renderStep(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <Step2Schedule eventId={eventId} onSaved={() => {}} />
    </QueryClientProvider>
  );
}
```

Y en `Step5Publish.test.tsx`:

```tsx
<Route
  path="/eventos/:id/editar"
  element={<Step5Publish eventId={eventId} onSaved={() => {}} />}
/>
```

Y en `Step3Capacity.test.tsx`, igual que `Step2Schedule.test.tsx` (quita `goNext={() => {}}` de `<Step3Capacity eventId={eventId} onSaved={() => {}} goNext={() => {}} />`).

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/Step2Schedule.test.tsx src/features/events/wizard/steps/Step3Capacity.test.tsx src/features/events/wizard/steps/Step5Publish.test.tsx`
Expected: FAIL — error de tipos, `goNext` sigue siendo obligatorio en las props de los tres componentes.

- [ ] **Step 3: Quitar `goNext` de las tres interfaces de props**

En `Step2Schedule.tsx`:

```ts
export interface Step2ScheduleProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}

export function Step2Schedule({ eventId }: Step2ScheduleProps) {
```

En `Step3Capacity.tsx`:

```ts
export interface Step3CapacityProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}

export function Step3Capacity({ eventId }: Step3CapacityProps) {
```

Y elimina el botón "Continuar" al final de su JSX:

```tsx
<Button type="button" onClick={goNext} className="mt-4 self-start">
  Continuar
</Button>
```

En `Step5Publish.tsx`:

```ts
export interface Step5PublishProps {
  eventId: string | null;
  onSaved: (id: string) => void;
}

export function Step5Publish({ eventId }: Step5PublishProps) {
```

(`Step5Publish` ya no usaba `goNext` en su cuerpo — solo se elimina de la interfaz y de la desestructuración.)

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/Step2Schedule.test.tsx src/features/events/wizard/steps/Step3Capacity.test.tsx src/features/events/wizard/steps/Step5Publish.test.tsx`
Expected: PASS

---

### Task 9: Nuevo componente `SeatingPlanSection`

**Files:**
- Create: `apps/panel/src/features/events/wizard/steps/SeatingPlanSection.tsx`
- Test: `apps/panel/src/features/events/wizard/steps/SeatingPlanSection.test.tsx`

**Interfaces:**
- Consumes: `Event.hasNumberedSeating`/`seatingPlanFileName` (Task 1), `PATCH /events/:id` (existente).
- Produces: `SeatingPlanSection({ eventId: string | null })` — consumido por `EventWizardPage` (Task 10).

- [ ] **Step 1: Escribir el test que falla**

```tsx
// apps/panel/src/features/events/wizard/steps/SeatingPlanSection.test.tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { SeatingPlanSection } from "./SeatingPlanSection";

function renderSection(eventId: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SeatingPlanSection eventId={eventId} />
    </QueryClientProvider>
  );
}

describe("SeatingPlanSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("hides the upload box until the numbered-seating checkbox is checked", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-1");
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
    expect(screen.queryByLabelText("Plano de asientos (PDF)")).not.toBeInTheDocument();
  });

  it("shows the upload box and saves the filename after selecting a PDF", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-1");
    await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());

    fireEvent.click(screen.getByRole("checkbox"));
    await waitFor(() => expect(screen.getByLabelText("Plano de asientos (PDF)")).toBeInTheDocument());

    const file = new File(["contenido"], "plano-sala.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Plano de asientos (PDF)"), { target: { files: [file] } });

    await waitFor(() => expect(screen.getByText("plano-sala.pdf")).toBeInTheDocument());
    expect(db.events.find((e) => e.id === "event-1")!.seatingPlanFileName).toBe("plano-sala.pdf");
  });
});
```

- [ ] **Step 2: Ejecutar el test y comprobar que falla**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/SeatingPlanSection.test.tsx`
Expected: FAIL — el módulo `./SeatingPlanSection` no existe.

- [ ] **Step 3: Crear el componente**

```tsx
// apps/panel/src/features/events/wizard/steps/SeatingPlanSection.tsx
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";

export interface SeatingPlanSectionProps {
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

export function SeatingPlanSection({ eventId }: SeatingPlanSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const [error, setError] = useState<string | null>(null);

  async function updateHasNumberedSeating(hasNumberedSeating: boolean) {
    if (!eventId) return;
    setError(null);
    try {
      await apiClient.patch(`/events/${eventId}`, { hasNumberedSeating }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function handleFileSelected(file: File | undefined) {
    if (!eventId || !file) return;
    setError(null);
    try {
      await apiClient.patch(`/events/${eventId}`, { seatingPlanFileName: file.name }, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["event", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={event?.hasNumberedSeating ?? false}
          disabled={!eventId}
          onChange={(e) => updateHasNumberedSeating(e.target.checked)}
        />
        ¿Este evento tiene asientos o gradas numeradas? (teatro, cine, pabellón...)
      </label>

      {event?.hasNumberedSeating && (
        <div className="rounded-md border-2 border-dashed border-border bg-surface-alt p-4 text-sm text-muted-foreground">
          <label htmlFor="seating-plan-file" className="font-semibold text-foreground">
            Plano de asientos (PDF)
          </label>
          <p className="mt-1">
            Sube tu plano de asientos en formato PDF con las localidades marcadas. Si no cuentas con él, contacta
            con nosotros.
          </p>
          <input
            id="seating-plan-file"
            type="file"
            accept="application/pdf"
            className="mt-2"
            onChange={(e) => handleFileSelected(e.target.files?.[0])}
          />
          {event.seatingPlanFileName && (
            <p className="mt-2 font-semibold text-foreground">{event.seatingPlanFileName}</p>
          )}
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar el test y comprobar que pasa**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/SeatingPlanSection.test.tsx`
Expected: PASS

---

### Task 10: Reescribir `EventWizardPage` como página única con secciones apiladas

**Files:**
- Modify: `apps/panel/src/app/router.tsx` (sin cambios de rutas, pero revisa que sigan apuntando a `EventWizardPage`)
- Modify: `apps/panel/src/features/events/wizard/EventWizardPage.tsx`
- Test: `apps/panel/src/features/events/wizard/EventWizardPage.test.tsx`

**Interfaces:**
- Consumes: `useWizardStore` (Task 5), `Step1BasicInfo`/`Step2Schedule`/`Step3Capacity`/`Step3TicketTypes`/`Step5Publish` (Tasks 6-8), `SeatingPlanSection` (Task 9).

- [ ] **Step 1: Escribir los tests que fallan**

Sustituye `apps/panel/src/features/events/wizard/EventWizardPage.test.tsx` por:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { useWizardStore } from "./wizardStore";
import { EventWizardPage } from "./EventWizardPage";

function renderAt(path: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/eventos/:id/editar" element={<EventWizardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EventWizardPage", () => {
  beforeEach(() => useWizardStore.setState({ eventId: null }));
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("resets to no eventId for a new event and only shows the sections that don't need one", () => {
    renderAt("/eventos/nuevo/editar");
    expect(screen.getByTestId("wizard-event-id")).toHaveTextContent("sin-id");
    expect(screen.getByRole("region", { name: "Información del evento" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Plano de asientos" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Tipos de entrada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Publicar evento" })).not.toBeInTheDocument();
  });

  it("sets the eventId from the URL and reveals the ticket-types and publish sections for an existing draft", async () => {
    renderAt("/eventos/event-5/editar");
    expect(screen.getByTestId("wizard-event-id")).toHaveTextContent("event-5");
    await waitFor(() => expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument());
    expect(screen.getByRole("region", { name: "Publicar evento" })).toBeInTheDocument();
  });

  it("reveals the zoned-capacity section only after checking its toggle", async () => {
    renderAt("/eventos/event-1/editar");
    await waitFor(() => expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument());
    expect(screen.queryByLabelText("Aforos")).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("¿Este evento tiene aforo dividido por zonas?"));

    await waitFor(() => expect(screen.getByLabelText("Aforos")).toBeInTheDocument());
  });

  it("shows the multiple-functions section for an event with hasSubEvents set", async () => {
    renderAt("/eventos/event-3/editar"); // seeded with hasSubEvents: true
    await waitFor(() => expect(screen.getByRole("region", { name: "Varias funciones" })).toBeInTheDocument());
  });

  it("hides the multiple-functions section for a single-function event", async () => {
    renderAt("/eventos/event-1/editar"); // seeded with hasSubEvents: false
    await waitFor(() => expect(screen.getByRole("region", { name: "Tipos de entrada" })).toBeInTheDocument());
    expect(screen.queryByRole("region", { name: "Varias funciones" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/EventWizardPage.test.tsx`
Expected: FAIL — la página sigue mostrando el stepper de pestañas y los nombres de región antiguos ("Datos básicos", "Aforo y zonas", etc.).

- [ ] **Step 3: Reescribir `EventWizardPage`**

```tsx
// apps/panel/src/features/events/wizard/EventWizardPage.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { useWizardStore } from "./wizardStore";
import { Step1BasicInfo } from "./steps/Step1BasicInfo";
import { Step2Schedule } from "./steps/Step2Schedule";
import { Step3Capacity } from "./steps/Step3Capacity";
import { Step3TicketTypes } from "./steps/Step3TicketTypes";
import { Step5Publish } from "./steps/Step5Publish";
import { SeatingPlanSection } from "./steps/SeatingPlanSection";

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

const SECTION_CLASS = "rounded-lg border-2 border-foreground bg-surface p-6 shadow-flat";

export function EventWizardPage() {
  const params = useParams<{ id?: string }>();
  const eventId = useWizardStore((s) => s.eventId);
  const setEventId = useWizardStore((s) => s.setEventId);
  const reset = useWizardStore((s) => s.reset);
  const { data: event } = useEventQuery(eventId);
  const [showZonedCapacity, setShowZonedCapacity] = useState(false);

  useEffect(() => {
    if (params.id && params.id !== "nuevo") setEventId(params.id);
    else reset();
  }, [params.id, setEventId, reset]);

  return (
    <div className="flex flex-col gap-6">
      <p data-testid="wizard-event-id" className="hidden">
        {eventId ?? "sin-id"}
      </p>

      <section aria-label="Información del evento" className={SECTION_CLASS}>
        <h2 className="mb-4 font-display text-lg font-semibold">Información del evento</h2>
        <Step1BasicInfo eventId={eventId} onSaved={setEventId} />
      </section>

      {event?.hasSubEvents && (
        <section aria-label="Varias funciones" className={SECTION_CLASS}>
          <h2 className="mb-4 font-display text-lg font-semibold">Varias funciones</h2>
          <Step2Schedule eventId={eventId} onSaved={setEventId} />
        </section>
      )}

      {eventId && (
        <section aria-label="Tipos de entrada" className={SECTION_CLASS}>
          <h2 className="mb-4 font-display text-lg font-semibold">Tipos de entrada</h2>
          <Step3TicketTypes eventId={eventId} onSaved={setEventId} />
        </section>
      )}

      {eventId && (
        <section aria-label="Aforo por zonas" className={SECTION_CLASS}>
          <label className="mb-4 flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={showZonedCapacity}
              onChange={(e) => setShowZonedCapacity(e.target.checked)}
            />
            ¿Este evento tiene aforo dividido por zonas?
          </label>
          {showZonedCapacity && <Step3Capacity eventId={eventId} onSaved={setEventId} />}
        </section>
      )}

      <section aria-label="Plano de asientos" className={SECTION_CLASS}>
        <h2 className="mb-4 font-display text-lg font-semibold">Plano de asientos</h2>
        <SeatingPlanSection eventId={eventId} />
      </section>

      {eventId && (
        <section aria-label="Publicar evento" className={SECTION_CLASS}>
          <Step5Publish eventId={eventId} onSaved={setEventId} />
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/EventWizardPage.test.tsx`
Expected: PASS

- [ ] **Step 5: Ejecutar la suite completa y el type-check**

Run: `pnpm --filter panel test -- --run && pnpm --filter panel exec tsc --noEmit`
Expected: PASS — todos los tests del proyecto en verde, sin errores de tipos.

---

## Verificación final

- [ ] Ejecutar `pnpm --filter panel test -- --run` y confirmar que el número total de tests pasa (sin regresiones respecto a los ~185 anteriores, más los nuevos de este plan).
- [ ] Ejecutar `pnpm --filter panel exec tsc --noEmit` y confirmar que no hay errores.
- [ ] Ejecutar `pnpm --filter @entraditas/types test -- --run` y confirmar que pasa.
