# Control de accesos (menú lateral) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar el apartado "Control de accesos" del menú lateral (hoy un `PlaceholderPage` genérico) con una vista de solo lectura que agrega las puertas de todos los eventos a los que el usuario tiene acceso.

**Architecture:** Mismo patrón que "Ventas" (`VentasLayout.tsx` + rutas anidadas con `<Outlet/>`): un `AccesosLayout` con una pestaña habilitada ("Puertas") y dos deshabilitadas ("Escáner en vivo", "Incidencias de escaneo"). La tabla de puertas reutiliza `canAccessEvent` (ya definida en `src/mocks/handlers/events.ts`) para el filtrado por organización/alcance de eventos — la misma función que ya protege el resto de endpoints de eventos y puertas.

**Tech Stack:** React 18, TypeScript, @tanstack/react-query, @tanstack/react-table, react-router-dom, MSW, vitest + @testing-library/react.

**Spec:** `docs/superpowers/specs/2026-08-31-accesos-menu-design.md`

## Global Constraints

- No se construyen "Escáner en vivo" ni "Incidencias de escaneo" — quedan como pestañas deshabilitadas (sin datos reales ni simulados de escaneo en este panel mock).
- La tabla es de solo lectura: ninguna acción (activar/desactivar, editar operadores, eliminar) se hace desde aquí — para eso se sigue usando la pestaña "Puertas" de la ficha del evento (ya construida).
- No se añade ningún permiso nuevo al modelo: se reutiliza `scan:validate`, ya declarado para esta sección en `src/app/navItems.ts:11`.
- `GET /gates` no lleva schema Zod propio — tipo local `GateWithEvent`/`GateOverviewItem`, mismo criterio que otros handlers sin schema dedicado (p. ej. `discountCodes.ts`).
- El repo es de estructura plana (`src/...`); usa `npm`, no `pnpm`. Todos los comandos de test se ejecutan desde la raíz del repo con `npm run test -- <ruta>`.
- Las contraseñas demo son por usuario (`DEMO_PASSWORD_BY_EMAIL` en `src/mocks/state.ts`): `admin@entraditas.com` → `N8@kP4!wY6#sD2&`, `superadmin@entraditas.com` → `vQ7!mZ2#Lr9@Tx5$`, `usuario@entraditas.com` → `xR5$Jq9%Fv3!Mn7*`, `subusuario@entraditas.com` → `T6#bW8@cL2!pZ9&`.

---

### Task 1: Segunda puerta semilla en `org-2`

**Files:**
- Modify: `src/mocks/data/db.seed.json`
- Modify: `src/mocks/db.test.ts`

**Interfaces:**
- Produces: una segunda fila en `Database.gates`, `id: "gate-4-entrada"`, en `event-4` (Festival del Sur, `org-2`) — necesaria para poder probar en la Tarea 2 que `GET /gates` filtra correctamente entre organizaciones (hoy solo existe `gate-2-norte`, en `org-1`).

- [ ] **Step 1: Write the failing test**

En `src/mocks/db.test.ts`, sustituye el test existente:

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

por:

```ts
  it("seeds two schema-valid gates across different organizations", () => {
    const db = createSeedDatabase();
    expect(db.gates).toHaveLength(2);
    for (const gate of db.gates) expect(() => GateSchema.parse(gate)).not.toThrow();

    const norte = db.gates.find((g) => g.id === "gate-2-norte")!;
    expect(norte.eventId).toBe("event-2");
    expect(norte.operatorUserIds).toContain(DEMO_SUBUSER_ID);

    const entrada = db.gates.find((g) => g.id === "gate-4-entrada")!;
    expect(entrada.eventId).toBe("event-4");
    expect(entrada.zoneId).toBeNull();
    expect(entrada.operatorUserIds).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/mocks/db.test.ts`
Expected: FAIL — `db.gates` still has length 1, `gate-4-entrada` doesn't exist.

- [ ] **Step 3: Add the seed gate**

En `src/mocks/data/db.seed.json`, dentro del array `"gates"`, añade una segunda entrada después de `gate-2-norte` (no olvides la coma que separa ambos objetos):

```json
    {
      "id": "gate-4-entrada",
      "eventId": "event-4",
      "subEventId": null,
      "name": "Entrada Principal",
      "code": "ENTRADA",
      "zoneId": null,
      "direction": "in",
      "allowReentry": false,
      "maxScansPerTicket": 1,
      "allowedTicketTypeGroupIds": null,
      "opensAt": null,
      "closesAt": null,
      "operatorUserIds": [],
      "isActive": true
    }
```

(`event-4` = "Festival del Sur", `org-2`; su recinto `venue-3` no tiene zonas sembradas, de ahí `zoneId: null`; `org-2` no tiene ningún `subuser` sembrado, de ahí `operatorUserIds: []`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- src/mocks/db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/mocks/data/db.seed.json src/mocks/db.test.ts
git commit -m "feat: seed a second gate on an org-2 event"
```

---

### Task 2: Endpoint `GET /gates`

**Files:**
- Modify: `src/mocks/handlers/gates.ts`
- Modify: `src/mocks/handlers/gates.test.ts`

**Interfaces:**
- Consumes: `db.gates` (Task 1), `db.events`, `db.zones`, `db.users`, `canAccessEvent` (ya importada en `gates.ts` desde `./events`).
- Produces: `GET /gates`, que devuelve `GateWithEvent[]` — `type GateWithEvent = Gate & { eventTitle: string; zoneName: string | null; operatorNames: string[] }`. El frontend (Tarea 3) declara su propia copia de esta forma (`GateOverviewItem`), sin importar nada de `src/mocks/*`.

- [ ] **Step 1: Write the failing tests**

Añade al final de `src/mocks/handlers/gates.test.ts` (dentro del `describe` existente, antes del `});` final):

```ts
  it("GET /gates returns only the gates whose event the admin can access, enriched with event/zone/operator names", async () => {
    const token = await login(); // admin@entraditas.com, org-1
    const gates = await apiClient.get<Array<Gate & { eventTitle: string; zoneName: string | null; operatorNames: string[] }>>(
      "/gates",
      { token }
    );
    expect(gates.map((g) => g.id)).toEqual(["gate-2-norte"]);
    const norte = gates[0]!;
    expect(norte.eventTitle).toBe("Rock en Directo");
    expect(norte.zoneName).toBe("Pista");
    expect(norte.operatorNames).toEqual(["Personal de puerta"]);
  });

  it("GET /gates returns gates across every organization to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "vQ7!mZ2#Lr9@Tx5$");
    const token = useSessionStore.getState().token!;
    const gates = await apiClient.get<{ id: string }[]>("/gates", { token });
    expect(gates.map((g) => g.id).sort()).toEqual(["gate-2-norte", "gate-4-entrada"]);
  });

  it("GET /gates returns none when the event-scoped user's events have no gates", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "T6#bW8@cL2!pZ9&"); // scoped to event-1 only, which has no gates
    const token = useSessionStore.getState().token!;
    const gates = await apiClient.get<{ id: string }[]>("/gates", { token });
    expect(gates).toEqual([]);
  });
```

Añade el import de `useSessionStore` si el archivo aún no lo tiene (ya lo tiene, de `resetDb`/`useSessionStore.setState` en el `afterEach` existente — no hace falta tocar los imports).

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/mocks/handlers/gates.test.ts`
Expected: FAIL — `/gates` es una ruta no manejada (404 / error de MSW).

- [ ] **Step 3: Implement the handler**

En `src/mocks/handlers/gates.ts`, añade justo antes de `export const gatesHandlers = [`:

```ts
type GateWithEvent = Gate & {
  eventTitle: string;
  zoneName: string | null;
  operatorNames: string[];
};

function toGateWithEvent(gate: Gate): GateWithEvent {
  const event = db.events.find((e) => e.id === gate.eventId)!;
  const zone = gate.zoneId ? db.zones.find((z) => z.id === gate.zoneId) : null;
  return {
    ...gate,
    eventTitle: event.title,
    zoneName: zone?.name ?? null,
    operatorNames: gate.operatorUserIds
      .map((id) => db.users.find((u) => u.id === id)?.fullName)
      .filter((name): name is string => Boolean(name))
  };
}
```

Y añade este handler al final del array `gatesHandlers` (después del handler de `GET /events/:eventId/team`, con una coma tras el `})` anterior):

```ts
  http.get(`${BASE}/gates`, ({ request }) => {
    const userId = getSessionUserId(request);
    if (!userId) return unauthenticated("req_gates_all");
    const user = db.users.find((u) => u.id === userId);
    if (!user) return unauthenticated("req_gates_all");
    const visibleEventIds = new Set(db.events.filter((e) => canAccessEvent(e, user)).map((e) => e.id));
    const gates = db.gates.filter((g) => visibleEventIds.has(g.eventId)).map(toGateWithEvent);
    return HttpResponse.json({ data: gates, meta: { page: 1, perPage: gates.length, total: gates.length, nextCursor: null } });
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/mocks/handlers/gates.test.ts`
Expected: PASS (11 tests: los 8 ya existentes + los 3 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/mocks/handlers/gates.ts src/mocks/handlers/gates.test.ts
git commit -m "feat: add GET /gates endpoint aggregating gates across accessible events"
```

---

### Task 3: `GatesOverviewPage`

**Files:**
- Create: `src/features/access/gates/useGatesOverviewQuery.ts`
- Create: `src/features/access/gates/GatesOverviewPage.tsx`
- Create: `src/features/access/gates/GatesOverviewPage.test.tsx`

**Interfaces:**
- Consumes: `GET /gates` (Task 2); `apiClient`, `useSessionStore`, `SortableHeader` (todos ya existentes).
- Produces: `useGatesOverviewQuery()` (query key `["gates-overview"]`), `GateOverviewItem` interface, `GatesOverviewPage` componente — consumido por la Tarea 4 (`AccesosLayout`/rutas).

- [ ] **Step 1: Write the failing test**

Create `src/features/access/gates/GatesOverviewPage.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { GatesOverviewPage } from "./GatesOverviewPage";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <GatesOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("GatesOverviewPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows both gates, each with its event, zone, status and operators, to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "vQ7!mZ2#Lr9@Tx5$");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3)); // header + 2 gates

    expect(screen.getByText("Puerta Norte — NORTE")).toBeInTheDocument();
    expect(screen.getByText("Rock en Directo")).toBeInTheDocument();
    expect(screen.getByText("Pista")).toBeInTheDocument();
    expect(screen.getByText("Personal de puerta")).toBeInTheDocument();

    expect(screen.getByText("Entrada Principal — ENTRADA")).toBeInTheDocument();
    expect(screen.getByText("Festival del Sur")).toBeInTheDocument();
    expect(screen.getByText("Sin zona")).toBeInTheDocument();
    expect(screen.getByText("Sin operadores asignados")).toBeInTheDocument();
  });

  it("shows only the admin's own organization's gate", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(2)); // header + 1 gate

    expect(screen.getByText("Puerta Norte — NORTE")).toBeInTheDocument();
    expect(screen.queryByText("Entrada Principal — ENTRADA")).not.toBeInTheDocument();
  });

  it("shows an empty-state message when no gate is visible", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "T6#bW8@cL2!pZ9&"); // scoped to event-1 only
    renderPage();
    expect(await screen.findByText("No hay puertas creadas todavía.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/features/access/gates/GatesOverviewPage.test.tsx`
Expected: FAIL — `./GatesOverviewPage` no existe.

- [ ] **Step 3: Implement the query hook**

Create `src/features/access/gates/useGatesOverviewQuery.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import type { Gate } from "@entraditas/types";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";

export interface GateOverviewItem extends Gate {
  eventTitle: string;
  zoneName: string | null;
  operatorNames: string[];
}

export function useGatesOverviewQuery() {
  const token = useSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["gates-overview"],
    queryFn: () => apiClient.get<GateOverviewItem[]>("/gates", { token: token! }),
    enabled: Boolean(token)
  });
}
```

- [ ] **Step 4: Implement the page**

Create `src/features/access/gates/GatesOverviewPage.tsx`:

```tsx
import { useState } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import type { SortingState } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import type { Gate } from "@entraditas/types";
import { SortableHeader } from "@/shared/ui/SortableHeader";
import { useGatesOverviewQuery, type GateOverviewItem } from "./useGatesOverviewQuery";

const DIRECTION_LABEL: Record<Gate["direction"], string> = { in: "Entrada", out: "Salida", both: "Ambas" };

const columnHelper = createColumnHelper<GateOverviewItem>();
const columns = [
  columnHelper.display({
    id: "gate",
    header: "Puerta",
    cell: (info) => <span className="font-semibold">{info.row.original.name} — {info.row.original.code}</span>
  }),
  columnHelper.accessor("eventTitle", {
    header: "Evento",
    cell: (info) => (
      <Link to={`/eventos/${info.row.original.eventId}`} className="font-semibold text-primary hover:underline">
        {info.getValue()}
      </Link>
    )
  }),
  columnHelper.accessor("zoneName", {
    header: "Zona",
    cell: (info) => info.getValue() ?? "Sin zona"
  }),
  columnHelper.accessor("direction", {
    header: "Dirección",
    cell: (info) => DIRECTION_LABEL[info.getValue()]
  }),
  columnHelper.accessor("isActive", {
    header: "Estado",
    cell: (info) => (info.getValue() ? "Activo" : "Inactivo")
  }),
  columnHelper.accessor("operatorNames", {
    header: "Operadores",
    cell: (info) => (info.getValue().length > 0 ? info.getValue().join(", ") : "Sin operadores asignados")
  })
];

export function GatesOverviewPage() {
  const { data: gates = [], isLoading } = useGatesOverviewQuery();
  const [sorting, setSorting] = useState<SortingState>([]);
  const table = useReactTable({
    data: gates,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    sortDescFirst: false
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">Puertas</h1>
        <p className="mt-1 text-sm text-muted-foreground">Puertas de todos los eventos a los que tienes acceso.</p>
      </header>
      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : gates.length === 0 ? (
        <p className="text-muted-foreground">No hay puertas creadas todavía.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border-2 border-foreground bg-surface shadow-flat">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-alt">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      aria-sort={header.column.getIsSorted() !== false ? (header.column.getIsSorted() === "asc" ? "ascending" : "descending") : undefined}
                      className="px-4 py-3 font-medium text-muted-foreground"
                    >
                      {header.column.getCanSort()
                        ? <SortableHeader header={header} />
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/features/access/gates/GatesOverviewPage.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/access/gates/useGatesOverviewQuery.ts src/features/access/gates/GatesOverviewPage.tsx src/features/access/gates/GatesOverviewPage.test.tsx
git commit -m "feat: add GatesOverviewPage"
```

---

### Task 4: `AccesosLayout` y rutas

**Files:**
- Create: `src/features/access/AccesosLayout.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/router.test.tsx`

**Interfaces:**
- Consumes: `GatesOverviewPage` (Task 3).
- Produces: rutas `/accesos` → `AccesosLayout`, `/accesos/puertas` → `GatesOverviewPage`.

- [ ] **Step 1: Write the failing test**

Añade en `src/app/router.test.tsx`, después del test `"shows the attendees list under Ventas to an authenticated admin"` (antes de `"opens an invitation link without an authenticated session"`):

```tsx
  it("shows the gates overview under Control de accesos to an authenticated admin", async () => {
    useSessionStore.setState({
      status: "authenticated",
      token: "t",
      user: { id: "u", email: "a@a.com", fullName: "A", role: "admin", organizationId: "org-1" },
      effectivePermissions: new Set(["scan:validate"]),
      eventScopes: []
    });
    renderApp(["/accesos"]);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Puertas" })).toBeInTheDocument());
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/app/router.test.tsx`
Expected: FAIL — `/accesos` sigue sirviendo el `PlaceholderPage` genérico (con título "Control de accesos", no "Puertas").

- [ ] **Step 3: Create `AccesosLayout`**

Create `src/features/access/AccesosLayout.tsx`:

```tsx
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/shared/lib/cn";

const ENABLED_TABS = [{ to: "/accesos/puertas", label: "Puertas" }] as const;
// Sections not built yet; rendered as disabled buttons so the full nav is visible early.
const DISABLED_TABS = ["Escáner en vivo", "Incidencias de escaneo"];

export function AccesosLayout() {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Control de accesos</p>

      <nav aria-label="Secciones de control de accesos">
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

- [ ] **Step 4: Wire the routes**

En `src/app/router.tsx`:

1. Añade los imports, junto al resto de imports de `features/`:
   ```tsx
   import { AccesosLayout } from "@/features/access/AccesosLayout";
   import { GatesOverviewPage } from "@/features/access/gates/GatesOverviewPage";
   ```
2. Añade `"/accesos"` al `Set` (línea 26):
   ```tsx
   const PLACEHOLDER_PATHS = new Set(["/eventos", "/equipo", "/dashboard", "/ventas", "/organizaciones", "/accesos"]);
   ```
3. Añade el bloque de rutas, justo después del bloque de `/ventas` (después de su `</Route>` de cierre) y antes de `<Route path="/sin-acceso" ...>`:
   ```tsx
   <Route element={<RequirePermission permission="scan:validate" />}>
     <Route path="/accesos" element={<AccesosLayout />}>
       <Route index element={<Navigate to="puertas" replace />} />
       <Route path="puertas" element={<GatesOverviewPage />} />
     </Route>
   </Route>
   ```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm run test -- src/app/router.test.tsx`
Expected: PASS (todos los tests, incluido el nuevo).

- [ ] **Step 6: Commit**

```bash
git add src/features/access/AccesosLayout.tsx src/app/router.tsx src/app/router.test.tsx
git commit -m "feat: enable the Control de accesos section with a gates overview"
```

---

### Task 5: Verificación completa

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm run test`
Expected: todos los archivos de test en verde.

- [ ] **Step 2: Type-check**

Run: `npx tsc -b --noEmit`
Expected: limpio (sin salida).

- [ ] **Step 3: Repaso manual contra el spec**

Vuelve a leer `docs/superpowers/specs/2026-08-31-accesos-menu-design.md` y confirma: la tabla es de solo lectura (ningún botón de acción), "Escáner en vivo" e "Incidencias de escaneo" siguen deshabilitadas, no se ha tocado el modelo de permisos, y cada fila enlaza correctamente al evento correspondiente.
