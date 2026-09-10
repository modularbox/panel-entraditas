import { http, HttpResponse } from "msw";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { db, sessions, demoPasswordFor } from "../state";
import { getSessionUserId } from "../authContext";

export function serializeSession(userId: string) {
  const user = db.users.find((u) => u.id === userId);
  if (!user) return null;
  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      organizationId: user.organizationId
    },
    effectivePermissions: [...resolveEffectivePermissions(user.role, user.permissionOverrides)],
    eventScopes: user.eventScopes
  };
}

export const authHandlers = [
  http.post("http://localhost:4000/api/v1/auth/login", async ({ request }) => {
    const body = (await request.json()) as { email: string; password: string };
    const user = db.users.find((u) => u.email === body.email);
    if (!user || user.status === "disabled" || body.password !== demoPasswordFor(user.email)) {
      return HttpResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Credenciales inválidas", requestId: "req_login" } },
        { status: 401 }
      );
    }
    // not a real token format, just something unique per login to key the sessions map.
    const token = `token_${user.id}_${sessions.size}`;
    sessions.set(token, user.id);
    return HttpResponse.json({
      data: { accessToken: token, ...serializeSession(user.id) },
      meta: { requestId: "req_login" }
    });
  }),

  /**
   * Abre la sesion local de alguien a quien api.entraditas.com ya ha dado por bueno.
   *
   * No pide contrasena, y eso no baja ninguna barrera: la autenticacion de verdad la acaba de
   * hacer la API, que es quien decide lo que sale publicado. Estos mocks son datos del propio
   * navegador y sus contrasenas de demostracion estan escritas en el repositorio, asi que
   * volverlas a pedir aqui solo servia para obligar a escribir dos contrasenas distintas.
   */
  http.post("http://localhost:4000/api/v1/auth/session-from-api", async ({ request }) => {
    const body = (await request.json()) as { email: string };
    const user = db.users.find((u) => u.email === body.email);
    if (!user || user.status === "disabled") {
      return HttpResponse.json(
        {
          error: {
            code: "NOT_FOUND",
            message: "Esa cuenta existe en entraditas.com pero no en este panel.",
            requestId: "req_session_api"
          }
        },
        { status: 404 }
      );
    }
    const token = `token_${user.id}_${sessions.size}`;
    sessions.set(token, user.id);
    return HttpResponse.json({
      data: { accessToken: token, ...serializeSession(user.id) },
      meta: { requestId: "req_session_api" }
    });
  }),

  http.post("http://localhost:4000/api/v1/auth/logout", ({ request }) => {
    const header = request.headers.get("Authorization");
    const token = header?.slice("Bearer ".length);
    if (token) sessions.delete(token);
    return HttpResponse.json({ data: {}, meta: { requestId: "req_logout" } });
  }),

  http.get("http://localhost:4000/api/v1/auth/me", ({ request }) => {
    const userId = getSessionUserId(request);
    if (!userId) {
      return HttpResponse.json(
        { error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_me" } },
        { status: 401 }
      );
    }
    return HttpResponse.json({ data: serializeSession(userId), meta: { requestId: "req_me" } });
  })
];
