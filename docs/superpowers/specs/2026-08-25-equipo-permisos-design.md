# Equipo y permisos — diseño

> Estado: aprobado para plan de implementación.
> Ámbito: `apps/panel` (panel de administración) + `packages/types`.

## 1. Contexto y objetivo

El organizador necesita gestionar quién forma parte de su equipo, qué puede
hacer cada persona (según su rol, con ajustes individuales) y a qué eventos
concretos tiene acceso. El alta se hace por invitación al correo (nunca
creando contraseñas a mano), y desactivar a alguien debe cortar el acceso al
instante, incluidas las sesiones ya abiertas.

Requisitos de negocio (tabla de capacidades proporcionada por el usuario):

| Capacidad | Superadmin | Administrador | Usuario | Subusuario |
|---|:--:|:--:|:--:|:--:|
| Gestionar organizadores | Sí | No | No | No |
| Crear y editar eventos | Sí | Sí | Solo los suyos | Configurable |
| Publicar un evento | Sí | Sí | Configurable | No |
| Poner precios y aforos | Sí | Sí | Solo los suyos | Configurable |
| Ver pedidos y compradores | Sí | Sí | Solo los suyos | Configurable |
| Devolver dinero | Sí | Sí | Configurable | No |
| Escanear entradas en la puerta | Sí | Sí | Sí | Solo su puerta |
| Gestionar invitados y cortesías | Sí | Sí | Solo los suyos | Solo su lista |
| Ver informes y estadísticas | Sí | Sí | Solo los suyos | Configurable |
| Ver el dinero y las liquidaciones | Sí | Sí | No | No |
| Dar de alta a personas del equipo | Sí | Sí | Configurable | No |
| Consultar el registro de actividad | Sí | Sí | No | No |

Reglas transversales:

1. Nadie puede dar a otra persona un permiso que él mismo no tenga.
2. Se puede desactivar a una persona al instante y cerrarle todas las
   sesiones abiertas.
3. El alta de personas se hace por invitación al correo, no creando
   contraseñas a mano.

## 2. Decisiones de alcance (acordadas en brainstorming)

- **"Solo su puerta" / "Solo su lista" (subusuario):** no se modela un
  sub-alcance granular por puerta o lista concreta en esta entrega (esos
  módulos — Puertas, Lista de invitados — no existen todavía como
  pantallas). `scan:validate` y `guestlist:manage` pasan a ser permisos
  **base fijos** del subusuario (siempre sí, no configurables); el filtrado
  fino se abordará cuando se construyan esos módulos.
- **Invitación:** se construye el flujo completo simulado — invitar desde
  el panel, y una página pública `/invitacion/:token` donde la persona
  invitada fija su contraseña y queda activada (auto-login). No hay envío
  real de email; el enlace de invitación se muestra en el propio panel
  (rol de un MailHog/Resend de desarrollo).
- **Jerarquía de roles asignables:** cualquiera con `users:manage` puede
  invitar o reasignar un rol de **nivel igual o inferior** al suyo. Orden:
  `superadmin(0) ≥ admin(1) ≥ user(2) ≥ subuser(3)`. Nunca un rol superior.
- **Límite de alcance por evento al asignar a otros:** si el actor tiene
  `eventScopes` no vacío, solo puede marcar eventos dentro de esa lista al
  configurar el alcance de otra persona; sin restricción propia, puede
  marcar cualquier evento de su organización.
- **Sesiones:** solo revocación total al desactivar (se invalidan todos los
  tokens del usuario). No se construye una vista de "sesiones activas" con
  revocación individual — queda para un módulo aparte.
- **Superadmin y Equipo:** `Equipo` es una función de organizador (opera
  sobre la organización del actor). El superadmin no tiene organización
  propia (`organizationId: null`) y no se le da un caso de uso aquí; su
  gestión de organizadores es un ámbito distinto, fuera de este ticket.
- **Selector de alcance por evento en el formulario:** solo se muestra para
  personas con rol Usuario o Subusuario. Administrador y Superadmin siempre
  tienen acceso a todos los eventos, sin selector.

## 3. Catálogo de capacidades y permisos base

### 3.1 Cambio a `ROLE_BASE_PERMISSIONS`

Se añade `guestlist:manage` a la base de `subuser` (hoy solo llega vía
override de un usuario demo). Con esto, la base de `subuser` pasa a ser:

```
["events:read", "scan:validate", "guestlist:read", "guestlist:manage"]
```

El resto de `ROLE_BASE_PERMISSIONS` no cambia.

### 3.2 Nuevo catálogo `CAPABILITIES`

En `apps/panel/src/shared/auth/permissions.ts`, se añade una estructura que
agrupa permisos "en crudo" en las capacidades de negocio de la tabla, y
declara si cada capacidad es fija o configurable por rol:

```ts
export type CapabilityAccess = "fixed_yes" | "fixed_no" | "configurable";

export interface Capability {
  key: string;
  label: string;
  permissions: Permission[];       // permisos en crudo que agrupa
  accessByRole: Record<RoleSlug, CapabilityAccess>;
}

export const CAPABILITIES: Capability[] = [
  {
    key: "manage_organizations",
    label: "Gestionar organizadores",
    permissions: ["organizations:manage"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_no", user: "fixed_no", subuser: "fixed_no" }
  },
  {
    key: "manage_events",
    label: "Crear y editar eventos",
    permissions: ["events:create", "events:update", "subevents:create", "subevents:update"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "publish_events",
    label: "Publicar un evento",
    permissions: ["events:publish"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" }
  },
  {
    key: "manage_pricing_capacity",
    label: "Poner precios y aforos",
    permissions: ["tickettypes:create", "tickettypes:update", "capacity:update"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "view_orders",
    label: "Ver pedidos y compradores",
    permissions: ["orders:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "refund_orders",
    label: "Devolver dinero",
    permissions: ["orders:refund"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" }
  },
  {
    key: "scan_tickets",
    label: "Escanear entradas en la puerta",
    permissions: ["scan:validate"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "fixed_yes" }
  },
  {
    key: "manage_guestlist",
    label: "Gestionar invitados y cortesías",
    permissions: ["guestlist:read", "guestlist:manage"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "fixed_yes" }
  },
  {
    key: "view_reports",
    label: "Ver informes y estadísticas",
    permissions: ["reports:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_yes", subuser: "configurable" }
  },
  {
    key: "view_finance",
    label: "Ver el dinero y las liquidaciones",
    permissions: ["finance:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_no", subuser: "fixed_no" }
  },
  {
    key: "manage_team",
    label: "Dar de alta a personas del equipo",
    permissions: ["users:manage"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "configurable", subuser: "fixed_no" }
  },
  {
    key: "view_audit_log",
    label: "Consultar el registro de actividad",
    permissions: ["audit:read"],
    accessByRole: { superadmin: "fixed_yes", admin: "fixed_yes", user: "fixed_no", subuser: "fixed_no" }
  }
];
```

Notas:
- `events:read`, `subevents:read`, `tickettypes:read` no aparecen como
  capacidades separadas: son lectura base implícita, ya cubierta por
  `ROLE_BASE_PERMISSIONS` para todos los roles con acceso a eventos.
- `events:delete`, `subevents:delete`, `tickettypes:delete`,
  `orders:export`, `reports:export`, `scan:reverse`, `finance:settle`,
  `roles:manage`, `settings:manage` no están en la tabla de negocio
  proporcionada; se mantienen tal cual ya están en `ROLE_BASE_PERMISSIONS`
  (admin/superadmin los tienen, user/subuser no), sin exponer ningún toggle
  para ellos en el editor de esta entrega.
- La UI de edición de permisos de una persona solo muestra un toggle por
  cada `Capability` cuya `accessByRole[personaRole] === "configurable"`.
  Activar el toggle añade un override `allow` para **todos** los permisos
  de esa capacidad; desactivarlo los quita (sin overrides `deny` explícitos
  para estas capacidades, ya que ninguna fila de la tabla pide reducir un
  "Sí" fijo).

## 4. Guardas de privilegio (reglas transversales)

Funciones puras en `permissions.ts`, reutilizadas por la UI (para
ocultar/deshabilitar controles) y por los handlers mock (autoritativas):

```ts
export const ROLE_LEVEL: Record<RoleSlug, number> = { superadmin: 0, admin: 1, user: 2, subuser: 3 };

// El actor puede asignar targetRole si su propio nivel es <= el del target
// (rol igual o inferior, nunca superior).
export function canAssignRole(actorRole: RoleSlug, targetRole: RoleSlug): boolean {
  return ROLE_LEVEL[actorRole] <= ROLE_LEVEL[targetRole];
}

// El actor puede otorgar `permission` si él mismo lo tiene en su conjunto
// efectivo.
export function canGrantPermission(actorEffective: Set<string>, permission: string): boolean {
  return actorEffective.has(permission);
}

// El actor puede asignar `targetScopes` (event ids) si están contenidos en
// su propio alcance, o si él mismo no tiene restricción (acceso a todos).
export function canAssignEventScopes(actorScopes: string[], targetScopes: string[]): boolean {
  if (actorScopes.length === 0) return true;
  return targetScopes.every((id) => actorScopes.includes(id));
}
```

Aplicación:
- **Invitar / editar rol:** `canAssignRole(actor.role, payload.role)`; si
  falla → `403 { code: "PRIVILEGE_ESCALATION" }`.
- **Invitar / editar overrides:** para cada capacidad activada, todos sus
  permisos deben pasar `canGrantPermission`; si alguno falla → `403
  PRIVILEGE_ESCALATION`.
- **Invitar / editar alcance:** `canAssignEventScopes(actor.eventScopes,
  payload.eventScopes)`; si falla → `403 PRIVILEGE_ESCALATION`.
- **Cualquier operación de equipo** requiere `users:manage` efectivo en el
  actor (ya protege la ruta `/equipo` vía `RequirePermission`).
- La UI aplica las mismas funciones para no ofrecer controles que el
  backend (mock) rechazaría: el selector de rol solo lista roles con
  `canAssignRole` verdadero; los toggles de capacidad solo se muestran si
  `accessByRole === "configurable"` **y** todos sus permisos pasan
  `canGrantPermission`; el selector de eventos solo ofrece los eventos
  dentro de `canAssignEventScopes`.

## 5. Modelo de datos

### 5.1 `packages/types/src/schemas.ts`

Nuevo esquema:

```ts
export const InvitationSchema = z.object({
  id: z.string(),
  token: z.string(),
  userId: z.string(),
  email: z.string().email(),
  organizationId: z.string(),
  invitedByUserId: z.string(),
  status: z.enum(["pending", "accepted"]),
  createdAt: z.string()
});
export type Invitation = z.infer<typeof InvitationSchema>;
```

`UserSchema` no cambia (ya soporta `status: "invited"`).

### 5.2 `apps/panel/src/mocks/db.ts`

- `Database` gana `invitations: Invitation[]`.
- `createSeedDatabase()` inicializa `invitations: []` (no se necesitan
  invitaciones pendientes de partida para los tests existentes).

### 5.3 `apps/panel/src/mocks/state.ts`

Sin cambios estructurales. La revocación de sesión se implementa como una
función auxiliar:

```ts
export function revokeAllSessionsForUser(userId: string): void {
  for (const [token, sid] of sessions) {
    if (sid === userId) sessions.delete(token);
  }
}
```

## 6. Endpoints mock nuevos

Base: `http://localhost:4000/api/v1`, mismo formato de respuesta
(`{ data, meta }` / `{ error }`) que los handlers existentes.

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/users` | `users:manage` | Equipo de la organización del actor |
| `POST` | `/users/invite` | `users:manage` | `{ email, fullName, role, permissionOverrides?, eventScopes? }` → guardas de la sección 4 → crea `User(status:"invited")` + `Invitation` → `{ user, inviteUrl }` |
| `PATCH` | `/users/:id` | `users:manage` | Edita `role`, `permissionOverrides`, `eventScopes` de alguien de la misma organización — mismas guardas |
| `POST` | `/users/:id/disable` | `users:manage` | `status → "disabled"` + `revokeAllSessionsForUser(id)` |
| `POST` | `/users/:id/enable` | `users:manage` | `status → "active"` |
| `GET` | `/invitations/:token` | público | `{ email, fullName, organizationName, role }` para la pantalla de aceptación; 404 si el token no existe o ya fue aceptado |
| `POST` | `/invitations/:token/accept` | público | `{ password }` → activa el usuario, marca la invitación `"accepted"`, devuelve sesión igual que `/auth/login` (auto-login) |

`inviteUrl` tiene la forma `${PANEL_URL}/invitacion/${token}` y se muestra
en la UI del panel (no se envía ningún email real).

Errores de dominio nuevos: `PRIVILEGE_ESCALATION`, `INVITATION_NOT_FOUND`,
`INVITATION_ALREADY_ACCEPTED`.

## 7. Páginas y componentes (apps/panel/src)

- **`features/team/list/TeamListPage.tsx`** (`/equipo`) — tabla (nombre,
  email, rol, estado) con acciones: Editar, Desactivar/Activar (según
  estado), y "Copiar enlace de invitación" mientras el estado sea
  `invited`. Botón "Invitar persona" → `/equipo/invitar`.
- **`features/team/form/TeamMemberFormPage.tsx`** (`/equipo/invitar` y
  `/equipo/:id/editar`) — formulario compartido:
  - Alta: email + nombre completo (deshabilitados en edición).
  - Selector de rol, limitado a `canAssignRole(actor.role, *)`.
  - Lista de capacidades configurables para el rol elegido, como
    checkboxes/switches — se recalcula dinámicamente si el usuario cambia
    el rol seleccionado en el propio formulario.
  - Selector de alcance por evento (multi-select), solo visible si el rol
    elegido es `user` o `subuser`; opciones limitadas al alcance del
    actor. Vacío = todos los eventos de la organización.
  - Al guardar una invitación nueva, se muestra el enlace de invitación
    generado con un botón "Copiar".
- **`features/auth/InvitationAcceptPage.tsx`** (`/invitacion/:token`, con
  `AuthLayout`, ruta pública) — carga los datos del token, pide contraseña
  (+ confirmación), al aceptar autentica y redirige a `/eventos`. Token no
  encontrado / ya aceptado → mensaje de error, sin formulario.
- **Router:** añadir a `router.tsx` las rutas `/equipo`, `/equipo/invitar`,
  `/equipo/:id/editar` (bajo `RequirePermission permission="users:manage"`,
  sustituyendo la entrada de `PlaceholderPage` para "Equipo"), y
  `/invitacion/:token` en la rama no autenticada (junto a `/login`).

## 8. Testing

- **Unit — `permissions.ts`:** `CAPABILITIES` (accesos por rol coherentes
  con la tabla), `canAssignRole`, `canGrantPermission`,
  `canAssignEventScopes`, y el `resolveEffectivePermissions` actualizado
  (subuser con `guestlist:manage` en base).
- **Unit/integración — handlers mock:** invitar con éxito; invitar rechazado
  por rol superior; invitar rechazado por override que el actor no tiene;
  invitar rechazado por alcance de evento fuera del propio; aceptar
  invitación (activa usuario + auto-login); token inválido/ya usado;
  desactivar revoca sesiones (una petición posterior con el token viejo
  devuelve 401); reactivar.
- **Componentes:** `TeamListPage` (acciones visibles según estado y
  permisos del actor viendo la lista), `TeamMemberFormPage` (rol
  seleccionable limitado, toggles correctos por rol, selector de alcance
  oculto para admin/superadmin, guardar produce el payload esperado),
  `InvitationAcceptPage` (flujo feliz + token inválido).
- No se añade cobertura E2E nueva en esta entrega salvo que surja al
  implementar (el golden path existente no cubre gestión de equipo).
