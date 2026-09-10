import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { OrganizationsListPage, formatCommissionRate } from "./OrganizationsListPage";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/organizaciones"]}>
        <Routes>
          <Route path="/organizaciones" element={<OrganizationsListPage />} />
          <Route path="/eventos" element={<div>Página de eventos</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("OrganizationsListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    return useSessionStore.getState().token!;
  }

  it("lists every organization with its admin account and commission", async () => {
    await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3)); // header + 2 seeded organizations
    expect(screen.getByText("Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("producciones-norte")).toBeInTheDocument();
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.getByText("Admin de Producciones Norte")).toBeInTheDocument();
    expect(screen.getByText("admin@entraditas.com")).toBeInTheDocument();
    expect(screen.getByText("Sur Live")).toBeInTheDocument();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("Admin de Sur Live")).toBeInTheDocument();
  });

  it("shows Conectar enabled only for organizations with an organizador account", async () => {
    await login();
    // org-2 loses its organizador -> its button should degrade to "Sin organizador" and be disabled.
    db.users.find((u) => u.organizationId === "org-2")!.status = "disabled";
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    const norteRow = screen.getByText("Producciones Norte").closest("tr")!;
    const surRow = screen.getByText("Sur Live").closest("tr")!;
    expect(within(norteRow).getByRole("button", { name: "Conectar" })).toBeEnabled();
    expect(within(surRow).getByRole("button", { name: "Sin organizador" })).toBeDisabled();
  });

  it("shows a dash for an organization without an organizador", async () => {
    await login();
    db.users.forEach((user) => {
      if (user.organizationId === "org-2") user.status = "disabled";
    });
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    const surRow = screen.getByText("Sur Live").closest("tr")!;
    expect(within(surRow).getAllByText("Sin organizador")).toHaveLength(2);
  });

  it("Conectar switches the session to the organization's admin and lands on Eventos", async () => {
    const superadminToken = await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));
    const surRow = screen.getByText("Sur Live").closest("tr")!;
    fireEvent.click(within(surRow).getByRole("button", { name: "Conectar" }));

    await waitFor(() => expect(useSessionStore.getState().user?.email).toBe("admin.surlive@entraditas.com"));
    expect(useSessionStore.getState().impersonatorToken).toBe(superadminToken);
    await waitFor(() => expect(screen.getByText("Página de eventos")).toBeInTheDocument());
  });

  it("sorts by name ascending on the first header click and descending on the second", async () => {
    await login();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(3));

    fireEvent.click(screen.getByText("Nombre"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Producciones Norte");
    expect(rows[1]).toHaveTextContent("Sur Live");

    fireEvent.click(screen.getByText("Nombre"));
    const rowsDesc = screen.getAllByRole("row").slice(1);
    expect(rowsDesc[0]).toHaveTextContent("Sur Live");
    expect(rowsDesc[1]).toHaveTextContent("Producciones Norte");
  });
});

describe("formatCommissionRate", () => {
  it("formats a fraction as a whole percentage", () => {
    expect(formatCommissionRate(0.08)).toBe("8%");
    expect(formatCommissionRate(0.1)).toBe("10%");
    expect(formatCommissionRate(0)).toBe("0%");
    expect(formatCommissionRate(1)).toBe("100%");
  });
});