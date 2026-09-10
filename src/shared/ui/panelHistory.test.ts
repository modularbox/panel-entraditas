import { describe, expect, it, beforeEach } from "vitest";
import { getPreviousPanelVisit, recordPanelVisit, resetPanelHistory } from "./panelHistory";

describe("panelHistory", () => {
  beforeEach(() => resetPanelHistory());

  it("returns null until at least two visits are recorded", () => {
    recordPanelVisit("/eventos");
    expect(getPreviousPanelVisit()).toBeNull();
    recordPanelVisit("/eventos/event-1");
    expect(getPreviousPanelVisit()).toBe("/eventos");
  });

  it("returns the previous in-app view for a list -> detail navigation", () => {
    recordPanelVisit("/organizaciones");
    recordPanelVisit("/organizaciones/org-1");
    expect(getPreviousPanelVisit()).toBe("/organizaciones");
  });

  it("does not grow the stack when revisiting the same route twice in a row", () => {
    recordPanelVisit("/equipo");
    recordPanelVisit("/equipo");
    recordPanelVisit("/equipo/invitar");
    expect(getPreviousPanelVisit()).toBe("/equipo");
  });

  it("truncates the stack when going back to an earlier view", () => {
    recordPanelVisit("/eventos");
    recordPanelVisit("/eventos/event-1");
    recordPanelVisit("/eventos/event-2");
    // Going back to /eventos/event-1 collapses the stack at that point.
    recordPanelVisit("/eventos/event-1");
    expect(getPreviousPanelVisit()).toBe("/eventos");
  });

  it("resetPanelHistory clears the recorded visits", () => {
    recordPanelVisit("/eventos");
    recordPanelVisit("/eventos/event-1");
    resetPanelHistory();
    expect(getPreviousPanelVisit()).toBeNull();
  });
});