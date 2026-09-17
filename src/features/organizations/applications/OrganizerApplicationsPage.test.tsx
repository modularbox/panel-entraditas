import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/lib/entraditasApi";
import { OrganizerApplicationsPage } from "./OrganizerApplicationsPage";

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OrganizerApplicationsPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const SOLICITUD: api.ApiOrganizerApplication = {
  id: "app-1",
  reference: "ORG-A1B2C3",
  organizationName: "Sala Prueba",
  legalName: "Sala Prueba SL",
  taxId: "B11111111",
  contactName: "Ana Prueba",
  email: "ana@salaprueba.es",
  phone: "+34600111222",
  eventType: "Conciertos",
  website: null,
  estimatedEvents: "4-10",
  localities: "Badajoz",
  message: "Queremos vender entradas.",
  status: "pending",
  organizationId: null,
  createdAt: "2026-09-17T10:00:00.000Z",
  reviewedAt: null
};

describe("OrganizerApplicationsPage", () => {
  afterEach(() => vi.restoreAllMocks());

  /**
   * Las solicitudes viven en la base de datos de la web. Sin sesion en la API no hay nada que
   * ensenar, y una lista vacia se leeria como "no hay solicitudes", que es justo lo contrario de
   * lo que pasa.
   */
  it("dice que no hay sesion en la API en vez de pintar una lista vacia", () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(false);
    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent(/no tiene sesión abierta/i);
    expect(screen.queryByRole("list", { name: "Solicitudes de organizador" })).not.toBeInTheDocument();
  });

  it("lista las solicitudes que devuelve la API", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizerApplications").mockResolvedValue([SOLICITUD]);
    renderPage();

    expect(await screen.findByText("Sala Prueba")).toBeInTheDocument();
    expect(screen.getByText(/ORG-A1B2C3/)).toBeInTheDocument();
    expect(screen.getByText("Queremos vender entradas.")).toBeInTheDocument();
  });

  // Aprobar no solo cambia un estado: crea la organizacion y la cuenta de quien la administra, y
  // esa cuenta nace sin contrasena. Si la pantalla no lo dice, nadie sabe que hay que estrenarla.
  it("al aprobar cuenta que la cuenta creada todavia no tiene contrasena", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizerApplications").mockResolvedValue([SOLICITUD]);
    const aprobar = vi.spyOn(api, "approveApiOrganizerApplication").mockResolvedValue({
      organizationId: "org-nueva",
      organizer: { id: "staff-1", email: "ana@salaprueba.es", fullName: "Ana Prueba" }
    });

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar y crear organización" }));

    await waitFor(() => expect(aprobar).toHaveBeenCalledWith("app-1"));
    expect(await screen.findByRole("status")).toHaveTextContent(/todavía no tiene contraseña/i);
  });

  it("cuenta el fallo cuando la API rechaza la aprobacion", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizerApplications").mockResolvedValue([SOLICITUD]);
    vi.spyOn(api, "approveApiOrganizerApplication").mockRejectedValue(new Error("Esa solicitud ya estaba resuelta."));

    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Aprobar y crear organización" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa solicitud ya estaba resuelta.");
  });

  it("una solicitud ya resuelta no ofrece aprobar ni rechazar", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizerApplications").mockResolvedValue([
      { ...SOLICITUD, status: "approved", organizationId: "org-nueva" }
    ]);

    renderPage();
    await screen.findByText("Sala Prueba");

    expect(screen.queryByRole("button", { name: "Aprobar y crear organización" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ver ficha" })).toHaveAttribute("href", "/organizaciones/org-nueva");
  });
});
