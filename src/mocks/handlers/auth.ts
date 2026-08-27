import { http, HttpResponse } from "msw";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { db, sessions } from "../state";
import { getSessionUserId } from "../authContext";

// every seed user shares this password; there's no per-user hash in the mock db.
const DEMO_PASSWORD = {"superadmin":"vQ7!mZ2#Lr9@Tx5$", "admin": "N8@kP4!wY6#sD2&", "user": "xR5$Jq9%Fv3!Mn7*", "subuser": "T6#bW8@cL2!pZ9&"};

function serializeSession(userId: string) {
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
    if (!user || user.status === "disabled" || body.password !== DEMO_PASSWORD[user.role]) {
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
