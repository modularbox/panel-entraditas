import { create } from "zustand";

interface WizardState {
  // null until step 1 creates/loads the event; steps 2-5 need a real id to call the API
  eventId: string | null;
  setEventId: (id: string) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  eventId: null,
  setEventId: (id) => set({ eventId: id }),
  reset: () => set({ eventId: null })
}));
