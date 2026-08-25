import { beforeEach, describe, expect, it } from "vitest";
import { useWizardStore } from "./wizardStore";

describe("useWizardStore", () => {
  beforeEach(() => useWizardStore.setState({ eventId: null, currentStep: 1 }));

  it("clamps next() at step 5 and back() at step 1", () => {
    const { next, back } = useWizardStore.getState();
    for (let i = 0; i < 10; i++) next();
    expect(useWizardStore.getState().currentStep).toBe(5);
    for (let i = 0; i < 10; i++) back();
    expect(useWizardStore.getState().currentStep).toBe(1);
  });

  it("goToStep jumps directly to a step", () => {
    useWizardStore.getState().goToStep(4);
    expect(useWizardStore.getState().currentStep).toBe(4);
  });

  it("reset clears eventId and returns to step 1", () => {
    useWizardStore.setState({ eventId: "event-1", currentStep: 3 });
    useWizardStore.getState().reset();
    expect(useWizardStore.getState()).toMatchObject({ eventId: null, currentStep: 1 });
  });
});
