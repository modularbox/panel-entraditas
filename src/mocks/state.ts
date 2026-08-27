import { createSeedDatabase, type Database } from "./db";

// mutable (not const) so resetDb can swap in a fresh seed between tests.
export let db: Database = createSeedDatabase();
// in-memory session store: token -> userId, lost on reload/reset (no persistence, mocks only).
export const sessions = new Map<string, string>();

// demo passwords are role-specific on purpose (mock stand-in for real per-user credentials).
export const DEMO_PASSWORD_BY_EMAIL: Record<string, string> = {
  "superadmin@entraditas.com": "vQ7!mZ2#Lr9@Tx5$",
  "admin@entraditas.com": "N8@kP4!wY6#sD2&",
  "usuario@entraditas.com": "xR5$Jq9%Fv3!Mn7*",
  "subusuario@entraditas.com": "T6#bW8@cL2!pZ9&"
};

export function demoPasswordFor(email: string): string {
  const password = DEMO_PASSWORD_BY_EMAIL[email];
  if (!password) {
    throw new Error(`No demo password registered for ${email}`);
  }
  return password;
}

export function resetDb(): void {
  db = createSeedDatabase();
  sessions.clear();
}

// used when disabling/removing a user, to force their existing sessions to log out immediately.
export function revokeAllSessionsForUser(userId: string): void {
  for (const [token, sessionUserId] of sessions) {
    if (sessionUserId === userId) sessions.delete(token);
  }
}
