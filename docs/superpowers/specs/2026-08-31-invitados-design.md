# Lista de invitados y cortesías (ficha de evento) — Diseño

**Fecha:** 2026-08-31
**Referencia:** `docs/README.md` §2.2.5 (`guest_lists`, `guest_list_entries`), §4.3 (mapa de navegación), §4.7-B ("Cortesías, lista de invitados y RRPP"), §6.10 (endpoints)

## Objetivo

Habilitar el apartado "Invitados" de la ficha de evento (hoy una pestaña deshabilitada en `EventDetailPage`), permitiendo crear listas de invitados nombradas por evento (con cupo opcional), y añadir/gestionar/eliminar invitados dentro de cada lista.

## No objetivos

- **Importación por CSV** (`POST /guest-lists/:id/entries/import`).
- **Envío masivo por email/SMS** (`POST /guest-lists/:id/issue`): no hay integración de correo/SMS en este panel mock.
- **Enlaces de RRPP con comisión automática** (`GET /events/:eventId/promoters/performance`): depende del módulo de liquidaciones, que no existe en este panel.
- **Check-in real sin QR por búsqueda**: no hay subsistema de escaneo/tickets reales en este panel (ver `docs/superpowers/specs/2026-08-26-puertas-design.md`, "No objetivos"). El estado "Registrado" de un invitado es un interruptor manual del organizador, no una validación real.
- **Emisión de un ticket real** (`guest_list_entries.ticket_id`): un invitado de la lista no genera ninguna fila en `TicketType`/`Order`; es solo un registro nominal.
- Estados `sent`/`cancelled` del modelo completo: se simplifican a solo `pending`/`checked_in` (ver "Modelo de datos").

## Arquitectura

Dos recursos a nivel de evento, con el mismo patrón CRUD ya usado para puertas (`gates.ts`/`GatesSection.tsx`): `GuestList` (una lista nombrada, con cupo opcional) y `GuestListEntry` (un invitado dentro de una lista). El handler mock usa `requireEvent`/`requireGuestList`/`requireEntry`, y la sección React (`GuestlistSection.tsx`) muestra las listas con sus invitados anidados dentro de cada una, más un formulario "Nueva lista" al final.

## Modelo de datos

### `GuestList` y `GuestListEntry` (nuevos, `packages/types/src/schemas.ts`)

```ts
export const GuestListSchema = z.object({
  id: z.string(),
  eventId: z.string(),
  subEventId: z.string().nullable(), // null = válida para todos los subeventos (mismo criterio que TicketType/Gate)
  name: z.string(),
  quota: z.number().int().positive().nullable() // null = sin límite
});
export type GuestList = z.infer<typeof GuestListSchema>;

export const GuestListEntrySchema = z.object({
  id: z.string(),
  guestListId: z.string(),
  fullName: z.string(),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  companions: z.number().int().nonnegative(),
  status: z.enum(["pending", "checked_in"]),
  notes: z.string().nullable()
});
export type GuestListEntry = z.infer<typeof GuestListEntrySchema>;
```

- `quota`: si no es `null`, es **bloqueante** — `POST /guest-lists/:id/entries` cuenta los invitados ya existentes en esa lista y, si ya está al máximo, responde `422 VALIDATION_ERROR` ("Esta lista ha alcanzado su cupo").
- `status`: por defecto `"pending"` al crear un invitado; se alterna con `PATCH /guest-list-entries/:id` (mismo patrón que el botón Activar/Desactivar de `Gate.isActive`).
- Eliminar una lista (`DELETE /guest-lists/:id`) borra en cascada todos sus invitados.

### `Database` (`src/mocks/db.ts` / `src/mocks/data/db.seed.json`)

Se añaden `guestLists: GuestList[]` y `guestListEntries: GuestListEntry[]`. Semilla: una lista `gl-2-prensa` ("Prensa", `eventId: "event-2"`, `subEventId: null`, `quota: 5`) con dos invitados: uno `status: "pending"`, otro `status: "checked_in"`.

## Endpoints del mock (nuevo `src/mocks/handlers/guestLists.ts`)

- `GET /events/:eventId/guest-lists` — lista las listas de invitados del evento.
- `POST /events/:eventId/guest-lists` — crea una (`name` obligatorio; `subEventId`/`quota` opcionales).
- `DELETE /guest-lists/:id` — elimina la lista y sus invitados.
- `GET /guest-lists/:id/entries` — lista los invitados de una lista.
- `POST /guest-lists/:id/entries` — añade un invitado (`fullName` obligatorio). Rechaza con `422` si la lista ya alcanzó su `quota`.
- `PATCH /guest-list-entries/:id` — actualiza cualquier subconjunto de campos (se usa para el botón Pendiente/Registrado, que envía `{ status }`).
- `DELETE /guest-list-entries/:id` — elimina un invitado.

Todos los endpoints reutilizan `canAccessEvent` (de `./events`), igual que `gates.ts`/`discountCodes.ts`. Se registra en `src/mocks/handlers/index.ts` (`...guestListsHandlers`).

## Componentes

**`GuestlistSection.tsx`** (nuevo, `src/features/events/wizard/steps/`, mismo directorio que `GatesSection`): recibe `eventId: string | null`. Si `eventId` es `null`, placeholder "Guarda la información del evento...". Obtiene `subEvents` (vía `useSubEventsQuery`, ya existente) para el selector "Subevento aplicable".

- Cada lista se muestra con: nombre, subevento ("Todos los subeventos" o su nombre), cupo (`"X / Y"` si tiene cupo, `"X · Sin límite"` si no), botón Eliminar (elimina la lista completa).
- **Dentro de cada lista**, sus invitados: nombre, email/teléfono (o "—" si no se dieron), acompañantes, notas, botón "Registrado"/"Pendiente" (alterna estado), botón Eliminar (quita solo ese invitado).
- **Dentro de cada lista**, un mini-formulario "Añadir invitado": Nombre (obligatorio), Email, Teléfono, Acompañantes (número, por defecto `0`), Notas. Botón "Añadir" deshabilitado hasta que Nombre esté relleno. Si la petición falla por cupo alcanzado, se muestra el mensaje de error del servidor.
- Formulario "Nueva lista" al final de la sección: Nombre (obligatorio), Subevento aplicable (radio "Todos los subeventos" / "Subevento concreto" + `<select>`, solo si el evento tiene subeventos — igual que en `GatesSection`), Cupo (número, opcional, vacío = sin límite). Botón "Crear lista" deshabilitado hasta que Nombre esté relleno.

## Integración en `EventDetailPage.tsx`

- `"Invitados"` pasa de `DISABLED_TABS` a `ENABLED_TABS` (`{ key: "invitados", label: "Invitados" }`).
- Se importa `GuestlistSection` y se renderiza `{activeTab === "invitados" && <GuestlistSection eventId={eventId} />}`.
- El test `"disables out-of-scope sections with an explanatory tooltip"`, que hoy comprueba que el botón `"Invitados"` está deshabilitado, se actualiza para apuntar a `"Pedidos"` (el siguiente que sigue sin construir).

## Testing

- `schemas.test.ts` — `GuestListSchema`/`GuestListEntrySchema`: aceptan un caso válido cada uno, `GuestList` acepta `quota`/`subEventId` como `null`, `GuestListEntry` rechaza un `status` desconocido.
- `guestLists.test.ts` (handler) — listar, crear lista, eliminar lista (comprueba que también borra sus invitados), listar invitados, añadir invitado, rechazar al superar el cupo, `PATCH` de estado, eliminar invitado, acceso a un evento fuera de alcance devuelve `404`.
- `GuestlistSection.test.tsx` — placeholder sin `eventId`; lista ya sembrada con sus 2 invitados (uno Pendiente, uno Registrado); botón "Crear lista" deshabilitado sin nombre; crea una lista nueva sin cupo (sin límite); añade un invitado a una lista existente; muestra un error al intentar añadir un invitado a una lista ya al cupo; alterna el estado de un invitado existente; elimina un invitado; elimina una lista completa (y sus invitados desaparecen con ella).
- `EventDetailPage.test.tsx` — añade un caso que cambia a la pestaña "Invitados" y comprueba que se ve la lista sembrada; el test existente de secciones deshabilitadas se actualiza para apuntar a "Pedidos".

## Fuera de alcance de esta spec

- Importación CSV, envío masivo de email/SMS, enlaces de RRPP y comisiones, check-in real sin QR, emisión de tickets/cortesías reales.
- Los otros 2 apartados pendientes del mapa de navegación (Pedidos y asistentes, Métricas) — cada uno su propio spec.
