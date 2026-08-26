# Ventas · Asistentes (CRM) — diseño

> Estado: aprobado para plan de implementación.
> Ámbito: `apps/panel` (panel de administración).
> Cuarto y último sub-proyecto del apartado Ventas (tras Pedidos,
> Reembolsos y Taquilla). Con esta entrega las 4 pestañas de Ventas
> quedan activas.

## 1. Contexto y objetivo

`Asistentes (CRM)` es hoy la última pestaña deshabilitada de
`VentasLayout`. Esta entrega la activa: un listado de compradores
("asistentes") con sus métricas de compra agregadas, y una ficha de
detalle con su histórico completo de pedidos.

## 2. Decisiones de alcance (acordadas en brainstorming)

- **Sin tabla nueva:** los pedidos no llevan `customerId` (solo
  `customerName`/`customerEmail` en texto libre), y no se añade uno. Los
  asistentes se **derivan en caliente** de `db.orders`, agrupando por
  `customerEmail`. Así queda automáticamente coherente con Taquilla (y
  con Pedidos en el futuro) sin ningún dato que sincronizar a mano.
- **Qué cuenta como compra real:** solo pedidos `paid`,
  `partially_refunded` o `refunded` generan métricas — un pedido
  `pending`, `cancelled` o `expired` no convierte a alguien en
  "asistente". `totalSpent` es neto (`total - refundedAmount`): un
  pedido reembolsado del todo suma 0 a lo gastado, pero la persona sigue
  contando como asistente (con ese pedido en su historial).
- **Con ficha de detalle:** reutiliza el mismo criterio de alcance que
  Pedidos; el histórico de la ficha muestra **todos** los pedidos de esa
  persona (cualquier estado, para contexto completo), aunque las 4
  métricas agregadas del encabezado solo cuenten los que cualifican.
- **Sin permiso nuevo:** reutiliza `orders:read` — la capacidad ya se
  llama "Ver pedidos y compradores" en el catálogo de `permissions.ts`.

## 3. Endpoints mock nuevos (`apps/panel/src/mocks/handlers/customers.ts`)

Base `http://localhost:4000/api/v1`, mismo formato de respuesta y mismo
criterio de alcance que `orders.ts` (reutiliza `canAccessOrder`,
exportada desde `orders.ts`).

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/customers` | `orders:read` | Agrupa los pedidos visibles al actor por `customerEmail`, filtra a los que cualifican (`paid`/`partially_refunded`/`refunded`), y devuelve un `Customer` por email con al menos 1 pedido cualificado. Query params opcionales: `eventId`, `q` (nombre o email, case-insensitive). Orden: `lastPurchaseAt` descendente |
| `GET` | `/customers/:email` | `orders:read` | `email` va codificado en la URL (`encodeURIComponent`). Devuelve `{ ...customer, orders: Order[] }` — `orders` son **todos** los pedidos de esa persona visibles al actor (cualquier estado), ordenados por fecha descendente. `404 NOT_FOUND` si no hay ningún pedido cualificado para ese email dentro del alcance del actor |

### 3.1 Cálculo de `Customer` por email (grupo de pedidos cualificados)

- `id`: el propio email (clave natural única en este modelo).
- `name`: `customerName` del pedido cualificado más reciente del grupo.
- `email`: el email del grupo.
- `ordersCount`: nº de pedidos cualificados.
- `ticketsCount`: suma de `quantity` de los `OrderItem` de esos pedidos.
- `totalSpent`: suma de `(order.total - order.refundedAmount)` de esos
  pedidos.
- `lastPurchaseAt`: `createdAt` máximo de esos pedidos.

Con la semilla actual de Pedidos (10 `orders`), esto produce 8
asistentes (se excluyen `order-3`, `pending`, y `order-7`, `cancelled` —
sus compradores no llegan a "asistente"): `marta.ruiz@example.com`,
`javier.soto@example.com`, `diego.molina@example.com` (totalSpent 0,
pedido reembolsado del todo), `sara.gomez@example.com`,
`pablo.ibanez@example.com` (los 5 de `org-1`), y
`nuria.vidal@example.com`, `prensa@surlive.example` (totalSpent 0,
cortesía), `hugo.serrano@example.com` (los 3 de `org-2`).

## 4. Páginas (`apps/panel/src/features/sales/attendees`)

- **`list/AttendeesListPage.tsx`** (`/ventas/asistentes`) — tabla con
  `@tanstack/react-table` (mismo patrón que `OrdersListPage`): nombre,
  email, nº pedidos, entradas, gastado, última compra. Filtro de evento
  (reutiliza `useEventsQuery`) y búsqueda. Fila → `Link` a
  `/ventas/asistentes/:email` (con el email codificado).
- **`list/useCustomersQuery.ts`** — `useQuery(["customers", filters], …)`.
- **`detail/AttendeeDetailPage.tsx`** (`/ventas/asistentes/:email`) —
  cabecera con las 4 métricas (pedidos, entradas, gastado, última
  compra) y debajo una tabla con el histórico completo de pedidos (nº
  pedido — enlaza a `/ventas/pedidos/:id`—, evento, estado, canal, total,
  fecha), mismas etiquetas de estado/canal que ya usa `OrderDetailPage`.
  `404` → mismo tratamiento visual que "Pedido no encontrado."
  ("Asistente no encontrado.").
- **`VentasLayout.tsx`** — "Asistentes (CRM)" pasa de `DISABLED_TABS` a
  `ENABLED_TABS`, apuntando a `/ventas/asistentes`. Con esto
  `DISABLED_TABS` queda vacío.
- **Router** (`app/router.tsx`) — añade `/ventas/asistentes` y
  `/ventas/asistentes/:email` dentro del mismo bloque
  `RequirePermission permission="orders:read"` que ya envuelve
  `VentasLayout`.

## 5. Testing

- **`mocks/handlers/customers.test.ts`:** el listado devuelve
  exactamente los 8 asistentes esperados con las métricas correctas
  (incluyendo el caso de reembolso total → `totalSpent: 0` sin excluir a
  la persona, y el caso de cortesía gratuita); un pedido `pending`/
  `cancelled` no genera asistente; alcance por organización (`admin` de
  `org-1` solo ve sus 5); filtro `eventId`/`q`; detalle devuelve el
  historial completo (incluyendo pedidos no cualificados de esa misma
  persona, si los hay) y `404` para un email sin pedidos cualificados
  visibles.
- **Componentes:** `AttendeesListPage` (filtros, navegación al detalle),
  `AttendeeDetailPage` (métricas correctas, historial completo, caso
  404).
- **`router.test.tsx`:** caso de acceso a `/ventas/asistentes`.
