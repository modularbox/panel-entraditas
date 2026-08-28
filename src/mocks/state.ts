import { createSeedDatabase, type Database } from "./db";

// Local persistence: the whole mock database is written to localStorage as a JSON snapshot after
// every mutation. On reload it is restored on top of the seed instead of starting from scratch.
export const STORAGE_KEY = "entraditas.mock.db.v1";

function wrapValue(value: unknown, onChange: () => void): unknown {
  if (Array.isArray(value)) return reactive(value, onChange);
  if (value !== null && typeof value === "object") return reactive(value as object, onChange);
  return value;
}

// Deep reactive wrapper: any mutation (property assignment, array push/splice, deletions — even on
// nested objects) calls onChange, which persists the whole snapshot to localStorage.
function reactive<T extends object>(value: T, onChange: () => void): T {
  if (Array.isArray(value)) {
    const target = (value as unknown[]).map((item) => wrapValue(item, onChange)) as unknown[];
    return new Proxy(target, {
      set(t, key, newValue, receiver) {
        Reflect.set(t, key, wrapValue(newValue, onChange), receiver);
        onChange();
        return true;
      },
      deleteProperty(t, key) {
        Reflect.deleteProperty(t, key);
        onChange();
        return true;
      }
    }) as T;
  }

  for (const key of Reflect.ownKeys(value)) {
    (value as Record<PropertyKey, unknown>)[key] = wrapValue((value as Record<PropertyKey, unknown>)[key], onChange);
  }
  return new Proxy(value, {
    set(t, key, newValue, receiver) {
      Reflect.set(t, key, wrapValue(newValue, onChange), receiver);
      onChange();
      return true;
    },
    deleteProperty(t, key) {
      Reflect.deleteProperty(t, key);
      onChange();
      return true;
    }
  }) as T;
}

function isDatabase(value: unknown): value is Database {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Database>;
  return (
    Array.isArray(candidate.organizations) &&
    Array.isArray(candidate.users) &&
    Array.isArray(candidate.venues) &&
    Array.isArray(candidate.zones) &&
    Array.isArray(candidate.events) &&
    Array.isArray(candidate.subEvents) &&
    Array.isArray(candidate.capacityPools) &&
    Array.isArray(candidate.ticketTypes) &&
    Array.isArray(candidate.ticketTypePrices) &&
    Array.isArray(candidate.discountCodes) &&
    Array.isArray(candidate.invitations) &&
    Array.isArray(candidate.orders) &&
    Array.isArray(candidate.orderItems) &&
    Array.isArray(candidate.refunds)
  );
}

function parseStoredDatabase(): Database | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isDatabase(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSnapshot(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // storage may be unavailable (private browsing, quota…) — keep running on the in-memory DB.
  }
}

function loadDatabase(): Database {
  return reactive(purgeCancelledOrders(parseStoredDatabase() ?? createSeedDatabase()), writeSnapshot);
}

// Cancelled orders are deleted outright (see POST /orders/:id/cancel): a stale localStorage snapshot
// from an older version could still contain one, so we drop it (with its items and refunds) on load.
function purgeCancelledOrders(database: Database): Database {
  const cancelledIds = new Set(database.orders.filter((order) => order.status === "cancelled").map((order) => order.id));
  if (cancelledIds.size === 0) return database;
  database.orders = database.orders.filter((order) => !cancelledIds.has(order.id));
  database.orderItems = database.orderItems.filter((item) => !cancelledIds.has(item.orderId));
  database.refunds = database.refunds.filter((refund) => !cancelledIds.has(refund.orderId));
  return database;
}

// mutable (not const) so resetDb/restoreFromStorage can swap in a fresh instance.
export let db: Database = loadDatabase();
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

// When the seed has already been saved (or a previous session left a snapshot), restore it.
export function restoreFromStorage(): void {
  const stored = parseStoredDatabase();
  if (stored) db = reactive(purgeCancelledOrders(stored), writeSnapshot);
}

export function resetDb(): void {
  db = reactive(createSeedDatabase(), writeSnapshot);
  sessions.clear();
  localStorage.removeItem(STORAGE_KEY);
}

// used when disabling/removing a user, to force their existing sessions to log out immediately.
export function revokeAllSessionsForUser(userId: string): void {
  for (const [token, sessionUserId] of sessions) {
    if (sessionUserId === userId) sessions.delete(token);
  }
}