import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event, OrganizationListItem } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { ConfirmProvider } from "@/shared/ui/useConfirm";
import { EventsListPage } from "./EventsListPage";

function evento(extra: Partial<Event> = {}): Event {
  return {
    id: "event-1",
    organizationId: "org-1",
    venueId: "venue-1",
    slug: "noche-de-jazz",
    title: "Noche de Jazz",
    description: "Una noche de jazz",
    category: "concierto",
    status: "published",
    visibility: "public",
    startsAt: "2026-10-10T21:00:00.000Z",
    endsAt: "2026-10-10T23:30:00.000Z",
    salesStartAt: null,
    salesEndAt: null,
    hasSubEvents: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    ...extra
  };
}

const ORGANIZACIONES: OrganizationListItem[] = [
  { id: "org-1", name: "Sala Riviera", slug: "sala-riviera", taxId: "B12345678", commissionRate: 0.08, contactEmail: "hola@sala-riviera.es", contactPhone: null, status: "active", organizer: null },
  { id: "org-2", name: "Eventos Madrid", slug: "eventos-madrid", taxId: "B87654321", commissionRate: 0.065, contactEmail: "hola@eventos-madrid.es", contactPhone: null, status: "active", organizer: null }
];

function pintar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        {/* Las acciones de cada fila piden confirmacion, asi que necesitan el modal montado. */}
        <ConfirmProvider>
          <EventsListPage />
        </ConfirmProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function sesionDe(rol: "superadmin" | "organizador") {
  useSessionStore.setState({
    token: "token-de-prueba",
    user: { id: "usr-1", email: "quien@entraditas.com", fullName: "Quien Mira", role: rol, organizationId: rol === "superadmin" ? null : "org-1" },
    effectivePermissions: new Set<string>(),
    eventScopes: []
  });
}

// La cabecera de cada columna es un botón de ordenación, así que su texto lleva la flecha detrás.
function cabeceras(): string[] {
  return screen.getAllByRole("columnheader").map((th) => (th.textContent ?? "").replace(/[▲▼↕]$/, ""));
}

describe("EventsListPage", () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * El superadmin es el único que ve eventos de más de una organización, y sin el nombre no se sabe
   * de quién es cada fila. Para el organizador la columna solo repetiría su propia empresa.
   */
  it("el superadmin ve la organización de cada evento, entre el título y el estado", async () => {
    sesionDe("superadmin");
    vi.spyOn(apiClient, "get").mockImplementation(async (path) =>
      path.startsWith("/organizations") ? ORGANIZACIONES : [evento(), evento({ id: "event-2", organizationId: "org-2", title: "Rock en Directo" })]
    );

    pintar();

    expect(await screen.findByText("Sala Riviera")).toBeInTheDocument();
    expect(screen.getByText("Eventos Madrid")).toBeInTheDocument();
    expect(cabeceras().slice(0, 3)).toEqual(["Título", "Organización", "Estado"]);
  });

  it("para un organizador la columna no aparece: solo vería el nombre de su propia empresa", async () => {
    sesionDe("organizador");
    const traer = vi.spyOn(apiClient, "get").mockImplementation(async (path) => (path.startsWith("/organizations") ? ORGANIZACIONES : [evento()]));

    pintar();

    expect(await screen.findByText("Noche de Jazz")).toBeInTheDocument();
    expect(screen.queryByText("Sala Riviera")).not.toBeInTheDocument();
    expect(cabeceras().slice(0, 2)).toEqual(["Título", "Estado"]);
    // El listado de organizaciones es de superadmin: no se pide, para no gastar un 403.
    expect(traer.mock.calls.some(([path]) => String(path).startsWith("/organizations"))).toBe(false);
  });
});
