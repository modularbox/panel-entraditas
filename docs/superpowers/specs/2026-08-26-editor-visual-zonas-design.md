# Editor visual de zonas del plano — Diseño

**Fecha:** 2026-08-26
**Referencia visual:** captura de pantalla aportada por el usuario (editor de recinto tipo "arrastra y suelta" con zonas numeradas, de pie, escenario/pantalla y zona accesible, más asignación de tipo de entrada por zona)

## Objetivo

Sustituir tanto la sección actual "Aforo por zonas" (`Step3Capacity`, formulario de nombre+capacidad numérica) como la sección "Plano de asientos" (`SeatingPlanSection`, checkbox + subida de PDF simulada) por un único editor visual de zonas: un lienzo donde el organizador dibuja, mueve y redimensiona zonas sobre un plano de su recinto, asigna un tipo de entrada a cada zona vendible, y ese plano queda guardado en el recinto (`Venue`) para reutilizarse automáticamente la próxima vez que se cree un evento en el mismo sitio.

## No objetivos

- No se construye un selector de asientos individuales (butaca 1, butaca 2...). Cada zona vendible lleva un aforo total agregado, igual que ya funciona hoy en "Aforo por zonas" — "numerada" frente a "de pie" es una etiqueta/estilo, no asientos reales.
- No se gestiona el aforo por función individual en eventos con varias funciones: igual que el `Step3Capacity` actual, la activación de zonas solo opera sobre la primera función del evento (`subEvents[0]`). Ampliar esto a todas las funciones queda fuera de alcance.
- No se construye edición colaborativa en tiempo real ni historial de versiones del plano.

## Arquitectura

Las zonas (`Zone`) pasan a llevar posición y tamaño (en porcentaje, relativos al lienzo) y un tipo (`kind`), y se editan directamente contra el `Venue` del evento — no contra el evento en sí — porque son la plantilla reutilizable del recinto. Cuando el evento ya tiene `eventId` y `venueId` resueltos (tras guardar la sección "Información del evento"), la nueva sección "Plano de asientos" sincroniza automáticamente, en segundo plano, un `CapacityPool` por cada zona vendible del recinto contra la primera función del evento — sin un paso manual de "activar zona". El plano dibujado es la fuente de la verdad; el aforo por evento se deriva de él.

## Modelo de datos

### `Zone` (`packages/types/src/schemas.ts`)

```ts
export const ZoneSchema = z.object({
  id: z.string(),
  venueId: z.string(),
  name: z.string(),
  kind: z.enum(["numbered", "standing", "stage", "accessible"]),
  capacity: z.number().int().nonnegative(),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100)
});
export type Zone = z.infer<typeof ZoneSchema>;
```

`capacity` cambia de `.positive()` a `.nonnegative()` porque las zonas `stage`/`accessible` no tienen aforo (se guardan con `capacity: 0` y el formulario no muestra ese campo para ellas). `x`/`y` son la esquina superior izquierda de la zona en porcentaje del lienzo; `width`/`height` su tamaño, también en porcentaje — así el plano se reescala igual en cualquier pantalla.

Las zonas ya sembradas en `db.ts` (`zonePista`, `zoneGrada`) se actualizan con `kind: "standing"` y una posición/tamaño por defecto razonable (p. ej. mitad izquierda/derecha del lienzo).

### `Event` — se retiran dos campos

`isCompetition` no cambia. Se eliminan `hasNumberedSeating` y `seatingPlanFileName`, añadidos en el trabajo inmediatamente anterior para el enfoque de "checkbox + PDF" que este diseño sustituye — ya no hay estado que guardar: el editor de zonas está siempre disponible para cualquier evento, con o sin zonas dibujadas.

## Endpoints del mock

- `GET /venues/:venueId/zones` (ya existe) — sin cambios de firma, ahora devuelve los campos nuevos.
- `POST /venues/:venueId/zones` (ya existe) — se amplía para aceptar `kind`, `x`, `y`, `width`, `height` en el body, con valores por defecto sensatos si no se envían (`kind: "standing"`, tamaño `20x20` en la posición `0,0`).
- `PATCH /zones/:id` (nuevo) — actualiza cualquier subconjunto de `name`, `kind`, `capacity`, `x`, `y`, `width`, `height`. Si la zona tiene `CapacityPool`s asociados (en cualquier evento) y se reduce `capacity` por debajo del `soldCount` de alguno, responde `422 INSUFFICIENT_CAPACITY` — mismo patrón que ya usa `PATCH /capacity-pools/:id`.
- `DELETE /zones/:id` (nuevo) — responde `409 VALIDATION_ERROR` si algún `CapacityPool` ligado a la zona tiene `soldCount > 0` en cualquier evento; si no, borra la zona y sus `CapacityPool`s asociados (solo los que no tengan ventas, por la comprobación anterior siempre serán todos).
- `GET /sub-events/:id/capacity`, `POST /sub-events/:id/capacity-pools`, `PATCH /capacity-pools/:id`, `PATCH /ticket-types/:id` (todos ya existen) se reutilizan tal cual para la sincronización zona↔aforo y la asignación de tipo de entrada.

## Sincronización zona → aforo del evento

Al montar la sección "Plano de asientos" con `eventId` y `venueId` resueltos:

1. `GET /venues/:venueId/zones` — zonas del recinto.
2. `useSubEventsQuery(eventId)` (ya existe) — se usa `subEvents[0]` como función objetivo, igual que hacía `Step3Capacity`.
3. `GET /sub-events/:id/capacity` — pools ya existentes para esa función.
4. Para cada zona con `kind` en `["numbered", "standing"]` que no tenga ya un pool con su `zoneId` en el resultado anterior, se llama a `POST /sub-events/:id/capacity-pools` con `{ name: zone.name, zoneId: zone.id, totalCapacity: zone.capacity }`, y se refresca la lista de pools.

Esta sincronización también debe volver a ejecutarse cuando se añade una zona nueva o se cambia el `capacity` de una existente (invalidando/refrescando las queries correspondientes), para que el pool del evento quede alineado con el plano.

## Componentes

- **`SeatingPlanSection.tsx`** (se reescribe por completo) — obtiene el evento para leer `venueId`, orquesta las queries de zonas/subeventos/pools/tipos de entrada, mantiene qué zona está seleccionada, y compone `ZoneCanvas`, `ZoneEditorPanel` y `TicketTypeAssignment`. Si el evento aún no tiene `venueId` (recinto sin resolver, caso raro dado que la sección 1 siempre lo crea), muestra un aviso y no renderiza el editor.
- **`ZoneCanvas.tsx`** (nuevo) — el lienzo: una franja fija "ESCENARIO" arriba (renderizada a partir de la zona `kind: "stage"` si existe, o de un marcador por defecto), y el resto de zonas como `div`s posicionados con `left/top/width/height` en `%`. Arrastrar mueve `x`/`y`; una asa en la esquina inferior derecha redimensiona `width`/`height`, ambos vía `pointerdown/pointermove/pointerup` propios (sin librería nueva), con los cambios confirmándose (llamada a `PATCH /zones/:id`) en `pointerup`. Clicar una zona la selecciona.
- **`ZoneEditorPanel.tsx`** (nuevo) — panel lateral para la zona seleccionada: nombre, aforo (solo si es vendible), Ancho %/Alto % (inputs numéricos que llaman a `PATCH /zones/:id` en `onBlur`, y son la vía alternativa a arrastrar — más fácil de testear), y botón "Eliminar esta zona". Los cuatro botones "+ Zona numerada / + Zona de pie / + Escenario/Pantalla / + Zona accesible" viven aquí también, cada uno llamando a `POST /venues/:venueId/zones` con el `kind` correspondiente y una posición/tamaño por defecto (evitando solapar zonas existentes de forma trivial: se coloca en el siguiente hueco libre en una rejilla simple).
- **`TicketTypeAssignment.tsx`** (nuevo) — lista, una fila por zona vendible, con el nombre de la zona y un `<select>` de los tipos de entrada del evento (vía el mismo hook de datos que ya usa `Step4TicketTypes`); al cambiar la selección llama a `PATCH /ticket-types/:id` con el `capacityPoolId` de esa zona.

## Qué se elimina

- `Step3Capacity.tsx` y `Step3Capacity.test.tsx` — sustituidos íntegramente por lo anterior.
- La sección "¿Aforo por zonas?" (el checkbox que desplegaba `Step3Capacity`) desaparece de `EventWizardPage`; "Plano de asientos" pasa a ser la única sección de este tipo, siempre visible.
- La lógica de checkbox + subida de PDF de la versión anterior de `SeatingPlanSection.tsx` se sustituye por el editor descrito arriba.
- `Event.hasNumberedSeating` y `Event.seatingPlanFileName` se eliminan del esquema y de los datos sembrados.
- El hook local `useVenuesQuery` ya extraído se reutiliza para resolver el recinto del evento; no se duplica.

## Testing

Sigue el patrón TDD ya usado en el proyecto:

- `schemas.test.ts` — nuevos campos de `Zone`, incluida la aceptación de `capacity: 0` para zonas `stage`/`accessible`.
- `venues.test.ts` — `POST /venues/:venueId/zones` con los campos nuevos; `PATCH /zones/:id` (incluido el bloqueo por ventas); `DELETE /zones/:id` (incluido el bloqueo por ventas).
- `ZoneCanvas.test.tsx` — añadir una zona con cada uno de los 4 botones; seleccionar una zona; editar Ancho%/Alto% desde el panel y comprobar que se persiste.
- `ZoneEditorPanel.test.tsx` (si se separa su lógica de `ZoneCanvas.test.tsx`) — validaciones del formulario, eliminación de zona.
- `TicketTypeAssignment.test.tsx` — asignar un tipo de entrada a una zona y comprobar el `capacityPoolId` resultante.
- `SeatingPlanSection.test.tsx` (se reescribe) — sincronización automática zona→`CapacityPool` al montar, y al añadir una zona nueva.
- `EventWizardPage.test.tsx` — se actualiza para reflejar que "¿Aforo por zonas?" ya no existe y "Plano de asientos" está siempre visible.

## Fuera de alcance de esta spec

- Aforo por función individual en eventos multi-función (se sigue usando solo la primera función, limitación heredada de `Step3Capacity`).
- Deshacer/rehacer en el editor visual.
- Exportar o imprimir el plano.
