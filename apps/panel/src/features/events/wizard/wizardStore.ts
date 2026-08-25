import { create } from "zustand";

interface WizardState {
  eventId: string | null;
  currentStep: number;
  setEventId: (id: string) => void;
  goToStep: (step: number) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  eventId: null,
  currentStep: 1,
  setEventId: (id) => set({ eventId: id }),
  goToStep: (step) => set({ currentStep: Math.min(5, Math.max(1, step)) }),
  next: () => set((s) => ({ currentStep: Math.min(5, s.currentStep + 1) })),
  back: () => set((s) => ({ currentStep: Math.max(1, s.currentStep - 1) })),
  reset: () => set({ eventId: null, currentStep: 1 })
}));
