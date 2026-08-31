# Control de accesos (menú lateral) — Diseño

**Fecha:** 2026-08-31
**Referencia:** `docs/README.md` §4.3 (mapa de navegación), `src/app/navItems.ts:11` (`{ label: "Control de accesos", path: "/accesos", permission: "scan:validate" }`)

## Objetivo

Habilitar el apartado "Control de accesos" del menú lateral (hoy un `PlaceholderPage` genérico servido automáticamente por `router.tsx`), con una vista de solo lectura que agrega **las puertas de todos los eventos** a los que el usuario tiene acceso, en un único lugar.

## No objetivos

- **"Escáner en vivo" e "Incidencias de escaneo"** (las otras 2 subsecciones que `docs/README.md` §4.3 documenta bajo "Control de accesos"): este panel mock no tiene subsistema real de Pedidos/Tickets/Scans (ver `docs/superpowers/specs/2026-08-26-puertas-design.md`, "No objetivos"), así que no hay datos de escaneo reales ni simulados que mostrar ahí. Quedan como pestañas deshabilitadas, igual que hace `VentasLayout` con las secciones de Ventas que aún no existen.
- **Edición desde esta vista.** La tabla es de solo lectura: para activar/desactivar una puerta, cambiar sus operadores o eliminarla, se sigue usando la pestaña "Puertas" de la ficha del evento correspondiente (ya construida). Esta vista solo enlaza hacia allí.
- No se añade ningún permiso nuevo al modelo (`gates:read`, etc.): se reutiliza `scan:validate`, el permiso que `navItems.ts` ya declara para esta sección.

## Arquitectura

Mismo patrón que "Ventas" (`VentasLayout.tsx` + rutas anidadas con `<Outlet/>`): un layout con pestañas por sección, una habilitada (Puertas) y dos deshabilitadas. La tabla de puertas reutiliza `canAccessEvent` (ya definida en `src/mocks/handlers/events.ts`) para el filtrado por organización/alcance de eventos — exactamente la misma función que ya protege el resto de endpoints de eventos y puertas, así que no se introduce ninguna lógica de autorización nueva.

## Endpoint del mock (`src/mocks/handlers/gates.ts`)

- `GET /gates` — devuelve todas las puertas cuyo evento pasa `canAccessEvent(event, user)`, cada una enriquecida con los datos que la tabla necesita mostrar sin que el frontend tenga que resolverlos aparte (nombre de evento, nombre de zona, nombres de operadores):
  ```ts
  type GateWithEvent = Gate & {
    eventTitle: string;
    zoneName: string | null; // resuelto desde gate.zoneId, o null si zoneId es null
    operatorNames: string[]; // resueltos desde gate.operatorUserIds
  };
  ```
  No lleva schema Zod propio (tipo local, mismo criterio que otros handlers cuya respuesta no tiene un schema dedicado, p. ej. `discountCodes.ts`). Se implementa iterando `db.events.filter(e => canAccessEvent(e, user))` y luego `db.gates.filter(g => visibleEventIds.has(g.eventId))`, en vez de reutilizar `requireEvent` (que está pensado para un único `eventId` de la URL).

## Datos semilla

Se añade una segunda puerta en `db.seed.json`, en un evento de `org-2` (para poder probar el filtrado entre organizaciones — hoy solo existe la puerta de `event-2`/`org-1`):

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

## Componentes y rutas

- **`src/features/access/AccesosLayout.tsx`** (nuevo): mismo patrón que `VentasLayout.tsx` — cabecera "Control de accesos", `ENABLED_TABS = [{ to: "/accesos/puertas", label: "Puertas" }]`, `DISABLED_TABS = ["Escáner en vivo", "Incidencias de escaneo"]` (botón deshabilitado con tooltip "Disponible en una fase posterior", igual que el resto del panel), `<Outlet/>`.
- **`src/features/access/gates/useGatesOverviewQuery.ts`** (nuevo): hook `useQuery` que llama a `GET /gates` (mismo patrón que `useOrganizationsQuery.ts`).
- **`src/features/access/gates/GatesOverviewPage.tsx`** (nuevo): tabla ordenable con `@tanstack/react-table` (mismo patrón que `EventsListPage.tsx`/`OrganizationsListPage.tsx`), columnas:
  - **Puerta** — nombre + código (p. ej. "Puerta Norte — NORTE").
  - **Evento** — `<Link to={\`/eventos/${eventId}\`}>` con el título del evento (mismo estilo que la columna "Título" de `EventsListPage`).
  - **Zona** — nombre de la zona o "Sin zona".
  - **Dirección** — Entrada/Salida/Ambas.
  - **Estado** — "Activo"/"Inactivo".
  - **Operadores** — nombres separados por coma, o "Sin operadores asignados".
  - Estado vacío: "No hay puertas creadas todavía." cuando la lista resuelta está vacía (nadie ha creado ninguna, o el usuario no tiene acceso a ningún evento con puertas).
- **`router.tsx`**: se añade `"/accesos"` al `Set` `PLACEHOLDER_PATHS` (para que deje de recibir el `PlaceholderPage` automático, igual que `/ventas` u `/organizaciones`) y se registran las rutas reales:
  ```tsx
  <Route element={<RequirePermission permission="scan:validate" />}>
    <Route path="/accesos" element={<AccesosLayout />}>
      <Route index element={<Navigate to="puertas" replace />} />
      <Route path="puertas" element={<GatesOverviewPage />} />
    </Route>
  </Route>
  ```
  (mismo patrón exacto que el bloque ya existente de `/ventas`).

## Testing

- `gates.test.ts` — nuevos casos para `GET /gates`: un admin de `org-1` solo ve la puerta de `event-2` (no la de `event-4`/`org-2`); el superadmin ve ambas; un usuario con `eventScopes` que no incluya ningún evento con puertas no ve ninguna.
- `GatesOverviewPage.test.tsx` — muestra ambas puertas (con su evento, zona, dirección, estado y operadores) a un superadmin; muestra solo la suya a un admin de `org-1`; cada fila enlaza al evento correspondiente; estado vacío cuando no hay ninguna puerta visible (p. ej. para un usuario sin eventos con puertas en su alcance).
- `router.test.tsx` — un caso que confirma que `/accesos` ya no es un placeholder y aterriza en la lista de puertas, igual que los casos ya existentes para `/organizaciones` y `/ventas`.
- `AccesosLayout` no lleva test propio (igual que `VentasLayout`, que tampoco lo tiene) — queda cubierto por `router.test.tsx` + `GatesOverviewPage.test.tsx`.

## Fuera de alcance de esta spec

- Escáner en vivo, incidencias de escaneo, cualquier dato de escaneo real o simulado.
- Edición de puertas desde esta vista (activar/desactivar, operadores, eliminar) — se sigue haciendo desde la ficha del evento.
- Cualquier permiso nuevo (`gates:read`, etc.) o cambio al modelo de permisos existente.
