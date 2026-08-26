import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { customersHandlers } from "./customers";
import { dashboardHandlers } from "./dashboard";
import { discountCodesHandlers } from "./discountCodes";
import { eventsHandlers } from "./events";
import { invitationsHandlers } from "./invitations";
import { ordersHandlers } from "./orders";
import { refundsHandlers } from "./refunds";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { venuesHandlers } from "./venues";
import { usersHandlers } from "./users";

export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...discountCodesHandlers, ...usersHandlers, ...invitationsHandlers, ...dashboardHandlers, ...ordersHandlers, ...refundsHandlers, ...customersHandlers];
