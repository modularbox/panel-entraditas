import { http, HttpResponse } from "msw";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { db, sessions } from "../state";

const BASE = "http://localhost:4000/api/v1";
function failure(code: string, message: string, status: number) {
  return HttpResponse.json({ error: { code, message, requestId: "req_invitation" } }, { status });
}
function session(userId: string) {
  const user = db.users.find((candidate) => candidate.id === userId)!;
  return { user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role, organizationId: user.organizationId }, effectivePermissions: [...resolveEffectivePermissions(user.role, user.permissionOverrides)], eventScopes: user.eventScopes };
}
export const invitationsHandlers = [
  http.get(`${BASE}/invitations/:token`, ({ params }) => {
    const invitation = db.invitations.find((candidate) => candidate.token === params.token);
    if (!invitation) return failure("INVITATION_NOT_FOUND", "La invitación no existe o ha caducado", 404);
    if (invitation.status === "accepted") return failure("INVITATION_ALREADY_ACCEPTED", "Esta invitación ya fue aceptada", 409);
    const user = db.users.find((candidate) => candidate.id === invitation.userId)!;
    const organization = db.organizations.find((candidate) => candidate.id === invitation.organizationId);
    return HttpResponse.json({ data: { email: invitation.email, fullName: user.fullName, organizationName: organization?.name ?? "", role: user.role }, meta: { requestId: "req_invitation" } });
  }),
  http.post(`${BASE}/invitations/:token/accept`, async ({ request, params }) => {
    const invitation = db.invitations.find((candidate) => candidate.token === params.token);
    if (!invitation) return failure("INVITATION_NOT_FOUND", "La invitación no existe o ha caducado", 404);
    if (invitation.status === "accepted") return failure("INVITATION_ALREADY_ACCEPTED", "Esta invitación ya fue aceptada", 409);
    await request.json();
    const user = db.users.find((candidate) => candidate.id === invitation.userId)!;
    user.status = "active";
    invitation.status = "accepted";
    const accessToken = `token_${user.id}_${sessions.size}`;
    sessions.set(accessToken, user.id);
    return HttpResponse.json({ data: { accessToken, ...session(user.id) }, meta: { requestId: "req_invitation" } });
  })
];
