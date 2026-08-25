import type { HttpHandler } from "msw";
import { authHandlers } from "./auth";
import { capacityPoolsHandlers } from "./capacityPools";
import { dashboardHandlers } from "./dashboard";
import { eventsHandlers } from "./events";
import { invitationsHandlers } from "./invitations";
import { subEventsHandlers } from "./subEvents";
import { ticketTypesHandlers } from "./ticketTypes";
import { venuesHandlers } from "./venues";
import { usersHandlers } from "./users";

export const handlers: HttpHandler[] = [...authHandlers, ...eventsHandlers, ...venuesHandlers, ...subEventsHandlers, ...capacityPoolsHandlers, ...ticketTypesHandlers, ...usersHandlers, ...invitationsHandlers, ...dashboardHandlers];
