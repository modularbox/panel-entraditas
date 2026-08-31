# Captcha real en el login — Informe

**Fecha:** 2026-08-31
**Tipo:** Informe de referencia (no es un spec para implementar ahora; documenta qué haría falta si algún día se sustituye la casilla "No soy un robot" por un captcha real).

## Contexto

El login actual (`src/features/auth/LoginPage.tsx`) tiene una casilla "No soy un robot" (`loginSchema.ts`) que es puramente una validación de cliente — no verifica nada, porque este panel es un mock completo: `src/mocks/handlers/auth.ts` simula el backend con MSW y no hay ningún servidor real al que llamar. Un captcha de verdad necesita, por definición, un servidor que verifique el resultado con el proveedor — así que no puede completarse solo en este repo tal como está montado hoy.

## 1. Elegir proveedor

| Opción | Cómo funciona | Fricción para el usuario |
|---|---|---|
| **reCAPTCHA v3 (Recomendado)** | Puntúa cada carga de página (0.0–1.0) según comportamiento, sin interacción visible. | Ninguna, salvo que la puntuación sea baja y se pida una verificación adicional. |
| reCAPTCHA v2 ("No soy un robot") | Casilla + a veces un reto visual (imágenes). | Baja-media; es el checkbox clásico de Google. |
| hCaptcha | Igual que reCAPTCHA v2, alternativa centrada en privacidad. | Baja-media. |

Para un panel de administración (login de personal, no de público general), **reCAPTCHA v3** es la mejor opción: no interrumpe al usuario salvo comportamiento sospechoso, y de todas formas el login ya está protegido por contraseña.

## 2. Qué hace falta antes de tocar código

- Una cuenta de Google reCAPTCHA (console.cloud.google.com o google.com/recaptcha/admin) asociada al dominio de producción (`panel.entraditas.com`, y `localhost` para desarrollo).
- Dos claves:
  - **Site key** (pública, va en el frontend).
  - **Secret key** (privada, **nunca** en el frontend — solo en el backend real).
- Un backend real que pueda recibir esa secret key como variable de entorno y hacer una llamada HTTP server-to-server. Esto es justo lo que este panel mock no tiene: `src/mocks/handlers/auth.ts` corre en el navegador (MSW), así que jamás debería llevar la secret key.

## 3. Cambios en el frontend

1. Cargar el script de Google: `<script src="https://www.google.com/recaptcha/api.js?render=SITE_KEY">` (o usar una librería como `react-google-recaptcha-v3`).
2. En `LoginPage.tsx`, sustituir la casilla "No soy un robot" por una llamada a `grecaptcha.execute(SITE_KEY, { action: "login" })` justo antes de enviar el formulario, que devuelve un token.
3. Añadir ese token al cuerpo de la petición `POST /auth/login` (`loginSchema.ts` pasaría a llevar `captchaToken: string` en vez de `notRobot: boolean`).
4. La site key se expondría como variable de entorno de build (`VITE_RECAPTCHA_SITE_KEY` en este proyecto, ya que usa Vite) — nunca hardcodeada.

## 4. Cambios en el backend (real, no en este mock)

El endpoint real de `POST /auth/login` tendría que, **antes** de comprobar la contraseña:

1. Recibir `captchaToken` en el cuerpo.
2. Hacer una petición `POST` server-to-server a `https://www.google.com/recaptcha/api/siteverify` con `secret` (la secret key) y `response` (el token recibido).
3. Comprobar la respuesta: `success: true` y, en reCAPTCHA v3, `score` por encima de un umbral (típicamente `0.5`) y `action === "login"`.
4. Si falla la verificación, responder `401`/`403` sin ni siquiera mirar el email/contraseña (evita gastar ciclos en credenciales si el tráfico es sospechoso).
5. Guardar la secret key como variable de entorno del servidor (`RECAPTCHA_SECRET_KEY`), nunca en el repositorio ni en el bundle del cliente.

## 5. Consideraciones adicionales

- **Rate limiting**: un captcha no sustituye limitar intentos de login por IP/usuario; conviene combinarlo con eso (ya mencionado como práctica general en `docs/README.md` §9, "Rate limits").
- **Modo degradado**: si el servicio de Google está caído, decidir si el login se bloquea o se permite sin captcha (normalmente se permite, con alerta interna).
- **Testing**: Google ofrece claves de prueba (`site key`/`secret key`) que siempre devuelven éxito, útiles para entornos de CI/staging sin depender de tráfico real.
- **Coste/privacidad**: reCAPTCHA es gratuito, pero envía datos de comportamiento a Google; hCaptcha es la alternativa si eso es un problema (p. ej. por RGPD/cumplimiento normativo interno).

## 6. Por qué no se implementa ahora en este repo

Sin un backend real que sostenga la secret key y haga la llamada de verificación, cualquier integración "real" en este panel mock sería solo teatro (un `console.log` fingiendo verificar) — peor que ser honestos con una casilla de validación de cliente, que es lo que hay ahora. El día que exista un backend real (`docs/README.md` describe la arquitectura completa con `apps/api`), este informe es el punto de partida para esa tarea.
