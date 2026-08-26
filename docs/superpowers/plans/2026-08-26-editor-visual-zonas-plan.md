# Editor visual de zonas del plano — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nota del proyecto:** no se ejecutan comandos `git` como parte de este plan — el usuario gestiona el control de versiones por su cuenta. Cada tarea termina en cuanto sus tests pasan.

**Goal:** Sustituir "Aforo por zonas" y "Plano de asientos" (checkbox + PDF) por un único editor visual de zonas arrastrables/redimensionables, ligado al recinto y reutilizable entre eventos.

**Architecture:** `Zone` gana posición/tamaño/tipo y pasa a ser la plantilla reutilizable del recinto. La sección "Plano de asientos" sincroniza automáticamente un `CapacityPool` por zona vendible contra la primera función del evento, sin paso manual de activación. El lienzo usa `div`s posicionados en % con eventos de puntero propios (sin librería nueva); el panel lateral con inputs numéricos es la vía alternativa, más fácil de testear.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query, zod, MSW, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-26-editor-visual-zonas-design.md`

## Global Constraints

- Sin dependencias nuevas — el arrastre/redimensionado se implementa con eventos de puntero nativos.
- Las zonas vendibles (`numbered`, `standing`) llevan aforo agregado únicamente — no hay asientos individuales.
- `stage` y `accessible` son marcadores visuales sin aforo ni tipo de entrada asignado.
- La activación de zonas solo opera sobre la primera función del evento (`subEvents[0]`), igual que hacía `Step3Capacity`.
- Todo el texto de la interfaz en español, siguiendo el tono ya usado en el resto del panel.

---

### Task 1: Esquemas — ampliar `Zone`, retirar campos de `Event`

**Files:**
- Modify: `packages/types/src/schemas.ts:35-50` (`VenueSchema`/`ZoneSchema`), `packages/types/src/schemas.ts:52-71` (`EventSchema`)
- Test: `packages/types/src/schemas.test.ts`

**Interfaces:**
- Produces: `Zone.kind: "numbered" | "standing" | "stage" | "accessible"`, `Zone.x/y/width/height: number`, `Zone.capacity: number` (ahora `.nonnegative()`) — usados por todas las tareas siguientes. `Event` deja de tener `hasNumberedSeating`/`seatingPlanFileName`.

- [ ] **Step 1: Escribir los tests que fallan**

En `packages/types/src/schemas.test.ts`, quita `hasNumberedSeating: false, hasNumberedSeating` y `seatingPlanFileName: null` de `validEvent` (deja el resto igual), y añade:

```ts
describe("ZoneSchema", () => {
  it("accepts a sellable zone with position and capacity", () => {
    const zone = ZoneSchema.parse({
      id: "zone-1", venueId: "venue-1", name: "Pista", kind: "standing",
      capacity: 500, x: 5, y: 20, width: 40, height: 30
    });
    expect(zone.kind).toBe("standing");
  });

  it("accepts a stage marker with zero capacity", () => {
    expect(() =>
      ZoneSchema.parse({
        id: "zone-2", venueId: "venue-1", name: "Escenario", kind: "stage",
        capacity: 0, x: 20, y: 2, width: 60, height: 12
      })
    ).not.toThrow();
  });

  it("rejects an unknown zone kind", () => {
    expect(() =>
      ZoneSchema.parse({
        id: "zone-3", venueId: "venue-1", name: "X", kind: "bogus",
        capacity: 0, x: 0, y: 0, width: 10, height: 10
      })
    ).toThrow();
  });
});
```

Añade `ZoneSchema` a los imports en la cabecera del archivo (`import { EventSchema, TicketTypeSchema, UserSchema, ZoneSchema } from "./schemas";`).

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter @entraditas/types test -- --run`
Expected: FAIL — `ZoneSchema` no exporta `kind`/`x`/`y`/`width`/`height` todavía.

- [ ] **Step 3: Ampliar los esquemas**

En `packages/types/src/schemas.ts`, sustituye `ZoneSchema` por:

```ts
export const ZoneSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  kind: z.enum(["numbered", "standing", "stage", "accessible"]),
  capacity: z.number().int().nonnegative(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100)
});
export type Zone = z.infer<typeof ZoneSchema>;
```

Y quita `isCompetition: z.boolean(),` — no, esa se queda. Quita únicamente estas dos líneas de `EventSchema`:

```ts
  hasNumberedSeating: z.boolean(),
  seatingPlanFileName: z.string().nullable(),
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter @entraditas/types test -- --run`
Expected: PASS

---

### Task 2: Datos sembrados y limpieza del handler de eventos

**Files:**
- Modify: `apps/panel/src/mocks/db.ts` (todas las apariciones de `hasNumberedSeating`/`seatingPlanFileName`; `zonePista`/`zoneGrada`)
- Modify: `apps/panel/src/mocks/handlers/events.ts` (constructor de `Event` en `POST /events`)

**Interfaces:**
- Consumes: `Zone`/`Event` de Task 1.

- [ ] **Step 1: Confirmar que el type-check falla**

Run: `pnpm --filter panel exec tsc --noEmit`
Expected: FAIL — `zonePista`/`zoneGrada` no tienen `kind`/`x`/`y`/`width`/`height`; los 5 eventos sembrados y el constructor de `POST /events` siguen asignando `hasNumberedSeating`/`seatingPlanFileName`, que ya no existen en el tipo `Event`.

- [ ] **Step 2: Actualizar las zonas sembradas**

En `apps/panel/src/mocks/db.ts`, sustituye:

```ts
  const zonePista: Zone = { id: "zone-pista", venueId: venue1.id, name: "Pista", capacity: 800 };
  const zoneGrada: Zone = { id: "zone-grada", venueId: venue1.id, name: "Grada", capacity: 400 };
```

por:

```ts
  const zonePista: Zone = {
    id: "zone-pista", venueId: venue1.id, name: "Pista", kind: "standing", capacity: 800,
    x: 5, y: 20, width: 40, height: 60
  };
  const zoneGrada: Zone = {
    id: "zone-grada", venueId: venue1.id, name: "Grada", kind: "standing", capacity: 400,
    x: 55, y: 20, width: 40, height: 60
  };
```

- [ ] **Step 3: Quitar `hasNumberedSeating`/`seatingPlanFileName` de los 5 eventos sembrados**

Para cada uno de `event1`..`event5` en `apps/panel/src/mocks/db.ts`, quita `isCompetition: false, hasNumberedSeating: false, seatingPlanFileName: null,` y sustitúyelo por `isCompetition: false,`. Por ejemplo, para `event1`:

```ts
    hasSubEvents: false, isCompetition: false,
    createdAt: "2026-07-01T00:00:00.000Z", publishedAt: "2026-07-05T00:00:00.000Z"
```

Aplica el mismo cambio (quitar `hasNumberedSeating: false, seatingPlanFileName: null,` dejando solo `isCompetition: false,`) en `event2`, `event3`, `event4` y `event5`.

- [ ] **Step 4: Quitar los campos del constructor de `POST /events`**

En `apps/panel/src/mocks/handlers/events.ts`, dentro del handler `POST /events`, quita estas dos líneas del objeto `event`:

```ts
      hasNumberedSeating: false,
      seatingPlanFileName: null,
```

- [ ] **Step 5: Ejecutar los tests del mock afectados**

Run: `pnpm --filter panel test -- --run src/mocks/db.test.ts src/mocks/handlers/events.test.ts`
Expected: PASS

El type-check global (`tsc --noEmit`) seguirá en rojo hasta terminar las tareas siguientes — `Step3Capacity.tsx`, `SeatingPlanSection.tsx` y `venues.ts` todavía no se han actualizado. No lo vuelvas a ejecutar en este paso; se retoma en la Task 5.

---

### Task 3: Geometría de zonas — funciones puras

**Files:**
- Create: `apps/panel/src/features/events/wizard/steps/zoneGeometry.ts`
- Test: `apps/panel/src/features/events/wizard/steps/zoneGeometry.test.ts`

**Interfaces:**
- Produces: `ZoneLayout { x, y, width, height }`, `defaultZoneLayout(kind, existingZones): ZoneLayout`, `clampPercent(value, min?, max?): number`, `computeDragPosition(zone, deltaXPercent, deltaYPercent): {x,y}`, `computeResizeSize(zone, deltaWidthPercent, deltaHeightPercent): {width,height}` — consumidos por `ZoneCanvas.tsx` y `SeatingPlanSection.tsx` (Task 5).

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// apps/panel/src/features/events/wizard/steps/zoneGeometry.test.ts
import { describe, expect, it } from "vitest";
import type { Zone } from "@entraditas/types";
import { clampPercent, computeDragPosition, computeResizeSize, defaultZoneLayout } from "./zoneGeometry";

describe("clampPercent", () => {
  it("clamps within the given range", () => {
    expect(clampPercent(150, 0, 100)).toBe(100);
    expect(clampPercent(-10, 0, 100)).toBe(0);
    expect(clampPercent(50, 0, 100)).toBe(50);
  });
});

describe("computeDragPosition", () => {
  it("moves by the given delta", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    expect(computeDragPosition(zone, 5, -5)).toEqual({ x: 15, y: 5 });
  });

  it("clamps so the zone never leaves the canvas", () => {
    const zone = { x: 90, y: 90, width: 20, height: 20 };
    expect(computeDragPosition(zone, 50, 50)).toEqual({ x: 80, y: 80 });
  });
});

describe("computeResizeSize", () => {
  it("resizes by the given delta", () => {
    const zone = { x: 10, y: 10, width: 20, height: 20 };
    expect(computeResizeSize(zone, 10, -5)).toEqual({ width: 30, height: 15 });
  });

  it("never shrinks below 1% or grows past the canvas edge", () => {
    const zone = { x: 90, y: 90, width: 20, height: 20 };
    expect(computeResizeSize(zone, 50, 50)).toEqual({ width: 10, height: 10 });
    expect(computeResizeSize(zone, -50, -50)).toEqual({ width: 1, height: 1 });
  });
});

describe("defaultZoneLayout", () => {
  it("places a stage at a fixed top position", () => {
    expect(defaultZoneLayout("stage", [])).toEqual({ x: 20, y: 2, width: 60, height: 12 });
  });

  it("places an accessible marker at a fixed bottom-left position", () => {
    expect(defaultZoneLayout("accessible", [])).toEqual({ x: 2, y: 86, width: 14, height: 12 });
  });

  it("staggers sellable zones across a 3-column grid", () => {
    const existing: Zone[] = [
      { id: "z1", venueId: "v1", name: "A", kind: "standing", capacity: 0, x: 0, y: 0, width: 1, height: 1 },
      { id: "z2", venueId: "v1", name: "B", kind: "numbered", capacity: 0, x: 0, y: 0, width: 1, height: 1 },
      { id: "z3", venueId: "v1", name: "C", kind: "stage", capacity: 0, x: 0, y: 0, width: 1, height: 1 }
    ];
    // 2 sellable zones already placed (the stage doesn't count) -> next goes to column index 2
    expect(defaultZoneLayout("standing", existing)).toEqual({ x: 57, y: 20, width: 22, height: 18 });
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/zoneGeometry.test.ts`
Expected: FAIL — el módulo `./zoneGeometry` no existe.

- [ ] **Step 3: Implementar las funciones**

```ts
// apps/panel/src/features/events/wizard/steps/zoneGeometry.ts
import type { Zone } from "@entraditas/types";

export interface ZoneLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STAGE_LAYOUT: ZoneLayout = { x: 20, y: 2, width: 60, height: 12 };
const ACCESSIBLE_LAYOUT: ZoneLayout = { x: 2, y: 86, width: 14, height: 12 };
const SELLABLE_GRID_COLUMNS = 3;
const SELLABLE_CELL_WIDTH = 26;
const SELLABLE_CELL_HEIGHT = 22;
const SELLABLE_GRID_START_Y = 20;
const SELLABLE_GRID_GAP = 4;

export function clampPercent(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultZoneLayout(kind: Zone["kind"], existingZones: Zone[]): ZoneLayout {
  if (kind === "stage") return STAGE_LAYOUT;
  if (kind === "accessible") return ACCESSIBLE_LAYOUT;
  const sellableCount = existingZones.filter((z) => z.kind === "numbered" || z.kind === "standing").length;
  const column = sellableCount % SELLABLE_GRID_COLUMNS;
  const row = Math.floor(sellableCount / SELLABLE_GRID_COLUMNS);
  return {
    x: 5 + column * SELLABLE_CELL_WIDTH,
    y: SELLABLE_GRID_START_Y + row * (SELLABLE_CELL_HEIGHT + SELLABLE_GRID_GAP),
    width: SELLABLE_CELL_WIDTH - 4,
    height: SELLABLE_CELL_HEIGHT - 4
  };
}

export function computeDragPosition(
  zone: ZoneLayout,
  deltaXPercent: number,
  deltaYPercent: number
): { x: number; y: number } {
  return {
    x: clampPercent(zone.x + deltaXPercent, 0, 100 - zone.width),
    y: clampPercent(zone.y + deltaYPercent, 0, 100 - zone.height)
  };
}

export function computeResizeSize(
  zone: ZoneLayout,
  deltaWidthPercent: number,
  deltaHeightPercent: number
): { width: number; height: number } {
  return {
    width: clampPercent(zone.width + deltaWidthPercent, 1, 100 - zone.x),
    height: clampPercent(zone.height + deltaHeightPercent, 1, 100 - zone.y)
  };
}
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/zoneGeometry.test.ts`
Expected: PASS

---

### Task 4: Endpoints de zonas en el mock — crear, editar, eliminar

**Files:**
- Modify: `apps/panel/src/mocks/handlers/venues.ts`
- Test: `apps/panel/src/mocks/handlers/venues.test.ts`

**Interfaces:**
- Consumes: `Zone` (Task 1).
- Produces: `POST /venues/:venueId/zones` ampliado con `kind`/`x`/`y`/`width`/`height` (con valores por defecto); `PATCH /zones/:id` (nuevo); `DELETE /zones/:id` (nuevo) — consumidos por `SeatingPlanSection.tsx` (Task 5).

- [ ] **Step 1: Escribir los tests que fallan**

Sustituye `apps/panel/src/mocks/handlers/venues.test.ts` por:

```ts
import { afterEach, describe, expect, it } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb } from "@/mocks/state";
import type { Venue, Zone } from "@entraditas/types";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", { email, password: "demo1234" });
  return result.accessToken;
}

describe("venues handlers", () => {
  afterEach(() => resetDb());

  it("lists only the caller's organization venues", async () => {
    const token = await loginAs("admin@entraditas.com");
    const venues = await apiClient.get<Venue[]>("/venues", { token });
    expect(venues.every((v) => v.organizationId === "org-1")).toBe(true);
    expect(venues.length).toBeGreaterThan(0);
  });

  it("creates a venue and lists the zones of an existing one", async () => {
    const token = await loginAs("admin@entraditas.com");
    const zones = await apiClient.get<Zone[]>("/venues/venue-1/zones", { token });
    expect(zones.length).toBeGreaterThanOrEqual(2);

    const created = await apiClient.post<Zone>(
      "/venues/venue-1/zones",
      { name: "Palco", kind: "numbered", capacity: 50, x: 10, y: 10, width: 15, height: 15 },
      { token }
    );
    expect(created).toMatchObject({ name: "Palco", kind: "numbered", capacity: 50 });
  });

  it("defaults kind and position when creating a zone without them", async () => {
    const token = await loginAs("admin@entraditas.com");
    const created = await apiClient.post<Zone>("/venues/venue-1/zones", { name: "Sin posición", capacity: 0 }, { token });
    expect(created).toMatchObject({ kind: "standing", x: 0, y: 0, width: 20, height: 20 });
  });

  it("updates a zone's position and capacity via PATCH", async () => {
    const token = await loginAs("admin@entraditas.com");
    const updated = await apiClient.patch<Zone>("/zones/zone-pista", { x: 30, capacity: 900 }, { token });
    expect(updated).toMatchObject({ x: 30, capacity: 900 });
  });

  it("blocks lowering a zone's capacity below its sold count via PATCH", async () => {
    const token = await loginAs("admin@entraditas.com");
    db.capacityPools.find((p) => p.id === "pool-2-pista")!.soldCount = 50;
    await expect(apiClient.patch("/zones/zone-pista", { capacity: 10 }, { token })).rejects.toMatchObject({
      code: "INSUFFICIENT_CAPACITY"
    });
  });

  it("blocks deleting a zone with sales, allows it once soldCount is 0", async () => {
    const token = await loginAs("admin@entraditas.com");
    db.capacityPools.find((p) => p.id === "pool-2-grada")!.soldCount = 10;
    await expect(apiClient.delete("/zones/zone-grada", { token })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    db.capacityPools.find((p) => p.id === "pool-2-grada")!.soldCount = 0;
    await apiClient.delete("/zones/zone-grada", { token });
    expect(db.zones.some((z) => z.id === "zone-grada")).toBe(false);
    expect(db.capacityPools.some((p) => p.id === "pool-2-grada")).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/venues.test.ts`
Expected: FAIL — `PATCH /zones/:id` y `DELETE /zones/:id` no existen; `POST /venues/:venueId/zones` no acepta `kind`/posición todavía.

- [ ] **Step 3: Implementar los endpoints**

Sustituye `apps/panel/src/mocks/handlers/venues.ts` por:

```ts
import { http, HttpResponse } from "msw";
import type { User, Venue, Zone } from "@entraditas/types";
import { db } from "../state";
import { getSessionUserId } from "../authContext";

const BASE = "http://localhost:4000/api/v1";

function unauthenticated(requestId: string) {
  return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId } }, { status: 401 });
}

function notFound(requestId: string) {
  return HttpResponse.json({ error: { code: "NOT_FOUND", message: "Recurso no encontrado", requestId } }, { status: 404 });
}

function requireUser(request: Request) {
  const userId = getSessionUserId(request);
  return userId ? db.users.find((u) => u.id === userId) ?? null : null;
}

function canAccessVenue(venue: Venue, user: User): boolean {
  return user.role === "superadmin" || venue.organizationId === user.organizationId;
}

function requireZone(request: Request, zoneId: string) {
  const user = requireUser(request);
  if (!user) return { error: unauthenticated("req_zones") };
  const zone = db.zones.find((z) => z.id === zoneId);
  const venue = zone ? db.venues.find((v) => v.id === zone.venueId) : null;
  if (!zone || !venue || !canAccessVenue(venue, user)) return { error: notFound("req_zones") };
  return { zone };
}

export const venuesHandlers = [
  http.get(`${BASE}/venues`, ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_venues");
    const venues = user.role === "superadmin" ? db.venues : db.venues.filter((v) => v.organizationId === user.organizationId);
    return HttpResponse.json({ data: venues, meta: { page: 1, perPage: venues.length, total: venues.length, nextCursor: null } });
  }),

  http.post(`${BASE}/venues`, async ({ request }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_venues_create");
    const body = (await request.json()) as Pick<Venue, "name" | "city" | "totalCapacity">;
    const venue: Venue = { id: `venue-${db.venues.length + 1}`, organizationId: user.organizationId!, ...body };
    db.venues.push(venue);
    return HttpResponse.json({ data: venue, meta: { requestId: "req_venues_create" } }, { status: 201 });
  }),

  http.get(`${BASE}/venues/:venueId/zones`, ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_zones");
    const venue = db.venues.find((v) => v.id === params.venueId);
    if (!venue || !canAccessVenue(venue, user)) return notFound("req_zones");
    const zones = db.zones.filter((z) => z.venueId === (params.venueId as string));
    return HttpResponse.json({ data: zones, meta: { page: 1, perPage: zones.length, total: zones.length, nextCursor: null } });
  }),

  http.post(`${BASE}/venues/:venueId/zones`, async ({ request, params }) => {
    const user = requireUser(request);
    if (!user) return unauthenticated("req_zones_create");
    const venue = db.venues.find((v) => v.id === params.venueId);
    if (!venue || !canAccessVenue(venue, user)) return notFound("req_zones_create");
    const body = (await request.json()) as Partial<Pick<Zone, "kind" | "x" | "y" | "width" | "height">> &
      Pick<Zone, "name" | "capacity">;
    const zone: Zone = {
      id: `zone-${db.zones.length + 1}`,
      venueId: params.venueId as string,
      name: body.name,
      capacity: body.capacity,
      kind: body.kind ?? "standing",
      x: body.x ?? 0,
      y: body.y ?? 0,
      width: body.width ?? 20,
      height: body.height ?? 20
    };
    db.zones.push(zone);
    return HttpResponse.json({ data: zone, meta: { requestId: "req_zones_create" } }, { status: 201 });
  }),

  http.patch(`${BASE}/zones/:id`, async ({ request, params }) => {
    const result = requireZone(request, params.id as string);
    if ("error" in result) return result.error;
    const body = (await request.json()) as Partial<Pick<Zone, "name" | "kind" | "capacity" | "x" | "y" | "width" | "height">>;
    if (body.capacity !== undefined) {
      const oversold = db.capacityPools.find((p) => p.zoneId === result.zone.id && p.soldCount > body.capacity!);
      if (oversold) {
        return HttpResponse.json(
          {
            error: {
              code: "INSUFFICIENT_CAPACITY",
              message: `No se puede bajar el aforo por debajo de las ${oversold.soldCount} entradas ya vendidas`,
              requestId: "req_zones_patch"
            }
          },
          { status: 422 }
        );
      }
    }
    Object.assign(result.zone, body);
    return HttpResponse.json({ data: result.zone, meta: { requestId: "req_zones_patch" } });
  }),

  http.delete(`${BASE}/zones/:id`, ({ request, params }) => {
    const result = requireZone(request, params.id as string);
    if ("error" in result) return result.error;
    const pools = db.capacityPools.filter((p) => p.zoneId === result.zone.id);
    if (pools.some((p) => p.soldCount > 0)) {
      return HttpResponse.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "No se puede eliminar una zona con entradas vendidas",
            requestId: "req_zones_delete"
          }
        },
        { status: 409 }
      );
    }
    db.zones = db.zones.filter((z) => z.id !== result.zone.id);
    db.capacityPools = db.capacityPools.filter((p) => p.zoneId !== result.zone.id);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_zones_delete" } });
  })
];
```

- [ ] **Step 4: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/mocks/handlers/venues.test.ts`
Expected: PASS

---

### Task 5: Componentes del editor y reescritura de `SeatingPlanSection`

**Files:**
- Create: `apps/panel/src/features/events/wizard/steps/useZonesQuery.ts`
- Create: `apps/panel/src/features/events/wizard/steps/ZoneCanvas.tsx`
- Create: `apps/panel/src/features/events/wizard/steps/ZoneEditorPanel.tsx`
- Create: `apps/panel/src/features/events/wizard/steps/TicketTypeAssignment.tsx`
- Modify: `apps/panel/src/features/events/wizard/steps/Step3TicketTypes.tsx` (exportar `groupTicketTypes`/`TicketTypeGroup`)
- Modify: `apps/panel/src/features/events/wizard/steps/SeatingPlanSection.tsx` (reescritura completa)
- Test: `apps/panel/src/features/events/wizard/steps/SeatingPlanSection.test.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `zoneGeometry.ts` (Task 3), `POST/PATCH/DELETE /zones`, `POST /venues/:venueId/zones` (Task 4), `GET /sub-events/:id/capacity`, `POST /sub-events/:id/capacity-pools`, `PATCH /capacity-pools/:id`, `PATCH /ticket-types/:id` (ya existen), `useVenuesQuery`/`useSubEventsQuery` (ya existen).
- Produces: `SeatingPlanSectionProps = { eventId: string | null }` (sin cambios) — sigue siendo consumido por `EventWizardPage` (Task 6) y `EventDetailPage` (Task 7).

`ZoneCanvas`, `ZoneEditorPanel` y `TicketTypeAssignment` son presentacionales (reciben datos y callbacks por props, sin llamadas a la API propias) — se verifican íntegramente a través de los tests de integración de `SeatingPlanSection`, igual que `SortableRow` dentro de `Step3TicketTypes` no tiene test propio.

- [ ] **Step 1: Exportar `groupTicketTypes` desde `Step3TicketTypes.tsx`**

En `apps/panel/src/features/events/wizard/steps/Step3TicketTypes.tsx`, añade `export` a la interfaz y a la función:

```ts
export interface TicketTypeGroup {
  groupId: string;
  name: string;
  basePrice: number;
  sortOrder: number;
}

export function groupTicketTypes(ticketTypes: TicketType[]): TicketTypeGroup[] {
```

- [ ] **Step 2: Crear `useZonesQuery`**

```ts
// apps/panel/src/features/events/wizard/steps/useZonesQuery.ts
import { useQuery } from "@tanstack/react-query";
import type { Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export function useZonesQuery(venueId: string | null | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["zones", venueId],
    queryFn: () => apiClient.get<Zone[]>(`/venues/${venueId}/zones`, { token: token! }),
    enabled: Boolean(venueId && token)
  });
}
```

- [ ] **Step 3: Crear `ZoneCanvas.tsx`**

```tsx
// apps/panel/src/features/events/wizard/steps/ZoneCanvas.tsx
import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Zone } from "@entraditas/types";
import { cn } from "@/shared/lib/cn";
import { computeDragPosition, computeResizeSize, type ZoneLayout } from "./zoneGeometry";

export interface ZoneCanvasProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onSelectZone: (id: string) => void;
  onZoneCommitted: (id: string, layout: ZoneLayout) => void;
}

interface DragState {
  zoneId: string;
  startX: number;
  startY: number;
  origin: ZoneLayout;
  mode: "move" | "resize";
}

export function ZoneCanvas({ zones, selectedZoneId, onSelectZone, onZoneCommitted }: ZoneCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [liveLayouts, setLiveLayouts] = useState<Record<string, ZoneLayout>>({});
  const dragRef = useRef<DragState | null>(null);

  function layoutFor(zone: Zone): ZoneLayout {
    return liveLayouts[zone.id] ?? zone;
  }

  function handlePointerDown(zone: Zone, mode: "move" | "resize", e: ReactPointerEvent) {
    e.stopPropagation();
    dragRef.current = { zoneId: zone.id, startX: e.clientX, startY: e.clientY, origin: layoutFor(zone), mode };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current;
    const container = containerRef.current;
    if (!drag || !container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const deltaXPercent = ((e.clientX - drag.startX) / rect.width) * 100;
    const deltaYPercent = ((e.clientY - drag.startY) / rect.height) * 100;
    const next: ZoneLayout =
      drag.mode === "move"
        ? { ...drag.origin, ...computeDragPosition(drag.origin, deltaXPercent, deltaYPercent) }
        : { ...drag.origin, ...computeResizeSize(drag.origin, deltaXPercent, deltaYPercent) };
    setLiveLayouts((prev) => ({ ...prev, [drag.zoneId]: next }));
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const layout = liveLayouts[drag.zoneId];
    if (layout) onZoneCommitted(drag.zoneId, layout);
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative h-96 w-full overflow-hidden rounded-md border-2 border-foreground bg-[#f4ead9]"
    >
      {zones.map((zone) => {
        const layout = layoutFor(zone);
        const selected = zone.id === selectedZoneId;
        const sellable = zone.kind === "numbered" || zone.kind === "standing";
        return (
          <button
            key={zone.id}
            type="button"
            aria-pressed={selected}
            aria-label={zone.name}
            onClick={() => onSelectZone(zone.id)}
            onPointerDown={(e) => handlePointerDown(zone, "move", e)}
            style={{
              left: `${layout.x}%`,
              top: `${layout.y}%`,
              width: `${layout.width}%`,
              height: `${layout.height}%`
            }}
            className={cn(
              "absolute flex flex-col items-center justify-center border-2 p-1 text-xs font-semibold",
              zone.kind === "stage" && "border-foreground bg-foreground text-background",
              zone.kind === "accessible" && "border-dashed border-foreground bg-transparent",
              sellable && "border-foreground bg-surface",
              selected && "ring-2 ring-primary"
            )}
          >
            <span>{zone.name}</span>
            {sellable && <span>{zone.capacity} plazas</span>}
            {selected && (
              <span
                role="presentation"
                onPointerDown={(e) => handlePointerDown(zone, "resize", e)}
                className="absolute bottom-0 right-0 h-3 w-3 cursor-nwse-resize bg-foreground"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Crear `ZoneEditorPanel.tsx`**

```tsx
// apps/panel/src/features/events/wizard/steps/ZoneEditorPanel.tsx
import type { Zone } from "@entraditas/types";
import { Button } from "@/shared/ui/button";

export interface ZoneEditorPanelProps {
  zones: Zone[];
  selectedZoneId: string | null;
  onAddZone: (kind: Zone["kind"]) => void;
  onUpdateZone: (id: string, patch: Partial<Pick<Zone, "name" | "capacity" | "width" | "height">>) => void;
  onDeleteZone: (id: string) => void;
}

const ADD_BUTTONS: { kind: Zone["kind"]; label: string }[] = [
  { kind: "numbered", label: "+ Zona numerada" },
  { kind: "standing", label: "+ Zona de pie" },
  { kind: "stage", label: "+ Escenario/Pantalla" },
  { kind: "accessible", label: "+ Zona accesible" }
];

export function ZoneEditorPanel({ zones, selectedZoneId, onAddZone, onUpdateZone, onDeleteZone }: ZoneEditorPanelProps) {
  const selectedZone = zones.find((z) => z.id === selectedZoneId) ?? null;
  const sellable = selectedZone?.kind === "numbered" || selectedZone?.kind === "standing";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {ADD_BUTTONS.map((btn) => (
          <Button key={btn.kind} type="button" variant="outline" onClick={() => onAddZone(btn.kind)}>
            {btn.label}
          </Button>
        ))}
      </div>

      {selectedZone && (
        <fieldset className="flex flex-col gap-2 border-t-2 border-border pt-3">
          <legend>Zona seleccionada</legend>

          <label htmlFor="zone-name">Nombre</label>
          <input
            id="zone-name"
            defaultValue={selectedZone.name}
            onBlur={(e) => onUpdateZone(selectedZone.id, { name: e.target.value })}
          />

          {sellable && (
            <>
              <label htmlFor="zone-capacity">Capacidad</label>
              <input
                id="zone-capacity"
                type="number"
                min="0"
                defaultValue={selectedZone.capacity}
                onBlur={(e) => onUpdateZone(selectedZone.id, { capacity: Number(e.target.value) })}
              />
            </>
          )}

          <label htmlFor="zone-width">Ancho %</label>
          <input
            id="zone-width"
            type="number"
            min="1"
            max="100"
            defaultValue={selectedZone.width}
            onBlur={(e) => onUpdateZone(selectedZone.id, { width: Number(e.target.value) })}
          />

          <label htmlFor="zone-height">Alto %</label>
          <input
            id="zone-height"
            type="number"
            min="1"
            max="100"
            defaultValue={selectedZone.height}
            onBlur={(e) => onUpdateZone(selectedZone.id, { height: Number(e.target.value) })}
          />

          <Button type="button" variant="destructive" onClick={() => onDeleteZone(selectedZone.id)} className="mt-2">
            Eliminar esta zona
          </Button>
        </fieldset>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Crear `TicketTypeAssignment.tsx`**

El mock no expone directamente "qué grupo de tipos de entrada está ligado a este pool" — por eso este componente recibe, para cada zona vendible, el `groupId` ya resuelto por el llamante (`SeatingPlanSection`, Step 8), en vez de recalcularlo a partir de `pools`/`ticketTypes` internamente.

```tsx
// apps/panel/src/features/events/wizard/steps/TicketTypeAssignment.tsx
import type { Zone } from "@entraditas/types";
import type { TicketTypeGroup } from "./Step3TicketTypes";

export interface ZoneAssignment {
  zone: Zone;
  assignedGroupId: string | null;
}

export interface TicketTypeAssignmentProps {
  assignments: ZoneAssignment[];
  groups: TicketTypeGroup[];
  onAssign: (zoneId: string, groupId: string) => void;
}

export function TicketTypeAssignment({ assignments, groups, onAssign }: TicketTypeAssignmentProps) {
  return (
    <fieldset>
      <legend>Asigna un tipo de entrada a cada zona</legend>
      <div className="flex flex-col gap-2">
        {assignments.map(({ zone, assignedGroupId }) => (
          <div key={zone.id} className="flex items-center gap-3">
            <label htmlFor={`assign-${zone.id}`} className="w-40 text-sm font-semibold">
              Tipo de entrada — {zone.name}
            </label>
            <select
              id={`assign-${zone.id}`}
              value={assignedGroupId ?? ""}
              onChange={(e) => e.target.value && onAssign(zone.id, e.target.value)}
            >
              <option value="">— Sin asignar —</option>
              {groups.map((g) => (
                <option key={g.groupId} value={g.groupId}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
```

- [ ] **Step 6: Escribir los tests que fallan para `SeatingPlanSection`**

Sustituye `apps/panel/src/features/events/wizard/steps/SeatingPlanSection.test.tsx` por:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { SeatingPlanSection } from "./SeatingPlanSection";

function renderSection(eventId: string | null) {
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

  it("shows a placeholder message when the event has not been saved yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la información del evento/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Zona numerada" })).not.toBeInTheDocument();
  });

  it("renders the venue's already-drawn zones", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2"); // venue-1 (Sala Apolo), zones Pista + Grada already seeded
    expect(await screen.findByRole("button", { name: "Pista" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Grada" })).toBeInTheDocument();
  });

  it("adds a numbered zone and auto-creates its capacity pool for the event's first function", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-1"); // venue-2 (Teatro Circo), zero zones seeded
    await waitFor(() => expect(screen.getByRole("button", { name: "+ Zona numerada" })).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "+ Zona numerada" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Nueva zona numerada" })).toBeInTheDocument());
    const zone = db.zones.find((z) => z.name === "Nueva zona numerada")!;
    await waitFor(() => expect(db.capacityPools.some((p) => p.zoneId === zone.id)).toBe(true));
  });

  it("edits a selected zone's width, height and capacity, keeping its capacity pool in sync", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2");
    fireEvent.click(await screen.findByRole("button", { name: "Pista" }));

    fireEvent.change(screen.getByLabelText("Ancho %"), { target: { value: "50" } });
    fireEvent.blur(screen.getByLabelText("Ancho %"));
    fireEvent.change(screen.getByLabelText("Capacidad"), { target: { value: "900" } });
    fireEvent.blur(screen.getByLabelText("Capacidad"));

    await waitFor(() => expect(db.zones.find((z) => z.id === "zone-pista")!.width).toBe(50));
    await waitFor(() => expect(db.capacityPools.find((p) => p.id === "pool-2-pista")!.totalCapacity).toBe(900));
  });

  it("deletes a zone without sales", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    renderSection("event-2");
    fireEvent.click(await screen.findByRole("button", { name: "Grada" }));

    fireEvent.click(screen.getByRole("button", { name: "Eliminar esta zona" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Grada" })).not.toBeInTheDocument());
    expect(db.zones.some((z) => z.id === "zone-grada")).toBe(false);
  });

  it("assigns a ticket type to a zone", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "demo1234");
    db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId = null;
    renderSection("event-2");
    await screen.findByRole("button", { name: "Pista" });

    fireEvent.change(screen.getByLabelText("Tipo de entrada — Pista"), { target: { value: "tt-2-pista" } });

    await waitFor(() => expect(db.ticketTypes.find((t) => t.id === "tt-2-pista")!.capacityPoolId).toBe("pool-2-pista"));
  });
});
```

- [ ] **Step 7: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/SeatingPlanSection.test.tsx`
Expected: FAIL — `SeatingPlanSection` sigue siendo la versión de checkbox + PDF.

- [ ] **Step 8: Reescribir `SeatingPlanSection.tsx`**

```tsx
// apps/panel/src/features/events/wizard/steps/SeatingPlanSection.tsx
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapacityPool, Event, TicketType, Zone } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { useSubEventsQuery } from "./useSubEventsQuery";
import { useZonesQuery } from "./useZonesQuery";
import { defaultZoneLayout, type ZoneLayout } from "./zoneGeometry";
import { ZoneCanvas } from "./ZoneCanvas";
import { ZoneEditorPanel } from "./ZoneEditorPanel";
import { TicketTypeAssignment, type ZoneAssignment } from "./TicketTypeAssignment";
import { groupTicketTypes } from "./Step3TicketTypes";

export interface SeatingPlanSectionProps {
  eventId: string | null;
}

const SELLABLE_KINDS: Zone["kind"][] = ["numbered", "standing"];
const ZONE_KIND_NAMES: Record<Zone["kind"], string> = {
  numbered: "Nueva zona numerada",
  standing: "Nueva zona de pie",
  stage: "Escenario",
  accessible: "Movilidad reducida"
};

function useEventQuery(eventId: string | null) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["event", eventId],
    queryFn: () => apiClient.get<Event>(`/events/${eventId}`, { token: token! }),
    enabled: Boolean(eventId && token)
  });
}

function useCapacityPoolsQuery(subEventId: string | undefined) {
  const token = useSessionStore((s) => s.token);
  return useQuery({
    queryKey: ["capacity-pools", subEventId],
    queryFn: () => apiClient.get<CapacityPool[]>(`/sub-events/${subEventId}/capacity`, { token: token! }),
    enabled: Boolean(subEventId && token)
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

export function SeatingPlanSection({ eventId }: SeatingPlanSectionProps) {
  const token = useSessionStore((s) => s.token);
  const queryClient = useQueryClient();
  const { data: event } = useEventQuery(eventId);
  const venueId = event?.venueId ?? null;
  const { data: zones = [] } = useZonesQuery(venueId);
  const { data: subEvents = [] } = useSubEventsQuery(eventId);
  const firstSubEvent = subEvents[0];
  const { data: pools = [] } = useCapacityPoolsQuery(firstSubEvent?.id);
  const { data: ticketTypes = [] } = useTicketTypesQuery(eventId);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The drawn plan is the source of truth: any sellable zone without a
  // matching capacity pool for this event's first function gets one
  // created automatically, with no manual "activate" step.
  useEffect(() => {
    if (!firstSubEvent) return;
    const missing = zones.filter((z) => SELLABLE_KINDS.includes(z.kind) && !pools.some((p) => p.zoneId === z.id));
    if (missing.length === 0) return;
    (async () => {
      for (const zone of missing) {
        await apiClient.post(
          `/sub-events/${firstSubEvent.id}/capacity-pools`,
          { name: zone.name, zoneId: zone.id, totalCapacity: zone.capacity },
          { token: token! }
        );
      }
      await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent.id] });
    })();
  }, [zones, pools, firstSubEvent, token, queryClient]);

  async function addZone(kind: Zone["kind"]) {
    if (!venueId) return;
    setError(null);
    const layout: ZoneLayout = defaultZoneLayout(kind, zones);
    try {
      const created = await apiClient.post<Zone>(
        `/venues/${venueId}/zones`,
        { name: ZONE_KIND_NAMES[kind], kind, capacity: 0, ...layout },
        { token: token! }
      );
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      setSelectedZoneId(created.id);
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function updateZone(
    id: string,
    patch: Partial<Pick<Zone, "name" | "capacity" | "x" | "y" | "width" | "height">>
  ) {
    setError(null);
    try {
      await apiClient.patch(`/zones/${id}`, patch, { token: token! });
      if (patch.capacity !== undefined) {
        const pool = pools.find((p) => p.zoneId === id);
        if (pool) {
          await apiClient.patch(`/capacity-pools/${pool.id}`, { totalCapacity: patch.capacity }, { token: token! });
          await queryClient.invalidateQueries({ queryKey: ["capacity-pools", firstSubEvent?.id] });
        }
      }
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function deleteZone(id: string) {
    setError(null);
    try {
      await apiClient.delete(`/zones/${id}`, { token: token! });
      await queryClient.invalidateQueries({ queryKey: ["zones", venueId] });
      if (selectedZoneId === id) setSelectedZoneId(null);
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  async function assignTicketType(zoneId: string, groupId: string) {
    setError(null);
    const pool = pools.find((p) => p.zoneId === zoneId);
    if (!pool) return;
    try {
      const rows = ticketTypes.filter((t) => t.groupId === groupId);
      await Promise.all(
        rows.map((t) => apiClient.patch(`/ticket-types/${t.id}`, { capacityPoolId: pool.id }, { token: token! }))
      );
      await queryClient.invalidateQueries({ queryKey: ["ticket-types", eventId] });
    } catch (e) {
      if (e instanceof AppError) setError(e.message);
    }
  }

  if (!eventId) {
    return (
      <p className="text-sm text-muted-foreground">
        Guarda la información del evento para poder dibujar el plano de asientos.
      </p>
    );
  }
  if (!event) return null;
  if (!venueId) {
    return <p role="alert">Este evento no tiene un recinto asociado todavía.</p>;
  }

  const sellableZones = zones.filter((z) => SELLABLE_KINDS.includes(z.kind));
  const groups = groupTicketTypes(ticketTypes);
  const assignments: ZoneAssignment[] = sellableZones.map((zone) => {
    const pool = pools.find((p) => p.zoneId === zone.id);
    const assignedGroup = pool ? groups.find((g) => ticketTypes.some((t) => t.groupId === g.groupId && t.capacityPoolId === pool.id)) : undefined;
    return { zone, assignedGroupId: assignedGroup?.groupId ?? null };
  });

  return (
    <div className="flex flex-col gap-4">
      {error && <p role="alert">{error}</p>}
      <div className="grid gap-4 md:grid-cols-[1fr_260px]">
        <ZoneCanvas
          zones={zones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
          onZoneCommitted={(id, layout) => updateZone(id, layout)}
        />
        <ZoneEditorPanel
          zones={zones}
          selectedZoneId={selectedZoneId}
          onAddZone={addZone}
          onUpdateZone={updateZone}
          onDeleteZone={deleteZone}
        />
      </div>
      {sellableZones.length > 0 && (
        <TicketTypeAssignment assignments={assignments} groups={groups} onAssign={assignTicketType} />
      )}
    </div>
  );
}
```

- [ ] **Step 9: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/steps/SeatingPlanSection.test.tsx`
Expected: PASS

- [ ] **Step 10: Type-check**

Run: `pnpm --filter panel exec tsc --noEmit`
Expected: Solo deben quedar errores en `Step3Capacity.tsx` (se elimina en Task 8), `EventWizardPage.tsx` y `EventDetailPage.tsx` (se corrigen en Tasks 6-7)

---

### Task 6: `EventWizardPage` — quitar "¿Aforo por zonas?"

**Files:**
- Modify: `apps/panel/src/features/events/wizard/EventWizardPage.tsx`
- Test: `apps/panel/src/features/events/wizard/EventWizardPage.test.tsx`

**Interfaces:**
- Consumes: `SeatingPlanSection` (Task 5, ya siempre visible).

- [ ] **Step 1: Actualizar el test**

En `apps/panel/src/features/events/wizard/EventWizardPage.test.tsx`, quita por completo el test `"reveals the zoned-capacity section only after checking its toggle"`.

- [ ] **Step 2: Ejecutar los tests y comprobar que fallan**

Run: `pnpm --filter panel test -- --run src/features/events/wizard/EventWizardPage.test.tsx`
Expected: FAIL (o error de compilación) — `EventWizardPage` sigue importando `Step3Capacity`, que ya no expone la forma esperada tras las tareas anteriores; el resto de tests debe seguir en verde salvo el compilado global.

- [ ] **Step 3: Reescribir `EventWizardPage.tsx`**

```tsx
// apps/panel/src/features/events/wizard/EventWizardPage.tsx
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { useWizardStore } from "./wizardStore";
import { Step1BasicInfo } from "./steps/Step1BasicInfo";
import { Step2Schedule } from "./steps/Step2Schedule";
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

---

### Task 7: `EventDetailPage` — sustituir la pestaña "Aforos y zonas"

**Files:**
- Modify: `apps/panel/src/features/events/detail/EventDetailPage.tsx`

**Interfaces:**
- Consumes: `SeatingPlanSection` (Task 5).

- [ ] **Step 1: Confirmar el estado actual**

Run: `pnpm --filter panel test -- --run src/features/events/detail/EventDetailPage.test.tsx`
Expected: PASS todavía (ningún test existente referencia la pestaña "Aforos y zonas" por nombre), pero el archivo dejará de compilar en cuanto se borre `Step3Capacity.tsx` en la Task 8 — se corrige ahora para no depender de orden de ejecución.

- [ ] **Step 2: Sustituir la pestaña**

En `apps/panel/src/features/events/detail/EventDetailPage.tsx`, cambia el import:

```ts
import { SeatingPlanSection } from "../wizard/steps/SeatingPlanSection";
```

en vez de `import { Step3Capacity } from "../wizard/steps/Step3Capacity";`. Cambia la entrada correspondiente de `ENABLED_TABS`:

```ts
const ENABLED_TABS = [
  { key: "general", label: "Información general" },
  { key: "subeventos", label: "Subeventos" },
  { key: "plano", label: "Plano de asientos" },
  { key: "tipos", label: "Tipos de entrada" }
] as const;
```

Y la línea correspondiente en el render:

```tsx
{activeTab === "plano" && <SeatingPlanSection eventId={eventId} />}
```

(en vez de `{activeTab === "aforos" && <Step3Capacity eventId={eventId} onSaved={noop} />}`).

- [ ] **Step 3: Ejecutar los tests y comprobar que pasan**

Run: `pnpm --filter panel test -- --run src/features/events/detail/EventDetailPage.test.tsx`
Expected: PASS

---

### Task 8: Eliminar `Step3Capacity`

**Files:**
- Delete: `apps/panel/src/features/events/wizard/steps/Step3Capacity.tsx`
- Delete: `apps/panel/src/features/events/wizard/steps/Step3Capacity.test.tsx`

**Interfaces:**
- Ninguna — a estas alturas ya no queda ningún import de `Step3Capacity` en el proyecto (Tasks 6 y 7 lo quitaron de `EventWizardPage` y `EventDetailPage`).

- [ ] **Step 1: Confirmar que no queda ningún import**

Run: `grep -r "Step3Capacity" apps/panel/src --include="*.tsx" --include="*.ts" -l`
Expected: sin resultados fuera de los dos archivos que se van a borrar.

- [ ] **Step 2: Borrar los archivos**

Elimina `apps/panel/src/features/events/wizard/steps/Step3Capacity.tsx` y `apps/panel/src/features/events/wizard/steps/Step3Capacity.test.tsx`.

- [ ] **Step 3: Ejecutar la suite completa y el type-check**

Run: `pnpm --filter panel test -- --run && pnpm --filter panel exec tsc --noEmit`
Expected: PASS — todos los tests del proyecto en verde, sin errores de tipos.

---

## Verificación final

- [ ] `pnpm --filter panel test -- --run` sin regresiones.
- [ ] `pnpm --filter panel exec tsc --noEmit` sin errores.
- [ ] `pnpm --filter @entraditas/types test -- --run` en verde.
