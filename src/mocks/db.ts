import type {
  CapacityPool, CustomerProfile, DiscountCode, Event, Gate, GuestList, GuestListEntry, Invitation, Order, OrderItem, Organization, Refund, SubEvent, TicketType, TicketTypePrice, User, Venue, VenuePlanTemplate, Zone
} from "@entraditas/types";
import seedData from "./data/db.seed.json";

export interface Database {
  organizations: Organization[];
  users: User[];
  customers: CustomerProfile[];
  venues: Venue[];
  zones: Zone[];
  venuePlanTemplates: VenuePlanTemplate[];
  events: Event[];
  subEvents: SubEvent[];
  capacityPools: CapacityPool[];
  ticketTypes: TicketType[];
  ticketTypePrices: TicketTypePrice[];
  discountCodes: DiscountCode[];
  gates: Gate[];
  invitations: Invitation[];
  guestLists: GuestList[];
  guestListEntries: GuestListEntry[];
  orders: Order[];
  orderItems: OrderItem[];
  refunds: Refund[];
}

// Los ids de las filas de ejemplo son los del fichero de semilla y no cambian; lo que cambia aqui
// es como se llaman, para que no quede el nombre de un rol que ya no existe. Los dos
// suborganizadores son personas distintas: una con alcance por evento y otra de puerta.
export const DEMO_SUPERADMIN_ID = "user-superadmin";
export const DEMO_ORGANIZADOR_ID = "user-admin";
export const DEMO_SUBORGANIZADOR_ID = "user-limited";
export const DEMO_SUBORGANIZADOR_PUERTA_ID = "user-subuser";

// The seed lives in a plain JSON file (src/mocks/data/db.seed.json) so it can be read by hand and
// acted as the local source of truth. Every call returns a deep clone: callers (handlers and tests)
// mutate the returned object freely without ever touching the imported module cache.
export function createSeedDatabase(): Database {
  const seeded = JSON.parse(JSON.stringify(seedData)) as Database;
  // Collections added after the seed file was written default to empty instead of undefined,
  // so handlers can push into them without every one guarding for a missing array.
  seeded.venuePlanTemplates ??= [];
  return seeded;
}