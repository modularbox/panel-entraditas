import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Refund } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { RefundsListPage } from "./RefundsListPage";

function reembolso(extra: Partial<Refund> = {}): Refund {
  return {
    id: "refund-1",
    orderId: "order-1",
    orderNumber: "PED-2026-0001",
    customerName: "Marta Ruiz",
    amount: 5800,
    reason: "No pudo asistir",
    status: "processed",
    createdAt: "2026-09-20T10:00:00.000Z",
    ...extra
  };
}

function pintar() {
  useSessionStore.setState({
    token: "token-de-prueba",
    user: { id: "usr-1", email: "quien@entraditas.com", fullName: "Quien Mira", role: "superadmin", organizationId: null },
    effectivePermissions: new Set<string>(),
    eventScopes: []
  });
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <RefundsListPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// La cabecera de cada columna es un botón de ordenación, así que su texto lleva la flecha detrás.
function cabeceras(): string[] {
  return screen.getAllByRole("columnheader").map((th) => (th.textContent ?? "").replace(/[▲▼↕]$/, ""));
}

describe("RefundsListPage", () => {
  afterEach(() => vi.restoreAllMocks());

  // Devolver el dinero es una decisión de una persona: sin su nombre, el reembolso no deja rastro
  // de quién lo ordenó. La API lo saca de `refunds.requested_by`.
  it("dice quién hizo cada reembolso", async () => {
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => (String(path).startsWith("/events") ? [] : [reembolso({ refundedBy: "Laura Fernández" })]));
    pintar();

    expect(await screen.findByText("Laura Fernández")).toBeInTheDocument();
    expect(cabeceras()).toContain("Usuario");
  });

  // Una celda en blanco se lee como un dato que se ha perdido. Si no se sabe quién lo pidió, se
  // dice que no se sabe, y el motivo sigue estando a la vista.
  it("cuando no se sabe quién lo hizo, lo dice en vez de dejar la celda vacía", async () => {
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => (String(path).startsWith("/events") ? [] : [reembolso({ refundedBy: null })]));
    pintar();

    expect(await screen.findByText("Sin usuario")).toBeInTheDocument();
  });
});
