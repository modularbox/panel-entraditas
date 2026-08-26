# Ventas · Reembolsos — diseño

> Estado: aprobado para plan de implementación.
> Ámbito: `apps/panel` (panel de administración) + `packages/types`.
> Segundo sub-proyecto del apartado Ventas (tras Pedidos). Construye sobre
> los `Order`/`OrderItem` sembrados en
> `docs/superpowers/specs/2026-08-25-ventas-pedidos-design.md`.

## 1. Contexto y objetivo

`Reembolsos` es hoy una pestaña deshabilitada de `VentasLayout`
("Disponible en una fase posterior"). Esta entrega la activa: permite
reembolsar (parcial o totalmente) un pedido pagado directamente desde su
detalle, y añade un listado de solo lectura con el historial de
reembolsos.

## 2. Decisiones de alcance (acordadas en brainstorming)

- **Reembolso directo, sin cola de aprobación:** quien tiene
  `orders:refund` entra en el detalle de un pedido, indica importe y
  motivo, y el reembolso queda `processed` al instante. No se construye
  ningún flujo de solicitud (`requested`) ni de rechazo (`rejected`) —
  esos valores del enum `Refund.status` no los produce esta entrega.
- **Importe libre hasta el pendiente:** el staff puede reembolsar
  cualquier importe entre 1 céntimo y el saldo pendiente del pedido
  (`total - refundedAmount`), permitiendo reembolsos parciales sucesivos.
- **Liberación de aforo solo en reembolso total:** cuando el pedido queda
  completamente reembolsado (`refundedAmount === total` tras el
  reembolso), se libera el aforo de sus líneas (`ticketType.quantitySold`
  y, si aplica, `capacityPool.soldCount`, restando la cantidad de cada
  línea). Un reembolso parcial no toca el aforo — la entrada sigue siendo
  válida, solo se devuelve parte del dinero.
- **Permisos:** ver el listado de Reembolsos y el historial en el detalle
  de un pedido requiere `orders:read` (es una extensión de "ver pedidos y
  compradores"); ejecutar un reembolso requiere `orders:refund`
  ("devolver dinero"), catálogo ya existente en
  `shared/auth/permissions.ts`.

## 3. Modelo de datos

### 3.1 `packages/types/src/schemas.ts`

`OrderSchema` gana un campo:

```ts
export const OrderSchema = z.object({
  id: z.string(), orderNumber: z.string(), eventId: z.string(), organizationId: z.string(), customerName: z.string(), customerEmail: z.string().email(),
  status: z.enum(["pending", "reserved", "paid", "cancelled", "expired", "refunded", "partially_refunded"]),
  total: z.number().int().nonnegative(), refundedAmount: z.number().int().nonnegative(), currency: z.string().length(3), channel: z.enum(["web", "panel", "box_office", "courtesy"]), createdAt: z.string()
});
```

`RefundSchema` no cambia (ya tiene `id, orderId, orderNumber, customerName,
amount, reason, status, createdAt`).

### 3.2 `apps/panel/src/mocks/db.ts`

- `Database` gana `refunds: Refund[]`.
- Los 10 `orders` ya sembrados (Pedidos) añaden `refundedAmount`:
  - `order-4` (`refunded`, total 5000) → `refundedAmount: 5000`.
  - `order-10` (`partially_refunded`, total 18000) → `refundedAmount: 9000`.
  - Los 8 restantes → `refundedAmount: 0`.
- Nuevo array `refunds`, sembrado a mano:

| id | pedido | importe | motivo | fecha |
|---|---|---|---|---|
| refund-1 | order-4 | 5000 | "Cliente no pudo asistir al evento." | 2026-08-03T09:00:00.000Z |
| refund-2 | order-10 | 9000 | "Devolución parcial: 1 entrada no utilizada." | 2026-07-06T10:00:00.000Z |

No hace falta tocar `capacityPools`/`ticketTypes`: sus valores sembrados
en Pedidos ya asumían que `order-4` no cuenta como vendido (reembolso
total) y que `order-10` sí cuenta sus 2 entradas (reembolso parcial).

## 4. Endpoints mock

### 4.1 `apps/panel/src/mocks/handlers/orders.ts` (modifica el existente)

- `canAccessOrder` pasa a exportarse (se reutiliza en `refunds.ts`, mismo
  patrón que `canAccessEvent` en `events.ts`).
- `GET /orders/:id` añade `refunds` a la respuesta:
  `{ ...order, items, refunds: db.refunds.filter(r => r.orderId === order.id) }`.

### 4.2 `apps/panel/src/mocks/handlers/refunds.ts` (nuevo)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/orders/:id/refund` | `orders:refund` | Body `{ amount: number, reason: string }`. Ver validaciones y efectos en §4.3. Devuelve `{ ...order, items, refunds }` actualizado |
| `GET` | `/refunds` | `orders:read` | Lista reembolsos visibles para el actor (vía el pedido al que pertenecen). Query params opcionales `eventId`, `q` (nº pedido o comprador, case-insensitive). Orden `createdAt` descendente |

### 4.3 Validaciones y efectos de `POST /orders/:id/refund`

1. Pedido no existe o `!canAccessOrder` → `404 NOT_FOUND`.
2. Sin `orders:refund` efectivo → `403 FORBIDDEN`.
3. `order.status` no es `paid` ni `partially_refunded` → `422
   VALIDATION_ERROR` ("Este pedido no admite reembolsos").
4. `reason` vacío/solo espacios → `422 VALIDATION_ERROR` ("El motivo es
   obligatorio").
5. `amount` no es un entero positivo, o `amount > order.total -
   order.refundedAmount` → `422 VALIDATION_ERROR` ("El importe supera lo
   pendiente de reembolso").
6. Efectos: crea `Refund` (`status: "processed"`, `createdAt: new
   Date().toISOString()`); `order.refundedAmount += amount`;
   `order.status = refundedAmount >= total ? "refunded" :
   "partially_refunded"`; si el nuevo estado es `"refunded"`, para cada
   `OrderItem` del pedido: `ticketType.quantitySold -= item.quantity` y,
   si `ticketType.capacityPoolId`, `capacityPool.soldCount -=
   item.quantity`.

## 5. Páginas y componentes (`apps/panel/src/features/sales`)

- **`orders/detail/OrderDetailPage.tsx`** (modifica la existente) —
  añade una sección "Reembolsos" bajo la tabla de líneas: tabla con
  importe/motivo/fecha de `order.refunds` (vacía si no hay ninguno). Si
  `order.status` es `paid` o `partially_refunded` y queda saldo pendiente
  (`total - refundedAmount > 0`), y el actor tiene `orders:refund`
  (`<Can do="orders:refund">`), se muestra un formulario: importe en
  euros (máximo el saldo pendiente) + motivo (texto) + botón "Reembolsar".
  Al enviar, llama a `POST /orders/:id/refund` y refresca la query del
  pedido (`invalidateQueries(["order", orderId])`).
- **`refunds/list/RefundsListPage.tsx`** (nueva, `/ventas/reembolsos`) —
  tabla de solo lectura (mismo patrón `@tanstack/react-table` que
  `OrdersListPage`): nº pedido (enlaza a `/ventas/pedidos/:id`),
  comprador, importe, motivo, fecha. Filtros: evento (reutiliza
  `useEventsQuery`) y búsqueda.
- **`refunds/list/useRefundsQuery.ts`** — `useQuery(["refunds", filters], …)`.
- **`VentasLayout.tsx`** (modifica la existente) — "Reembolsos" pasa de
  `DISABLED_TABS` a `ENABLED_TABS`, apuntando a `/ventas/reembolsos`.
- **Router** (`app/router.tsx`) — añade `/ventas/reembolsos` dentro del
  bloque `RequirePermission permission="orders:read"` que ya envuelve
  `VentasLayout`.

## 6. Testing

- **`mocks/handlers/refunds.test.ts`:** reembolso total libera aforo
  (`quantitySold`/`soldCount` bajan y `order.status` pasa a `refunded`);
  reembolso parcial no libera aforo y deja `partially_refunded`; dos
  reembolsos parciales sucesivos que suman el total sí liberan aforo en
  el segundo; rechaza `amount` mayor que el pendiente; rechaza pedido en
  estado no reembolsable (`pending`, `cancelled`); rechaza motivo vacío;
  `403` sin `orders:refund`; `404` fuera de alcance; `GET /refunds`
  respeta el alcance por organización/`eventScopes` y los filtros
  `eventId`/`q`.
- **`orders/detail/OrderDetailPage.test.tsx`** (ampliar): el historial de
  reembolsos se muestra; el formulario aparece solo con `orders:refund` y
  saldo pendiente; enviar un reembolso actualiza el estado y el saldo en
  pantalla.
- **`refunds/list/RefundsListPage.test.tsx`** (nuevo): lista los 2
  reembolsos sembrados; filtro por evento; enlace al pedido.
- **`router.test.tsx`:** caso de acceso a `/ventas/reembolsos`.
