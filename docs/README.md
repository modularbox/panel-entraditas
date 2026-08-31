# entraditas.com — Especificación Técnica y Guía de Desarrollo

> **Documento:** Especificación Técnica de Sistema (SDS) + Guía de Implementación
> **Producto:** `entraditas.com` — Plataforma de gestión, venta y control de acceso de entradas
> **Versión:** 1.0
> **Autor:** Arquitectura de Software / Tech Lead
> **Estado:** Aprobado para desarrollo (Fase 0)

---

## Índice

1. [Resumen Ejecutivo y Arquitectura General](#1-resumen-ejecutivo-y-arquitectura-general)
2. [Modelo de Datos y Diagramas de Flujo](#2-modelo-de-datos-y-diagramas-de-flujo)
3. [Módulo 1 — Aplicación Web Pública](#3-módulo-1--aplicación-web-pública-entraditascom)
4. [Módulo 2 — Panel de Administración](#4-módulo-2--panel-de-administración-panelentraditascom)
5. [Módulo 3 — Servidor API Backend](#5-módulo-3--servidor-api-backend-apientraditascom)
6. [Catálogo de Endpoints de la API](#6-catálogo-de-endpoints-de-la-api)
7. [Roadmap y Fases de Implementación](#7-roadmap-y-fases-de-implementación)
8. [Anexos](#8-anexos)

---

## 1. Resumen Ejecutivo y Arquitectura General

### 1.1 Objetivo del sistema

`entraditas.com` es una plataforma **multi-organizador (multi-tenant lógico)** para la creación, venta, distribución y validación de entradas a eventos. El sistema cubre el ciclo de vida completo:

```
Creación del evento → Publicación → Venta/Reserva → Emisión del ticket (QR firmado)
→ Validación en puerta → Métricas en tiempo real → Liquidación al organizador
```

### 1.2 Actores del sistema

| Actor | Descripción | Interfaz principal |
|---|---|---|
| **Comprador / Asistente** | Usuario final anónimo o registrado que compra entradas | Web pública |
| **Superadministrador** | Personal de la plataforma. Acceso global, cross-organización | Panel |
| **Administrador (Organizador)** | Propietario de una organización. Gestiona sus eventos, su equipo y sus finanzas | Panel |
| **Usuario** | Miembro del equipo del organizador con permisos amplios sobre eventos asignados | Panel |
| **Subusuario** | Perfil restringido (p. ej. personal de puerta, taquilla, RRPP) con acceso granular por sección/evento | Panel / App de validación |
| **Validador (Scanner)** | Rol operativo derivado de Subusuario, opera en puerta | PWA de escaneo |

### 1.3 Principios arquitectónicos

1. **API-first.** La API es el único punto de verdad. Web y Panel son clientes desacoplados que consumen los mismos contratos versionados (`/api/v1`).
2. **Monolito modular antes que microservicios.** El backend se organiza en módulos de dominio con fronteras explícitas (`events`, `ticketing`, `access`, `billing`, `identity`). Esto permite extraer un módulo a servicio independiente en el futuro sin reescritura, evitando la complejidad operativa prematura.
3. **Autoridad del stock en el servidor.** El aforo y la disponibilidad nunca se calculan en cliente. Toda reserva pasa por una transacción con bloqueo pesimista o `SELECT ... FOR UPDATE`.
4. **Idempotencia en operaciones críticas.** Compras, confirmaciones de pago y validaciones de QR aceptan `Idempotency-Key`.
5. **Trazabilidad total.** Toda mutación relevante genera un registro en `audit_logs` con actor, IP, entidad y diff.
6. **Seguridad por defecto.** Deny-by-default en RBAC, tokens de corta vida, QR firmados criptográficamente, rate limiting por IP y por usuario.

### 1.4 Diagrama de arquitectura general

```mermaid
graph TB
    subgraph "Clientes"
        WEB["Web Pública<br/>entraditas.com<br/>React + Vite + TS + Tailwind"]
        PANEL["Panel Admin<br/>panel.entraditas.com<br/>React + TS + Tailwind + shadcn/ui"]
        SCAN["PWA Validación<br/>scan.entraditas.com<br/>Offline-first + IndexedDB"]
    end

    subgraph "Edge"
        CDN["CDN / WAF<br/>Cloudflare"]
    end

    subgraph "Backend — api.entraditas.com"
        GW["API Gateway / Reverse Proxy<br/>Nginx"]
        API["API REST<br/>Node.js + Express + TypeScript"]
        WORKER["Worker de Jobs<br/>BullMQ"]
        WS["Realtime<br/>WebSocket / SSE"]
    end

    subgraph "Persistencia"
        PG[("PostgreSQL 16<br/>Datos transaccionales")]
        REDIS[("Redis<br/>Cache · Locks · Colas · Rate limit")]
        S3[("Object Storage S3<br/>Imágenes · PDFs · Reportes")]
    end

    subgraph "Servicios externos"
        PAY["Pasarela de Pago<br/>Stripe / MercadoPago / Redsys"]
        MAIL["Email transaccional<br/>Resend / SES"]
        SMS["SMS / WhatsApp"]
        OBS["Observabilidad<br/>Sentry · OpenTelemetry"]
    end

    WEB --> CDN
    PANEL --> CDN
    SCAN --> CDN
    CDN --> GW
    GW --> API
    API --> PG
    API --> REDIS
    API --> S3
    API --> WS
    API -.publica jobs.-> REDIS
    REDIS -.consume.-> WORKER
    WORKER --> PG
    WORKER --> MAIL
    WORKER --> SMS
    WORKER --> S3
    API <--> PAY
    PAY -.webhook.-> API
    API --> OBS
```

### 1.5 Stack tecnológico consolidado

| Capa | Tecnología | Justificación |
|---|---|---|
| Web pública | React 18 + Vite + TypeScript + Tailwind CSS | Time-to-interactive bajo, build rápido, tipado end-to-end |
| SEO (opcional Fase 3) | Prerender / SSR con Vite SSR o migración a Next.js | El catálogo de eventos necesita indexación; se resuelve inicialmente con prerender estático + meta dinámicos |
| Panel | React 18 + TypeScript + Tailwind + **shadcn/ui** + TanStack Table | Componentes accesibles, sin lock-in de framework de dashboard cerrado |
| Estado servidor | **TanStack Query v5** | Cache, revalidación, optimistic updates |
| Estado cliente | **Zustand** | Ligero, sin boilerplate (carrito, sesión, filtros) |
| Formularios | React Hook Form + **Zod** | Mismo esquema Zod compartido con el backend |
| Backend | Node.js 20 LTS + Express 4 + TypeScript | Requisito de proyecto; ecosistema maduro |
| ORM | **Prisma** (alternativa: Drizzle) | Migraciones versionadas, tipado generado, buen DX |
| Base de datos | **PostgreSQL 16** | Transacciones robustas, `FOR UPDATE`, JSONB, particionado para `scans` |
| Cache / colas | Redis 7 + BullMQ | Locks distribuidos, reserva temporal (TTL), colas de email/PDF |
| Autenticación | JWT (access 15 min) + Refresh token rotativo en cookie `httpOnly` | Balance seguridad/UX; OAuth2 social en Fase 3 |
| Validación | Zod + middleware genérico | Contratos únicos |
| Documentación | OpenAPI 3.1 autogenerado (`zod-to-openapi`) + Scalar/Swagger UI | Contrato vivo |
| Testing | Vitest (unit) + Supertest (integración) + Playwright (E2E) | |
| CI/CD | GitHub Actions → Docker → despliegue (Railway/Fly.io/VPS + Docker Compose) | |
| Observabilidad | Sentry + Pino (logs estructurados) + OpenTelemetry | |

### 1.6 Entornos y dominios

| Entorno | Web | Panel | API |
|---|---|---|---|
| Producción | `entraditas.com` | `panel.entraditas.com` | `api.entraditas.com` |
| Staging | `stg.entraditas.com` | `panel.stg.entraditas.com` | `api.stg.entraditas.com` |
| Desarrollo | `localhost:5173` | `localhost:5174` | `localhost:4000` |

**CORS:** lista blanca explícita por entorno. `credentials: true` para el refresh cookie. Nunca `origin: *`.

### 1.7 Decisiones de arquitectura registradas (ADR resumidas)

| # | Decisión | Alternativa descartada | Motivo |
|---|---|---|---|
| ADR-01 | Monolito modular en Express | Microservicios / NestJS | Equipo reducido; coste operativo; NestJS añade curva sin beneficio inmediato |
| ADR-02 | PostgreSQL sobre MySQL | MySQL 8 | Mejor soporte a `JSONB`, índices parciales, `EXCLUDE` y particionado nativo |
| ADR-03 | Reserva de stock con Redis + confirmación transaccional en PG | Solo PG | Evita bloqueos largos durante el checkout (el usuario tarda minutos) |
| ADR-04 | QR con payload firmado (JWT compacto / HMAC) + validación online contra BD | QR con solo UUID | El código firmado evita enumeración; la BD resuelve el doble uso |
| ADR-05 | Multi-tenancy lógico por `organization_id` con filtrado obligatorio en repositorio | Schema por tenant | Simplicidad operativa; se mitiga el riesgo con un *tenant guard* centralizado |
| ADR-06 | Emisión de PDF/QR en worker asíncrono | Síncrono en request | Mantiene el p95 del checkout por debajo de 500 ms |

### 1.8 Requisitos no funcionales

| Categoría | Objetivo |
|---|---|
| Rendimiento web | LCP < 2.0 s (4G), TTI < 3.0 s, Lighthouse ≥ 90 |
| Rendimiento API | p95 < 300 ms en lecturas, < 800 ms en checkout |
| Escala pico | 5.000 usuarios concurrentes en on-sale; 200 escaneos/segundo por evento |
| Disponibilidad | 99.9 % mensual |
| Validación en puerta | < 300 ms por escaneo online; modo offline obligatorio con sincronización posterior |
| Seguridad | OWASP Top 10 mitigado; PCI-DSS SAQ-A (sin almacenar datos de tarjeta) |
| Privacidad | RGPD/LOPDGDD: consentimiento, exportación y borrado de datos personales |
| Accesibilidad | WCAG 2.1 nivel AA en web pública |

---

## 2. Modelo de Datos y Diagramas de Flujo

### 2.1 Diagrama Entidad-Relación

```mermaid
erDiagram
    ORGANIZATION ||--o{ USER : "emplea"
    ORGANIZATION ||--o{ EVENT : "organiza"
    ORGANIZATION ||--o{ SETTLEMENT : "recibe"

    ROLE ||--o{ USER : "clasifica"
    ROLE }o--o{ PERMISSION : "role_permissions"
    USER ||--o{ USER_PERMISSION : "override granular"
    USER ||--o{ USER_EVENT_SCOPE : "acceso por evento"
    USER ||--o{ USER : "parent_user_id (subusuarios)"

    VENUE ||--o{ EVENT : "aloja"
    VENUE ||--o{ ZONE : "contiene"

    EVENT ||--o{ SUB_EVENT : "se divide en"
    EVENT ||--o{ TICKET_TYPE : "define (nivel evento)"
    EVENT ||--o{ GATE : "controla acceso por"
    EVENT ||--o{ DISCOUNT_CODE : "promociona con"

    SUB_EVENT ||--o{ TICKET_TYPE : "define (nivel subevento)"
    SUB_EVENT ||--o{ CAPACITY_POOL : "consume aforo de"
    ZONE ||--o{ CAPACITY_POOL : "aporta aforo"

    TICKET_TYPE ||--o{ TICKET_TYPE_PRICE : "tarifas por tramo"
    TICKET_TYPE ||--o{ ORDER_ITEM : "se vende como"
    TICKET_TYPE }o--o{ GATE : "gate_ticket_types (habilitación)"

    CUSTOMER ||--o{ ORDER : "realiza"
    ORDER ||--o{ ORDER_ITEM : "contiene"
    ORDER ||--|| PAYMENT : "liquida con"
    ORDER ||--o{ REFUND : "puede devolver"
    ORDER_ITEM ||--o{ TICKET : "emite"

    TICKET ||--o{ SCAN : "es validado en"
    GATE ||--o{ SCAN : "registra"
    USER ||--o{ SCAN : "operado por"

    GUEST_LIST ||--o{ GUEST_LIST_ENTRY : "agrupa"
    GUEST_LIST_ENTRY ||--o| TICKET : "genera cortesía"
    EVENT ||--o{ GUEST_LIST : "tiene"

    USER ||--o{ AUDIT_LOG : "genera"
    SETTLEMENT ||--o{ SETTLEMENT_LINE : "detalla"
    EVENT ||--o{ SETTLEMENT_LINE : "aporta a"
```

### 2.2 Diccionario de entidades

#### 2.2.1 Identidad y permisos

**`organizations`** — Tenant. Cada organizador es una organización.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `varchar(160)` | |
| `slug` | `varchar(80)` UNIQUE | Subdominios/URLs |
| `tax_id` | `varchar(32)` | CIF/NIF/RUC para facturación |
| `commission_rate` | `numeric(5,4)` | Comisión de plataforma por defecto |
| `payout_details` | `jsonb` | IBAN, titular, cifrado a nivel de columna |
| `status` | `enum(active, suspended)` | |
| `created_at / updated_at` | `timestamptz` | |

**`users`**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK NULL | `NULL` solo para superadmin |
| `parent_user_id` | `uuid` FK NULL | Autorreferencia: define un **subusuario** |
| `role_id` | `uuid` FK | |
| `email` | `citext` UNIQUE | |
| `password_hash` | `text` | Argon2id |
| `full_name`, `phone` | | |
| `mfa_secret` | `text` NULL | TOTP, obligatorio para superadmin |
| `status` | `enum(active, invited, disabled)` | |
| `last_login_at`, `failed_attempts`, `locked_until` | | Anti-fuerza bruta |

> **Regla de integridad:** `parent_user_id IS NOT NULL` ⇒ `role.slug = 'subuser'` y `organization_id` debe coincidir con el del padre. Se aplica con `CHECK` + trigger.

**`roles`** · `id`, `slug` (`superadmin | admin | user | subuser`), `name`, `level` (`0..3`), `is_system`.

**`permissions`** · Catálogo plano con notación `recurso:acción`.

```
events:read      events:create   events:update   events:delete   events:publish
subevents:*      tickettypes:*   capacity:update
orders:read      orders:refund   orders:export
gates:read       gates:manage    scan:validate   scan:reverse
guestlist:read   guestlist:manage
reports:read     reports:export  finance:read    finance:settle
users:read       users:manage    roles:manage    audit:read      settings:manage
```

**`role_permissions`** (N:M) — permisos base por rol.
**`user_permissions`** — override por usuario: `user_id`, `permission_id`, `effect enum(allow, deny)`. `deny` siempre gana.
**`user_event_scopes`** — `user_id`, `event_id`. Si un usuario tiene filas aquí, su acceso queda **restringido a esos eventos**. Sin filas ⇒ acceso a todos los de su organización (según su rol).

#### 2.2.2 Eventos y aforo

**`venues`** · `id`, `organization_id`, `name`, `address`, `city`, `country`, `lat`, `lng`, `total_capacity`, `timezone`.

**`zones`** · Sectores físicos del recinto: `id`, `venue_id`, `name` (Pista, Grada A, Palco), `capacity`, `is_numbered`.

**`events`**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` FK | |
| `venue_id` | `uuid` FK NULL | |
| `slug` | `varchar(120)` UNIQUE | URL pública |
| `title`, `subtitle`, `description` | | Descripción en Markdown |
| `category` | `enum` | concierto, teatro, deporte, festival, conferencia… |
| `cover_image_url`, `gallery` | `text`, `jsonb` | |
| `status` | `enum(draft, published, on_sale, sold_out, paused, finished, cancelled)` | |
| `visibility` | `enum(public, unlisted, private)` | |
| `starts_at`, `ends_at` | `timestamptz` | Rango global del evento |
| `sales_start_at`, `sales_end_at` | `timestamptz` | |
| `has_sub_events` | `boolean` | Si `false`, se crea 1 subevento implícito |
| `service_fee_type` | `enum(none, percent, fixed)` | |
| `service_fee_value` | `numeric(10,2)` | |
| `settings` | `jsonb` | Límite por pedido, edad mínima, T&C, política de reembolso |
| `published_at`, `created_by` | | |

**`sub_events`** — Funciones, sesiones, pases, días de festival.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `event_id` | `uuid` FK | |
| `name` | `varchar(160)` | "Viernes 12 · 22:00", "Función matinal" |
| `starts_at`, `ends_at`, `doors_open_at` | `timestamptz` | |
| `capacity` | `int` NULL | Aforo específico; si `NULL`, hereda de zonas/evento |
| `status` | `enum(scheduled, on_sale, sold_out, cancelled, finished)` | |
| `sort_order` | `int` | |

> **Modelo normalizado:** un evento **siempre** tiene al menos un subevento. Los eventos de fecha única generan uno automáticamente. Esto elimina las ramas condicionales en la lógica de venta y validación.

**`capacity_pools`** — Bolsa de aforo compartida. Permite que varios tipos de entrada compitan por el mismo cupo físico.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `sub_event_id` | `uuid` FK | |
| `zone_id` | `uuid` FK NULL | |
| `name` | `varchar(80)` | "Aforo general Pista" |
| `total_capacity` | `int` | |
| `sold_count` | `int` | Denormalizado, actualizado transaccionalmente |
| `held_count` | `int` | Reservas temporales activas |

`disponible = total_capacity - sold_count - held_count`

**`ticket_types`** — VIP, General, Early Bird, Promoción 2x1, Cortesía…

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `event_id` | `uuid` FK | Siempre presente (facilita queries) |
| `sub_event_id` | `uuid` FK NULL | **NULL ⇒ tipo a nivel de evento** (válido para todos los subeventos, p. ej. abono de festival) |
| `capacity_pool_id` | `uuid` FK NULL | Cupo del que descuenta |
| `name`, `description` | | |
| `kind` | `enum(paid, free, courtesy, promo, pass)` | |
| `base_price` | `numeric(10,2)` | |
| `currency` | `char(3)` | |
| `quantity_total` | `int` NULL | Cupo propio del tipo (`NULL` = ilimitado dentro del pool) |
| `quantity_sold` | `int` | |
| `min_per_order`, `max_per_order` | `int` | |
| `sales_start_at`, `sales_end_at` | `timestamptz` | |
| `visibility` | `enum(public, hidden, code_only)` | `code_only` requiere código de acceso |
| `access_code` | `varchar(64)` NULL | |
| `is_transferable`, `is_refundable` | `boolean` | |
| `sort_order`, `color` | | UI |

> **Regla de negocio clave:** un `ticket_type` con `sub_event_id = NULL` y `kind = 'pass'` (abono) emite un ticket con validez en **todos** los subeventos del evento; el control de reentradas se lleva en `scans` por `sub_event_id`.

**`ticket_type_prices`** — Tramos temporales (Early Bird → Regular → Last Minute): `ticket_type_id`, `name`, `price`, `starts_at`, `ends_at`, `quantity_limit`, `is_active`.

**`discount_codes`** · `id`, `event_id`, `code`, `type enum(percent, fixed)`, `value`, `max_uses`, `used_count`, `max_uses_per_customer`, `applies_to` (`jsonb` con IDs de ticket_type), `valid_from`, `valid_to`, `status`.

#### 2.2.3 Venta y emisión

**`customers`** · `id`, `email` UNIQUE, `full_name`, `phone`, `document_id`, `marketing_opt_in`, `password_hash` NULL (compra invitado permitida), `created_at`.

**`orders`**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `order_number` | `varchar(20)` UNIQUE | Legible: `ENT-2026-0001234` |
| `customer_id` | `uuid` FK | |
| `event_id` | `uuid` FK | Desnormalizado para reporting |
| `organization_id` | `uuid` FK | Desnormalizado para tenant guard |
| `status` | `enum(pending, reserved, paid, cancelled, expired, refunded, partially_refunded)` | |
| `subtotal`, `service_fee`, `discount_total`, `tax_total`, `total` | `numeric(10,2)` | |
| `currency` | `char(3)` | |
| `discount_code_id` | `uuid` FK NULL | |
| `channel` | `enum(web, panel, box_office, api, courtesy)` | |
| `expires_at` | `timestamptz` | TTL de la reserva |
| `ip_address`, `user_agent`, `metadata` | | Antifraude |
| `created_by_user_id` | `uuid` NULL | Si se vendió desde panel/taquilla |

**`order_items`** · `id`, `order_id`, `ticket_type_id`, `sub_event_id`, `quantity`, `unit_price`, `unit_fee`, `unit_discount`, `line_total`.

**`tickets`** — Una fila por entrada individual emitida.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `order_item_id` | `uuid` FK | |
| `event_id`, `sub_event_id`, `ticket_type_id` | `uuid` FK | |
| `code` | `varchar(32)` UNIQUE | Identificador corto legible |
| `qr_payload` | `text` | Cadena firmada (ver §2.5) |
| `secret_hash` | `text` | HMAC del nonce; nunca se expone |
| `status` | `enum(valid, used, cancelled, refunded, transferred, expired)` | |
| `holder_name`, `holder_document`, `holder_email` | | Nominación opcional |
| `seat_label` | `varchar(24)` NULL | Numeración |
| `issued_at`, `first_scanned_at`, `scan_count` | | |
| `pdf_url`, `wallet_url` | `text` NULL | S3 |

**`payments`** · `id`, `order_id`, `provider` (`stripe|mercadopago|redsys|cash|transfer`), `provider_payment_id`, `status` (`initiated, authorized, captured, failed, refunded`), `amount`, `currency`, `method` (`card, wallet, transfer, cash`), `raw_response jsonb`, `processed_at`.

**`refunds`** · `id`, `order_id`, `payment_id`, `amount`, `reason`, `status`, `requested_by_user_id`, `processed_at`, `tickets` (`jsonb` de IDs afectados).

#### 2.2.4 Control de accesos

**`gates`** — Puertas o puntos de validación.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `uuid` PK | |
| `event_id` | `uuid` FK | |
| `sub_event_id` | `uuid` FK NULL | `NULL` = válida para todos |
| `name`, `code` | | "Puerta Norte", `GATE-N` |
| `zone_id` | `uuid` FK NULL | |
| `direction` | `enum(in, out, both)` | Soporte de reentrada |
| `allow_reentry` | `boolean` | |
| `max_scans_per_ticket` | `int` | Default 1 |
| `is_active` | `boolean` | |
| `device_token` | `text` | Token de dispositivo emparejado |

**`gate_ticket_types`** (N:M) — Qué tipos de entrada admite cada puerta. Sin filas ⇒ admite todos.

**`scans`** — Log inmutable de validaciones. **Tabla particionada por `event_id` o por mes.**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `bigserial` PK | |
| `ticket_id` | `uuid` FK NULL | `NULL` si el QR no existe |
| `gate_id`, `sub_event_id`, `event_id` | `uuid` FK | |
| `scanned_by_user_id` | `uuid` FK | |
| `result` | `enum(granted, denied_already_used, denied_invalid, denied_wrong_gate, denied_wrong_time, denied_cancelled, denied_wrong_subevent)` | |
| `direction` | `enum(in, out)` | |
| `scanned_at` | `timestamptz` | Momento real del escaneo (del dispositivo) |
| `synced_at` | `timestamptz` | Momento de llegada al servidor (modo offline) |
| `device_id`, `raw_code`, `latitude`, `longitude` | | Forense |

> **Restricción antifraude:** índice único parcial `UNIQUE (ticket_id, sub_event_id) WHERE result = 'granted' AND direction = 'in'` cuando `allow_reentry = false`. Garantiza un solo uso incluso con escaneos concurrentes en puertas distintas.

#### 2.2.5 Módulos avanzados

**`guest_lists`** · `id`, `event_id`, `sub_event_id` NULL, `name` ("Prensa", "Patrocinadores", "RRPP Carlos"), `owner_user_id`, `quota`, `used_count`, `ticket_type_id`, `status`.
**`guest_list_entries`** · `id`, `guest_list_id`, `full_name`, `email`, `phone`, `companions`, `ticket_id` NULL, `status` (`pending, sent, checked_in, cancelled`), `notes`.

**`settlements`** (liquidaciones) · `id`, `organization_id`, `event_id` NULL, `period_start`, `period_end`, `gross_sales`, `platform_commission`, `payment_fees`, `refunds_total`, `taxes`, `net_payable`, `status` (`draft, approved, paid, disputed`), `paid_at`, `invoice_url`.
**`settlement_lines`** · `settlement_id`, `event_id`, `concept`, `quantity`, `unit_amount`, `amount`.

**`audit_logs`** · `id bigserial`, `organization_id`, `actor_user_id`, `actor_role`, `action` (`event.updated`), `entity_type`, `entity_id`, `changes jsonb` (`{before, after}`), `ip_address`, `user_agent`, `created_at`. **Append-only**: sin `UPDATE` ni `DELETE` (revocado a nivel de rol de BD).

**`notifications`** · Cola lógica de comunicaciones: `id`, `channel(email|sms|push|whatsapp)`, `template`, `recipient`, `payload jsonb`, `status`, `sent_at`, `error`.

### 2.3 Índices recomendados

```sql
CREATE INDEX idx_events_org_status        ON events (organization_id, status);
CREATE INDEX idx_events_slug              ON events (slug);
CREATE INDEX idx_events_starts            ON events (starts_at) WHERE status IN ('published','on_sale');
CREATE INDEX idx_subevents_event_start    ON sub_events (event_id, starts_at);
CREATE INDEX idx_tickettypes_event        ON ticket_types (event_id, sub_event_id);
CREATE INDEX idx_orders_customer          ON orders (customer_id, created_at DESC);
CREATE INDEX idx_orders_event_status      ON orders (event_id, status);
CREATE INDEX idx_orders_expiry            ON orders (expires_at) WHERE status = 'reserved';
CREATE UNIQUE INDEX idx_tickets_code      ON tickets (code);
CREATE INDEX idx_tickets_subevent_status  ON tickets (sub_event_id, status);
CREATE INDEX idx_scans_event_time         ON scans (event_id, scanned_at DESC);
CREATE INDEX idx_scans_ticket             ON scans (ticket_id);
CREATE INDEX idx_audit_entity             ON audit_logs (entity_type, entity_id, created_at DESC);
```

### 2.4 Flujo de compra (reserva → pago → emisión)

```mermaid
sequenceDiagram
    autonumber
    participant U as Usuario (Web)
    participant A as API
    participant R as Redis
    participant DB as PostgreSQL
    participant P as Pasarela
    participant W as Worker

    U->>A: POST /orders/hold (ticket_type, qty, sub_event)
    A->>R: Lock distribuido sobre capacity_pool
    A->>DB: BEGIN; SELECT pool FOR UPDATE
    alt Hay disponibilidad
        A->>DB: held_count += qty; INSERT order(status=reserved, expires_at=+10min)
        A->>DB: COMMIT
        A->>R: SET hold:{orderId} TTL 600s
        A-->>U: 201 {orderId, expiresAt, total}
    else Sin stock
        A->>DB: ROLLBACK
        A-->>U: 409 SOLD_OUT
    end

    U->>A: POST /orders/{id}/checkout (datos comprador)
    A->>P: Crear PaymentIntent (amount, metadata.orderId)
    A-->>U: {clientSecret}
    U->>P: Confirma pago (SDK cliente, PCI SAQ-A)

    P-->>A: Webhook payment_intent.succeeded (firmado)
    A->>DB: BEGIN; verificar idempotencia
    A->>DB: order.status = paid; pool.held -= qty; pool.sold += qty
    A->>DB: INSERT tickets[] (código + QR firmado)
    A->>DB: COMMIT
    A->>W: enqueue(generatePDF, sendEmail)
    W->>U: Email con tickets + enlace de descarga

    Note over A,DB: Job cron cada 60s libera órdenes con expires_at < now()
```

### 2.5 Diseño del código QR

El payload del QR es una cadena compacta y **firmada**, no un simple UUID:

```
ENT1.<ticketId_base62>.<nonce>.<HMAC-SHA256(ticketId|nonce|eventId, SECRET)[:16]>
```

| Propiedad | Cómo se consigue |
|---|---|
| No enumerable | `nonce` aleatorio de 128 bits |
| No falsificable offline | HMAC con secreto rotable por evento |
| Verificable sin red | El validador precarga la clave del evento y valida la firma antes de consultar la BD |
| Un solo uso | Resuelto en servidor mediante `scans` + índice único parcial |
| Revocable | `tickets.status` y lista de revocación sincronizada al dispositivo |

**Modo offline (obligatorio en recintos con mala cobertura):** la PWA descarga un *manifest* del subevento (lista de hashes de tickets válidos, ~40 bytes por ticket) en IndexedDB. Valida firma + pertenencia local, registra el escaneo y lo sincroniza en lote. Los conflictos (mismo ticket escaneado en dos dispositivos offline) se resuelven por `scanned_at` más antiguo y se reportan como **incidencia** en el panel.

### 2.6 Máquinas de estado

```mermaid
stateDiagram-v2
    direction LR
    [*] --> pending
    pending --> reserved : hold OK
    reserved --> paid : pago capturado
    reserved --> expired : TTL vencido
    reserved --> cancelled : usuario/admin
    paid --> partially_refunded : reembolso parcial
    paid --> refunded : reembolso total
    partially_refunded --> refunded
    expired --> [*]
    cancelled --> [*]
    refunded --> [*]
```

```mermaid
stateDiagram-v2
    direction LR
    [*] --> valid : emitido
    valid --> used : primer escaneo (sin reentrada)
    valid --> transferred : cesión a otro titular
    transferred --> valid
    valid --> cancelled : anulación admin
    valid --> refunded : reembolso
    used --> refunded : reembolso excepcional
```

---

## 3. Módulo 1 — Aplicación Web Pública (`entraditas.com`)

### 3.1 Objetivo

Maximizar la **conversión** del embudo `descubrimiento → selección → pago → ticket en el móvil`, con carga instantánea en redes móviles y cero fricción innecesaria.

### 3.2 Stack y configuración

- **React 18 + Vite 5 + TypeScript** (`strict: true`, `noUncheckedIndexedAccess`)
- **Tailwind CSS 3.4** con *design tokens* propios (no la paleta por defecto)
- **React Router 6** con *lazy routes* y `Suspense`
- **TanStack Query** para datos de servidor; **Zustand** persistido en `sessionStorage` para el carrito
- **React Hook Form + Zod** para checkout
- **Vitest + Testing Library**; **Playwright** para el E2E del flujo de compra

### 3.3 Estructura de carpetas

```
src/
├── app/
│   ├── router.tsx
│   ├── providers.tsx          # QueryClient, Theme, Toaster, ErrorBoundary
│   └── layouts/               # PublicLayout, CheckoutLayout
├── features/
│   ├── catalog/               # listado, filtros, búsqueda
│   │   ├── api/               # queries + tipos derivados de OpenAPI
│   │   ├── components/
│   │   └── hooks/
│   ├── event-detail/          # ficha, selector de subevento
│   ├── ticket-selection/      # selector de tipos, cantidades, códigos promo
│   ├── checkout/              # datos, pago, confirmación
│   ├── my-tickets/            # área de usuario, descarga QR
│   └── auth/                  # login mágico / OAuth
├── shared/
│   ├── ui/                    # Button, Input, Sheet, Skeleton…
│   ├── lib/                   # apiClient, formatters, currency, dates
│   ├── hooks/                 # useCountdown, useMediaQuery, useAnalytics
│   └── types/                 # api.generated.ts (desde OpenAPI)
├── styles/
└── main.tsx
```

### 3.4 Mapa de rutas

| Ruta | Vista | Notas SEO |
|---|---|---|
| `/` | Home: destacados, categorías, próximos | Prerender estático |
| `/eventos` | Catálogo con filtros (ciudad, fecha, categoría, precio) | Filtros en query string, indexable |
| `/eventos/:slug` | Ficha del evento + lista de subeventos | `JSON-LD` schema.org `Event` |
| `/eventos/:slug/:subEventId` | Selección de entradas del subevento | `noindex` |
| `/checkout/:orderId` | Datos + pago | `noindex`, sin layout distractor |
| `/checkout/:orderId/confirmacion` | Confirmación + descarga inmediata | Evento de conversión |
| `/mis-entradas` | Listado de pedidos y tickets | Requiere sesión o *magic link* |
| `/ticket/:code` | Vista pública del ticket (QR a pantalla completa) | Token de acceso en URL |
| `/organizador/:slug` | Perfil público del organizador | Indexable |

### 3.5 Flujo de selección de entradas — reglas de UX

1. **Un solo scroll hasta el CTA.** En la ficha de evento, el bloque de compra es *sticky* en desktop y una *bottom sheet* fija en móvil.
2. **Subeventos como paso explícito.** Si `has_sub_events = true`, se muestra un selector de fecha/función antes de los tipos de entrada. Si solo hay uno, se salta el paso.
3. **Tipos de entrada con estado visible.** Cada tipo muestra precio final (con desglose de gastos de gestión al desplegar), disponibilidad (`Últimas 12`, `Agotado`), límites por pedido y ventana de venta.
4. **Precio total siempre visible.** Nada de sorpresas en el último paso — es la principal causa de abandono.
5. **Temporizador de reserva.** Contador de 10 minutos visible desde que se crea el *hold*, con avisos a 2 min y renovación única posible.
6. **Checkout de un solo paso** con secciones colapsables: identidad → nominación (si aplica) → pago. **Compra como invitado por defecto**; la cuenta se crea implícitamente tras la compra.
7. **Recuperación de errores.** Si el pago falla, la reserva se mantiene y se ofrece reintento sin perder la selección.
8. **Entrega inmediata.** En la pantalla de confirmación el QR ya está disponible (no se obliga a esperar el email).

### 3.6 Entrega del ticket

- **QR en pantalla** renderizado en cliente desde `qr_payload` (`qrcode.react`), con brillo máximo sugerido y bloqueo de rotación.
- **PDF descargable** generado en el backend (worker) y servido desde S3 con URL firmada de caducidad corta.
- **Apple Wallet / Google Wallet** (`.pkpass`) en Fase 3.
- **Reenvío por email** y **transferencia de entrada** a otro asistente (genera nuevo `qr_payload` e invalida el anterior).

### 3.7 Rendimiento — presupuesto y técnicas

| Métrica | Presupuesto |
|---|---|
| JS inicial (gzip) | ≤ 120 KB |
| CSS (gzip) | ≤ 20 KB |
| LCP | ≤ 2.0 s en 4G |
| CLS | ≤ 0.05 |

Técnicas: *code splitting* por ruta; `react-lazy` para el módulo de pago (SDK de la pasarela solo en checkout); imágenes en AVIF/WebP con `srcset` y dimensiones explícitas (evita CLS); `font-display: swap` con subset latino; skeletons en lugar de spinners; prefetch de la ficha de evento al hacer hover/intersección en la tarjeta del catálogo; `staleTime` alto para catálogo y `staleTime: 0` para disponibilidad.

### 3.8 SEO, accesibilidad y analítica

- **SEO:** sitemap dinámico, `JSON-LD` de tipo `Event` y `Offer` por evento, meta OG por evento, URLs limpias con slug, canonical. Prerender de rutas públicas en build + revalidación por webhook al publicar un evento.
- **Accesibilidad (WCAG AA):** navegación completa por teclado, foco visible, contraste ≥ 4.5:1, `aria-live` en el contador de reserva y en errores de pago, etiquetas asociadas a todos los campos.
- **Analítica de embudo:** eventos `view_event`, `select_subevent`, `add_to_cart`, `begin_checkout`, `purchase` (GA4 / Plausible + envío server-side para fiabilidad).

---

## 4. Módulo 2 — Panel de Administración (`panel.entraditas.com`)

### 4.1 Stack

React 18 + TypeScript + Tailwind + **shadcn/ui** (Radix) + **TanStack Table v8** (tablas con server-side pagination/sorting/filtering) + **Recharts** (gráficos) + **TanStack Query** + **dnd-kit** (ordenación de tipos de entrada) + **react-zxing** (escaneo por cámara).

Se descarta un framework de dashboard cerrado para evitar bloqueo tecnológico y mantener control total sobre el rendimiento de tablas con decenas de miles de filas.

### 4.2 Sistema de Roles y Permisos (RBAC + ABAC)

#### Jerarquía

```mermaid
graph TD
    SA["<b>SUPERADMINISTRADOR</b><br/>Plataforma · nivel 0<br/>Acceso cross-organización"]
    AD["<b>ADMINISTRADOR</b><br/>Organizador · nivel 1<br/>Dueño de su organización"]
    US["<b>USUARIO</b><br/>Equipo · nivel 2<br/>Opera eventos asignados"]
    SU["<b>SUBUSUARIO</b><br/>Operativo · nivel 3<br/>Permisos granulares por sección"]

    SA -->|crea y suspende| AD
    AD -->|crea y asigna scope| US
    AD -->|crea| SU
    US -->|crea si tiene users:manage| SU
```

#### Modelo de resolución de permisos

El permiso efectivo se calcula así (evaluado en el middleware de la API y replicado en el cliente solo para ocultar UI, nunca como control de seguridad):

```
permisos_efectivos = (permisos_del_rol ∪ overrides_allow) − overrides_deny
acceso_a_recurso   = permisos_efectivos ∧ tenant_match ∧ event_scope_match
```

1. **Nivel 1 — Rol (RBAC):** conjunto base de permisos.
2. **Nivel 2 — Override por usuario:** `allow` añade, `deny` resta. `deny` es siempre prioritario.
3. **Nivel 3 — Alcance por atributo (ABAC):** `organization_id` obligatorio + `user_event_scopes` opcional que limita la visibilidad a eventos concretos.
4. **Nivel 4 — Alcance por puerta:** un subusuario validador solo puede escanear en las `gates` que tenga asignadas.

> Un subusuario nunca puede recibir un permiso que su usuario padre no posea. La API valida esta invariante al crear u otorgar permisos (*privilege escalation guard*).

#### Matriz de permisos por defecto

| Sección / Acción | Superadmin | Administrador | Usuario | Subusuario |
|---|:--:|:--:|:--:|:--:|
| Gestión de organizaciones | ✅ | ❌ | ❌ | ❌ |
| Comisiones de plataforma | ✅ | 👁️ | ❌ | ❌ |
| Suplantar organizador (*impersonate*) | ✅ | ❌ | ❌ | ❌ |
| Crear / editar eventos | ✅ | ✅ | ✅¹ | ⚙️ |
| Publicar / despublicar evento | ✅ | ✅ | ⚙️ | ❌ |
| Eliminar evento | ✅ | ✅ | ❌ | ❌ |
| Subeventos y aforos | ✅ | ✅ | ✅¹ | ⚙️ |
| Tipos de entrada y precios | ✅ | ✅ | ✅¹ | ⚙️ |
| Códigos de descuento | ✅ | ✅ | ✅¹ | ⚙️ |
| Ver pedidos | ✅ | ✅ | ✅¹ | ⚙️ |
| Reembolsar / anular | ✅ | ✅ | ⚙️ | ❌ |
| Venta en taquilla | ✅ | ✅ | ✅ | ⚙️ |
| Configurar puertas | ✅ | ✅ | ✅¹ | ❌ |
| Escanear QR | ✅ | ✅ | ✅ | ✅² |
| Revertir escaneo | ✅ | ✅ | ⚙️ | ❌ |
| Lista de invitados / cortesías | ✅ | ✅ | ✅¹ | ⚙️³ |
| Dashboard y métricas | ✅ | ✅ | ✅¹ | ⚙️ |
| Exportar informes | ✅ | ✅ | ⚙️ | ❌ |
| Liquidaciones y finanzas | ✅ | ✅ | ❌ | ❌ |
| Gestión de usuarios del equipo | ✅ | ✅ | ⚙️ | ❌ |
| Logs de auditoría | ✅ | ✅ | ❌ | ❌ |
| Ajustes de la organización | ✅ | ✅ | ❌ | ❌ |

**Leyenda:** ✅ permitido · ❌ denegado · ⚙️ configurable por override · 👁️ solo lectura
¹ Limitado a los eventos de su `user_event_scopes` · ² Solo en las puertas asignadas · ³ Típicamente solo su propia lista (RRPP)

#### Implementación en el cliente

```tsx
// shared/auth/Can.tsx
export function Can({ do: action, on, children, fallback = null }: CanProps) {
  const { has } = usePermissions();
  return has(action, on) ? <>{children}</> : <>{fallback}</>;
}

// Uso
<Can do="events:delete" on={{ eventId }}>
  <Button variant="destructive">Eliminar evento</Button>
</Can>
```

El backend devuelve en `/auth/me` el array de permisos efectivos y los `eventScopes`, que se cachean en el store. **La ocultación de UI es cosmética; toda ruta de la API revalida.**

### 4.3 Mapa de navegación del panel

```
📊 Dashboard
🎫 Eventos
   ├─ Listado (filtros por estado, fecha, organizador)
   └─ Detalle del evento
       ├─ Información general
       ├─ Subeventos / Funciones
       ├─ Aforos y zonas
       ├─ Tipos de entrada y tarifas
       ├─ Códigos de descuento
       ├─ Puertas y control de acceso
       ├─ Lista de invitados / Cortesías
       ├─ Pedidos y asistentes
       └─ Métricas del evento
🛒 Ventas
   ├─ Pedidos          ├─ Reembolsos
   ├─ Taquilla (POS)   └─ Asistentes (CRM)
🚪 Control de accesos
   ├─ Escáner en vivo  ├─ Puertas
   └─ Incidencias de escaneo
📈 Informes
   ├─ Ventas · Aforo · Canales · Promotores
   └─ Exportaciones (CSV / XLSX / PDF)
💰 Finanzas
   ├─ Liquidaciones    ├─ Facturas
   └─ Comisiones
👥 Equipo
   ├─ Usuarios y subusuarios
   └─ Roles y permisos
⚙️ Configuración
   ├─ Organización · Marca · Pasarelas
   └─ Plantillas de email
🛡️ Auditoría (superadmin / admin)
🏢 Organizadores (solo superadmin)
```

### 4.4 Gestión de eventos — especificación funcional

**Asistente de creación en 5 pasos** (guardado como borrador en cada paso):

1. **Datos básicos:** título, categoría, descripción (editor Markdown/TipTap), imagen de portada (recorte 16:9 + 1:1), galería, recinto.
2. **Fechas y subeventos:** modo "evento único" o "múltiples funciones". Generador rápido de funciones recurrentes (p. ej. "todos los sábados a las 21:00 durante 6 semanas"). Duplicación de configuración entre subeventos.
3. **Aforo y zonas:** definición de `capacity_pools`, asignación a zonas del recinto, aforo total con validación contra la capacidad del venue.
4. **Tipos de entrada:** creación de VIP/General/Promo con precio, cupo, ventana de venta, límites por pedido, visibilidad, tramos de precio (Early Bird). Selector explícito de **alcance**: *aplica a todo el evento* o *a subeventos concretos* (multi-select). Reordenación por arrastre.
5. **Publicación:** revisión, previsualización de la ficha pública, checklist de bloqueo (sin tipos de entrada → no publicable), programación de la salida a la venta.

**Vista de aforo consolidada:** tabla matricial subeventos × tipos de entrada con vendidas / disponibles / % ocupación y edición inline de cupos, con recálculo de disponibilidad en tiempo real.

### 4.5 Control de accesos / Puertas

**Configuración de puertas:** nombre, código, subevento aplicable (o todos), tipos de entrada admitidos, dirección (entrada/salida/ambas), reentrada permitida, escaneos máximos por ticket, ventana horaria de apertura, operadores asignados.

**Aplicación de escaneo (PWA en `scan.entraditas.com`):**

- Login por PIN corto o QR de emparejamiento del dispositivo (evita teclear contraseñas en la puerta).
- Escaneo por cámara (`BarcodeDetector` nativo con fallback a ZXing) y soporte de lectores láser (modo teclado HID).
- **Feedback inequívoco en < 300 ms:** pantalla verde + vibración corta ✅ / pantalla roja + doble vibración + motivo textual ❌. Muestra nombre del titular, tipo de entrada y, si procede, el aviso *"Ya validada a las 21:04 en Puerta Norte"*.
- **Modo offline:** descarga del manifest del subevento, validación local, cola de sincronización con indicador de pendientes.
- **Búsqueda manual** por nombre, documento, email o código, para tickets con QR ilegible.
- **Check-in manual** de invitados de la lista sin QR.
- Contador en vivo de aforo dentro del recinto y de escaneos del operador.

**Panel de escáner en vivo (web):** flujo de escaneos en tiempo real (WebSocket), ocupación por puerta, alertas de intentos denegados, ritmo de entrada (personas/minuto) para detectar cuellos de botella.

### 4.6 Dashboard y métricas

**KPIs principales (con comparativa contra periodo anterior):** ingresos brutos y netos, entradas vendidas, ticket medio, % de aforo, tasa de conversión del embudo, tasa de asistencia (*check-in rate*), reembolsos.

**Visualizaciones:**

| Gráfico | Tipo | Uso |
|---|---|---|
| Ventas acumuladas vs. tiempo | Línea con proyección | Predecir sold-out |
| Ventas por tipo de entrada | Barras apiladas | Mix de producto |
| Aforo ocupado por subevento | Barra de progreso | Estado operativo |
| Curva de entrada al recinto | Área temporal | Dimensionar personal de puerta |
| Canales de venta | Donut | Web / taquilla / cortesías |
| Mapa de calor geográfico | Mapa | Origen de compradores |
| Embudo de conversión | Funnel | Detección de fugas |

**Tiempo real:** los contadores críticos (ventas, aforo, escaneos) se actualizan por **SSE/WebSocket** con *fallback* a polling de 15 s. Los agregados pesados se precalculan en vistas materializadas refrescadas cada minuto (`event_stats_mv`) para no golpear las tablas transaccionales.

**Informes exportables:** ventas detalladas, listado de asistentes, control de accesos, financiero por evento, cierre de taquilla. Generación asíncrona con notificación al terminar; formatos CSV, XLSX y PDF.

### 4.7 Módulos avanzados propuestos

Se proponen cinco módulos que aportan valor diferencial. Los cuatro primeros se consideran **prioritarios**.

#### 🥇 A. Liquidaciones y cierre económico con organizadores

Automatiza el proceso más doloroso y propenso a error del negocio.

- Cálculo automático por evento y por periodo: ventas brutas − comisión de plataforma − comisiones de pasarela − reembolsos − retenciones fiscales = **neto a pagar**.
- Reglas de comisión configurables por organización, evento o tipo de entrada (porcentaje, fijo, mixto, con mínimos y topes).
- **Anticipos y pagos parciales** antes de la celebración del evento, con límite de riesgo configurable.
- Estados: `borrador → aprobada → pagada → disputada`, con adjuntos y notas.
- Generación de factura/autofactura en PDF y exportación contable (CSV compatible con ERP).
- Portal del organizador con historial de pagos y desglose descargable.

#### 🥈 B. Cortesías, lista de invitados y RRPP

Convierte una gestión habitualmente manual (hojas de cálculo y WhatsApp) en un flujo trazable.

- Listas nominales por categoría (prensa, patrocinadores, artista, staff) con **cupo por lista**.
- Emisión masiva de cortesías con envío automático por email/SMS.
- **Enlaces de RRPP con código de seguimiento:** cada promotor recibe una URL única; el sistema atribuye ventas y comisiona automáticamente (integrable con el módulo de liquidaciones).
- Check-in de invitados sin QR mediante búsqueda por nombre o documento.
- Control de acompañantes (+1, +2) y ranking de efectividad por promotor.

#### 🥉 C. Registro de auditoría y seguridad operativa

Imprescindible cuando varias personas manipulan aforos, precios y reembolsos.

- Log inmutable *append-only* de toda mutación con `{before, after}`, actor, IP, dispositivo y marca temporal.
- Vista de línea temporal por entidad ("historial de este evento") y por usuario.
- **Alertas automáticas** ante patrones anómalos: reembolsos fuera de horario, cambios masivos de precio, emisión de cortesías por encima del umbral, un mismo operador denegando muchos escaneos.
- Sesiones activas, revocación remota de dispositivos y exportación de logs para cumplimiento.

#### 4️⃣ D. Taquilla presencial (POS) y venta asistida

- Interfaz optimizada para tablet: venta rápida en puerta con cobro en efectivo, tarjeta (datáfono) o transferencia.
- **Impresión térmica** de entradas (ESC/POS) y emisión de QR al instante.
- Apertura y **cierre de caja por turno** con arqueo, cuadre y diferencias registradas.
- Funciona con la misma lógica de aforo, por lo que la venta online y presencial nunca sobrevenden.

#### 5️⃣ E. Marketing, CRM y mercado secundario *(deseable)*

- Segmentación de asistentes (compradores recurrentes, alto valor, inactivos) y campañas de email.
- Recuperación de carritos abandonados y avisos de "vuelven a estar disponibles".
- **Reventa oficial controlada** entre usuarios con precio tope, invalidando el QR original y emitiendo uno nuevo: elimina el fraude de reventa y da control al organizador.
- Encuestas post-evento y NPS.

---

## 5. Módulo 3 — Servidor API Backend (`api.entraditas.com`)

### 5.1 Arquitectura interna

Monolito modular por dominio con arquitectura en capas. Cada módulo expone su router y no accede directamente a los repositorios de otro módulo (comunicación vía servicios de aplicación o eventos internos).

```
Request → Router → Middlewares → Validator (Zod) → Controller → Service → Repository → Prisma → PostgreSQL
                        ↓                              ↓
                  Auth · RBAC · Tenant           Domain Events → Queue (BullMQ)
```

**Responsabilidad por capa**

| Capa | Hace | No hace |
|---|---|---|
| Router | Declara rutas y encadena middlewares | Lógica |
| Middleware | Autentica, autoriza, valida, limita, correla | Acceso a datos de negocio |
| Controller | Traduce HTTP ↔ dominio, formatea respuesta | Reglas de negocio |
| Service | Reglas de negocio, transacciones, orquestación | Conocer `req`/`res` |
| Repository | Consultas y persistencia (con `organization_id` forzado) | Reglas de negocio |

### 5.2 Estructura de carpetas

```
src/
├── config/
│   ├── env.ts                    # Validación de entorno con Zod (falla al arrancar)
│   ├── database.ts  cache.ts  queue.ts  logger.ts
├── modules/
│   ├── identity/                 # auth, users, roles, permissions
│   │   ├── auth.routes.ts  auth.controller.ts  auth.service.ts
│   │   ├── user.repository.ts   permission.service.ts
│   │   └── dto/  auth.schema.ts
│   ├── organizations/
│   ├── events/                   # events, sub_events, venues, zones, capacity
│   ├── ticketing/                # ticket_types, prices, discount_codes
│   ├── orders/                   # holds, checkout, orders, tickets, refunds
│   ├── payments/                 # gateway adapters + webhooks
│   ├── access/                   # gates, scans, offline manifest
│   ├── guestlist/
│   ├── reports/                  # agregados, exportaciones
│   ├── finance/                  # settlements, commissions, payouts
│   └── audit/
├── shared/
│   ├── middlewares/              # authenticate, authorize, tenantGuard,
│   │                             # validate, rateLimit, idempotency, errorHandler
│   ├── errors/                   # AppError y jerarquía tipada
│   ├── utils/                    # qr.ts, pagination.ts, money.ts, dates.ts
│   ├── events/                   # bus de eventos de dominio
│   └── types/
├── jobs/                         # workers BullMQ
│   ├── generateTicketPdf.job.ts  sendEmail.job.ts
│   ├── expireHolds.job.ts        buildReport.job.ts
│   └── refreshStats.job.ts
├── docs/                         # OpenAPI
├── app.ts                        # composición de Express
└── server.ts                     # bootstrap + graceful shutdown
```

### 5.3 Cadena de middlewares

```ts
app.use(helmet());
app.use(cors({ origin: env.ALLOWED_ORIGINS, credentials: true }));
app.use(requestId());                 // X-Request-Id para correlación
app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '1mb' }));
app.use(rateLimiter({ windowMs: 60_000, max: 120 }));

router.post(
  '/events/:eventId/ticket-types',
  authenticate,                       // verifica JWT → req.auth
  tenantGuard,                        // inyecta organizationId y filtra
  authorize('tickettypes:create', { scope: 'event', param: 'eventId' }),
  validate({ params: EventIdParams, body: CreateTicketTypeSchema }),
  auditLog('tickettype.created'),
  ticketTypeController.create
);

app.use(notFoundHandler);
app.use(errorHandler);                // último siempre
```

**`authorize(permission, options)`** resuelve el permiso efectivo (rol ∪ allow − deny), comprueba `organization_id` y, si `scope: 'event'`, verifica `user_event_scopes`. Devuelve `403 FORBIDDEN` con el permiso faltante en el cuerpo (útil en desarrollo, redactado en producción).

### 5.4 Autenticación

| Elemento | Diseño |
|---|---|
| Access token | JWT `HS256`/`RS256`, TTL **15 min**, claims: `sub`, `orgId`, `role`, `perms` (hash), `jti` |
| Refresh token | Opaco, 30 días, **rotativo**, almacenado hasheado en BD, cookie `httpOnly · Secure · SameSite=Strict` |
| Detección de robo | Reutilización de un refresh ya rotado ⇒ revocación de toda la familia de tokens |
| Contraseñas | Argon2id (`m=19456, t=2, p=1`) |
| MFA | TOTP obligatorio para superadmin, opcional para admin |
| Dispositivos de escaneo | Token de larga duración vinculado a `gate_id` + `device_id`, revocable desde el panel |
| Clientes públicos | Endpoints de catálogo sin auth, con rate limit por IP y cache CDN |
| OAuth2 social | Google/Apple para compradores (Fase 3) |

### 5.5 Convenciones de la API

- **Versionado en la ruta:** `/api/v1/...`. Los cambios rompedores generan `v2` con solapamiento de 6 meses.
- **Respuestas consistentes:**

```jsonc
// Éxito
{ "data": { }, "meta": { "requestId": "..." } }

// Colección paginada (cursor por defecto en listados grandes)
{ "data": [ ], "meta": { "page": 1, "perPage": 25, "total": 431, "nextCursor": "eyJ..." } }

// Error
{ "error": { "code": "INSUFFICIENT_CAPACITY", "message": "Solo quedan 3 entradas de tipo VIP",
             "details": [{ "field": "quantity", "issue": "max_available", "max": 3 }],
             "requestId": "req_01H..." } }
```

- **Códigos de error de dominio** (además del HTTP): `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `SOLD_OUT`, `INSUFFICIENT_CAPACITY`, `HOLD_EXPIRED`, `ORDER_ALREADY_PAID`, `PAYMENT_FAILED`, `TICKET_ALREADY_USED`, `TICKET_INVALID`, `GATE_NOT_ALLOWED`, `SALES_WINDOW_CLOSED`, `LIMIT_PER_ORDER_EXCEEDED`, `IDEMPOTENCY_CONFLICT`, `RATE_LIMITED`.
- **Filtrado y orden:** `?status=on_sale&city=Madrid&sort=-starts_at&page=2&perPage=25`.
- **Idempotencia:** cabecera `Idempotency-Key` obligatoria en `POST /orders/hold`, `/checkout`, `/refunds` y `/scans`. La respuesta se cachea 24 h en Redis por clave + hash del cuerpo.
- **Concurrencia optimista:** `If-Match` con `ETag` en actualizaciones de eventos y aforos para evitar sobrescrituras entre operadores.
- **Rate limits:** públicos 120 req/min por IP; autenticados 600 req/min por usuario; escaneo 1.200 req/min por dispositivo; login 5 intentos/15 min por IP+email.

### 5.6 Reglas críticas de negocio en el backend

1. **Reserva de aforo (hold).** Transacción con `SELECT ... FOR UPDATE` sobre `capacity_pools`, verificación de `quantity_total` del tipo, límites por pedido y ventana de venta. Lock distribuido en Redis (`SET NX PX`) para reducir contención en el on-sale.
2. **Expiración.** Job cada 60 s: `UPDATE orders SET status='expired' WHERE status='reserved' AND expires_at < now()` y devolución de `held_count` en la misma transacción.
3. **Webhook de pago.** Verificación de firma obligatoria; procesamiento idempotente por `provider_payment_id`; si el pedido ya expiró y el pago llega igualmente, se intenta re-reservar y, si no hay aforo, se dispara reembolso automático con notificación.
4. **Validación de QR.** Verificar firma → cargar ticket → comprobar `status`, `sub_event_id`, ventana horaria de la puerta, tipo de entrada permitido, reentrada. `INSERT` en `scans` dentro de la transacción, apoyándose en el índice único parcial para resolver carreras. Respuesta siempre con `result` explícito, nunca un error genérico.
5. **Tenant guard.** El repositorio base inyecta `organization_id` en toda consulta. Los tests incluyen un caso por endpoint que verifica que un usuario de la organización A recibe `404` (no `403`, para no filtrar existencia) al acceder a recursos de B.
6. **Dinero en enteros.** Todos los importes se manejan en la unidad mínima (céntimos) con `bigint`/`Decimal`; nunca `float`.

### 5.7 Jobs y tareas programadas

| Job | Disparador | Función |
|---|---|---|
| `expireHolds` | Cron 60 s | Liberar reservas caducadas |
| `generateTicketPdf` | Evento `order.paid` | Renderizar PDF y subir a S3 |
| `sendTransactionalEmail` | Cola | Confirmación, recordatorio, reembolso |
| `sendEventReminder` | Cron diario | Recordatorio 24 h antes con QR |
| `refreshStatsMV` | Cron 60 s | Refrescar vistas materializadas |
| `syncOfflineScans` | On demand | Procesar lotes de escaneos offline |
| `buildReport` | On demand | Exportaciones pesadas |
| `computeSettlement` | Cron mensual / manual | Generar liquidaciones |
| `abandonedCartEmail` | Cron 30 min | Recuperación de conversión |

### 5.8 Observabilidad y calidad

- **Logs estructurados** (Pino) con `requestId`, `userId`, `organizationId`; redacción automática de campos sensibles.
- **Métricas** Prometheus: latencia por endpoint, tasa de error, profundidad de colas, holds activos, escaneos/segundo.
- **Trazas** OpenTelemetry en el flujo de checkout completo.
- **Health checks:** `/health/live` y `/health/ready` (BD, Redis, S3).
- **Testing:** cobertura mínima del 80 % en `services`; suites obligatorias de concurrencia (200 compras simultáneas de las 10 últimas entradas ⇒ exactamente 10 pagadas), de RBAC (matriz completa rol × endpoint) y de aislamiento multi-tenant.

---

## 6. Catálogo de Endpoints de la API

Base: `https://api.entraditas.com/api/v1`
Leyenda de acceso: 🌐 público · 🔐 autenticado · 🛡️ requiere permiso · 👑 superadmin

### 6.1 Autenticación e identidad

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/auth/register` | 🌐 | Registro de comprador |
| `POST` | `/auth/login` | 🌐 | Login (devuelve access + set-cookie refresh) |
| `POST` | `/auth/refresh` | 🌐 | Rotación de refresh token |
| `POST` | `/auth/logout` | 🔐 | Revoca la sesión actual |
| `POST` | `/auth/logout-all` | 🔐 | Revoca todas las sesiones |
| `POST` | `/auth/forgot-password` | 🌐 | Envía enlace de recuperación |
| `POST` | `/auth/reset-password` | 🌐 | Restablece con token |
| `POST` | `/auth/magic-link` | 🌐 | Acceso sin contraseña a "Mis entradas" |
| `POST` | `/auth/mfa/enroll` · `/auth/mfa/verify` | 🔐 | Alta y verificación de TOTP |
| `GET` | `/auth/me` | 🔐 | Perfil + permisos efectivos + scopes |
| `POST` | `/auth/device/pair` | 🌐 | Emparejar dispositivo de escaneo con código |

### 6.2 Catálogo público

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/public/events` | 🌐 | Catálogo con filtros: `city`, `category`, `dateFrom`, `dateTo`, `q`, `minPrice`, `maxPrice` |
| `GET` | `/public/events/featured` | 🌐 | Destacados de portada |
| `GET` | `/public/events/:slug` | 🌐 | Ficha completa con subeventos y tipos visibles |
| `GET` | `/public/events/:slug/sub-events` | 🌐 | Funciones/fechas disponibles |
| `GET` | `/public/sub-events/:id/availability` | 🌐 | Disponibilidad en vivo por tipo de entrada (`Cache-Control: no-store`) |
| `POST` | `/public/discount-codes/validate` | 🌐 | Valida un código y devuelve el descuento aplicable |
| `POST` | `/public/ticket-types/unlock` | 🌐 | Desbloquea tipos `code_only` |
| `GET` | `/public/organizers/:slug` | 🌐 | Perfil público del organizador |
| `GET` | `/public/venues/:id` | 🌐 | Datos del recinto |

### 6.3 Compra y pedidos

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/orders/hold` | 🌐 | Crea reserva temporal. Requiere `Idempotency-Key`. Cuerpo: `{ subEventId, items:[{ticketTypeId, quantity}], discountCode? }` |
| `GET` | `/orders/:id` | 🌐+token | Estado del pedido y tiempo restante |
| `POST` | `/orders/:id/extend` | 🌐 | Extiende el hold una única vez (+5 min) |
| `PATCH` | `/orders/:id/items` | 🌐 | Modifica cantidades antes del pago |
| `POST` | `/orders/:id/checkout` | 🌐 | Datos del comprador + nominación; crea intención de pago |
| `POST` | `/orders/:id/cancel` | 🌐 | Cancela y libera aforo |
| `GET` | `/orders/:id/tickets` | 🌐+token | Tickets emitidos con `qr_payload` |
| `GET` | `/orders` | 🔐 | Historial del comprador |
| `POST` | `/orders/:id/resend-email` | 🌐+token | Reenvía las entradas |

### 6.4 Pagos

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/payments/intent` | 🌐 | Crea PaymentIntent para un pedido |
| `POST` | `/payments/webhook/:provider` | 🌐(firmado) | Recepción de eventos de la pasarela |
| `GET` | `/payments/:id` | 🛡️ `orders:read` | Detalle de un pago |
| `POST` | `/refunds` | 🛡️ `orders:refund` | Reembolso total o parcial |
| `GET` | `/refunds` | 🛡️ `orders:read` | Listado de reembolsos |

### 6.5 Tickets

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/tickets/:code` | 🌐+token | Datos del ticket para su visualización |
| `GET` | `/tickets/:code/pdf` | 🌐+token | Descarga del PDF (URL firmada) |
| `GET` | `/tickets/:code/wallet` | 🌐+token | Pase para Apple/Google Wallet |
| `POST` | `/tickets/:code/transfer` | 🔐 | Transfiere la entrada; reemite QR |
| `POST` | `/tickets/:id/cancel` | 🛡️ `orders:refund` | Anula una entrada concreta |
| `GET` | `/events/:eventId/tickets` | 🛡️ `orders:read` | Listado de entradas del evento (paginado, filtros) |

### 6.6 Gestión de eventos (panel)

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/events` | 🛡️ `events:read` | Listado de la organización (o global si 👑) |
| `POST` | `/events` | 🛡️ `events:create` | Crear evento |
| `GET` | `/events/:id` | 🛡️ `events:read` | Detalle completo |
| `PATCH` | `/events/:id` | 🛡️ `events:update` | Actualizar (soporta `If-Match`) |
| `DELETE` | `/events/:id` | 🛡️ `events:delete` | Borrado lógico (bloqueado si hay ventas) |
| `POST` | `/events/:id/publish` | 🛡️ `events:publish` | Publicar / programar salida a la venta |
| `POST` | `/events/:id/unpublish` | 🛡️ `events:publish` | Despublicar |
| `POST` | `/events/:id/duplicate` | 🛡️ `events:create` | Clonar con toda su configuración |
| `POST` | `/events/:id/cover` | 🛡️ `events:update` | Subida de imagen (URL prefirmada) |
| `GET` | `/events/:id/summary` | 🛡️ `events:read` | Resumen operativo (ventas, aforo, ingresos) |

### 6.7 Subeventos, zonas y aforo

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/events/:eventId/sub-events` | 🛡️ `events:read` | Listar funciones |
| `POST` | `/events/:eventId/sub-events` | 🛡️ `subevents:create` | Crear función |
| `POST` | `/events/:eventId/sub-events/bulk` | 🛡️ `subevents:create` | Generación recurrente masiva |
| `PATCH` | `/sub-events/:id` | 🛡️ `subevents:update` | Actualizar |
| `DELETE` | `/sub-events/:id` | 🛡️ `subevents:delete` | Eliminar (bloqueado con ventas) |
| `POST` | `/sub-events/:id/cancel` | 🛡️ `subevents:update` | Cancelar función y disparar reembolsos |
| `GET` | `/sub-events/:id/capacity` | 🛡️ `events:read` | Estado de aforo detallado |
| `PATCH` | `/capacity-pools/:id` | 🛡️ `capacity:update` | Ajustar aforo (valida contra vendidas) |
| `GET/POST` | `/venues` · `/venues/:id/zones` | 🛡️ `events:update` | Recintos y zonas |

### 6.8 Tipos de entrada y descuentos

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/events/:eventId/ticket-types` | 🛡️ `tickettypes:read` | Listar (nivel evento y subevento) |
| `POST` | `/events/:eventId/ticket-types` | 🛡️ `tickettypes:create` | Crear con `scope: event \| subEventIds[]` |
| `PATCH` | `/ticket-types/:id` | 🛡️ `tickettypes:update` | Actualizar |
| `DELETE` | `/ticket-types/:id` | 🛡️ `tickettypes:delete` | Eliminar si no tiene ventas |
| `POST` | `/ticket-types/reorder` | 🛡️ `tickettypes:update` | Reordenar |
| `POST` | `/ticket-types/:id/prices` | 🛡️ `tickettypes:update` | Añadir tramo de precio |
| `GET/POST` | `/events/:eventId/discount-codes` | 🛡️ `tickettypes:update` | Códigos promocionales |
| `POST` | `/discount-codes/bulk-generate` | 🛡️ `tickettypes:update` | Generar N códigos únicos |

### 6.9 Puertas y control de accesos

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/events/:eventId/gates` | 🛡️ `gates:read` | Listar puertas |
| `POST` | `/events/:eventId/gates` | 🛡️ `gates:manage` | Crear puerta |
| `PATCH` | `/gates/:id` | 🛡️ `gates:manage` | Configurar (tipos admitidos, reentrada, horario) |
| `DELETE` | `/gates/:id` | 🛡️ `gates:manage` | Eliminar |
| `POST` | `/gates/:id/operators` | 🛡️ `gates:manage` | Asignar operadores |
| `POST` | `/gates/:id/pairing-code` | 🛡️ `gates:manage` | Código de emparejamiento de dispositivo |
| **`POST`** | **`/scan/validate`** | 🛡️ `scan:validate` | **Validación de QR.** Cuerpo: `{ code, gateId, subEventId, direction, scannedAt, deviceId }`. Requiere `Idempotency-Key` |
| `POST` | `/scan/batch` | 🛡️ `scan:validate` | Sincronización de escaneos offline |
| `POST` | `/scan/manual` | 🛡️ `scan:validate` | Check-in manual por nombre/documento |
| `POST` | `/scan/:scanId/reverse` | 🛡️ `scan:reverse` | Revertir un escaneo erróneo |
| `GET` | `/sub-events/:id/offline-manifest` | 🛡️ `scan:validate` | Manifiesto de tickets válidos para modo offline |
| `GET` | `/events/:eventId/scans` | 🛡️ `gates:read` | Log de escaneos (filtros por puerta, resultado, hora) |
| `GET` | `/events/:eventId/attendance/live` | 🛡️ `gates:read` | SSE con aforo y escaneos en tiempo real |

### 6.10 Lista de invitados y cortesías

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET/POST` | `/events/:eventId/guest-lists` | 🛡️ `guestlist:*` | Listas y cupos |
| `POST` | `/guest-lists/:id/entries` | 🛡️ `guestlist:manage` | Añadir invitado |
| `POST` | `/guest-lists/:id/entries/import` | 🛡️ `guestlist:manage` | Importar CSV |
| `POST` | `/guest-lists/:id/issue` | 🛡️ `guestlist:manage` | Emitir cortesías y enviarlas |
| `DELETE` | `/guest-list-entries/:id` | 🛡️ `guestlist:manage` | Retirar invitación |
| `GET` | `/events/:eventId/promoters/performance` | 🛡️ `reports:read` | Rendimiento por RRPP |

### 6.11 Ventas asistidas (taquilla)

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `POST` | `/box-office/orders` | 🛡️ `orders:create` | Venta presencial (efectivo/tarjeta) |
| `POST` | `/box-office/shifts/open` · `/close` | 🛡️ `orders:create` | Apertura y arqueo de caja |
| `GET` | `/box-office/shifts/:id/summary` | 🛡️ `reports:read` | Cierre de turno |

### 6.12 Usuarios, roles y permisos

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/users` | 🛡️ `users:read` | Equipo de la organización |
| `POST` | `/users/invite` | 🛡️ `users:manage` | Invitar usuario o subusuario |
| `PATCH` | `/users/:id` | 🛡️ `users:manage` | Editar datos y rol |
| `POST` | `/users/:id/disable` · `/enable` | 🛡️ `users:manage` | Activar/desactivar |
| `PUT` | `/users/:id/permissions` | 🛡️ `users:manage` | Overrides `allow`/`deny` |
| `PUT` | `/users/:id/event-scopes` | 🛡️ `users:manage` | Eventos accesibles |
| `GET` | `/users/:id/sessions` · `DELETE` `/sessions/:sid` | 🛡️ `users:manage` | Sesiones activas y revocación |
| `GET` | `/roles` · `/permissions` | 🛡️ `roles:manage` | Catálogos |
| `PUT` | `/roles/:id/permissions` | 👑 | Editar permisos base de un rol |

### 6.13 Métricas, informes y finanzas

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/dashboard/overview` | 🛡️ `reports:read` | KPIs globales con comparativa |
| `GET` | `/events/:id/analytics/sales` | 🛡️ `reports:read` | Serie temporal de ventas |
| `GET` | `/events/:id/analytics/occupancy` | 🛡️ `reports:read` | Aforo por subevento y tipo |
| `GET` | `/events/:id/analytics/channels` | 🛡️ `reports:read` | Ventas por canal |
| `GET` | `/events/:id/analytics/funnel` | 🛡️ `reports:read` | Embudo de conversión |
| `GET` | `/events/:id/analytics/attendance` | 🛡️ `reports:read` | Curva de entrada al recinto |
| `POST` | `/reports/export` | 🛡️ `reports:export` | Encola exportación (CSV/XLSX/PDF) |
| `GET` | `/reports/exports/:id` | 🛡️ `reports:export` | Estado y descarga |
| `GET` | `/finance/settlements` | 🛡️ `finance:read` | Liquidaciones |
| `POST` | `/finance/settlements/compute` | 🛡️ `finance:settle` | Calcular liquidación de un periodo |
| `POST` | `/finance/settlements/:id/approve` · `/pay` | 🛡️ `finance:settle` | Aprobar y marcar pagada |
| `GET` | `/finance/settlements/:id/invoice` | 🛡️ `finance:read` | Factura PDF |

### 6.14 Auditoría y administración de plataforma

| Método | Endpoint | Acceso | Descripción |
|---|---|---|---|
| `GET` | `/audit-logs` | 🛡️ `audit:read` | Filtros por actor, acción, entidad, rango |
| `GET` | `/audit-logs/entity/:type/:id` | 🛡️ `audit:read` | Historial de una entidad |
| `GET` | `/audit-logs/alerts` | 🛡️ `audit:read` | Alertas de patrones anómalos |
| `GET/POST` | `/admin/organizations` | 👑 | Alta y gestión de organizadores |
| `PATCH` | `/admin/organizations/:id/commission` | 👑 | Comisión de plataforma |
| `POST` | `/admin/organizations/:id/suspend` | 👑 | Suspender |
| `POST` | `/admin/impersonate/:userId` | 👑 | Suplantación auditada con TTL corto |
| `GET` | `/admin/platform/stats` | 👑 | Métricas globales (GMV, organizaciones activas) |
| `GET` | `/health/live` · `/health/ready` | 🌐 | Health checks |

---

## 7. Roadmap y Fases de Implementación

Estimación orientativa para un equipo de **1 tech lead + 2 desarrolladores full-stack + 1 diseñador a tiempo parcial**.

```mermaid
gantt
    title Plan de implementación — entraditas.com
    dateFormat YYYY-MM-DD
    axisFormat %b
    section Fundación
    Fase 0 · Setup e infraestructura      :f0, 2026-09-01, 2w
    Fase 1 · Núcleo (auth, eventos, API)  :f1, after f0, 4w
    section MVP comercial
    Fase 2 · Venta online end-to-end      :f2, after f1, 5w
    Fase 3 · Control de accesos           :f3, after f2, 4w
    section Escalado
    Fase 4 · Métricas e informes          :f4, after f3, 3w
    Fase 5 · Módulos avanzados            :f5, after f4, 5w
    Fase 6 · Optimización y go-live       :f6, after f5, 3w
```

### Fase 0 — Fundación (2 semanas)

**Objetivo:** que cualquier desarrollador pueda levantar el proyecto y desplegar en 10 minutos.

- Monorepo (npm workspaces): `apps/web`, `apps/panel`, `apps/scan`, `apps/api`, `packages/ui`, `packages/types`, `packages/config`.
- Docker Compose local (Postgres, Redis, MinIO, MailHog).
- Esquema Prisma inicial + migraciones + seeds realistas (2 organizaciones, 5 eventos, roles y permisos).
- CI en GitHub Actions: lint, typecheck, tests, build, migraciones en staging.
- ESLint + Prettier + Husky + Conventional Commits.
- Entornos de staging desplegados y con dominios configurados.

**Entregable:** infraestructura funcionando con "Hello World" autenticado extremo a extremo.

### Fase 1 — Núcleo de identidad y eventos (4 semanas)

- Módulo `identity` completo: login, refresh rotativo, recuperación, invitaciones, MFA para superadmin.
- **RBAC completo** con los 4 roles, overrides, `event_scopes` y `tenantGuard`, con su batería de tests.
- CRUD de organizaciones, eventos, subeventos, zonas y aforos.
- CRUD de tipos de entrada con alcance evento/subevento y tramos de precio.
- Shell del panel: layout, navegación condicionada por permisos, tablas, formularios, gestión de equipo.
- OpenAPI publicado y tipos generados para los clientes.

**Criterio de aceptación:** un administrador puede crear un evento completo con 3 funciones y 4 tipos de entrada; un subusuario con permisos restringidos ve exactamente lo que le corresponde.

### Fase 2 — Venta online extremo a extremo (5 semanas)

- Endpoints públicos de catálogo y disponibilidad, con cache.
- Web pública: home, catálogo con filtros, ficha de evento, selección de subevento y entradas.
- **Motor de reservas:** holds con TTL, locks, expiración automática, límites y ventanas de venta.
- Integración de la pasarela de pago + webhooks idempotentes + reembolsos.
- Emisión de tickets con QR firmado, PDF asíncrono, email transaccional.
- Área "Mis entradas" y descarga.
- Códigos de descuento.
- **Test de carga** del on-sale (objetivo: 500 compras/minuto sin sobreventa).

**Criterio de aceptación:** compra real completada en producción restringida, con entrada descargable y contabilidad correcta del aforo bajo concurrencia.

### Fase 3 — Control de accesos (4 semanas)

- CRUD de puertas y asignación de operadores y tipos de entrada.
- Endpoint `/scan/validate` con todas las reglas y garantías anti doble uso.
- **PWA de escaneo** con cámara, feedback háptico/visual, búsqueda manual y modo offline con manifiesto + sincronización en lote.
- Emparejamiento de dispositivos y revocación.
- Panel de escaneo en vivo con SSE y gestión de incidencias.
- Pruebas de campo en un evento piloto real.

**Criterio de aceptación:** 1.000 validaciones en un evento real con < 1 % de incidencias y funcionamiento verificado sin cobertura de red.

### Fase 4 — Métricas e informes (3 semanas)

- Vistas materializadas y jobs de agregación.
- Dashboard con KPIs, gráficos y tiempo real.
- Analíticas por evento: ventas, aforo, canales, embudo, curva de asistencia.
- Motor de exportación asíncrona (CSV/XLSX/PDF) con notificación.
- Analítica de conversión en la web pública.

### Fase 5 — Módulos avanzados (5 semanas)

Orden sugerido por retorno: **liquidaciones → cortesías/RRPP → auditoría → taquilla POS**.

- Liquidaciones: reglas de comisión, cálculo, estados, facturas, portal del organizador.
- Cortesías, listas de invitados, enlaces de promotor con atribución.
- Auditoría: log inmutable, línea temporal por entidad, alertas de anomalías.
- Taquilla POS con turnos, arqueo e impresión térmica.

### Fase 6 — Optimización, cumplimiento y lanzamiento (3 semanas)

- Auditoría de rendimiento (Lighthouse ≥ 90, presupuesto de bundle) y de accesibilidad (WCAG AA).
- Pentest / revisión OWASP y corrección de hallazgos.
- RGPD: política de privacidad, consentimiento, exportación y borrado de datos, retención.
- Runbooks operativos, copias de seguridad con restauración probada, plan de recuperación.
- Documentación de usuario, onboarding de organizadores y soporte.
- **Go-live.**

### Fases posteriores (backlog priorizado)

Wallet de Apple/Google · reventa oficial controlada · asientos numerados con mapa interactivo · app nativa para asistentes · marketplace y recomendaciones · internacionalización y multimoneda · API pública para partners con API keys · integraciones (Mailchimp, Meta/Google Ads, contabilidad).

---

## 8. Anexos

### 8.1 Variables de entorno (API)

```bash
NODE_ENV=production
PORT=4000
APP_URL=https://entraditas.com
PANEL_URL=https://panel.entraditas.com
ALLOWED_ORIGINS=https://entraditas.com,https://panel.entraditas.com,https://scan.entraditas.com

DATABASE_URL=postgresql://user:pass@host:5432/entraditas
REDIS_URL=redis://host:6379

JWT_ACCESS_SECRET=          # rotable
JWT_ACCESS_TTL=15m
REFRESH_TTL_DAYS=30
QR_SIGNING_SECRET=          # rotable por evento
ARGON2_MEMORY=19456

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
PAYMENT_PROVIDER=stripe

S3_ENDPOINT=  S3_BUCKET=  S3_ACCESS_KEY=  S3_SECRET_KEY=
RESEND_API_KEY=  MAIL_FROM="entraditas <no-reply@entraditas.com>"

SENTRY_DSN=
LOG_LEVEL=info
HOLD_TTL_SECONDS=600
RATE_LIMIT_PUBLIC_PER_MIN=120
```

### 8.2 Convenciones de desarrollo

- **Ramas:** `main` (producción) · `develop` (staging) · `feat/*`, `fix/*`, `chore/*`.
- **Commits:** Conventional Commits (`feat(orders): add hold expiration job`).
- **PR:** obligatorio, con revisión, CI en verde y descripción del impacto en BD.
- **Migraciones:** siempre reversibles; nunca destructivas sin fase de despliegue previa (*expand/contract*).
- **Nomenclatura:** `snake_case` en BD, `camelCase` en TypeScript, `kebab-case` en URLs y archivos.
- **Definition of Done:** código + tests + tipos + documentación OpenAPI + entrada en el registro de auditoría si es mutación + revisión de permisos.

### 8.3 Checklist previo al go-live

- [ ] Copias de seguridad automáticas con restauración verificada
- [ ] Rotación de secretos documentada
- [ ] Rate limiting y WAF activos
- [ ] Webhooks de pago verificados en producción (incluidos fallos y reintentos)
- [ ] Test de carga superado con el aforo del mayor evento previsto
- [ ] Modo offline de escaneo probado en el recinto real
- [ ] Alertas configuradas (error rate, latencia, cola saturada, sobreventa)
- [ ] Plan de contingencia en puerta (listado impreso / validación manual)
- [ ] Textos legales, RGPD y política de reembolsos publicados
- [ ] Runbook de incidencias y responsable de guardia asignado

### 8.4 Riesgos identificados y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Sobreventa por concurrencia en on-sale | Crítico | Locks + transacciones + tests de concurrencia + índices únicos |
| Caída de red en el recinto | Alto | Modo offline obligatorio con manifiesto local |
| Fraude por duplicación de QR | Alto | Firma HMAC + un solo uso en BD + reventa oficial |
| Pico de tráfico en salida a la venta | Alto | CDN, cache agresiva del catálogo, sala de espera virtual (Fase posterior) |
| Escalada de privilegios entre subusuarios | Alto | *Privilege escalation guard* + tests de matriz RBAC |
| Fuga de datos entre organizaciones | Crítico | Tenant guard en repositorio + test de aislamiento por endpoint |
| Discrepancias en liquidaciones | Medio | Importes en enteros, conciliación automática con la pasarela, auditoría |

---

*Fin del documento — entraditas.com · Especificación Técnica v1.0*
