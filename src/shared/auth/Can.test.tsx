import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Can } from "./Can";
import { useSessionStore } from "./sessionStore";

describe("Can", () => {
  afterEach(() => {
    cleanup();
    useSessionStore.setState({ effectivePermissions: new Set(), eventScopes: [] });
  });

  it("renders children when the permission is present", () => {
    useSessionStore.setState({ effectivePermissions: new Set(["events:delete"]), eventScopes: [] });
    render(<Can do="events:delete">Eliminar</Can>);
    expect(screen.getByText("Eliminar")).toBeInTheDocument();
  });

  it("renders the fallback when the permission is missing", () => {
    useSessionStore.setState({ effectivePermissions: new Set(), eventScopes: [] });
    render(
      <Can do="events:delete" fallback={<span>Oculto</span>}>
        Eliminar
      </Can>
    );
    expect(screen.getByText("Oculto")).toBeInTheDocument();
    expect(screen.queryByText("Eliminar")).not.toBeInTheDocument();
  });

  it("respects eventScopes when 'on' is provided", () => {
    useSessionStore.setState({ effectivePermissions: new Set(["events:read"]), eventScopes: ["event-1"] });
    render(
      <Can do="events:read" on={{ eventId: "event-2" }} fallback={<span>Oculto</span>}>
        Ver
      </Can>
    );
    expect(screen.getByText("Oculto")).toBeInTheDocument();
  });
});
