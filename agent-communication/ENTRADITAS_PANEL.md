# Entraditas Panel Handoff

Ultima actualizacion: 2026-09-01

Este archivo queda reservado para el chat/agente que trabaja en `panel.entraditas.com`.

## Alcance

- Dominio: `panel.entraditas.com`
- Repo local: `C:\Users\AXEL\Desktop\MODULARBOX\PANEL-ENTRADITAS`
- Repo esperado: `git@github.com:modularbox/panel-entraditas.git`

Este archivo no debe usarse para decisiones de la web publica de compradores. Para `entraditas.com`, usar:

```text
C:\Users\AXEL\Desktop\MODULARBOX\ENTRADITAS\agent-communication\ENTRADITAS_PUBLIC_WEB.md
```

## Responsabilidad Del Panel

El panel gestiona organizadores/admins y el flujo interno de eventos:

- Datos basicos del evento.
- Sesiones / fechas.
- Tipos de entrada.
- Plano y zonas.
- Publicacion.
- Estados: borrador, pendiente/enviado a revision, en revision, publicado, cancelado, rechazado.
- Aprobacion de organizadores.
- Gestion interna y administracion.

## Contratos Que Debe Coordinar Con La Web Publica

La web publica consume eventos publicados y debe recibir como minimo:

- Portada.
- Galeria.
- Categoria.
- Titulo.
- Fecha/hora o `dateStatus: "to_be_announced"`.
- Ubicacion: recinto, direccion, localidad y provincia.
- Descripcion.
- Tipos de entrada con nombre, precio y color.
- Gastos de gestion opcionales.
- Plano opcional con zonas/asientos.
- Estado publicado.

Si un evento no tiene fecha confirmada, la web publica muestra:

```text
Fecha por confirmar + Avisar
```

y no permite compra general.

## Nota Para El Chat Del Panel

Completar este archivo desde el chat encargado del panel con:

- Estado real del repo.
- Comandos de build/test.
- Pantallas terminadas.
- Pendientes.
- Contratos API usados.
- Decisiones visuales del panel.

## Estado Real Del Repo

- Repo local: `C:\Users\AXEL\Desktop\MODULARBOX\PANEL-ENTRADITAS`
- Remoto: `git@github.com:modularbox/panel-entraditas.git`
- Branch local actual: `codex/eventos-panel`
- `origin/main` actual revisado: `72f5224` (`Añade handoff compartido Codex Claude`)
- Estado al revisar: limpio salvo esta carpeta `agent-communication/` pendiente de trackear.
- Este chat queda limitado a `panel.entraditas.com`. No tocar `C:\Users\AXEL\Desktop\MODULARBOX\ENTRADITAS` salvo lectura puntual para sincronizar estilos/contratos.

## Stack Y Comandos

Stack actual del panel:

- React 18
- Vite
- TypeScript
- Tailwind
- TanStack Query
- Zustand
- React Hook Form
- Zod
- MSW/mocks locales mientras no este conectada la API real

Comandos:

```powershell
npm.cmd ci
npm.cmd test -- --run --reporter=dot
npm.cmd run build
npm.cmd run dev
```

Validacion mas reciente (2026-09-02):

- Tests: `58 passed`, `411 tests OK`
- Build: OK (tipos limpios; sigue el aviso preexistente de chunk > 500 kB)
- Produccion verificada con `200 OK` (verificacion anterior)

Nota de entorno: el navegador integrado de Claude Code no puede ejecutar el panel porque
bloquea el registro del Service Worker de MSW, y `src/main.tsx` solo renderiza dentro de
`enableMocking().then(...)`. Para revisar visualmente hay que abrir `npm.cmd run dev` en un
Chrome/Edge normal (`http://localhost:5174`). Se anadio `.claude/launch.json` en este repo.

## Estructura Principal Del Panel

Rutas principales:

- `src/app/router.tsx`
- `src/app/navItems.ts`
- `src/app/layouts/PanelLayout.tsx`

Features activas:

- Eventos:
  - Lista: `src/features/events/list/`
  - Detalle/edicion por pestañas: `src/features/events/detail/`
  - Wizard crear/editar: `src/features/events/wizard/`
- Dashboard:
  - `src/features/dashboard/`
- Ventas:
  - Pedidos: `src/features/sales/orders/`
  - Asistentes: `src/features/sales/attendees/`
  - Reembolsos: `src/features/sales/refunds/`
  - Taquilla: `src/features/sales/taquilla/`
- Control de accesos:
  - `src/features/access/`
  - Puertas: `src/features/access/gates/`
- Equipo:
  - `src/features/team/`
- Organizaciones:
  - `src/features/organizations/`

Secciones todavia placeholder desde navegacion:

- Informes
- Finanzas
- Auditoria

## Estado Del Modulo Eventos

Wizard:

- Archivo principal: `src/features/events/wizard/EventWizardPage.tsx`
- Pasos visibles desde el inicio:
  1. Informacion del evento
  2. Varias funciones
  3. Tipos de entrada
  4. Plano de asientos
  5. Publicar evento
- Los pasos que necesitan `eventId` aparecen bloqueados hasta guardar el evento.
- Si el evento cargado es de una sola funcion, se oculta el paso de varias funciones.

Informacion basica:

- Archivo: `src/features/events/wizard/steps/Step1BasicInfo.tsx`
- Incluye portada adjunta/URL, galeria multiple, categorias, fecha por confirmar, descripcion visual, gastos de gestion y preview publico.

Preview publico:

- Archivo: `src/features/events/wizard/steps/publicEventPreview.tsx`
- Modos: tarjeta web y detalle web.
- El boton `Puntos` del editor se puede activar y desactivar pulsando de nuevo.

Tipos de entrada:

- Archivo: `src/features/events/wizard/steps/Step4TicketTypes.tsx`
- Incluye nombre, precio, color, cantidad total, edicion y borrado.
- No se puede avanzar si hay un tipo a medio crear/editar sin guardar.

Plano y zonas:

- Archivos:
  - `src/features/events/wizard/steps/SeatingPlanSection.tsx`
  - `src/features/events/wizard/steps/ZoneCanvas.tsx`
  - `src/features/events/wizard/steps/ZoneEditorPanel.tsx`
  - `src/features/events/wizard/steps/ZoneSeatEditor.tsx`
  - `src/features/events/wizard/steps/seatMap.ts`
  - `src/features/events/wizard/steps/TicketTypeAssignment.tsx`
- El plano es opcional.
- Zonas vendibles: numeradas y de pie.
- Elementos no vendibles: escenario, accesible, puerta.
- La asignacion acumulada por tipo muestra fraccion tipo `30/80`.
- No se puede superar el limite de entradas del tipo entre varias zonas.

### Asientos Individuales (2026-09-02)

Las zonas numeradas ya no pintan puntos decorativos: tienen asientos reales, numerados y
asignables uno a uno.

Modelo:

- Los asientos NO se guardan en base de datos. Se derivan de `capacity` + `rows` de la zona
  con `buildSeatGrid()` en `seatMap.ts`. La zona sigue siendo un registro pequeno y reutilizable.
- Numeracion fisica: la fila A es la mas cercana al escenario (se calcula comparando la posicion
  del elemento `stage` con la de la zona), y el asiento 1 es el de la izquierda de cada fila.
  Etiquetas tipo `A1`, `B7`; con mas de 26 filas continua en `AA`, `AB`.
- El reparto de plazas por fila es lo mas uniforme posible: 25 plazas en 4 filas son 7/6/6/6.
- `Zone.rows` (nuevo, opcional): filas fisicas de una zona numerada. `null` = se deduce de la
  forma de la zona para que las butacas salgan aproximadamente cuadradas.
- `CapacityPool.seatAssignments` (nuevo, opcional): lista dispersa `{seatId, ticketTypeGroupId}`.
  Solo aparecen los asientos asignados, asi que una zona puede tener asientos sin vender.

Reglas de negocio:

- Una zona numerada puede vender VARIOS tipos de entrada a la vez (antes era uno por zona).
- Un tipo de entrada consume stock por asiento asignado, no por capacidad entera de la zona.
  El handler valida esto en `poolTakeForGroup()` / `validateAllocation()`.
- El reparto se hace por cantidad (se colocan solos en orden de lectura) o clicando asientos.
- Sobre un asiento asignado se puede: quitar el tipo, cambiarlo, o moverlo a otro asiento
  (si el destino esta ocupado, se intercambian; nunca se pierde una asignacion).
- Bajar la cantidad libera los ultimos asientos colocados.
- Las asignaciones que apuntan a asientos inexistentes (tras redimensionar o cambiar filas)
  se descartan con `pruneAssignments()` para que no sigan consumiendo stock.
- Validacion del paso: una zona numerada es invalida si no tiene plazas o si no tiene ningun
  asiento asignado. Dejar asientos sin asignar es valido (se muestra como aviso, no bloquea).
- Las zonas de pie mantienen la asignacion por zona entera en `TicketTypeAssignment`.

Tests: `seatMap.test.ts` (37) y `ZoneSeatEditor.test.tsx` (13), mas 3 de integracion en
`SeatingPlanSection.test.tsx`.

Revision/publicacion:

- Archivo: `src/features/events/wizard/steps/Step5Publish.tsx`
- Checklist visible:
  - Datos principales de la plantilla.
  - Fecha o aviso.
  - Tipos de entrada.
  - Plano y zonas.
- Si falta algo, se marca `Pendiente` y no permite enviar a revision.
- Al enviar a revision vuelve a `/eventos`.

Detalle de evento:

- Archivo: `src/features/events/detail/EventDetailPage.tsx`
- Pestañas activas:
  - Informacion general
  - Subeventos
  - Aforos y zonas
  - Tipos de entrada
  - Codigos de descuento
  - Puertas
  - Invitados
- Pestañas visibles desactivadas:
  - Pedidos
  - Metricas

## Contratos API/Mocks Usados Por El Panel

Contratos compartidos:

- `packages/types/src/schemas.ts`

Mocks y handlers:

- Seed: `src/mocks/data/db.seed.json`
- Estado mock: `src/mocks/state.ts`
- Handlers:
  - `src/mocks/handlers/events.ts`
  - `src/mocks/handlers/subEvents.ts`
  - `src/mocks/handlers/ticketTypes.ts`
  - `src/mocks/handlers/capacityPools.ts`
  - `src/mocks/handlers/venues.ts`
  - `src/mocks/handlers/discountCodes.ts`
  - `src/mocks/handlers/gates.ts`
  - `src/mocks/handlers/guestLists.ts`
  - `src/mocks/handlers/organizations.ts`

Si se cambian contratos de eventos, entradas, aforos, descuentos, zonas, puertas o invitados:

- Actualizar `packages/types/src/schemas.ts`.
- Actualizar mocks/handlers.
- Actualizar este archivo.
- Si afecta a compradores/web publica, documentarlo en la seccion "Impacto Para Web Publica".

## Deploy

Produccion:

- URL: `https://panel.entraditas.com/`
- Ruta SFTP usada con exito: `/panel.ENTRADITAS.COM`
- Ultimo deploy manual de app realizado despues del commit `d7e9b3a`.
- El commit `72f5224` solo añade documentacion de handoff, por lo que no cambio el build de produccion.

Workflow:

- Archivo: `.github/workflows/deploy.yml`
- El workflow compila, pero GitHub Actions todavia necesita secrets para hacer FTP automatico:
  - `FTP_USERNAME`
  - probablemente `FTP_PASSWORD`
- No guardar credenciales en Git.

## Decisiones Importantes

- Este chat solo trabaja el panel de organizadores/admins.
- La web publica es otro repo/hilo. Leerla solo cuando haga falta entender estilo o contrato visual.
- Para cambios de frontend, conservar la linea visual de bordes negros, sombra dura, acciones principales en naranja/rojo y componentes modernos.
- El panel trabaja contra mocks ahora mismo, preparado para API futura.
- El stock real, reservas, pagos, QR y seguridad final deben quedar bajo autoridad de API, no del cliente.

## Contrato De Publicacion Implementado (2026-09-02)

Primera mitad de la sincronizacion, ya en codigo. Falta la segunda (ver "Lo Que Bloquea").

### Que Se Construyo

- `packages/types/src/publicCatalog.ts`: el contrato que consume la web publica
  (`PublicEvent`, `PublicTicketTier`, `PublicSeat`, `PublicSeatZone`, `PublicDiscountCode`,
  `PublicSession`, `PublicMatchup`, `EVENT_CATEGORIES`).
- `src/features/publish/toPublicEvent.ts`: mapper puro del modelo interno del panel al
  contrato. Es el UNICO sitio donde se resuelven las diferencias entre los dos mundos.
- `src/mocks/handlers/publicCatalog.ts`: `GET /public/events` y `GET /public/events/:slug`.
  Sin autenticacion y cross-organizacion a proposito: un comprador no tiene sesion de panel
  y navega los eventos de todos los organizadores a la vez.

### Reglas Fijadas En El Contrato

- **Dinero siempre en centimos**, enteros. La web formatea. Nunca floats.
- **Categorias cerradas** (`EVENT_CATEGORIES`). `Event.category` ya es el enum compartido, y
  los handlers de crear/editar rechazan con 422 una categoria desconocida: antes el default
  era `"otros"`, que la web no sabe pintar. Este bug lo caza ahora el chequeo de tipos.
- **Los asientos viajan explicitos** (no `rows x seatsPerRow`), cada uno con su etiqueta y su
  `tierId`. Asi la web nunca re-deriva la numeracion y no puede discrepar con el panel sobre
  que silla es la A7. Esto ANULA la recomendacion previa de compartir `seatMap.ts`: ya no hace
  falta, el panel manda los asientos resueltos.
- `tierId: null` en un asiento = **no esta a la venta**, no es "agotado". La web debe pintarlo
  como no seleccionable.
- **Gastos de gestion** viajan como `{type, value}`, no como importe fijo por entrada: un fee
  porcentual no se puede resolver a una cifra antes de que el comprador elija tipo de entrada.
- Estados internos de revision NUNCA salen: solo `published`/`on_sale`/`sold_out`/`paused`/
  `finished` y ademas `visibility: "public"`. Borrador, pendiente y rechazado quedan fuera.
- Tipos de entrada `hidden` y `code_only` no entran en el catalogo.
- **Codigos de descuento**: solo se publican los `active` y con usos restantes. `percent` es
  entero (10 = 10%), `fixed` en centimos, y se conserva la restriccion por tipo de entrada.

### Lo Que Bloquea La Sincronizacion Real

El endpoint existe pero vive dentro del Service Worker de MSW del panel: **solo responde
dentro del navegador del panel**. La web publica no puede llamarlo (otro origen, otro
despliegue estatico, sin backend comun). Hoy son dos sitios estaticos por FTP sin API.

Para que un evento creado en el panel aparezca de verdad en entraditas.com hace falta UNA de
estas dos, y ninguna se puede hacer solo desde este repo:

1. Levantar `api-entraditas` sirviendo `GET /public/events` con estos mismos contratos
   (el mapper ya esta escrito y probado, es portable tal cual).
2. O un paso de build que exporte el catalogo a un JSON estatico que la web lea.

Ademas la web tiene que cambiar para consumirlo: hoy sus eventos salen de datos mock locales
y sus 2 codigos de descuento estan hardcodeados en `src/lib/discounts.ts`.

## Analisis De api.entraditas.com (2026-09-02)

Revisado `C:\Users\AXEL\Desktop\MODULARBOX\api-entraditas`. **La API NO es solo para pagos**:
ya implementa el transporte que necesita la sincronizacion.

- Node + SQLite, escucha en `127.0.0.1:8787`. Su README lo dice explicitamente:
  "publicacion de eventos desde el panel y lectura desde la web publica".
- `PUT /v1/events/:id` con cabecera `x-panel-api-key` -> el panel publica.
- `GET /v1/events` -> devuelve `{ items: [...] }` con los eventos `status = 'published'`.
- Guarda el body tal cual en `payload_json`, asi que es casi agnostica a la forma: solo
  **valida** que existan `slug`, `title`, `status`, `category`, `venue.name`, `venue.city`,
  `ticketTiers` (array no vacio) y, si `dateStatus` es `confirmed`, `date` y `time`.
- Bonus importante: al pasar un evento de `to_be_announced` a `confirmed` **dispara sola** las
  notificaciones a quien pulso la campanita (usuarios registrados e invitados por email/SMS).

### Incompatibilidades Con El Contrato De Publicacion

| Concepto | Contrato del panel | Lo que valida la API |
|---|---|---|
| Tipos de entrada | `tiers` | `ticketTiers` (nombre distinto) |
| Fecha | `startsAt` ISO | `date` + `time` separados |
| Dinero | centimos | la web espera euros |
| Envoltorio de respuesta | `{data, meta}` | `{items}` |

Como la API guarda el payload entero, basta con que el panel mande **ademas** los campos que
ella valida (`ticketTiers`, `date`, `time`) para pasar la validacion sin perder el contrato rico.

### Lo Que Falta Para Que Un Evento Del Panel Llegue A La Web

Ya esta hecho: la web consume y fusiona (commit `c8cba60` en `web-entraditas`), y el panel
produce el contrato (`toPublicEvent`). **Falta la pieza del medio: el panel no llama nunca a
`PUT /v1/events/:id`.** Sin eso la API no tiene nada que servir.

Antes de implementarlo hay que decidir una cosa de seguridad: `PANEL_API_KEY` esta pensada para
llamadas servidor-a-servidor. El panel es una app de navegador, asi que **cualquiera que abra
las devtools podria leer la clave** y publicar eventos falsos. Opciones:

1. Que la publicacion la haga un backend/funcion intermedia con la clave (lo correcto).
2. O que la API acepte el JWT de sesion del panel y valide rol en vez de una clave compartida.

No se ha implementado ninguna: es una decision de Axel.

## Analisis Sincronizacion Web <-> Panel (2026-09-02)

Analisis de lectura del repo `ENTRADITAS` para preparar la conexion. Nada implementado
todavia: esto es el inventario de lo que hay que alinear.

### La Web Ya Tiene Un Contrato De API Esperado

`ENTRADITAS/src/lib/accountApi.ts` ya llama a `VITE_API_URL` con estos endpoints. Es el
contrato que la API tendra que cumplir, y varios exigen pantallas en el panel que NO existen:

| Endpoint que llama la web | Que necesita del panel |
|---|---|
| `POST /v1/auth/login` | Cuentas de comprador (dominio distinto al staff del panel) |
| `POST /v1/auth/verification` + `/v1/auth/register` | Alta con codigo por email/SMS |
| `PATCH /v1/me` | Perfil del comprador |
| `GET /v1/notifications`, `PATCH /v1/notifications/:id/read` | **Falta en panel**: nada emite notificaciones |
| `POST/DELETE /v1/events/:id/alerts` | **Falta en panel**: al confirmar fecha hay que disparar el aviso |
| `POST /v1/support/requests` | **Falta en panel**: bandeja de soporte |
| `POST /v1/organizers/applications` | **Falta en panel**: aprobar/rechazar solicitudes de organizador |

Ojo: la web usa base `/v1/...` y el panel `http://localhost:4000/api/v1/...`. Hay que unificar.

### Desajustes De Contrato De Evento

Comparando `ENTRADITAS/src/types/index.ts` (`EventItem`) con `packages/types/src/schemas.ts`:

| Campo | Web publica | Panel | Accion |
|---|---|---|---|
| Categoria | union cerrada de 7 (`concierto`, `teatro`, `cine`, `festival`, `deporte`, `conferencia`, `familiar`) | `category: z.string()` libre | **Compartir el enum**. Hoy el panel puede crear una categoria que la web no sabe pintar |
| Precios | euros (`price: 25`) | centimos (`basePrice: 2500`) | Fijar unidad unica en el contrato (recomendado: centimos en API, formateo en cliente) |
| Recinto | `address`, `province`, `coordinates`, `placeId` | `Venue` solo tiene `name`, `city`, `totalCapacity` | **Falta en panel**: direccion, provincia y coordenadas |
| `longDescription` | si | solo `description` | **Falta en panel** |
| `tags: string[]` | si | no | **Falta en panel** |
| `featured: boolean` | si (destacados en home) | no | **Falta en panel**: no hay forma de destacar un evento |
| `durationMinutes` | si | no | **Falta en panel** |
| Partido/versus | `Matchup` con equipos y logos | solo `isCompetition: boolean` | **Falta en panel**: no se pueden crear equipos ni subir sus logos |
| Plano | `SeatsElement {rows, seatsPerRow, price}` (1 precio por zona) | `Zone {capacity, rows}` + tipo por asiento | Modelos incompatibles: ver "Cambio De Contrato" abajo |

### Cuentas

Son dos dominios de identidad distintos y conviene no mezclarlos:

- Panel: `superadmin | admin | user | subuser`, con `organizationId`, `permissionOverrides`
  y `eventScopes`.
- Web: `AccountRole = 'user' | 'organizer' | 'admin'` en `AuthContext.tsx`.

El rol `organizer` de la web es residuo de cuando el panel vivia dentro de ese repo. Decision
propuesta: la web se queda solo con compradores y el alta de organizador pasa a ser una
solicitud (`POST /v1/organizers/applications`) que se aprueba desde el panel.

### Orden Recomendado

1. Mover el enum de categorias y `seatMap.ts` a `packages/` compartido entre repos.
2. Anadir al panel los campos que la web ya pinta y el panel no puede rellenar
   (`longDescription`, `tags`, `featured`, `durationMinutes`, matchup, direccion del recinto).
3. Pantalla de solicitudes de organizador en el panel.
4. Notificaciones/avisos de fecha disparados desde el panel.
5. Unificar base de URL y unidad monetaria en la API real.

## Pendientes Prioritarios

- Probar visualmente el wizard completo en desktop y movil (incluido el nuevo editor de asientos).
- Desarrollar el apartado de QR (pendiente, no empezado).
- Ejecutar el plan de sincronizacion web <-> panel del analisis de arriba.
- Mejorar drag/touch del plano si vuelve a ir mal en pantallas tactiles.
- Implementar plantillas reutilizables de plano con API/mock formal.
- Pulir selectores nativos visibles en puertas, invitados y cualquier pantalla nueva.
- Configurar secrets de GitHub Actions para deploy automatico real.
- Sincronizar contrato final de evento publicado con el repo publico si cambia el modelo.

## Impacto Para Web Publica

Actualmente el panel prepara/dibuja estos datos para que la web publica los consuma cuando la API exista:

- Portada y galeria.
- Categoria.
- Titulo.
- Fecha/hora o fecha por confirmar.
- Ubicacion/localidad.
- Descripcion HTML basica.
- Tipos de entrada con precio, color y cantidad.
- Gastos de gestion.
- Plano opcional con zonas/asientos.
- Subeventos/sesiones.
- Estado de revision/publicacion.

Regla vigente: si un evento no tiene fecha confirmada, la web publica debe mostrar `Fecha por confirmar` + aviso/campanita y no compra general.

### Modo De Aforo Y Plantillas (2026-09-02)

- `Event.seatingMode: "plan" | "zones" | null` (nuevo). Los dos modos son **excluyentes**: un
  evento nuevo elige primero y solo se muestra ese editor. Si es `null` pero el recinto ya
  tiene zonas dibujadas, se asume `plan` y no se vuelve a preguntar (compatibilidad).
- Modo `zones` (sin plano): mismo modelo completo -- zonas, aforo, filas, reparto por tipo de
  entrada y asientos -- en una lista, sin lienzo. Las zonas creadas ahi guardan posicion por
  defecto, asi que pasar a `plan` despues no pierde nada. No ofrece escenario ni puertas,
  que solo tienen sentido sobre un plano dibujado.
- `VenuePlanTemplate` **redefinido**: antes era un tipo huerfano con la forma antigua
  (`VenuePlanElement`) y sin handlers ni UI. Ahora guarda `TemplateZone[]` (zonas sin `id` ni
  `venueId`), es decir la forma de la sala, reutilizable en varios recintos.
  Handlers: `GET/POST /venue-plan-templates`, `DELETE /venue-plan-templates/:id`.
  Aplicar una plantilla es aditivo: nunca borra las zonas que ya haya.
- Movilidad reducida ya **no es un tipo de zona**: es `CapacityPool.accessibleSeatIds`, marca
  por asiento con casilla, pintada en azul con el simbolo de silla de ruedas. Se retiro el
  boton de "zona accesible" (el `kind` sigue existiendo por planos antiguos).

Bugs de interaccion corregidos el mismo dia:

- El input de reparto por tipo estaba gobernado por el estado persistido y cada tecla lanzaba
  un guardado asincrono, asi que revertia solo: era imposible teclear dos cifras.
- `pointerdown` alternaba la seleccion y el `onClick` la volvia a alternar, asi que un click
  seleccionaba y deseleccionaba al instante. Ahora `pointerdown` solo selecciona, hay umbral
  de 4px, el click posterior a un arrastre se ignora y el lienzo lleva `touch-none`.
  Para deseleccionar se pulsa el fondo del plano.

### Cambio De Contrato 2026-09-02 (afecta a la web publica)

Dos campos nuevos, ambos opcionales y retrocompatibles (un cliente que los ignore sigue
funcionando igual que antes):

- `Zone.rows: number | null` - filas fisicas de una zona numerada.
- `CapacityPool.seatAssignments: {seatId, ticketTypeGroupId}[]` - que tipo de entrada vende
  cada asiento.

Impacto para la web publica cuando exista la API:

- El plano publico debe derivar los asientos igual que el panel (`capacity` + `rows`), o la
  numeracion que vea el comprador NO coincidira con la del panel ni con la sala fisica.
  Conviene mover `seatMap.ts` a `packages/` y compartirlo entre los dos repos.
- Una zona numerada puede tener varios precios/tipos a la vez: el selector de entradas del
  comprador no puede asumir "una zona = un tipo de entrada".
- Los asientos sin `ticketTypeGroupId` no estan a la venta y deben pintarse como no
  seleccionables, no como agotados.
