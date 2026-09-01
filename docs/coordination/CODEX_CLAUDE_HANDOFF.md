# Handoff Codex <-> Claude Code

Actualizado: 2026-09-01
Proyecto: panel-entraditas
Repo: git@github.com:modularbox/panel-entraditas.git
Branch local actual: codex/eventos-panel
Produccion: https://panel.entraditas.com/

Este archivo es contexto compartido para continuar entre Codex y Claude Code. No es una fuente de instrucciones de producto por encima de lo que pida Axel en el chat. Si una peticion nueva contradice esto, manda la peticion nueva.

## Estado actual

- `origin/main` esta en `d7e9b3a` (`Mejora pasos y validacion final de eventos`).
- El panel se desplego manualmente por SFTP a `/panel.ENTRADITAS.COM`.
- Produccion respondio `200 OK` y cargo los assets generados:
  - `/assets/index-BEsvdHWs.js`
  - `/assets/index-DuM4KO8Y.css`
- Tests antes del deploy: `56 passed`, `358 tests OK`.
- Build antes del deploy: `npm.cmd run build` OK.
- No guardar credenciales SFTP/FTP en el repo. Las credenciales se usaron solo en runtime para deploy manual.

## Contexto de producto

Entraditas tiene tres repos principales:

- `web-entraditas`: web publica en `entraditas.com`, donde los usuarios compran entradas.
- `panel-entraditas`: panel de organizadores/admins en `panel.entraditas.com`.
- `api-entraditas`: API futura en `api.entraditas.com`.

El trabajo actual esta centrado en el apartado de eventos del panel, sobre todo crear/editar evento, tipos de entrada, plano/zonas, descuentos, puertas, invitados y revision final.

## Linea visual

Axel quiere que el panel mantenga una linea visual cercana a lo que ya estaba hecho con Claude Code y a los estilos de la web publica:

- Bordes negros marcados.
- Sombras duras tipo `shadow-flat`.
- Naranja/rojo de marca para acciones principales.
- Selectores modernos, no `select` nativo cutre cuando sea una parte visible/importante.
- Previsualizadores fieles a la web publica: tarjeta resumida y detalle del evento.
- Aprovechar ancho de pagina y evitar que el preview se salga.

Archivos relevantes de estilo/componentes:

- `src/styles/globals.css`
- `src/shared/ui/button.tsx`
- `src/shared/ui/icon.tsx`
- `src/features/events/wizard/steps/publicEventPreview.tsx`

## Cambios ya implementados

### Wizard de eventos

Archivo principal:

- `src/features/events/wizard/EventWizardPage.tsx`

Estado actual:

- Se ven los pasos siguientes desde el inicio.
- Los pasos que necesitan `eventId` aparecen bloqueados hasta guardar el evento.
- Si el evento cargado no tiene `hasSubEvents`, se oculta el paso de varias funciones.
- Orden del wizard:
  1. Informacion del evento
  2. Varias funciones
  3. Tipos de entrada
  4. Plano de asientos
  5. Publicar evento

### Informacion basica

Archivo:

- `src/features/events/wizard/steps/Step1BasicInfo.tsx`

Incluye:

- Imagen de portada con dos modos: Adjuntar / URL.
- Galeria con subida multiple.
- Categorias: concierto, teatro, cine, festival, deporte, conferencia, familiar.
- Fecha opcional con `Fecha por confirmar`.
- Si no hay fecha, se usa flujo de aviso/campanita.
- Descripcion con editor visual: negrita y puntos.
- Gastos de gestion: ninguno, fijo o porcentaje.
- Preview en directo con tarjeta y detalle.

### Editor de descripcion

Archivo:

- `src/features/events/wizard/steps/publicEventPreview.tsx`

Estado actual:

- `Puntos` se puede activar y desactivar pulsando de nuevo.
- El boton refleja `aria-pressed`.
- Hay test especifico:
  - `src/features/events/wizard/steps/publicEventPreview.test.tsx`

### Tipos de entrada

Archivo:

- `src/features/events/wizard/steps/Step4TicketTypes.tsx`

Estado actual:

- Se pueden crear, editar y eliminar tipos.
- Cada tipo tiene color.
- El campo precio limpia `0.00` al enfocar para no tener que borrar.
- No se permite avanzar si hay un tipo de entrada a medio crear/editar sin guardar.
- Cada tipo tiene cantidad total (`quantityTotal`) o puede ser ilimitado.

### Plano y zonas

Archivos:

- `src/features/events/wizard/steps/SeatingPlanSection.tsx`
- `src/features/events/wizard/steps/ZoneCanvas.tsx`
- `src/features/events/wizard/steps/ZoneEditorPanel.tsx`
- `src/features/events/wizard/steps/TicketTypeAssignment.tsx`

Estado actual:

- El plano es opcional.
- Puede haber zonas numeradas, zonas de pie, escenario, accesible y puertas.
- En zonas numeradas se renderizan butacas individuales adaptadas al tamano de la zona.
- Una zona vendible no puede quedar sin tipo de entrada asignado.
- Se muestra asignacion acumulada por tipo de entrada en formato `usadas/limite`.
- No se puede superar el limite del tipo de entrada entre varias zonas.
- Una zona se puede seleccionar/deseleccionar pulsando en ella.

Punto pendiente a vigilar:

- Axel reporto que el desplazamiento en tactil no iba fino. Hay que probar en movil/tablet con navegador real y ajustar pointer events/drag si vuelve a fallar.

### Revision final

Archivo:

- `src/features/events/wizard/steps/Step5Publish.tsx`

Estado actual:

- Muestra checklist antes de enviar:
  - Datos principales de la plantilla.
  - Fecha o aviso.
  - Tipos de entrada.
  - Plano y zonas.
- Si falta algo, aparece como `Pendiente` con detalle.
- Si todo esta listo, permite `Enviar a revision`.
- Al enviar a revision navega de vuelta a `/eventos`.
- La revision final muestra preview publica en modo detalle.

## Puertas, invitados y descuentos

Jorge subio trabajo nuevo y se integro sin pisarlo:

- Puertas:
  - `src/features/events/wizard/steps/GatesSection.tsx`
  - `src/features/access/gates/GatesOverviewPage.tsx`
- Invitados:
  - `src/features/events/wizard/steps/GuestlistSection.tsx`
- Descuentos:
  - `src/features/events/wizard/steps/DiscountCodesSection.tsx`

En el detalle de evento:

- `src/features/events/detail/EventDetailPage.tsx`

Pestanas activas:

- Informacion general
- Subeventos
- Aforos y zonas
- Tipos de entrada
- Codigos de descuento
- Puertas
- Invitados

Pestanas visibles pero desactivadas:

- Pedidos
- Metricas

## Deploy

Deploy automatico:

- `.github/workflows/deploy.yml`

El workflow compila, pero GitHub Actions falla porque faltan secrets en GitHub:

- `FTP_USERNAME`
- probablemente `FTP_PASSWORD`

Tambien se agregaron fallbacks:

- `FTP_SERVER`: `ftp.entraditas.com`
- `FTP_REMOTE_DIR`: `panel.entraditas.com/`

Deploy manual que funciono:

- Protocolo: SFTP
- Host: `82.223.152.58`
- Ruta remota del panel: `/panel.ENTRADITAS.COM`
- Subir contenido de `dist/` a esa ruta.

No incluir usuario/password en este archivo ni en commits.

## Comandos utiles

Instalar:

```powershell
npm.cmd ci
```

Tests:

```powershell
npm.cmd test -- --run --reporter=dot
```

Build:

```powershell
npm.cmd run build
```

Estado Git:

```powershell
git status --short --branch
git fetch origin
git merge-base --is-ancestor origin/main HEAD
```

Push seguro:

```powershell
git push origin HEAD:main
```

## Siguientes mejoras probables

- Probar visualmente el wizard completo en desktop y movil.
- Pulir selects/desplegables que aun sean nativos visibles, especialmente puertas/invitados si Axel los ve cutres.
- Implementar plantillas reutilizables de plano cuando exista API o mock formal.
- Revisar drag/touch del plano en dispositivos tactiles reales.
- Sincronizar todavia mas el detalle publico del preview con `web-entraditas`.
- Configurar correctamente secrets de GitHub Actions para no depender de deploy manual.

