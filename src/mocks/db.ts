import type {
  CapacityPool, DiscountCode, Event, Invitation, Order, OrderItem, Organization, Refund, SubEvent, TicketType, TicketTypePrice, User, Venue, Zone
} from "@entraditas/types";
import seedData from "./data/db.seed.json";

export interface Database {
  organizations: Organization[];
  users: User[];
  venues: Venue[];
  zones: Zone[];
  events: Event[];
  subEvents: SubEvent[];
  capacityPools: CapacityPool[];
  ticketTypes: TicketType[];
  ticketTypePrices: TicketTypePrice[];
  discountCodes: DiscountCode[];
  invitations: Invitation[];
  orders: Order[];
  orderItems: OrderItem[];
  refunds: Refund[];
}

export const DEMO_SUPERADMIN_ID = "user-superadmin";
export const DEMO_ADMIN_ID = "user-admin";
export const DEMO_USER_ID = "user-limited";
export const DEMO_SUBUSER_ID = "user-subuser";

// The seed lives in a plain JSON file (src/mocks/data/db.seed.json) so it can be read by hand and
// acted as the local source of truth. Every call returns a deep clone: callers (handlers and tests)
// mutate the returned object freely without ever touching the imported module cache.
export function createSeedDatabase(): Database {
  return JSON.parse(JSON.stringify(seedData)) as Database;
}