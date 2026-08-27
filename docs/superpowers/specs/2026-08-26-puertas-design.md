# Puertas y control de acceso — Diseño

**Fecha:** 2026-08-26
**Referencia:** `docs/README.md` §2.2.4 (`gates`, `gate_ticket_types`), §4.3 (mapa de navegación), §4.5 (Control de accesos / Puertas), §6.9 (endpoints)

## Objetivo

Habilitar el apartado "Puertas" de la ficha de evento (hoy una pestaña deshabilitada en `EventDetailPage`), permitiendo crear, listar, activar/desactivar y eliminar puertas de control de acceso asociadas a un evento, y asignarles como operadores a subusuarios ya existentes de la organización.

## No objetivos

- No hay subsistema de Pedidos/Tickets/Scans en este panel, así que ninguna puerta puede validar un QR de verdad: no se construyen `POST /scan/validate`, `/scan/batch`, `/scan/manual`, `/scan/:scanId/reverse`, `GET /events/:eventId/scans` ni `GET /events/:eventId/attendance/live`.
- No hay PWA de escaneo (`apps/scan` en la arquitectura completa) — queda fuera de este repo/panel.
- No se implementa emparejamiento de dispositivos (`device_token`, `POST /gates/:id/pairing-code`, `POST /auth/device/pair`): no tiene sentido sin un dispositivo de escaneo real.
- No se construye el subsistema "Equipo" completo (invitar usuarios, editar rol, activar/desactivar, permisos, sesiones — `docs/README.md` §6.x). Para poder asignar operadores a una puerta hace falta poder listar los subusuarios ya existentes de la organización; se añade solo un endpoint de lectura mínimo para eso (ver "Endpoints del mock"), no la gestión de equipo.
- `isActive` es un interruptor manual del organizador; no hay ningún proceso automático que lo cambie.

## Arquitectura

Las puertas son un recurso a nivel de evento (`eventId`), gestionado con el mismo patrón CRUD ya usado para códigos de descuento (`discountCodes.ts`): un handler mock con `requireEvent`/`requireGate`, y una sección React con lista arriba + formulario de creación abajo (`GatesSection.tsx`, misma estructura que `DiscountCodesSection.tsx`). Al igual que `appliesTo` en `DiscountCode`, qué tipos de entrada admite una puerta se modela como un array de `groupId` (o `null` = todos) en vez de la tabla de unión `gate_ticket_types` del diseño completo — más simple y coherente con el resto del panel mock.

## Modelo de datos

### `Gate` (nuevo, `packages/types/src/schemas.ts`)

```ts
export const GateSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(),
  name: z.string(),
  code: z.string(),
  zoneId: z.string().nullable(),
  direction: z.enum(["in", "out", "both"]),
  allowReentry: z.boolean(),
  maxScansPerTicket: z.number().int().positive(),
  allowedTicketTypeGroupIds: z.array(z.string()).nullable(),
  opensAt: z.string().nullable(),
  closesAt: z.string().nullable(),
  operatorUserIds: z.array(z.string()),
  isActive: z.boolean()
});
export type Gate = z.infer<typeof GateSchema>;
```

- `subEventId`: `null` = válida para todos los subeventos del evento (igual criterio que `TicketType.subEventId`).
- `zoneId`: opcional; referencia a una `Zone` del recinto del evento (`Venue` → `Zone`, ya existente). `null` = sin zona asociada.
- `allowedTicketTypeGroupIds`: array de `groupId` de tipos de entrada, o `null` = admite todos.
- `opensAt` / `closesAt`: ventana horaria en la que la puerta admite escaneos (ISO datetime, mismo patrón que `salesStartAt`/`salesEndAt` de `Event` o `doorsOpenAt` de `SubEvent`). `null` en uno o ambos = sin restricción por ese lado. Como no hay subsistema de escaneo real (ver "No objetivos"), esta ventana es solo informativa/configurable en esta fase — no se valida contra nada en tiempo de ejecución.
- `maxScansPerTicket`: entero positivo, por defecto `1` en el formulario de creación.
- `operatorUserIds`: array de `id` de `User` con `role: "subuser"` de la misma organización que el evento; `[]` por defecto (nadie asignado todavía). A diferencia de `subEventId`/`allowedTicketTypeGroupIds`, aquí no hay un significado especial para "vacío" (no es "todos") — simplemente nadie asignado aún.

### `Database` (`apps/panel/src/mocks/db.ts`)

Se añade `gates: Gate[]` a la interfaz `Database` y al seed: una puerta de ejemplo en `event-2` (Rock en Directo, venue con zonas `zone-pista`/`zone-grada` ya sembradas), p. ej. "Puerta Norte" con `zoneId: zonePista.id`, `direction: "in"`, `allowReentry: false`, `maxScansPerTicket: 1`, `allowedTicketTypeGroupIds: null`, `opensAt: null`, `closesAt: null`, `operatorUserIds: [DEMO_SUBUSER_ID]` (el único subusuario ya sembrado, `db.ts` — "Personal de puerta", organización `org1`, misma organización que `event-2`), `isActive: true`.

## Endpoints del mock (nuevo `apps/panel/src/mocks/handlers/gates.ts`)

- `GET /events/:eventId/gates` — lista las puertas del evento.
- `POST /events/:eventId/gates` — crea una. Si `code` (comparado sin distinguir mayúsculas/minúsculas) ya existe en ese mismo evento, responde `422 VALIDATION_ERROR` ("Ya existe una puerta con ese código en este evento"). `isActive` se inicializa a `true`; `operatorUserIds` a `[]` si no se envía.
- `PATCH /gates/:id` — actualiza cualquier subconjunto de campos (se usa para editar, para el botón Activar/Desactivar que envía `{ isActive: boolean }`, y para el selector de operadores que envía `{ operatorUserIds: string[] }`).
- `DELETE /gates/:id` — elimina la puerta. Sin restricciones de negocio (no hay `scans` que lo impidan en esta fase).
- `GET /events/:eventId/team` (nuevo, mínimo) — devuelve los `User` con `role: "subuser"` de la misma organización que el evento (`event.organizationId`). Es una versión de solo lectura, acotada a este caso de uso, del futuro `GET /users` completo de "Equipo" (`docs/README.md` §6.x) — no incluye invitación, edición de rol ni gestión de permisos.

Se registra en `apps/panel/src/mocks/handlers/index.ts` junto al resto (`...gatesHandlers`).

## Componentes

- **`GatesSection.tsx`** (nuevo, `apps/panel/src/features/events/wizard/steps/`, mismo directorio que `DiscountCodesSection`/`SeatingPlanSection` ya que se reutiliza también desde `EventDetailPage`): recibe `eventId: string | null`. Si `eventId` es `null`, placeholder "Guarda la información del evento...". Obtiene `venueId` del evento (para `useZonesQuery`), `subEvents` (vía `useSubEventsQuery`, ya existente), `ticketTypes`/`groupTicketTypes` (igual que `DiscountCodesSection`) y el equipo de subusuarios (vía `GET /events/:eventId/team`) para los selectores.
  - Lista de puertas existentes: nombre + código, subevento ("Todos" o el nombre del subevento), zona ("Sin zona" o su nombre), dirección (Entrada/Salida/Ambas), reentrada (Sí/No), tipos admitidos ("Todos" o los nombres seleccionados), ventana horaria ("Sin restricción horaria", o "Desde hh:mm"/"Hasta hh:mm"/"hh:mm–hh:mm" según qué extremos tenga definidos, formateados con `Intl.DateTimeFormat`), operadores asignados (nombres, o "Sin operadores asignados"), botón Activar/Desactivar según `isActive`, botón Eliminar.
  - Formulario "Nueva puerta": Nombre (obligatorio), Código (obligatorio), Subevento aplicable (radio "Todos los subeventos" / "Subevento concreto" + `<select>` cuando hay subeventos; si el evento no tiene subeventos, se omite el selector y siempre es `null`), Zona (`<select>` con "Sin zona" + las zonas del recinto, opcional), Dirección (radio Entrada/Salida/Ambas, por defecto Entrada), Permite reentrada (checkbox), Escaneos máximos por ticket (número, por defecto `1`), Tipos de entrada admitidos (radio "Todos los tipos de entrada" / "Tipos concretos" + checkboxes por grupo, mismo patrón que `DiscountCodesSection`), Ventana horaria de apertura (dos `<input type="datetime-local">` opcionales, "Abre" y "Cierra"; vacío = `null`, mismo patrón de conversión a ISO que `validFrom`/`validTo` de `DiscountCodesSection`), Operadores (checkboxes con los subusuarios de la organización devueltos por `GET /events/:eventId/team`; si no hay ninguno, se muestra "No hay subusuarios en esta organización" en vez de la lista).
  - Botón "Crear puerta" deshabilitado hasta que Nombre y Código estén rellenos.
  - Cada puerta de la lista también tiene su propio bloque de operadores editable in situ: checkboxes (mismo listado de subusuarios) que al cambiar llaman a `PATCH /gates/:id` con `{ operatorUserIds }` — no hace falta entrar en un modo "editar" aparte, igual que el botón Activar/Desactivar actúa directamente sobre la fila.

## Integración en `EventDetailPage.tsx`

- `"Puertas"` pasa de `DISABLED_TABS` a `ENABLED_TABS` (`{ key: "puertas", label: "Puertas" }`).
- Se importa `GatesSection` y se renderiza `{activeTab === "puertas" && <GatesSection eventId={eventId} />}`.
- No se toca `EventWizardPage.tsx`: este apartado es solo de la ficha de evento ya creado, según el mapa de navegación de `docs/README.md` §4.3.

## Testing

- `schemas.test.ts` — `GateSchema`: acepta una puerta válida, rechaza `direction` desconocida, acepta `subEventId`/`zoneId`/`allowedTicketTypeGroupIds`/`opensAt`/`closesAt` como `null`, acepta `operatorUserIds` como array vacío.
- `gates.test.ts` (handler) — crear, listar, rechazar código duplicado (case-insensitive) dentro del mismo evento, `PATCH` para cambiar `isActive`, `PATCH` para cambiar `operatorUserIds`, `DELETE`, `GET /events/:eventId/team` devuelve solo los `subuser` de la organización del evento.
- `GatesSection.test.tsx` — placeholder sin `eventId`; lista puertas ya sembradas (incluido su operador ya asignado); crea una nueva con "Todos los subeventos"/"Todos los tipos de entrada" sin operadores; crea una con subevento y tipos de entrada concretos; botón deshabilitado con campos obligatorios vacíos; asigna un operador a una puerta existente desde la lista; activar/desactivar una puerta existente; eliminar una.
- `EventDetailPage.test.tsx` — se añade un caso que cambia a la pestaña "Puertas" y comprueba que el formulario de creación se renderiza (ya no está en `DISABLED_TABS`). El test existente `"disables out-of-scope sections with an explanatory tooltip"` apunta hoy al botón `"Puertas"` para comprobar que está deshabilitado — como esta spec lo mueve a `ENABLED_TABS`, ese test se actualiza para apuntar a `"Invitados"` en su lugar (sigue deshabilitado).

## Fuera de alcance de esta spec

- Escaneo real, PWA de escaneo, emparejamiento de dispositivos, log de escaneos, aforo en vivo.
- Gestión de equipo (invitar, editar rol, activar/desactivar usuarios, permisos, sesiones) — solo se lee la lista de subusuarios ya existentes.
- Los otros 3 apartados pendientes del mapa de navegación (Invitados/Cortesías, Pedidos y asistentes, Métricas) — cada uno su propio spec.
