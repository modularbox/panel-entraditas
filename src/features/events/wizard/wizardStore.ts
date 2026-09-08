import { create } from "zustand";
import type { EventRules } from "@entraditas/types";

interface WizardState {
  // null until the "Informacion" step creates/loads the event; the later steps need a real id
  eventId: string | null;
  /**
   * Respuestas del cuestionario dadas ANTES de que exista el evento.
   *
   * El cuestionario es el primer paso a proposito: varias respuestas cambian lo que tiene
   * sentido montar despues (si no se puede elegir butaca, sobra el selector de asientos). Como
   * en ese momento todavia no hay evento contra el que guardar, se quedan aqui y viajan dentro
   * de la peticion que lo crea (ver Step1BasicInfo). null = no se ha respondido nada aun.
   */
  draftRules: EventRules | null;
  setEventId: (id: string) => void;
  setDraftRules: (rules: EventRules) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set) => ({
  eventId: null,
  draftRules: null,
  setEventId: (id) => set({ eventId: id }),
  setDraftRules: (rules) => set({ draftRules: rules }),
  // Empezar un evento nuevo tiene que olvidar tambien las respuestas del anterior: si no, el
  // segundo evento nacería con el cuestionario del primero sin que nadie lo haya respondido.
  reset: () => set({ eventId: null, draftRules: null })
}));
