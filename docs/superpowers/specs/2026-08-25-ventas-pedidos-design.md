# Ventas · Pedidos — diseño

> Estado: aprobado para plan de implementación.
> Ámbito: `apps/panel` (panel de administración) + `packages/types`.
> Primer sub-proyecto del apartado Ventas (Pedidos · Reembolsos · Taquilla (POS) · Asistentes (CRM)).
> Cada uno de los otros tres se aborda como su propio ciclo spec → plan → implementación.

## 1. Contexto y objetivo

Hoy `Ventas` es un único `PlaceholderPage` colgado de `/ventas`. Esta entrega
construye la primera pestaña real de esa sección: **Pedidos**, de solo
consulta (listado + detalle). Cancelar un pedido y gestionar reembolsos
quedan fuera — son el siguiente sub-proyecto (Reembolsos), que actuará sobre
los mismos `Order` que aquí se introducen.

## 2. Decisiones de alcance (acordadas en brainstorming)

- **Solo consulta:** listado con filtros/búsqueda + detalle. Ninguna acción
  de escritura (cancelar, reembolsar, reenviar entradas) en este ticket.
- **Líneas de pedido:** `Order` (ya existente en `packages/types`) es plano
  (solo `total`). Se añade `OrderItem` para poder mostrar un desglose real
  en el detalle — necesario también para Taquilla (crear el pedido línea a
  línea) y Asistentes (qué compró cada persona) más adelante.
- **Filtros del listado:** evento, estado, canal y búsqueda libre (nº de
  pedido / nombre / email del comprador).
- **Estructura de la sección Ventas:** `VentasLayout` con pestañas —
  Pedidos activa; Reembolsos, Taquilla (POS) y Asistentes (CRM)
  deshabilitadas ("Disponible en una fase posterior"), mismo estilo que las
  pestañas deshabilitadas de `EventDetailPage`. `/ventas` redirige a
  `/ventas/pedidos`.
- **Coherencia de aforos:** los pedidos sembrados actualizan
  `capacityPool.soldCount` y `ticketType.quantitySold` de los tipos de
  entrada afectados, para que cuadren con las líneas de pedido pagadas /
  parcialmente reembolsadas. Hoy esos campos están a 0 en toda la semilla;
  no hay ningún test que dependa de ese valor inicial exacto (los que los
  usan los sobrescriben ellos mismos antes de leerlos).

## 3. Modelo de datos

### 3.1 `packages/types/src/schemas.ts`

Nuevo esquema:

```ts
export const OrderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  ticketTypeId: z.string(),
  ticketTypeName: z.string(), // snapshot del nombre en el momento de compra
  quantity: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
  subtotal: z.number().int().nonnegative()
});
export type OrderItem = z.infer<typeof OrderItemSchema>;
```

`OrderSchema` no cambia.

### 3.2 `apps/panel/src/mocks/db.ts`

`Database` gana `orders: Order[]` y `orderItems: OrderItem[]`.

Semilla (escrita a mano, no aleatoria, para tests deterministas). Solo
`event-1`, `event-2` y `event-4` tienen pedidos (son los que están
publicados / a la venta; `event-3` y `event-5` se quedan sin pedidos):

**Event 1 — Noche de Jazz (org-1, tt-1 "General" 25,00 €)**

| id | nº pedido | estado | canal | comprador | líneas | total |
|---|---|---|---|---|---|---|
| order-1 | PED-2026-0001 | paid | web | Marta Ruiz | tt-1 × 2 | 5000 |
| order-2 | PED-2026-0002 | paid | panel | Javier Soto | tt-1 × 3 | 7500 |
| order-3 | PED-2026-0003 | pending | web | Lucía Fernández | tt-1 × 1 | 2500 |
| order-4 | PED-2026-0004 | refunded | web | Diego Molina | tt-1 × 2 | 5000 |

→ `tt-1.quantitySold = 5`, `pool-1.soldCount = 5` (solo `paid`; `pending` y
`refunded` no cuentan).

**Event 2 — Rock en Directo (org-1, tt-2-pista 30,00 €, tt-2-grada 50,00 €)**

| id | nº pedido | estado | canal | comprador | líneas | total |
|---|---|---|---|---|---|---|
| order-5 | PED-2026-0005 | paid | web | Sara Gómez | tt-2-pista × 4, tt-2-grada × 2 | 22000 |
| order-6 | PED-2026-0006 | paid | box_office | Pablo Ibáñez | tt-2-pista × 2 | 6000 |
| order-7 | PED-2026-0007 | cancelled | web | Elena Castro | tt-2-grada × 1 | 5000 |

→ `tt-2-pista.quantitySold = 6`, `pool-2-pista.soldCount = 6`;
`tt-2-grada.quantitySold = 2`, `pool-2-grada.soldCount = 2` (`cancelled` no
cuenta).

**Event 4 — Festival del Sur (org-2, tt-4-pass "Abono 3 días" 90,00 €, sin pool — ticket tipo `pass`)**

| id | nº pedido | estado | canal | comprador | líneas | total |
|---|---|---|---|---|---|---|
| order-8 | PED-2026-0008 | paid | box_office | Nuria Vidal | tt-4-pass × 2 | 18000 |
| order-9 | PED-2026-0009 | paid | courtesy | Prensa Sur | tt-4-pass × 1 (precio 0) | 0 |
| order-10 | PED-2026-0010 | partially_refunded | web | Hugo Serrano | tt-4-pass × 2 | 18000 |

→ `tt-4-pass.quantitySold = 5` (`paid` + `partially_refunded` cuentan —
al no tener granularidad por entrada individual, se asume que al menos una
unidad de un pedido parcialmente reembolsado sigue vendida; sin pool que
actualizar, es un ticket tipo `pass`).

`organizationId` y `eventId` de cada `Order` se toman del evento
correspondiente (`event-1`/`event-2` → `org-1`; `event-4` → `org-2`).
`createdAt` con fechas de agosto/julio de 2026, anteriores a cada evento.

## 4. Endpoints mock nuevos (`apps/panel/src/mocks/handlers/orders.ts`)

Base `http://localhost:4000/api/v1`, mismo formato (`{ data, meta }` /
`{ error }`) y mismo criterio de alcance que `events.ts`
(`canAccessEvent`: superadmin ve todo; el resto solo su organización, y si
tiene `eventScopes` no vacío, solo esos eventos).

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/orders` | `orders:read` | Lista pedidos visibles para el actor. Query params opcionales: `eventId`, `status`, `channel`, `q` (busca en `orderNumber`, `customerName`, `customerEmail`, case-insensitive). Orden: `createdAt` descendente |
| `GET` | `/orders/:id` | `orders:read` | `{ ...order, items: OrderItem[] }`. `404 NOT_FOUND` si no existe o el evento del pedido queda fuera del alcance del actor |

Sin `orders:read` efectivo → `403 FORBIDDEN` (mismo patrón que
`dashboard.ts`).

## 5. Páginas y componentes (`apps/panel/src/features/sales`)

- **`VentasLayout.tsx`** (`/ventas/*`) — pestañas de navegación real
  (`NavLink`, no estado local): Pedidos, y Reembolsos / Taquilla (POS) /
  Asistentes (CRM) deshabilitadas con el mismo estilo que
  `EventDetailPage`. `<Outlet />` para las rutas hijas.
- **`orders/list/OrdersListPage.tsx`** (`/ventas/pedidos`) — tabla con
  `@tanstack/react-table` (mismo patrón que `EventsListPage`): nº pedido,
  evento, comprador, canal, estado, total, fecha. Filtros encima: select de
  evento (reutiliza `useEventsQuery`), select de estado, select de canal,
  input de búsqueda. Fila → `Link` a `/ventas/pedidos/:id`.
- **`orders/list/useOrdersQuery.ts`** — `useQuery(["orders", filters], …)`,
  construye el query string a partir de los 4 filtros.
- **`orders/detail/OrderDetailPage.tsx`** (`/ventas/pedidos/:id`) —
  cabecera (nº pedido, badge de estado, evento, comprador + email, canal,
  fecha) y tabla de líneas (tipo de entrada, cantidad, precio unitario,
  subtotal) con el total al pie. `404` → mismo tratamiento que
  `EventDetailPage` ("Pedido no encontrado").
- **Router:** añadir `/ventas` a `PLACEHOLDER_PATHS` en `router.tsx`;
  añadir rutas `/ventas` (redirige a `pedidos`), `/ventas/pedidos` y
  `/ventas/pedidos/:id` bajo `RequirePermission permission="orders:read"`,
  con `VentasLayout` como elemento padre.

## 6. Testing

- **Unit/integración — `mocks/handlers/orders.test.ts`:** listado sin
  filtros; filtro por `eventId`, `status`, `channel`, `q` (nº pedido, nombre,
  email); alcance por organización (admin de `org-1` no ve pedidos de
  `event-4`); alcance por `eventScopes` (usuario limitado a `event-1` y
  `event-2` no ve pedidos de `event-4`, si tuviera `orders:read`); detalle
  devuelve `items`; `404` en pedido inexistente o fuera de alcance; `403`
  sin `orders:read`.
- **Componentes:** `OrdersListPage` (filtros combinados, navegación a
  detalle, estado vacío), `OrderDetailPage` (desglose de líneas + total,
  caso 404).
- **`router.test.tsx`:** añadir caso de acceso a `/ventas/pedidos` para un
  rol con `orders:read`.
