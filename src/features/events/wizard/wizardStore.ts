import { create } from "zustand";

/**
 * How big the plan is drawn. A working preference, not part of the event: the zones' coordinates
 * are percentages and stay valid at any canvas size.
 *
 * It lives here, and in localStorage, because it used to be component state inside the seating
 * step: going to the next step unmounted it and the canvas snapped back to its default every
 * single time you came back.
 */
const CANVAS_KEY = "entraditas.panel.plano.lienzo";
const DEFAULT_CANVAS = { height: 384, width: 100 };

function readCanvas(): { height: number; width: number } {
  try {
    const raw = localStorage.getItem(CANVAS_KEY);
    if (!raw) return DEFAULT_CANVAS;
    const parsed = JSON.parse(raw) as Partial<{ height: number; width: number }>;
    return {
      height: Number.isFinite(parsed.height) ? Math.min(900, Math.max(280, parsed.height!)) : DEFAULT_CANVAS.height,
      width: Number.isFinite(parsed.width) ? Math.min(100, Math.max(40, parsed.width!)) : DEFAULT_CANVAS.width
    };
  } catch {
    // A browser with storage blocked must still be able to draw a plan.
    return DEFAULT_CANVAS;
  }
}

interface WizardState {
  // null until the "Informacion" step creates/loads the event; the later steps need a real id
  eventId: string | null;
  setEventId: (id: string) => void;
  canvasHeight: number;
  canvasWidth: number;
  setCanvasSize: (size: { height?: number; width?: number }) => void;
  reset: () => void;
}

export const useWizardStore = create<WizardState>((set, get) => ({
  eventId: null,
  setEventId: (id) => set({ eventId: id }),
  canvasHeight: readCanvas().height,
  canvasWidth: readCanvas().width,
  setCanvasSize: ({ height, width }) => {
    const next = { height: height ?? get().canvasHeight, width: width ?? get().canvasWidth };
    set({ canvasHeight: next.height, canvasWidth: next.width });
    try {
      localStorage.setItem(CANVAS_KEY, JSON.stringify(next));
    } catch {
      // Not being able to remember the size is not a reason to refuse to change it.
    }
  },
  // Starting a new event does not reset the canvas size: it is how this person likes to work.
  reset: () => set({ eventId: null })
}));
