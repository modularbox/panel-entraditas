import { beforeEach, describe, expect, it } from "vitest";
import { useWizardStore } from "./wizardStore";

describe("useWizardStore", () => {
  beforeEach(() => useWizardStore.setState({ eventId: null }));

  it("setEventId stores the id", () => {
    useWizardStore.getState().setEventId("event-1");
    expect(useWizardStore.getState().eventId).toBe("event-1");
  });

  it("reset clears eventId", () => {
    useWizardStore.setState({ eventId: "event-1" });
    useWizardStore.getState().reset();
    expect(useWizardStore.getState().eventId).toBeNull();
  });
});
