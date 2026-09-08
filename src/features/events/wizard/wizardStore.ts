import { create } from "zustand";

interface WizardState {
  // null until the "Informacion" step creates/loads the event; the later steps need a real id
  eventId: string | null;
  setEventId: (id: string) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  eventId: null,
  setEventId: (id) => set({ eventId: id }),
  reset: () => set({ eventId: null })
}));