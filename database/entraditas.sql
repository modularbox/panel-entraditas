-- ============================================================
-- Entraditas - Base de Datos Fusionada para MySQL/MariaDB (XAMPP)
-- Fusion: panel-entraditas + modelo probado de eventos/zonas/entradas
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Eliminar tablas existentes (orden inverso de dependencias)
DROP TABLE IF EXISTS `reembolsos`;
DROP TABLE IF EXISTS `pedido_articulos`;
DROP TABLE IF EXISTS `pedidos`;
DROP TABLE IF EXISTS `lista_invitado_entradas`;
DROP TABLE IF EXISTS `lista_invitados`;
DROP TABLE IF EXISTS `puerta_operadores`;
DROP TABLE IF EXISTS `puertas`;
DROP TABLE IF EXISTS `codigos_descuento_tipos`;
DROP TABLE IF EXISTS `codigos_descuento`;
DROP TABLE IF EXISTS `tipo_entrada_precios`;
DROP TABLE IF EXISTS `asientos_asignados`;
DROP TABLE IF EXISTS `tipos_entrada`;
DROP TABLE IF EXISTS `aforos`;
DROP TABLE IF EXISTS `sesiones`;
DROP TABLE IF EXISTS `zonas`;
DROP TABLE IF EXISTS `recintos`;
DROP TABLE IF EXISTS `usuario_alcance_eventos`;
DROP TABLE IF EXISTS `ajuste_permisos`;
DROP TABLE IF EXISTS `invitaciones`;
DROP TABLE IF EXISTS `usuarios`;
DROP TABLE IF EXISTS `clientes`;
DROP TABLE IF EXISTS `eventos`;
DROP TABLE IF EXISTS `organizaciones`;

CREATE TABLE IF NOT EXISTS `organizaciones` (
    `id_organizacion` VARCHAR(64)  NOT NULL,
    `nombre`          VARCHAR(255) NOT NULL,
    `slug`            VARCHAR(120) NOT NULL,
    `tasa_comision`   DECIMAL(5,4) NOT NULL DEFAULT 0.0000,
    `creado_en`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_organizacion`),
    UNIQUE KEY `uk_org_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `clientes` (
    `id_cliente`       VARCHAR(64)  NOT NULL,
    `id_organizacion`  VARCHAR(64)  NULL,
    `nombre_completo`  VARCHAR(255) NOT NULL,
    `correo`           VARCHAR(255) NOT NULL,
    `telefono`         VARCHAR(50)  NULL,
    `creado_en`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_cliente`),
    UNIQUE KEY `uk_cli_org_correo` (`id_organizacion`,`correo`),
    KEY `idx_cli_org` (`id_organizacion`),
    KEY `idx_cli_correo` (`correo`),
    CONSTRAINT `fk_cli_org` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuarios` (
    `id_usuario`       VARCHAR(64)  NOT NULL,
    `id_organizacion`  VARCHAR(64)  NULL,
    `usuario_padre_id` VARCHAR(64)  NULL,
    `rol`              ENUM('superadmin','organizador','suborganizador') NOT NULL,
    `correo`           VARCHAR(255) NOT NULL,
    `nombre_completo`  VARCHAR(255) NOT NULL,
    `estado`           ENUM('activo','invitado','deshabilitado') NOT NULL DEFAULT 'invitado',
    `cuenta_bancaria`  VARCHAR(255) NULL,
    `contrasena_hash`  VARCHAR(255) NULL,
    `creado_en`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_usuario`),
    UNIQUE KEY `uk_usuarios_correo` (`correo`),
    KEY `idx_usu_org` (`id_organizacion`),
    KEY `idx_usu_padre` (`usuario_padre_id`),
    CONSTRAINT `fk_usu_org` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_usu_padre` FOREIGN KEY (`usuario_padre_id`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `usuario_alcance_eventos` (
    `id_usuario` VARCHAR(64) NOT NULL,
    `id_evento`  VARCHAR(64) NOT NULL,
    PRIMARY KEY (`id_usuario`,`id_evento`),
    KEY `idx_uae_evt` (`id_evento`),
    CONSTRAINT `fk_uae_usu` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ajuste_permisos` (
    `id_ajuste`  VARCHAR(64)  NOT NULL,
    `id_usuario` VARCHAR(64)  NOT NULL,
    `permiso`    VARCHAR(100) NOT NULL,
    `efecto`     ENUM('permitir','denegar') NOT NULL,
    PRIMARY KEY (`id_ajuste`),
    KEY `idx_ap_usu` (`id_usuario`),
    CONSTRAINT `fk_ap_usu` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invitaciones` (
    `id_invitacion`           VARCHAR(64)  NOT NULL,
    `token`                   VARCHAR(255) NOT NULL,
    `id_usuario`              VARCHAR(64)  NOT NULL,
    `correo`                  VARCHAR(255) NOT NULL,
    `id_organizacion`         VARCHAR(64)  NOT NULL,
    `invitado_por_usuario_id` VARCHAR(64)  NOT NULL,
    `estado`                  ENUM('pendiente','aceptada') NOT NULL DEFAULT 'pendiente',
    `creado_en`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_invitacion`),
    UNIQUE KEY `uk_inv_token` (`token`),
    KEY `idx_inv_org` (`id_organizacion`),
    CONSTRAINT `fk_inv_usu` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_inv_org` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_inv_por` FOREIGN KEY (`invitado_por_usuario_id`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `recintos` (
    `id_recinto`      VARCHAR(64)  NOT NULL,
    `id_organizacion` VARCHAR(64)  NOT NULL,
    `nombre`          VARCHAR(255) NOT NULL,
    `ciudad`          VARCHAR(120) NOT NULL,
    `provincia`       VARCHAR(120) NULL,
    `direccion`       VARCHAR(255) NULL,
    `lat`             DECIMAL(10,7) NULL,
    `lng`             DECIMAL(10,7) NULL,
    `aforo_total`     INT NOT NULL DEFAULT 0,
    `creado_en`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_recinto`),
    KEY `idx_rec_org` (`id_organizacion`),
    CONSTRAINT `fk_rec_org` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `zonas` (
    `id_zona`            VARCHAR(64)  NOT NULL,
    `id_recinto`         VARCHAR(64)  NOT NULL,
    `nombre`             VARCHAR(255) NOT NULL,
    `tipo`               ENUM('numerada','de_pie','escenario','accesible','puerta') NOT NULL,
    `capacidad`          INT NOT NULL DEFAULT 0,
    `filas`              INT NULL,
    `asientos_por_fila`  JSON NULL,
    `pos_x`              DECIMAL(5,2) NULL,
    `pos_y`              DECIMAL(5,2) NULL,
    `ancho`              DECIMAL(5,2) NULL,
    `alto`               DECIMAL(5,2) NULL,
    `creado_en`          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_zona`),
    KEY `idx_zon_rec` (`id_recinto`),
    CONSTRAINT `fk_zon_rec` FOREIGN KEY (`id_recinto`) REFERENCES `recintos` (`id_recinto`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `eventos` (
    `id_evento`                    VARCHAR(64)  NOT NULL,
    `id_organizacion`              VARCHAR(64)  NOT NULL,
    `id_recinto`                   VARCHAR(64)  NULL,
    `slug`                         VARCHAR(120) NOT NULL,
    `titulo`                       VARCHAR(255) NOT NULL,
    `categoria`                    ENUM('concierto','teatro','cine','festival','deporte','conferencia','familiar') NOT NULL,
    `descripcion`                  TEXT NOT NULL,
    `descripcion_larga`            TEXT NULL,
    `imagen_portada`               VARCHAR(500) NULL,
    `galeria`                      JSON NULL,
    `etiquetas`                    JSON NULL,
    `destacado`                    TINYINT(1) NOT NULL DEFAULT 0,
    `modo_aforo`                   ENUM('plan','zonas') NULL,
    `fecha_inicio`                 DATETIME NULL,
    `fecha_fin`                    DATETIME NULL,
    `duracion_minutos`             INT NULL,
    `venta_inicio`                 DATETIME NULL,
    `venta_fin`                    DATETIME NULL,
    `tipo_gasto_gestion`           ENUM('none','percent','fixed') NOT NULL DEFAULT 'none',
    `valor_gasto_gestion`          DECIMAL(10,2) NOT NULL DEFAULT 0,
    `estado`                       ENUM('borrador','pendiente_revision','en_revision','publicado','rechazado','a_la_venta','agotado','pausado','finalizado','cancelado') NOT NULL DEFAULT 'borrador',
    `visibilidad`                  ENUM('publico','no_listado','privado') NOT NULL DEFAULT 'publico',
    `creado_en`                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `publicado_en`                 DATETIME NULL,
    `ubicacion`                    VARCHAR(255) NULL,
    `localidad`                    VARCHAR(255) NULL,
    `tiene_sub_eventos`            TINYINT(1) NOT NULL DEFAULT 0,
    `es_competitivo`               TINYINT(1) NOT NULL DEFAULT 0,
    `enfrentamiento`               JSON NULL,
    `fecha_pendiente`              TINYINT(1) NOT NULL DEFAULT 0,
    `notificar_fecha_confirmada`   TINYINT(1) NOT NULL DEFAULT 0,
    `reglas`                       JSON NULL,
    `max_entradas_por_pedido`      INT NULL,
    `max_entradas_por_cliente`     INT NULL,
    `permitir_huecos_asiento`      TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (`id_evento`),
    UNIQUE KEY `uk_evt_slug` (`slug`),
    KEY `idx_evt_org` (`id_organizacion`),
    KEY `idx_evt_rec` (`id_recinto`),
    KEY `idx_evt_estado` (`estado`),
    KEY `idx_evt_cat` (`categoria`),
    KEY `idx_evt_inicio` (`fecha_inicio`),
    CONSTRAINT `fk_evt_org` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_evt_rec` FOREIGN KEY (`id_recinto`) REFERENCES `recintos` (`id_recinto`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `usuario_alcance_eventos` ADD CONSTRAINT `fk_uae_evt` FOREIGN KEY (`id_evento`) REFERENCES `eventos` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `sesiones` (
    `id_sesion`       VARCHAR(64)  NOT NULL,
    `id_evento`       VARCHAR(64)  NOT NULL,
    `nombre`          VARCHAR(255) NOT NULL,
    `fecha_inicio`    DATETIME NULL,
    `fecha_fin`       DATETIME NULL,
    `apertura_puertas` DATETIME NULL,
    `estado`          ENUM('programada','a_la_venta','agotada','cancelada','finalizada') NOT NULL DEFAULT 'programada',
    `orden`           INT NOT NULL DEFAULT 0,
    `creado_en`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_sesion`),
    KEY `idx_ses_evt` (`id_evento`),
    CONSTRAINT `fk_ses_evt` FOREIGN KEY (`id_evento`) REFERENCES `eventos` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `aforos` (
    `id_aforo`              VARCHAR(64)  NOT NULL,
    `id_sesion`             VARCHAR(64)  NOT NULL,
    `id_zona`               VARCHAR(64)  NULL,
    `nombre`                VARCHAR(255) NOT NULL,
    `capacidad_total`       INT NOT NULL DEFAULT 0,
    `vendidas`              INT NOT NULL DEFAULT 0,
    `reservadas`            INT NOT NULL DEFAULT 0,
    `id_tipo_entrada_zona`  VARCHAR(64)  NULL,
    `creado_en`             DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_aforo`),
    KEY `idx_afo_ses` (`id_sesion`),
    KEY `idx_afo_zon` (`id_zona`),
    CONSTRAINT `fk_afo_ses` FOREIGN KEY (`id_sesion`) REFERENCES `sesiones` (`id_sesion`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_afo_zon` FOREIGN KEY (`id_zona`) REFERENCES `zonas` (`id_zona`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tipos_entrada` (
    `id_tipo_entrada` VARCHAR(64)  NOT NULL,
    `group_id`        VARCHAR(64)  NOT NULL,
    `id_evento`       VARCHAR(64)  NOT NULL,
    `id_sesion`       VARCHAR(64)  NULL,
    `nombre`          VARCHAR(255) NOT NULL,
    `tipo`            ENUM('pago','gratis','cortesia','promocional','abono') NOT NULL DEFAULT 'pago',
    `precio_centimos` INT NOT NULL DEFAULT 0,
    `moneda`          CHAR(3) NOT NULL DEFAULT 'EUR',
    `cantidad_total`  INT NULL,
    `cantidad_vendida` INT NOT NULL DEFAULT 0,
    `minimo_por_pedido`  INT NOT NULL DEFAULT 1,
    `maximo_por_pedido`  INT NOT NULL DEFAULT 6,
    `visibilidad`     ENUM('publico','oculto','con_codigo') NOT NULL DEFAULT 'publico',
    `es_transferible` TINYINT(1) NOT NULL DEFAULT 1,
    `es_reembolsable` TINYINT(1) NOT NULL DEFAULT 1,
    `color`           VARCHAR(16) NULL,
    `orden`           INT NOT NULL DEFAULT 0,
    `creado_en`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_tipo_entrada`),
    KEY `idx_te_evt` (`id_evento`),
    KEY `idx_te_ses` (`id_sesion`),
    KEY `idx_te_grupo` (`group_id`),
    KEY `idx_te_tipo` (`tipo`),
    CONSTRAINT `fk_te_evt` FOREIGN KEY (`id_evento`) REFERENCES `eventos` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_te_ses` FOREIGN KEY (`id_sesion`) REFERENCES `sesiones` (`id_sesion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `aforos` ADD CONSTRAINT `fk_afo_te` FOREIGN KEY (`id_tipo_entrada_zona`) REFERENCES `tipos_entrada` (`id_tipo_entrada`) ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS `asientos_asignados` (
    `id_aforo`          VARCHAR(64) NOT NULL,
    `id_asiento`        VARCHAR(16) NOT NULL,
    `id_tipo_entrada`   VARCHAR(64) NOT NULL,
    `movilidad_reducida` TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (`id_aforo`,`id_asiento`),
    KEY `idx_aa_te` (`id_tipo_entrada`),
    CONSTRAINT `fk_aa_afo` FOREIGN KEY (`id_aforo`) REFERENCES `aforos` (`id_aforo`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_aa_te` FOREIGN KEY (`id_tipo_entrada`) REFERENCES `tipos_entrada` (`id_tipo_entrada`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tipo_entrada_precios` (
    `id_tramo`         VARCHAR(64)  NOT NULL,
    `id_tipo_entrada`  VARCHAR(64)  NOT NULL,
    `nombre`           VARCHAR(255) NOT NULL,
    `precio`           INT NOT NULL DEFAULT 0,
    `fecha_inicio`     DATETIME NOT NULL,
    `fecha_fin`        DATETIME NOT NULL,
    `activo`           TINYINT(1) NOT NULL DEFAULT 1,
    `creado_en`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_tramo`),
    KEY `idx_tep_te` (`id_tipo_entrada`),
    KEY `idx_tep_fechas` (`activo`,`fecha_inicio`,`fecha_fin`),
    CONSTRAINT `fk_tep_te` FOREIGN KEY (`id_tipo_entrada`) REFERENCES `tipos_entrada` (`id_tipo_entrada`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `codigos_descuento` (
    `codigo`                     VARCHAR(64) NOT NULL,
    `id_evento`                  VARCHAR(64) NOT NULL,
    `tipo`                       ENUM('percent','fixed') NOT NULL,
    `valor`                      INT NOT NULL DEFAULT 0,
    `usos_maximos`               INT NULL,
    `usos_totales`               INT NOT NULL DEFAULT 0,
    `usos_maximos_por_cliente`   INT NULL,
    `valido_desde`               DATETIME NULL,
    `valido_hasta`               DATETIME NULL,
    `estado`                     ENUM('activo','inactivo') NOT NULL DEFAULT 'activo',
    `creado_en`                  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`codigo`),
    KEY `idx_cd_evt` (`id_evento`),
    CONSTRAINT `fk_cd_evt` FOREIGN KEY (`id_evento`) REFERENCES `eventos` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `codigos_descuento_tipos` (
    `codigo`          VARCHAR(64) NOT NULL,
    `id_tipo_entrada` VARCHAR(64) NOT NULL,
    PRIMARY KEY (`codigo`,`id_tipo_entrada`),
    KEY `idx_cdt_te` (`id_tipo_entrada`),
    CONSTRAINT `fk_cdt_cd` FOREIGN KEY (`codigo`) REFERENCES `codigos_descuento` (`codigo`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_cdt_te` FOREIGN KEY (`id_tipo_entrada`) REFERENCES `tipos_entrada` (`id_tipo_entrada`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `puertas` (
    `id_puerta`              VARCHAR(64)  NOT NULL,
    `id_evento`              VARCHAR(64)  NOT NULL,
    `id_sesion`              VARCHAR(64)  NULL,
    `nombre`                 VARCHAR(255) NOT NULL,
    `codigo`                 VARCHAR(50)  NOT NULL,
    `id_zona`                VARCHAR(64)  NULL,
    `direccion`              ENUM('entrada','salida','ambas') NOT NULL DEFAULT 'ambas',
    `permitir_reentrada`     TINYINT(1) NOT NULL DEFAULT 0,
    `max_escaneos_por_entrada` INT NOT NULL DEFAULT 1,
    `abren_en`               DATETIME NULL,
    `cierran_en`             DATETIME NULL,
    `activo`                 TINYINT(1) NOT NULL DEFAULT 1,
    `creado_en`              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_puerta`),
    KEY `idx_pue_evt` (`id_evento`),
    KEY `idx_pue_ses` (`id_sesion`),
    KEY `idx_pue_zon` (`id_zona`),
    CONSTRAINT `fk_pue_evt` FOREIGN KEY (`id_evento`) REFERENCES `eventos` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_pue_ses` FOREIGN KEY (`id_sesion`) REFERENCES `sesiones` (`id_sesion`) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT `fk_pue_zon` FOREIGN KEY (`id_zona`) REFERENCES `zonas` (`id_zona`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `puerta_operadores` (
    `id_puerta`  VARCHAR(64) NOT NULL,
    `id_usuario` VARCHAR(64) NOT NULL,
    PRIMARY KEY (`id_puerta`,`id_usuario`),
    KEY `idx_pop_usu` (`id_usuario`),
    CONSTRAINT `fk_pop_pue` FOREIGN KEY (`id_puerta`) REFERENCES `puertas` (`id_puerta`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_pop_usu` FOREIGN KEY (`id_usuario`) REFERENCES `usuarios` (`id_usuario`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lista_invitados` (
    `id_lista`    VARCHAR(64)  NOT NULL,
    `id_evento`   VARCHAR(64)  NOT NULL,
    `id_sesion`   VARCHAR(64)  NULL,
    `nombre`      VARCHAR(255) NOT NULL,
    `cuota`       INT NULL,
    `creado_en`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_lista`),
    KEY `idx_li_evt` (`id_evento`),
    KEY `idx_li_ses` (`id_sesion`),
    CONSTRAINT `fk_li_evt` FOREIGN KEY (`id_evento`) REFERENCES `eventos` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_li_ses` FOREIGN KEY (`id_sesion`) REFERENCES `sesiones` (`id_sesion`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lista_invitado_entradas` (
    `id_entrada`       VARCHAR(64)  NOT NULL,
    `id_lista`         VARCHAR(64)  NOT NULL,
    `nombre_completo`  VARCHAR(255) NOT NULL,
    `correo`           VARCHAR(255) NULL,
    `telefono`         VARCHAR(50)  NULL,
    `acompanantes`     INT NOT NULL DEFAULT 0,
    `estado`           ENUM('pendiente','registrado') NOT NULL DEFAULT 'pendiente',
    `notas`            TEXT NULL,
    `creado_en`        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_entrada`),
    KEY `idx_lie_lista` (`id_lista`),
    CONSTRAINT `fk_lie_lista` FOREIGN KEY (`id_lista`) REFERENCES `lista_invitados` (`id_lista`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pedidos` (
    `id_pedido`           VARCHAR(64)  NOT NULL,
    `numero_pedido`       VARCHAR(50)  NOT NULL,
    `id_evento`           VARCHAR(64)  NOT NULL,
    `id_organizacion`     VARCHAR(64)  NOT NULL,
    `id_cliente`          VARCHAR(64)  NULL,
    `nombre_cliente`      VARCHAR(255) NOT NULL,
    `correo_cliente`      VARCHAR(255) NOT NULL,
    `estado`              ENUM('pendiente','reservado','pagado','cancelado','expirado','reembolsado','parcialmente_reembolsado') NOT NULL DEFAULT 'pendiente',
    `total`               INT NOT NULL DEFAULT 0,
    `monto_reembolsado`   INT NOT NULL DEFAULT 0,
    `moneda`              CHAR(3) NOT NULL DEFAULT 'EUR',
    `canal`               ENUM('web','panel','taquilla','cortesia') NOT NULL DEFAULT 'web',
    `creado_en`           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_pedido`),
    UNIQUE KEY `uk_ped_num` (`numero_pedido`),
    KEY `idx_ped_evt` (`id_evento`),
    KEY `idx_ped_org` (`id_organizacion`),
    KEY `idx_ped_estado` (`estado`),
    KEY `idx_ped_canal` (`canal`),
    KEY `idx_ped_correo` (`correo_cliente`),
    KEY `idx_ped_cli` (`id_cliente`),
    CONSTRAINT `fk_ped_evt` FOREIGN KEY (`id_evento`) REFERENCES `eventos` (`id_evento`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_ped_org` FOREIGN KEY (`id_organizacion`) REFERENCES `organizaciones` (`id_organizacion`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_ped_cli` FOREIGN KEY (`id_cliente`) REFERENCES `clientes` (`id_cliente`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pedido_articulos` (
    `id_articulo`          VARCHAR(64)  NOT NULL,
    `id_pedido`            VARCHAR(64)  NOT NULL,
    `id_tipo_entrada`      VARCHAR(64)  NOT NULL,
    `tipo_entrada_nombre`  VARCHAR(255) NOT NULL,
    `cantidad`             INT NOT NULL DEFAULT 1,
    `precio_unitario`      INT NOT NULL DEFAULT 0,
    `subtotal`             INT NOT NULL DEFAULT 0,
    PRIMARY KEY (`id_articulo`),
    KEY `idx_pa_ped` (`id_pedido`),
    KEY `idx_pa_te` (`id_tipo_entrada`),
    CONSTRAINT `fk_pa_ped` FOREIGN KEY (`id_pedido`) REFERENCES `pedidos` (`id_pedido`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `fk_pa_te` FOREIGN KEY (`id_tipo_entrada`) REFERENCES `tipos_entrada` (`id_tipo_entrada`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reembolsos` (
    `id_reembolso`    VARCHAR(64)  NOT NULL,
    `id_pedido`       VARCHAR(64)  NOT NULL,
    `numero_pedido`   VARCHAR(50)  NOT NULL,
    `nombre_cliente`  VARCHAR(255) NOT NULL,
    `monto`           INT NOT NULL DEFAULT 0,
    `motivo`          TEXT NOT NULL,
    `estado`          ENUM('solicitado','procesado','rechazado') NOT NULL DEFAULT 'solicitado',
    `creado_en`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `actualizado_en`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`id_reembolso`),
    KEY `idx_rem_ped` (`id_pedido`),
    CONSTRAINT `fk_rem_ped` FOREIGN KEY (`id_pedido`) REFERENCES `pedidos` (`id_pedido`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- DATOS DE EJEMPLO
SET FOREIGN_KEY_CHECKS = 0;
-- ============================================================

INSERT INTO `organizaciones` (`id_organizacion`,`nombre`,`slug`,`tasa_comision`) VALUES
('org-001','Entraditas Demo','entraditas-demo',0.0800),
('org-002','Eventos Madrid','eventos-madrid',0.0650),
('org-003','Festival Sound','festival-sound',0.1000);

INSERT INTO `usuarios` (`id_usuario`,`id_organizacion`,`usuario_padre_id`,`rol`,`correo`,`nombre_completo`,`estado`) VALUES
('usr-000',NULL,NULL,'superadmin','admin@entraditas.com','Administrador General','activo'),
('usr-001','org-001',NULL,'organizador','maria@entraditas-demo.com','Maria Garcia','activo'),
('usr-002','org-001','usr-001','suborganizador','carlos@entraditas-demo.com','Carlos Lopez','activo'),
('usr-003','org-002',NULL,'organizador','pedro@eventos-madrid.com','Pedro Martinez','activo'),
('usr-004','org-003',NULL,'organizador','laura@festival-sound.com','Laura Fernandez','activo'),
('usr-005','org-001','usr-001','suborganizador','ana@entraditas-demo.com','Ana Rodriguez','invitado');

INSERT INTO `ajuste_permisos` (`id_ajuste`,`id_usuario`,`permiso`,`efecto`) VALUES
('ap-001','usr-002','events:create','permitir'),
('ap-002','usr-002','orders:read','permitir'),
('ap-003','usr-002','guestlist:read','permitir');

INSERT INTO `invitaciones` (`id_invitacion`,`token`,`id_usuario`,`correo`,`id_organizacion`,`invitado_por_usuario_id`,`estado`,`creado_en`) VALUES
('inv-001','tok-abc123xyz','usr-005','ana@entraditas-demo.com','org-001','usr-001','pendiente','2026-09-01 10:00:00');

INSERT INTO `recintos` (`id_recinto`,`id_organizacion`,`nombre`,`ciudad`,`provincia`,`direccion`,`lat`,`lng`,`aforo_total`) VALUES
('rec-001','org-001','Sala Riviera','Madrid','Madrid','Paseo de la Infanta Isabel 17',40.4086,-3.6942,2500),
('rec-002','org-001','Teatro Real','Madrid','Madrid','Plaza de Oriente s/n',40.4153,-3.7143,1800),
('rec-003','org-002','WiZink Center','Madrid','Madrid','Pza. Rio de Janeiro 28',40.4297,-3.5838,17400),
('rec-004','org-003','IFEMA Pavilion','Madrid','Madrid','Feria de Madrid',40.4625,-3.5700,12000);

INSERT INTO `zonas` (`id_zona`,`id_recinto`,`nombre`,`tipo`,`capacidad`,`filas`,`asientos_por_fila`,`pos_x`,`pos_y`,`ancho`,`alto`) VALUES
('zon-001','rec-001','Pista General','de_pie',1200,NULL,NULL,10,50,80,40),
('zon-002','rec-001','Platea Numerada','numerada',600,15,'[40,40,40,40,40,40,40,40,40,40,40,40,40,40,40]',10,10,80,35),
('zon-003','rec-001','Palco VIP','numerada',100,5,'[20,20,20,20,20]',10,0,80,8),
('zon-004','rec-001','Acceso PMR','accesible',50,NULL,NULL,90,50,8,15),
('zon-005','rec-001','Escenario','escenario',0,NULL,NULL,10,92,80,8),
('zon-006','rec-003','Pista Central','de_pie',5000,NULL,NULL,10,50,80,40),
('zon-007','rec-003','Grada Baja','numerada',4000,20,'[200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200,200]',5,5,90,40),
('zon-008','rec-003','Grada Alta','numerada',3000,15,'[200,200,200,200,200,200,200,200,200,200,200,200,200,200,200]',5,0,90,40);

INSERT INTO `eventos` (`id_evento`,`id_organizacion`,`id_recinto`,`slug`,`titulo`,`categoria`,`descripcion`,`descripcion_larga`,`galeria`,`etiquetas`,`destacado`,`modo_aforo`,`fecha_inicio`,`fecha_fin`,`duracion_minutos`,`venta_inicio`,`venta_fin`,`tipo_gasto_gestion`,`valor_gasto_gestion`,`estado`,`visibilidad`,`creado_en`,`publicado_en`,`ubicacion`,`localidad`,`tiene_sub_eventos`,`es_competitivo`,`enfrentamiento`,`fecha_pendiente`,`notificar_fecha_confirmada`,`reglas`,`max_entradas_por_pedido`,`max_entradas_por_cliente`,`permitir_huecos_asiento`) VALUES
('evt-001','org-001','rec-001','noche-rock-madrid','Noche de Rock en Madrid','concierto','Una noche epica con los mejores grupos de rock nacional','Disfruta de una noche inolvidable.',NULL,'["rock","musica","madrid"]',1,'zonas','2026-10-15 20:00:00','2026-10-15 23:30:00',180,'2026-09-01 00:00:00','2026-10-15 18:00:00','percent',5.00,'a_la_venta','publico','2026-09-01 00:00:00','2026-09-01 00:00:00','Sala Riviera','Madrid',0,0,NULL,0,0,'{"minPerOrder":1,"maxPerOrder":6,"maxPerCustomer":0,"allowGuestCheckout":true,"allowIsolatedSeats":false,"allowSeatSelection":true,"maxContiguousSeats":0,"requiresAttendeeName":false,"requiresAttendeeDocument":false,"isTransferable":true,"allowReentry":false,"maxScansPerTicket":1,"isRefundable":true,"refundDeadlineDays":7,"minimumAge":0,"showRemainingTickets":true,"lowStockThreshold":20,"wheelchairAccessible":false}',NULL,NULL,1),
('evt-002','org-001','rec-002','opera-carmen','Carmen - Opera','teatro','La celebre opera de Bizet','La Opera Carmen llega al Teatro Real.',NULL,'["opera","teatro","clasico"]',0,'plan','2026-11-20 19:30:00','2026-11-20 22:00:00',150,'2026-09-15 00:00:00','2026-11-20 17:00:00','fixed',2.50,'publicado','publico','2026-09-01 00:00:00','2026-09-01 00:00:00','Teatro Real','Madrid',0,0,NULL,0,0,NULL,NULL,NULL,1),
('evt-003','org-002','rec-003','concierto-estrella','Concierto Estrella 2026','concierto','El mayor concierto del verano','Reunira a los mejores artistas.',NULL,'["concierto","verano","wizink"]',1,'zonas','2026-09-25 21:00:00','2026-09-26 01:00:00',240,'2026-08-01 00:00:00','2026-09-25 19:00:00','percent',8.00,'a_la_venta','publico','2026-08-01 00:00:00','2026-08-01 00:00:00','WiZink Center','Madrid',0,0,NULL,0,0,'{"minPerOrder":2,"maxPerOrder":8,"maxPerCustomer":8,"allowGuestCheckout":true,"allowIsolatedSeats":false,"allowSeatSelection":true,"maxContiguousSeats":0,"requiresAttendeeName":false,"requiresAttendeeDocument":false,"isTransferable":true,"allowReentry":true,"maxScansPerTicket":2,"isRefundable":true,"refundDeadlineDays":3,"minimumAge":16,"showRemainingTickets":true,"lowStockThreshold":50,"wheelchairAccessible":true}',NULL,NULL,1),
('evt-004','org-003','rec-004','sound-festival-2026','Sound Festival 2026','festival','Festival de musica electronica','Tres dias de musica electronica.',NULL,'["festival","electronica"]',0,'zonas',NULL,NULL,NULL,NULL,NULL,'none',0,'borrador','publico','2026-09-01 00:00:00',NULL,'IFEMA Pavilion','Madrid',1,0,NULL,0,0,NULL,NULL,NULL,1);

INSERT INTO `sesiones` (`id_sesion`,`id_evento`,`nombre`,`fecha_inicio`,`fecha_fin`,`apertura_puertas`,`estado`,`orden`) VALUES
('ses-001','evt-004','Dia 1 - Viernes','2026-12-11 18:00:00','2026-12-12 02:00:00','2026-12-11 17:00:00','a_la_venta',1),
('ses-002','evt-004','Dia 2 - Sabado','2026-12-12 18:00:00','2026-12-13 03:00:00','2026-12-12 17:00:00','a_la_venta',2),
('ses-003','evt-004','Dia 3 - Domingo','2026-12-13 16:00:00','2026-12-13 23:00:00','2026-12-13 15:00:00','a_la_venta',3);

INSERT INTO `usuario_alcance_eventos` (`id_usuario`,`id_evento`) VALUES ('usr-002','evt-001');

INSERT INTO `aforos` (`id_aforo`,`id_sesion`,`id_zona`,`nombre`,`capacidad_total`,`vendidas`,`reservadas`,`id_tipo_entrada_zona`) VALUES
('afo-001','ses-001','zon-006','Pista Central Sound Festival',5000,3200,150,'te-010'),
('afo-002','ses-001','zon-007','Grada Baja Sound Festival',4000,2800,100,'te-011'),
('afo-003','ses-001','zon-008','Grada Alta Sound Festival',3000,1500,50,'te-012');

INSERT INTO `tipos_entrada` (`id_tipo_entrada`,`group_id`,`id_evento`,`id_sesion`,`nombre`,`tipo`,`precio_centimos`,`moneda`,`cantidad_total`,`cantidad_vendida`,`minimo_por_pedido`,`maximo_por_pedido`,`visibilidad`,`es_transferible`,`es_reembolsable`,`color`,`orden`) VALUES
('te-001','grp-010','evt-001',NULL,'General','pago',2500,'EUR',800,520,1,6,'publico',1,1,'#3B82F6',1),
('te-002','grp-010','evt-001',NULL,'Early Bird','pago',1800,'EUR',200,200,1,6,'oculto',1,1,'#10B981',0),
('te-003','grp-010','evt-001',NULL,'VIP','pago',5000,'EUR',100,65,1,4,'publico',1,1,'#F59E0B',2),
('te-004','grp-010','evt-001',NULL,'Prensa','cortesia',0,'EUR',30,12,1,1,'oculto',0,0,'#8B5CF6',3),
('te-005','grp-010','evt-001',NULL,'Patrocinador','promocional',0,'EUR',20,8,1,2,'oculto',0,0,'#EC4899',4),
('te-010','grp-001','evt-004','ses-001','Pista General - Viernes','pago',4500,'EUR',5000,3200,1,6,'publico',1,1,'#3B82F6',1),
('te-011','grp-002','evt-004','ses-001','Grada Baja - Viernes','pago',3500,'EUR',4000,2800,1,6,'publico',1,1,'#10B981',2),
('te-012','grp-003','evt-004','ses-001','Grada Alta - Viernes','pago',2500,'EUR',3000,1500,1,8,'publico',1,1,'#F59E0B',3),
('te-013','grp-004','evt-004','ses-001','Abono 3 Dias','abono',10000,'EUR',500,180,1,4,'publico',1,1,'#EC4899',4),
('te-014','grp-005','evt-004','ses-001','Entrada Gratis','gratis',0,'EUR',50,30,1,2,'con_codigo',0,0,'#6B7280',5);

INSERT INTO `tipo_entrada_precios` (`id_tramo`,`id_tipo_entrada`,`nombre`,`precio`,`fecha_inicio`,`fecha_fin`,`activo`) VALUES
('tep-001','te-001','Early Bird',1800,'2026-09-01 00:00:00','2026-09-15 23:59:59',0),
('tep-002','te-001','Regular',2500,'2026-09-16 00:00:00','2026-10-10 23:59:59',1),
('tep-003','te-001','Ultimo Momento',3000,'2026-10-11 00:00:00','2026-10-15 18:00:00',0),
('tep-004','te-010','Early Bird Pista',3500,'2026-08-01 00:00:00','2026-08-31 23:59:59',0),
('tep-005','te-010','Regular Pista',4500,'2026-09-01 00:00:00','2026-12-10 23:59:59',1),
('tep-006','te-010','Ultimo Momento Pista',5500,'2026-12-11 00:00:00','2026-12-11 17:00:00',0);

INSERT INTO `codigos_descuento` (`codigo`,`id_evento`,`tipo`,`valor`,`usos_maximos`,`usos_totales`,`usos_maximos_por_cliente`,`valido_desde`,`valido_hasta`,`estado`) VALUES
('ROCK10','evt-001','percent',10,500,45,2,'2026-09-01 00:00:00','2026-10-14 23:59:59','activo'),
('VIP20','evt-001','fixed',1000,100,12,1,'2026-09-01 00:00:00','2026-10-14 23:59:59','activo'),
('VERANO2026','evt-003','percent',15,2000,180,4,'2026-08-01 00:00:00','2026-09-20 23:59:59','activo'),
('SOUND3DIA','evt-004','fixed',2000,500,0,1,'2026-09-01 00:00:00','2026-12-10 23:59:59','activo');

INSERT INTO `codigos_descuento_tipos` (`codigo`,`id_tipo_entrada`) VALUES ('VIP20','te-003'),('SOUND3DIA','te-013');

INSERT INTO `puertas` (`id_puerta`,`id_evento`,`id_sesion`,`nombre`,`codigo`,`id_zona`,`direccion`,`permitir_reentrada`,`max_escaneos_por_entrada`,`abren_en`,`cierran_en`,`activo`) VALUES
('pue-001','evt-001',NULL,'Puerta Principal','PP-001',NULL,'entrada',0,1,'2026-10-15 19:00:00','2026-10-15 21:00:00',1),
('pue-002','evt-001',NULL,'Puerta VIP','VIP-001','zon-003','entrada',1,2,'2026-10-15 18:30:00','2026-10-15 20:30:00',1),
('pue-003','evt-001',NULL,'Salida General','SG-001',NULL,'salida',0,1,'2026-10-15 22:00:00','2026-10-16 00:00:00',1),
('pue-004','evt-003',NULL,'Entrada WiZink','WZ-ENT',NULL,'ambas',1,2,'2026-09-25 19:00:00','2026-09-25 22:00:00',1),
('pue-005','evt-004','ses-001','Entrada Festival Dia 1','SF-D1',NULL,'entrada',1,3,'2026-12-11 17:00:00','2026-12-11 20:00:00',1),
('pue-006','evt-004','ses-002','Entrada Festival Dia 2','SF-D2',NULL,'entrada',1,3,'2026-12-12 17:00:00','2026-12-12 20:00:00',1);

INSERT INTO `puerta_operadores` (`id_puerta`,`id_usuario`) VALUES
('pue-001','usr-002'),('pue-002','usr-001'),('pue-003','usr-002'),('pue-004','usr-003'),('pue-005','usr-004');

INSERT INTO `lista_invitados` (`id_lista`,`id_evento`,`id_sesion`,`nombre`,`cuota`) VALUES
('li-001','evt-001',NULL,'Prensa',20),
('li-002','evt-001',NULL,'Patrocinadores',15),
('li-003','evt-003',NULL,'Invitados VIP',50),
('li-004','evt-004','ses-001','Artistas y Crew',100);

INSERT INTO `lista_invitado_entradas` (`id_entrada`,`id_lista`,`nombre_completo`,`correo`,`telefono`,`acompanantes`,`estado`,`notas`) VALUES
('lie-001','li-001','Juan Perez','juan@elpais.com','600123456',1,'registrado','Periodista de cultura'),
('lie-002','li-001','Maria TV','maria@tve.es','600234567',0,'registrado',NULL),
('lie-003','li-001','Carlos Radio','carlos@cope.es',NULL,2,'pendiente',NULL),
('lie-004','li-002','Sponsor Corp','events@sponsor.com','912345678',5,'registrado','4 entradas + 1 camarero'),
('lie-005','li-002','Brand Team','vip@brand.com',NULL,3,'pendiente',NULL),
('lie-006','li-003','Invitado WiZink','invitado@wizink.com','600987654',2,'pendiente','Invitacion corporativa');

INSERT INTO `clientes` (`id_cliente`,`id_organizacion`,`nombre_completo`,`correo`,`telefono`,`creado_en`) VALUES
('cli-001','org-001','Pedro Comprador','pedro@email.com','600111222','2026-09-05 14:30:00'),
('cli-002','org-001','Ana Compradora','ana@email.com','600333444','2026-09-06 10:15:00'),
('cli-003','org-001','Taquilla On-Site','taquilla@entraditas.com',NULL,'2026-09-07 18:45:00'),
('cli-004','org-002','Laura Vip','laura@email.com','600555666','2026-08-15 09:00:00'),
('cli-005','org-002','Roberto Norte','roberto@email.com','600777888','2026-09-01 22:30:00'),
('cli-006','org-001','Invitado Cortesia','cortesia@entraditas.com',NULL,'2026-09-08 11:00:00'),
('cli-007','org-002','Marta Festival','marta@email.com',NULL,'2026-08-20 16:20:00'),
('cli-008','org-003','DJ Fan','dj@email.com',NULL,'2026-09-10 12:00:00');

INSERT INTO `pedidos` (`id_pedido`,`numero_pedido`,`id_evento`,`id_organizacion`,`id_cliente`,`nombre_cliente`,`correo_cliente`,`estado`,`total`,`monto_reembolsado`,`moneda`,`canal`,`creado_en`) VALUES
('ped-001','PED-2026-0001','evt-001','org-001','cli-001','Pedro Comprador','pedro@email.com','pagado',5000,0,'EUR','web','2026-09-05 14:30:00'),
('ped-002','PED-2026-0002','evt-001','org-001','cli-002','Ana Compradora','ana@email.com','pagado',2500,0,'EUR','web','2026-09-06 10:15:00'),
('ped-003','PED-2026-0003','evt-001','org-001','cli-003','Taquilla On-Site','taquilla@entraditas.com','pagado',7500,2500,'EUR','taquilla','2026-09-07 18:45:00'),
('ped-004','PED-2026-0004','evt-003','org-002','cli-004','Laura Vip','laura@email.com','pagado',18000,0,'EUR','web','2026-08-15 09:00:00'),
('ped-005','PED-2026-0005','evt-003','org-002','cli-005','Roberto Norte','roberto@email.com','reservado',10500,0,'EUR','web','2026-09-01 22:30:00'),
('ped-006','PED-2026-0006','evt-001','org-001','cli-006','Invitado Cortesia','cortesia@entraditas.com','pagado',0,0,'EUR','cortesia','2026-09-08 11:00:00'),
('ped-007','PED-2026-0007','evt-003','org-002','cli-007','Marta Festival','marta@email.com','cancelado',9000,0,'EUR','web','2026-08-20 16:20:00'),
('ped-008','PED-2026-0008','evt-004','org-003','cli-008','DJ Fan','dj@email.com','pagado',20000,5000,'EUR','web','2026-09-10 12:00:00');

INSERT INTO `pedido_articulos` (`id_articulo`,`id_pedido`,`id_tipo_entrada`,`tipo_entrada_nombre`,`cantidad`,`precio_unitario`,`subtotal`) VALUES
('pa-001','ped-001','te-001','General',2,2500,5000),
('pa-002','ped-002','te-001','General',1,2500,2500),
('pa-003','ped-003','te-001','General',2,2500,5000),
('pa-004','ped-003','te-003','VIP',1,5000,5000),
('pa-005','ped-003','te-004','Prensa',2,0,0),
('pa-006','ped-004','te-010','Pista General - Viernes',4,4500,18000),
('pa-007','ped-005','te-011','Grada Baja - Viernes',3,3500,10500),
('pa-008','ped-006','te-004','Prensa',2,0,0),
('pa-009','ped-007','te-010','Pista General - Viernes',2,4500,9000),
('pa-010','ped-008','te-013','Abono 3 Dias',2,10000,20000);

INSERT INTO `reembolsos` (`id_reembolso`,`id_pedido`,`numero_pedido`,`nombre_cliente`,`monto`,`motivo`,`estado`,`creado_en`) VALUES
('rem-001','ped-003','PED-2026-0003','Taquilla On-Site',2500,'Cliente se equivoco de zona','procesado','2026-09-08 09:00:00'),
('rem-002','ped-008','PED-2026-0008','DJ Fan',5000,'No puede asistir al dia 2','solicitado','2026-09-11 14:30:00');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- FIN DEL SCRIPT
-- ============================================================