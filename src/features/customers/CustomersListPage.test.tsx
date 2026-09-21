import { render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { CustomersListPage } from "./CustomersListPage";
import { canConnectCustomerToWeb, connectApiCustomerSession, getWebBase } from "@/shared/lib/entraditasApi";

vi.mock("@/shared/lib/entraditasApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/entraditasApi")>();
  return {
    ...actual,
    canConnectCustomerToWeb: vi.fn(() => false),
    connectApiCustomerSession: vi.fn(async () => null),
    getWebBase: vi.fn(() => "https://entraditas.com")
  };
});

const canConnectMock = vi.mocked(canConnectCustomerToWeb);
const connectMock = vi.mocked(connectApiCustomerSession);
const webBaseMock = vi.mocked(getWebBase);

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <CustomersListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CustomersListPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
    canConnectMock.mockReturnValue(false);
    connectMock.mockClear();
    webBaseMock.mockReturnValue("https://entraditas.com");
  });

  it("shows all 8 qualifying customers to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(9)); // header + 8 data rows
  });

  it("links each row to its customer detail under /clientes", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    const link = await screen.findByRole("link", { name: "Marta Ruiz" });
    expect(link).toHaveAttribute("href", `/clientes/${encodeURIComponent("marta.ruiz@example.com")}`);
  });

  // Es la fila de Marta Ruiz: el boton tiene que estar dentro de su misma fila.
  async function botonConectarDeMarta(): Promise<HTMLElement> {
    const enlace = await screen.findByRole("link", { name: "Marta Ruiz" });
    const fila = enlace.closest("tr");
    if (!fila) throw new Error("No se encontro la fila de Marta Ruiz");
    return within(fila).getByRole("button", { name: "Conectar" });
  }

  it("does not offer Conectar while the panel has no session in the API", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();
    await screen.findByRole("link", { name: "Marta Ruiz" });
    expect(screen.queryByRole("button", { name: "Conectar" })).not.toBeInTheDocument();
  });

  it("offers Conectar per customer when the panel is connected, and opens the customer session on the web", async () => {
    canConnectMock.mockReturnValue(true);
    connectMock.mockResolvedValue({
      token: "sesion-comprador-abc123",
      account: { name: "Marta Ruiz", email: "marta.ruiz@example.com", phone: "", role: "user" }
    });
    const open = vi.fn();
    vi.stubGlobal("open", open);
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();

    const boton = await botonConectarDeMarta();
    expect(boton).toBeEnabled();
    boton.click();

    await waitFor(() => expect(connectMock).toHaveBeenCalledWith("marta.ruiz@example.com"));
    await waitFor(() => expect(open).toHaveBeenCalledWith(
      "https://entraditas.com/conectar?token=sesion-comprador-abc123",
      "_blank",
      "noopener,noreferrer"
    ));
    vi.unstubAllGlobals();
  });

  it("reports when the customer session could not be opened", async () => {
    canConnectMock.mockReturnValue(true);
    connectMock.mockResolvedValue(null);
    await useSessionStore.getState().login("superadmin@entraditas.com", "superadmin1234");
    renderPage();

    const boton = await botonConectarDeMarta();
    boton.click();

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("No se pudo abrir la sesión de este cliente en entraditas.com.")
    );
  });
});