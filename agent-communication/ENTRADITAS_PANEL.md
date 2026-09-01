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

Validacion mas reciente antes de este handoff:

- Tests: `56 passed`, `358 tests OK`
- Build: OK
- Produccion verificada con `200 OK`

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
  - `src/features/events/wizard/steps/TicketTypeAssignment.tsx`
- El plano es opcional.
- Zonas vendibles: numeradas y de pie.
- Elementos no vendibles: escenario, accesible, puerta.
- Las zonas numeradas pintan butacas adaptadas al tamaño de la zona.
- Una zona vendible no puede quedar sin tipo de entrada asignado.
- La asignacion acumulada por tipo muestra fraccion tipo `30/80`.
- No se puede superar el limite de entradas del tipo entre varias zonas.

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

## Pendientes Prioritarios

- Probar visualmente el wizard completo en desktop y movil.
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
