import { create } from "zustand";

export type EventCategoryChoice = "concierto" | "teatro" | "cine" | "festival" | "deporte" | "conferencia" | "familiar";

export interface EventSetup {
  /** null until the form is completed. */
  completed: boolean;
  category: EventCategoryChoice;
  hasSubEvents: boolean;
  needsSeatingPlan: boolean;
  maxTicketsPerOrder: number;
  maxTicketsPerCustomer: number;
  allowSingleSeatGaps: boolean;
  hasDiscountCodes: boolean;
  setField: <K extends keyof Omit<EventSetup, "completed" | "setField" | "complete" | "reset">>(
    key: K,
    value: EventSetup[K]
  ) => void;
  complete: () => void;
  reset: () => void;
}

const DEFAULTS: Omit<EventSetup, "setField" | "complete" | "reset"> = {
  completed: false,
  category: "concierto",
  hasSubEvents: false,
  needsSeatingPlan: false,
  maxTicketsPerOrder: 10,
  maxTicketsPerCustomer: 6,
  allowSingleSeatGaps: true,
  hasDiscountCodes: false
};

export const useSetupStore = create<EventSetup>((set) => ({
  ...DEFAULTS,
  setField: (key, value) => set({ [key]: value } as Pick<EventSetup, typeof key>),
  complete: () => set({ completed: true }),
  reset: () => set({ ...DEFAULTS })
}));
