import { createSeedDatabase, type Database } from "./db";

export let db: Database = createSeedDatabase();
export const sessions = new Map<string, string>();

export function resetDb(): void {
  db = createSeedDatabase();
  sessions.clear();
}
