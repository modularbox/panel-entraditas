import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TicketTransfer } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { TransfersListPage } from "./TransfersListPage";

function transferencia(extra: Partial<TicketTransfer> = {}): TicketTransfer {
  return {
    id: "trf-1",
    ticketId: "tic-1",
    ticketStatus: "valid",
    ticketSeat: null,
    orderId: "ord-1",
    orderNumber: "PED-2026-0001",
    eventId: "evt-1",
    eventTitle: "La fiesta",
    organizationId: "org-1",
    organizationName: "Sala Riviera",
    fromUserId: "usr-1",
    fromName: "Marta Ruiz",
    fromEmail: "marta@correo.com",
    toUserId: "usr-2",
    toName: "Ana Lopez",
    toEmail: "ana@correo.com",
    toEmailOffered: "ana@correo.com",
    status: "accepted",
    message: null,
    createdAt: "2026-09-20T10:00:00.000Z",
    respondedAt: "2026-09-20T10:05:00.000Z",
    ...extra
  };
}

function pintar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <TransfersListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function sesionDe(rol: "superadmin" | "organizador") {
  useSessionStore.setState({
    token: "token-de-prueba",
    user: {
      id: "usr-admin",
      email: "quien@entraditas.com",
      fullName: "Quien Mira",
      role: rol,
      organizationId: rol === "superadmin" ? null : "org-1"
    },
    effectivePermissions: new Set<string>(),
    eventScopes: []
  });
}

function cabeceras(): string[] {
  return screen.getAllByRole("columnheader").map((th) => (th.textContent ?? "").replace(/[▲▼↕]$/, ""));
}

describe("TransfersListPage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("el superadmin ve la organización de cada cesión entre el nº de pedido y el evento", async () => {
    sesionDe("superadmin");
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      if (String(path).startsWith("/events")) return [];
      return [transferencia(), transferencia({ id: "trf-2", orderNumber: "PED-2026-0002", organizationId: "org-2", organizationName: "Eventos Madrid", fromName: "Luis Pérez", fromEmail: "luis@correo.com", toName: "Eva García", toEmail: "eva@correo.com", status: "pending" })];
    });

    pintar();

    expect(await screen.findByText("PED-2026-0001")).toBeInTheDocument();
    expect(screen.getByText("Sala Riviera")).toBeInTheDocument();
    expect(screen.getByText("Eventos Madrid")).toBeInTheDocument();
    expect(cabeceras().slice(0, 3)).toEqual(["Nº pedido", "Organización", "Evento"]);
  });

  it("para un organizador la columna no aparece y los datos llegan del endpoint /transfers", async () => {
    sesionDe("organizador");
    const traer = vi.spyOn(apiClient, "get").mockImplementation(async (path) => {
      if (String(path).startsWith("/events")) return [];
      return [transferencia({ organizationName: "Sala Riviera" })];
    });

    pintar();

    expect(await screen.findByText("PED-2026-0001")).toBeInTheDocument();
    expect(cabeceras().slice(0, 2)).toEqual(["Nº pedido", "Evento"]);
    expect(screen.queryByText("Sala Riviera")).not.toBeInTheDocument();
    expect(traer).toHaveBeenCalledWith("/transfers", { token: "token-de-prueba" });
  });

  it("muestra los dos lados de la cesión en sus columnas", async () => {
    sesionDe("organizador");
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => (String(path).startsWith("/events") ? [] : [transferencia({ fromName: "", fromEmail: "anónimo@correo.com", toName: "", toEmail: "nuevo@correo.com", status: "rejected" })]));

    pintar();

    expect(await screen.findByText("anónimo@correo.com")).toBeInTheDocument();
    expect(screen.getAllByText("Sin nombre")).toHaveLength(2);
    const rechazados = screen.getAllByText("Rechazada");
    expect(rechazados.length).toBeGreaterThanOrEqual(1);
    expect(rechazados.some((el) => el.tagName === "TD")).toBe(true);
  });
});