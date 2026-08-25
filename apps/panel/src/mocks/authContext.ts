import { sessions } from "./state";

export function getSessionUserId(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length);
  return sessions.get(token) ?? null;
}
