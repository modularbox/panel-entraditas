import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Menu } from "./Menu";
import type { SessionUser } from "@/shared/auth/sessionStore";

function envolver(user: SessionUser) {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Menu
        items={[{ label: "Dashboard", path: "/dashboard", permission: "reports:read" }]}
        user={user}
        onLogout={() => {}}
      />
    </MemoryRouter>
  );
}

describe("Menu", () => {
  it("muestra la organizacion y debajo el usuario", () => {
    envolver({
      id: "org-1",
      email: "ana@sonora.example",
      fullName: "Ana Pérez",
      role: "organizador",
      organizationId: "org-1",
      organizationName: "Sonora Producciones"
    });

    expect(screen.getByText("Sonora Producciones")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
  });

  it("sin organizacion muestra solo el usuario", () => {
    envolver({ id: "s-1", email: "admin@entraditas.example", fullName: "Admin", role: "superadmin", organizationId: null });

    expect(screen.getByText("Admin")).toBeInTheDocument();
    expect(screen.queryByText("Sonora Producciones")).not.toBeInTheDocument();
  });
});