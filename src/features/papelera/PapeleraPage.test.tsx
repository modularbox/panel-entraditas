import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AvisoGlobal, useAvisoGlobal } from "@/shared/ui/AvisoGlobal";
import { PapeleraPage } from "./PapeleraPage";
import type { ElementoEnPapelera } from "./papelera";

const EVENTO: ElementoEnPapelera = {
  type: "event",
  id: "demo-romeo",
  title: "Romeo y Julieta",
  detail: "Escena Viva · 16/10/2026 21:00 · 12 ventas",
  deletedAt: "2026-10-02T08:00:00.000Z",
  deletedBy: "Super Admin",
  purge: "Se borran también sus 12 ventas (30 entradas), con lo que movieron en el monedero de los compradores."
};

const CLIENTE: ElementoEnPapelera = {
  type: "customer",
  id: "u-1",
  title: "Ana Pérez",
  detail: "ana@ejemplo.es",
  deletedAt: "2026-10-01T08:00:00.000Z",
  deletedBy: null,
  purge: "Se borra su cuenta y su monedero."
};

function pintar(rol: "superadmin" | "organizador" = "superadmin") {
  useSessionStore.setState({
    token: "token-de-prueba",
    user: { id: "usr-1", email: "quien@entraditas.com", fullName: "Quien Mira", role: rol, organizationId: rol === "superadmin" ? null : "org-1" },
    effectivePermissions: new Set<string>(["trash:manage"]),
    eventScopes: []
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AvisoGlobal />
        <PapeleraPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PapeleraPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAvisoGlobal.setState({ aviso: null });
  });

  it("enseña lo eliminado con quién y qué es", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([EVENTO, CLIENTE]);
    pintar();

    expect(await screen.findByText("Romeo y Julieta")).toBeInTheDocument();
    expect(screen.getByText(EVENTO.detail)).toBeInTheDocument();
    expect(screen.getByText(/Super Admin/)).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Todo (2)" })).toBeInTheDocument();
  });

  // Borrar para siempre no se puede deshacer: antes de hacerlo tiene que decir qué se lleva.
  it("antes de borrar para siempre dice lo que se lleva, y solo borra al confirmar", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([EVENTO]);
    const borrar = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });
    pintar();

    fireEvent.click(await screen.findByRole("button", { name: "Borrar para siempre" }));
    expect(screen.getByText(/Se borran también sus 12 ventas/)).toBeInTheDocument();
    expect(borrar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sí, borrar para siempre" }));
    await waitFor(() => expect(borrar).toHaveBeenCalledWith("/trash/event/demo-romeo", { token: "token-de-prueba" }));
    expect(await screen.findByText(/borrado para siempre/)).toBeInTheDocument();
  });

  it("restaura y lo dice", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([EVENTO]);
    const restaurar = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true, note: null });
    pintar();

    fireEvent.click(await screen.findByRole("button", { name: "Restaurar" }));
    await waitFor(() => expect(restaurar).toHaveBeenCalledWith("/trash/event/demo-romeo/restore", undefined, { token: "token-de-prueba" }));
    expect(await screen.findByText(/restaurado/)).toBeInTheDocument();
  });

  // Un organizador solo tiene en la papelera sus eventos y sus ventas: los filtros de clientes y
  // organizaciones no le dicen nada.
  it("al organizador no le ofrece clientes ni organizaciones", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([EVENTO]);
    pintar("organizador");

    await screen.findByText("Romeo y Julieta");
    expect(screen.queryByRole("button", { name: /Clientes/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Organizaciones/ })).not.toBeInTheDocument();
  });

  it("vacía", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue([]);
    pintar();
    expect(await screen.findByText("La papelera está vacía.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vaciar papelera" })).not.toBeInTheDocument();
  });
});
