import { createSeedDatabase, type Database } from "./db";

// mutable (not const) so resetDb can swap in a fresh seed between tests.
export let db: Database = createSeedDatabase();
// in-memory session store: token -> userId, lost on reload/reset (no persistence, mocks only).
export const sessions = new Map<string, string>();

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
