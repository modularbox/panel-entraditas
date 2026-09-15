import { create } from "zustand";
import type { EventRules } from "@entraditas/types";

interface WizardState {
  // null until the "Informacion" step creates/loads the event; the later steps need a real id
  eventId: string | null;
  setEventId: (id: string | null) => void;
  // Respuestas del cuestionario previo al asistente: se mandan con el evento al crearlo.
  // null = el organizador no respondio y se usa el valor por defecto de cada regla.
  draftRules: EventRules | null;
  setDraftRules: (rules: EventRules | null) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  eventId: null,
  setEventId: (id) => set({ eventId: id }),
  draftRules: null,
  setDraftRules: (rules) => set({ draftRules: rules }),
  reset: () => set({ eventId: null, draftRules: null })
}));