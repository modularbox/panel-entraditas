# Rediseño del asistente de creación de eventos — Diseño

**Fecha:** 2026-08-26
**Referencia visual:** https://entraditas.com/organizador/nuevo (captura de pantalla aportada por el usuario)

## Objetivo

Rediseñar `EventWizardPage` para que se parezca, en estilo visual, flujo y campos, al
formulario de creación de eventos de la web de referencia — pasando de un asistente de
5 pasos con navegación por pestañas a una única página con secciones apiladas — sin
perder ninguna capacidad que el panel ya ofrece hoy (funciones múltiples/subeventos,
recintos reutilizables, zonas de aforo numérico, tipos de entrada reordenables).

## No objetivos

- No se construye un flujo de moderación/revisión real. El botón final publica el
  evento igual que hoy (`POST /events/:id/publish`); no se introduce un estado
  "pendiente de revisión".
- No se construye un editor de planos de asientos real. La sección "Plano de
  asientos" solo captura la intención (checkbox) y un nombre de archivo simulado —
  el procesamiento real del PDF queda fuera de alcance, igual que en la referencia
  ("si no cuentas con él, contacta con nosotros").
- No se cambia el modelo de permisos (`events:create`, `events:read`) ni las rutas
  existentes (`/eventos/nuevo/editar`, `/eventos/:id/editar`).

## Arquitectura

`EventWizardPage` deja de renderizar un único paso a la vez controlado por
`wizardStore.currentStep` y pasa a renderizar todas las secciones apiladas
verticalmente en una sola página. Cada sección sigue siendo, internamente, el mismo
componente de hoy (mismo hook de datos, misma llamada a la API) — el cambio es de
composición y layout, no de lógica de negocio:

| Sección (nueva página) | Componente reutilizado | Estado |
|---|---|---|
| Información del evento | `Step1BasicInfo` (ampliado) | Siempre visible |
| Competición | Campo nuevo dentro de `Step1BasicInfo` | Siempre visible |
| ¿Varias funciones? | `Step2Schedule` (sin cambios de lógica) | Oculta tras checkbox |
| Tipos de entrada | `Step3TicketTypes` (ampliado) | Visible tras guardar sección 1 |
| ¿Aforo por zonas? | `Step3Capacity` (sin cambios de lógica) | Oculta tras checkbox |
| Plano de asientos | Componente nuevo `SeatingPlanSection` | Siempre visible |
| Publicar evento | `Step5Publish` (sin cambios de lógica) | Visible tras guardar sección 1 |

`wizardStore` pierde el concepto de `currentStep`/`goToStep`/`next`/`back` (ya no hay
navegación paso a paso) y se queda solo con `eventId` — necesario porque las
secciones 2 en adelante siguen dependiendo de que el evento ya exista en borrador.
Se mantiene el guardado incremental actual: la sección "Información del evento" crea
el evento (`POST /events`) o lo actualiza (`PATCH /events/:id`) al enviarse; el resto
de secciones se habilitan cuando `eventId` no es `null`, igual que hoy.

`WIZARD_STEP_TITLES` y la barra de pestañas numeradas desaparecen. Se sustituyen por
títulos de sección `<h2>` dentro de la propia página, con el mismo estilo de tarjeta
(`border-2 border-foreground bg-surface shadow-flat`) que ya usa el resto del panel.

## Cambios de datos

### `Event` (`packages/types/src/schemas.ts`)

Se añaden tres campos, todos con valor por defecto para no romper eventos existentes:

```ts
isCompetition: z.boolean(),
hasNumberedSeating: z.boolean(),
seatingPlanFileName: z.string().nullable()
```

Los eventos ya sembrados en `db.ts` se actualizan con `isCompetition: false`,
`hasNumberedSeating: false`, `seatingPlanFileName: null`.

### `TicketType`

Se añade:

```ts
color: z.string().nullable()
```

Usado por el selector de color de la sección "Tipos de entrada" (paleta fija de 6-8
colores predefinidos, no un color picker libre — coherente con los puntos de color
de la referencia). Los tipos de entrada ya sembrados se actualizan con `color: null`.

### `Venue` — sin cambios de esquema

`Venue` ya tiene `name` y `city`, que son exactamente los campos "Recinto /
dirección" y "Ciudad" de la referencia. En vez de exponer un selector de recinto
existente, la sección "Información del evento" pide directamente "Recinto" y
"Ciudad" como texto libre. Al guardar:

1. Se busca un `Venue` de la organización con `name` y `city` iguales (comparación
   case-insensitive, `trim()`).
2. Si existe, se reutiliza su `id` como `venueId` del evento.
3. Si no existe, se crea uno nuevo vía `POST /venues` con
   `totalCapacity: 999999` (capacidad "sin límite definido" hasta que el
   organizador configure aforo por zonas en la sección avanzada — ese valor nunca
   se muestra al usuario, solo actúa de tope no restrictivo para la validación que
   ya existe en `Step3Capacity`).

Esta lógica vive en un helper nuevo `findOrCreateVenue` en
`apps/panel/src/mocks/handlers/events.ts` (mock) — en un backend real sería
responsabilidad del propio endpoint `POST /events`. Como el proyecto es
mock-first, el endpoint `POST /events` del mock hace esta resolución cuando recibe
`venueName`/`venueCity` en el body en vez de `venueId` directo.

## Sección 1: Información del evento

Sustituye y amplía `step1Schema`/`Step1BasicInfo`:

| Campo | Tipo | Validación | Mapea a |
|---|---|---|---|
| Título del evento | texto | mín. 3 caracteres (igual que hoy) | `Event.title` |
| Categoría | select (mismas 5 opciones actuales) | requerido (igual que hoy) | `Event.category` |
| Ciudad | texto | requerido | `Venue.city` (vía `findOrCreateVenue`) |
| Recinto | texto | requerido | `Venue.name` (vía `findOrCreateVenue`) |
| Fecha | date input | requerida | crea el primer `SubEvent` (`startsAt`) |
| Hora | time input | requerida | crea el primer `SubEvent` (`startsAt`) |
| Descripción | textarea | mín. 1 carácter (igual que hoy) | `Event.description` |
| ¿Es competición? | checkbox | — | `Event.isCompetition` |
| ¿Varias funciones o fechas? | checkbox | — | `Event.hasSubEvents`; si se marca, despliega la sección "¿Varias funciones?" y las funciones se gestionan ahí en vez de con el campo Fecha/Hora único |

Al enviar por primera vez (sin `eventId`): `POST /events` con estos campos +
`venueName`/`venueCity`. La respuesta trae el `Event` creado; el mock, en la misma
petición, crea también el primer `SubEvent` con `startsAt` = Fecha+Hora combinadas y
`endsAt` = `startsAt` + 3 horas (duración por defecto, igual que ya asume
`Step2Schedule` con `durationMinutes: 120` de patrón — aquí usamos 180 min como
default razonable para un evento de función única; el usuario puede ajustarlo luego
abriendo "¿Varias funciones?"). Si `hasSubEvents` es `true`, no se crea ningún
`SubEvent` automáticamente — el usuario los define en la sección desplegable.

Reenvíos posteriores (con `eventId` ya asignado, p. ej. al editar un borrador)
seguirán usando `PATCH /events/:id` como hoy.

## Sección "Tipos de entrada"

Amplía el formulario ya existente en `Step3TicketTypes`:

- Se añade el campo **Cantidad** (input numérico, opcional — vacío = ilimitado,
  igual semántica que `quantityTotal: null` ya soportada por el esquema). Se envía
  como `quantityTotal: priceEuros === "" ? null : Number(cantidad)`.
- Se añade un selector de **Color** con 6 pastillas fijas (paleta reutilizando los
  tokens de color ya definidos en `packages/config` / Tailwind del proyecto, para no
  introducir una paleta nueva). Selección única, por defecto ninguna (`color: null`).
- El resto del componente (orden por drag&drop, ámbito evento/subeventos) no
  cambia.

## Sección "Plano de asientos" (nueva)

Componente nuevo `SeatingPlanSection.tsx`, autocontenido, sin dependencia de
`eventId` para poder mostrarse siempre (a diferencia de tipos de entrada / aforo):

- Checkbox "¿Este evento tiene asientos o gradas numeradas?" → controla
  `Event.hasNumberedSeating`.
- Si está marcado, aparece una zona de subida de archivo (`<input type="file"
  accept="application/pdf">` estilizado como caja punteada, igual que la
  referencia) con el texto "Sube tu plano de asientos en formato PDF... si no
  cuentas con él, contacta con nosotros". No hay backend de almacenamiento real: al
  seleccionar un archivo, se guarda únicamente `file.name` en
  `Event.seatingPlanFileName` vía `PATCH /events/:id` (no se sube el binario). Esto
  dentro del alcance mock-first del proyecto y evita construir infraestructura de
  storage que no se necesita para el resto del panel.
- Ambos campos se guardan mediante `PATCH /events/:id` en cuanto cambian (patrón
  autoguardado, sin botón propio), habilitado solo cuando `eventId` existe.

## Sección "Publicar evento"

Sin cambios funcionales respecto a `Step5Publish` actual (checklist + botón
"Publicar evento" que llama a `POST /events/:id/publish`). Solo cambia su posición
en la página (al final, tras todas las secciones) y el título de sección, que pasa
de "Checklist de publicación" a mantenerse igual dentro de una tarjeta con el mismo
estilo que el resto de secciones.

## Compatibilidad con eventos existentes

Los eventos creados con el flujo anterior (ya en `db.ts` o creados durante pruebas
manuales previas) no tienen `isCompetition`/`hasNumberedSeating`/
`seatingPlanFileName`. Al añadir estos campos al esquema con valores obligatorios
(no opcionales), se actualiza el seed de `db.ts` con los valores por defecto
(`false`/`false`/`null`) para que seguir cumpliendo el esquema — igual que se hizo
con `refundedAmount` en el trabajo de Ventas.

## Testing

Sigue el patrón TDD ya usado en el resto del proyecto:

- `EventWizardPage.test.tsx` (existente, se actualiza): en vez de comprobar
  navegación entre pasos, comprueba que todas las secciones aparecen apiladas y que
  las secciones dependientes de `eventId` (Tipos de entrada, Publicar, ¿Varias
  funciones?, ¿Aforo por zonas?) están deshabilitadas/ocultas hasta guardar la
  sección 1.
- `Step1BasicInfo.test.tsx` (existente, se amplía): nuevos campos (ciudad, recinto,
  fecha, hora, competición) y el envío que crea `Venue` + `SubEvent` automáticos.
- `SeatingPlanSection.test.tsx` (nuevo): checkbox, subida simulada de archivo,
  guardado del nombre.
- `Step3TicketTypes.test.tsx` (existente, se amplía): cantidad y color en la
  creación de un tipo de entrada.
- `events.test.ts` (mock handlers, existente, se amplía): `findOrCreateVenue`
  (reutiliza recinto existente vs crea uno nuevo), creación automática del primer
  `SubEvent` al crear el evento con Fecha/Hora.

## Fuera de alcance de esta spec

- Edición de recintos ya creados desde esta pantalla (gestión de `Venue` sigue sin
  UI dedicada, igual que hoy).
- Vista previa del plano de asientos subido.
- Cualquier cambio en `EventsListPage`/`EventDetailPage` — no consumen estos campos
  nuevos por ahora; podrían mostrarse en una iteración futura si se pide.
