# Ventas · Taquilla (POS) — diseño

> Estado: aprobado para plan de implementación.
> Ámbito: `apps/panel` (panel de administración).
> Tercer sub-proyecto del apartado Ventas (tras Pedidos y Reembolsos).
> Primera vía de **creación** de pedidos — hasta ahora solo se leían o se
> reembolsaban pedidos ya existentes.

## 1. Contexto y objetivo

`Taquilla (POS)` es hoy una pestaña deshabilitada de `VentasLayout`. Esta
entrega la activa: permite a alguien con permiso vender entradas
presencialmente (venta en taquilla, `channel: "box_office"`) para un
evento accesible, eligiendo uno o varios tipos de entrada con su
cantidad, y confirma la venta como un pedido ya pagado.

## 2. Decisiones de alcance (acordadas en brainstorming)

- **Permiso nuevo `orders:create`:** no existía en el catálogo original
  (que solo cubría ver/reembolsar pedidos). `Admin`/`Superadmin` lo
  tienen fijo; `Usuario`/`Subusuario` lo tienen **configurable** desde
  Equipo — mismo patrón que "Ver pedidos y compradores" o "Poner precios
  y aforos".
- **Comprador obligatorio:** el formulario exige nombre y email, igual
  que el resto de pedidos. Para ventas sin datos reales el propio staff
  escribe algo genérico (p.ej. "Venta en taquilla" / un email de
  contacto del recinto). No se toca `OrderSchema`.
- **Carrito con varias líneas:** una venta puede incluir varios tipos de
  entrada distintos con su cantidad cada uno, confirmados como un único
  pedido — igual que ya soporta el modelo `OrderItem` de Pedidos.
- **Sin pago real:** al confirmar, el pedido queda `status: "paid"` al
  instante (no hay paso de cobro simulado).
- **Sin gate por estado del evento:** cualquier evento accesible para el
  actor se puede seleccionar; el único límite real es el stock disponible
  por tipo de entrada (no se añade una regla de negocio nueva tipo "solo
  eventos on_sale").

## 3. Catálogo de permisos

### 3.1 `apps/panel/src/shared/auth/permissions.ts`

Nuevo permiso en `PERMISSIONS`:

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

`superadmin` (= `PERMISSIONS`) y `admin` (= `ALL_EXCEPT_ORG_MANAGE`) lo
obtienen automáticamente. `ROLE_BASE_PERMISSIONS.user` y `.subuser` **no**
cambian (el permiso no entra en su base — se otorga vía override,
igual que `orders:refund` para `user`).

Nueva entrada en `CAPABILITIES`:

```ts
{ key: "sell_tickets", label: "Vender entradas en taquilla", permissions: ["orders:create"], accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "configurable" } }
```

Al reutilizar `getConfigurableCapabilities`/`capabilityKeysToOverrides`
(ya genéricos), el editor de personas en `TeamMemberFormPage` muestra el
toggle "Vender entradas en taquilla" sin tocar esa pantalla.

## 4. Endpoint mock nuevo

### 4.1 `apps/panel/src/mocks/handlers/orders.ts` (modifica el existente)

`POST /orders` — acceso `orders:create` + `canAccessEvent` (ya exportada
desde `events.ts`) sobre el `eventId` recibido.

Body: `{ eventId: string, customerName: string, customerEmail: string, items: { ticketTypeId: string, quantity: number }[] }`.

Validaciones (en orden):
1. Sin usuario autenticado → `401 UNAUTHENTICATED`.
2. Evento inexistente o fuera de alcance (`!canAccessEvent`) → `404 NOT_FOUND`.
3. Sin `orders:create` efectivo → `403 FORBIDDEN`.
4. `items` vacío, o algún `ticketTypeId` no pertenece a ese evento, o
   `quantity` no es un entero positivo → `422 VALIDATION_ERROR`.
5. Para cada línea: si `ticketType.quantityTotal !== null` y
   `quantityTotal - quantitySold < quantity` → `422 INSUFFICIENT_CAPACITY`
   (mensaje incluye el nombre del tipo de entrada sin stock).

Efectos (todas las líneas ya validadas):
- Crea `Order`: `id: order-${db.orders.length + 1}`, `orderNumber` siguiente
  en la secuencia `PED-2026-00NN` (basado en `db.orders.length`),
  `status: "paid"`, `channel: "box_office"`, `refundedAmount: 0`,
  `total` = suma de subtotales, `currency: "EUR"`, `createdAt: new
  Date().toISOString()`.
- Crea un `OrderItem` por línea (`unitPrice` = `ticketType.basePrice`
  actual, `subtotal = unitPrice * quantity`, `ticketTypeName` =
  `ticketType.name`).
- Para cada línea: `ticketType.quantitySold += quantity`; si
  `ticketType.capacityPoolId`, también `capacityPool.soldCount += quantity`.
- Devuelve `{ ...order, items, refunds: [] }` (mismo shape que
  `GET /orders/:id`, con `refunds` vacío porque el pedido acaba de
  crearse), `201`.

## 5. Página y componentes (`apps/panel/src/features/sales/taquilla`)

- **`useEventTicketTypesQuery.ts`** — hook local (`useQuery(["ticket-types", eventId], () => apiClient.get<TicketType[]>(\`/events/${eventId}/ticket-types\`, ...))`), equivalente al hook privado ya usado en `Step4TicketTypes.tsx` pero colocado en esta feature (no se toca el wizard).
- **`TaquillaPage.tsx`** (`/ventas/taquilla`) — pantalla única:
  1. Select de evento (reutiliza `useEventsQuery`).
  2. Al elegir evento, `useEventTicketTypesQuery(eventId)` — por cada
     tipo de entrada: nombre, precio, disponibilidad (`quantityTotal -
     quantitySold`, o "Ilimitado" si `quantityTotal` es `null`), e input
     numérico de cantidad (`min 0`, `max` = mínimo entre disponibilidad y
     `maxPerOrder`; deshabilitado y con etiqueta "Agotado" si la
     disponibilidad es 0).
  3. Resumen del carrito: líneas con cantidad > 0, subtotal por línea y
     total.
  4. Campos nombre y email del comprador.
  5. Botón "Confirmar venta" (deshabilitado si el carrito está vacío o
     faltan nombre/email) → `POST /orders`. Éxito: mensaje con el nº de
     pedido creado y un enlace a `/ventas/pedidos/:id`; se vacía el
     carrito y los campos de comprador. Error → mensaje con el motivo
     (p.ej. sin stock), carrito intacto.
  6. Toda la pantalla (selects, cantidades y el botón de confirmar)
     queda envuelta en `<Can do="orders:create" fallback={...}>`, mostrando
     un aviso de "No tienes permiso para vender entradas" en el `fallback`
     — la ruta en sí solo exige `orders:read` (como el resto de Ventas),
     igual que Pedidos ya distingue "ver" de "actuar".
- **`VentasLayout.tsx`** — "Taquilla (POS)" pasa de `DISABLED_TABS` a
  `ENABLED_TABS`, apuntando a `/ventas/taquilla`.
- **Router** (`app/router.tsx`) — añade `/ventas/taquilla` dentro del
  bloque `RequirePermission permission="orders:read"` que ya envuelve
  `VentasLayout`.

## 6. Testing

- **`mocks/handlers/orders.test.ts`** (ampliar): venta con varias líneas
  crea el pedido y descuenta `quantitySold`/`soldCount` de cada línea;
  rechaza cantidad mayor que el stock disponible (`INSUFFICIENT_CAPACITY`);
  rechaza un tipo de entrada que no pertenece al evento indicado; rechaza
  carrito vacío; `403` sin `orders:create` (p.ej. `usuario@entraditas.com`,
  que no lo tiene por defecto); `404` con evento fuera de alcance.
- **`shared/auth/permissions.test.ts`** (ampliar): la nueva capacidad
  `sell_tickets` aparece como configurable para `user`/`subuser` y fija
  para `admin`/`superadmin`.
- **`features/sales/taquilla/TaquillaPage.test.tsx`** (nuevo): construir
  un carrito con 2 líneas y confirmar la venta; input deshabilitado
  cuando el stock es 0; sin `orders:create` se muestra el aviso en vez
  del formulario.
- **`router.test.tsx`:** caso de acceso a `/ventas/taquilla`.
