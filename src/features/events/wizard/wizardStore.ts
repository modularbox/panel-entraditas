import { create } from "zustand";

interface WizardState {
  eventId: string | null;
  setEventId: (id: string) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  eventId: null,
  setEventId: (id) => set({ eventId: id }),
  reset: () => set({ eventId: null })
}));
