import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { RequirePermission } from "./RequirePermission";
import { useSessionStore } from "./sessionStore";

function renderWithGuard(permission: string) {
  return render(
    <MemoryRouter initialEntries={["/eventos"]}>
      <Routes>
        <Route element={<RequirePermission permission={permission} />}>
          <Route path="/eventos" element={<div>Contenido protegido</div>} />
        </Route>
        <Route path="/sin-acceso" element={<div>Sin acceso</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("RequirePermission", () => {
  afterEach(() => {
    cleanup();
    useSessionStore.setState({ effectivePermissions: new Set(), eventScopes: [] });
  });

  it("renders the protected route when the permission is present", () => {
    useSessionStore.setState({ effectivePermissions: new Set(["events:read"]), eventScopes: [] });
    renderWithGuard("events:read");
    expect(screen.getByText("Contenido protegido")).toBeInTheDocument();
  });

  it("redirects to /sin-acceso when the permission is missing", () => {
    useSessionStore.setState({ effectivePermissions: new Set(), eventScopes: [] });
    renderWithGuard("events:read");
    expect(screen.getByText("Sin acceso")).toBeInTheDocument();
  });
});
