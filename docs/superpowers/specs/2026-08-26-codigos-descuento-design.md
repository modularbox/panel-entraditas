# Códigos de descuento — Diseño

**Fecha:** 2026-08-26
**Referencia:** `docs/README.md` §2.2.2 (`discount_codes`), §4.3 (mapa de navegación), §6.8 (endpoints)

## Objetivo

Habilitar el apartado "Códigos de descuento" de la ficha de evento (hoy una pestaña deshabilitada en `EventDetailPage`, con el aviso "Disponible en una fase posterior"), permitiendo crear, listar, activar/desactivar y eliminar códigos de descuento asociados a un evento.

## No objetivos

- No hay subsistema de Pedidos/checkout en este panel todavía, así que ningún código se puede canjear de verdad: `usedCount` se muestra pero permanece en 0, y no existe el endpoint público `POST /public/discount-codes/validate` — queda fuera de alcance.
- No se incluye generación masiva (`bulk-generate`).
- `validFrom`/`validTo` y `status` son solo informativos en esta fase: no hay ningún proceso automático que desactive un código al pasar `validTo`, ni que impida su canje (no hay canje). El organizador controla `status` manualmente.

## Arquitectura

Los códigos de descuento son un recurso a nivel de evento (`eventId`), gestionado con el mismo patrón CRUD ya usado para tipos de entrada (`ticketTypes.ts`): un handler mock con `requireEvent`/`requireDiscountCode`, una nueva sección React que sigue la estructura lista-arriba + formulario-de-creación-abajo (igual que `Step4TicketTypes.tsx`), y un botón de creación deshabilitado hasta que los campos obligatorios estén rellenos (mismo patrón ya usado en el resto del asistente esta sesión).

## Modelo de datos

### `DiscountCode` (nuevo, `packages/types/src/schemas.ts`)

```ts
export const DiscountCodeSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  code: z.string(),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().nonnegative(),
  maxUses: z.number().int().positive().nullable(),
  usedCount: z.number().int().nonnegative(),
  maxUsesPerCustomer: z.number().int().positive().nullable(),
  appliesTo: z.array(z.string()).nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  status: z.enum(["active", "inactive"])
});
export type DiscountCode = z.infer<typeof DiscountCodeSchema>;
```

- `value`: si `type === "percent"`, entero 0–100; si `type === "fixed"`, céntimos (mismo criterio que `TicketType.basePrice`).
- `appliesTo`: array de `groupId` de tipos de entrada (el mismo `groupId` que ya usa `TicketType`/`groupTicketTypes`); `null` = aplica a todos los tipos de entrada del evento.
- `maxUses` / `maxUsesPerCustomer`: `null` = ilimitado.

### `Database` (`apps/panel/src/mocks/db.ts`)

Se añade `discountCodes: DiscountCode[]` a la interfaz `Database` y al seed (vacío o con 1-2 códigos de ejemplo en un evento existente, para que `DiscountCodesSection.test.tsx` tenga un caso de "ya hay códigos").

## Endpoints del mock (nuevo `apps/panel/src/mocks/handlers/discountCodes.ts`)

- `GET /events/:eventId/discount-codes` — lista los códigos del evento.
- `POST /events/:eventId/discount-codes` — crea uno. Si `code` (comparado sin distinguir mayúsculas/minúsculas) ya existe en ese mismo evento, responde `422 VALIDATION_ERROR` ("Ya existe un código de descuento con ese nombre en este evento"). `usedCount` se inicializa a `0`, `status` a `"active"`.
- `PATCH /discount-codes/:id` — actualiza cualquier subconjunto de campos (se usa tanto para editar como para el botón Activar/Desactivar, que envía `{ status: "active" | "inactive" }`).
- `DELETE /discount-codes/:id` — elimina el código. Sin restricciones de negocio (a diferencia de zonas/tipos de entrada) porque `usedCount` siempre es 0 en esta fase.

Se registra en `apps/panel/src/mocks/handlers/index.ts` junto al resto (`...discountCodesHandlers`).

## Componentes

- **`DiscountCodesSection.tsx`** (nuevo, `apps/panel/src/features/events/wizard/steps/`, mismo directorio que `SeatingPlanSection`/`Step4TicketTypes` ya que ambos se reutilizan también desde `EventDetailPage`): recibe `eventId: string | null`. Si `eventId` es `null`, placeholder "Guarda la información del evento...". Obtiene `ticketTypes` (vía el mismo hook que ya usa `Step4TicketTypes`) para poder listar los tipos de entrada seleccionables en "Aplica a", y `groupTicketTypes` (ya exportado) para agruparlos.
  - Lista de códigos existentes: código, tipo+valor formateado ("15%" o "10,00 €"), usos ("0 / 100" o "0 (ilimitado)"), "Aplica a" (nombres de los tipos o "Todos"), botón Activar/Desactivar según `status`, botón Eliminar.
  - Formulario "Nuevo código de descuento": Código (input texto, obligatorio), Tipo (radio Porcentaje/Importe fijo), Valor (input numérico, obligatorio, sufijo `%` o `€` según tipo), Usos máximos (opcional, placeholder "Ilimitado"), Usos máximos por cliente (opcional, placeholder "Ilimitado"), Válido desde / Válido hasta (inputs `type="date"`, opcionales), Aplica a (radio "Todos los tipos de entrada" / "Tipos concretos" + checkboxes por grupo, mismo patrón que la selección de subeventos en `Step4TicketTypes`).
  - Botón "Crear código" deshabilitado hasta que Código, Tipo y Valor estén rellenos.

## Integración en `EventDetailPage.tsx`

- `"Códigos de descuento"` pasa de `DISABLED_TABS` a `ENABLED_TABS` (`{ key: "descuentos", label: "Códigos de descuento" }`).
- Se importa `DiscountCodesSection` y se renderiza `{activeTab === "descuentos" && <DiscountCodesSection eventId={eventId} />}`.
- No se toca `EventWizardPage.tsx`: este apartado es solo de la ficha de evento ya creado, según el mapa de navegación de `docs/README.md` §4.3.

## Testing

- `schemas.test.ts` — `DiscountCodeSchema`: acepta un código válido, rechaza `type` desconocido, acepta `maxUses`/`appliesTo`/`validFrom`/`validTo` como `null`.
- `discountCodes.test.ts` (handler) — crear, listar, rechazar código duplicado (case-insensitive) dentro del mismo evento, `PATCH` para cambiar `status`, `DELETE`.
- `DiscountCodesSection.test.tsx` — placeholder sin `eventId`; lista códigos ya sembrados; crea uno nuevo (con "Todos los tipos de entrada"); crea uno con "Tipos concretos" y comprueba `appliesTo`; botón deshabilitado con campos obligatorios vacíos; activar/desactivar un código existente; eliminar uno.
- `EventDetailPage.test.tsx` — ya cubre que las pestañas fuera de alcance (p. ej. "Puertas") están deshabilitadas; se añade un caso nuevo que cambia a la pestaña "Códigos de descuento" y comprueba que el formulario de creación se renderiza (ya no está en `DISABLED_TABS`).

## Fuera de alcance de esta spec

- Canje real de códigos (no hay Pedidos).
- `bulk-generate`.
- Aplicación automática de `validFrom`/`validTo` (expiración).
- Los otros 4 apartados pendientes del mapa de navegación (Puertas, Invitados/Cortesías, Pedidos y asistentes, Métricas) — cada uno su propio spec.
