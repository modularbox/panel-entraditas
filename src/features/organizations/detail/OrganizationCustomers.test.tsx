import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as api from "@/shared/lib/entraditasApi";
import { OrganizationCustomers } from "./OrganizationCustomers";

function pintar() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <OrganizationCustomers organizationId="org-1" />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const CLIENTE: api.ApiCustomer = {
  id: "u-1",
  name: "Marta Ruiz",
  email: "marta.ruiz@example.com",
  phone: "+34 611 010 101",
  status: "active",
  ordersCount: 2,
  ticketsCount: 3,
  totalSpent: 7500,
  lastPurchaseAt: "2026-09-12T10:00:00.000Z",
  createdAt: "2026-06-15T10:00:00.000Z",
  events: ["Noche de Jazz", "Rock en Directo"]
};

describe("OrganizationCustomers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("lista quién le ha comprado y en qué eventos", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    const traer = vi.spyOn(api, "fetchApiOrganizationCustomers").mockResolvedValue([CLIENTE]);

    pintar();

    await waitFor(() => expect(screen.getByText("Marta Ruiz")).toBeInTheDocument());
    expect(traer).toHaveBeenCalledWith("org-1");
    // Lo que pidió Axel: los clientes de ese organizador Y en qué eventos.
    expect(screen.getByText("Noche de Jazz, Rock en Directo")).toBeInTheDocument();
    expect(screen.getByText("75,00 €")).toBeInTheDocument();
  });

  it("desde el cliente se puede abrir su ficha", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizationCustomers").mockResolvedValue([CLIENTE]);

    pintar();

    const enlace = await screen.findByRole("link", { name: "Marta Ruiz" });
    expect(enlace).toHaveAttribute("href", "/clientes/marta.ruiz%40example.com");
  });

  /**
   * Una tabla vacía se leería como "esta organización no ha vendido nada", que es una afirmación
   * sobre su negocio. Sin sesión en la API no se sabe, y hay que decirlo.
   */
  it("sin sesión en la API lo dice, en vez de enseñar una tabla vacía", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(false);
    const traer = vi.spyOn(api, "fetchApiOrganizationCustomers");

    pintar();

    expect(screen.getByText(/Sin sesión en entraditas\.com/)).toBeInTheDocument();
    expect(traer).not.toHaveBeenCalled();
  });

  it("si no le ha comprado nadie lo dice claro", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizationCustomers").mockResolvedValue([]);
    vi.spyOn(api, "fetchApiOrganizations").mockResolvedValue([
      { id: "org-1", name: "Producciones Norte", slug: "norte", taxId: null, commissionRate: 0.08,
        contactEmail: null, contactPhone: null, status: "active", createdAt: null, organizer: null }
    ]);

    pintar();

    await waitFor(() => expect(screen.getByText("Todavía no le ha comprado nadie.")).toBeInTheDocument());
  });

  /**
   * El listado de Organizaciones todavía sale de los datos de ejemplo del panel, así que sus ids no
   * son los de la base real. Decir "todavía no le ha comprado nadie" ahí suena a dato y no lo es.
   */
  it("distingue una organización de ejemplo de una que de verdad no ha vendido", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizationCustomers").mockResolvedValue([]);
    vi.spyOn(api, "fetchApiOrganizations").mockResolvedValue([]);

    pintar();

    await waitFor(() => expect(screen.getByText(/solo existe en los datos de ejemplo/)).toBeInTheDocument());
    expect(screen.queryByText("Todavía no le ha comprado nadie.")).not.toBeInTheDocument();
  });

  it("cuenta el fallo cuando la API no responde", async () => {
    vi.spyOn(api, "canReadFromApi").mockReturnValue(true);
    vi.spyOn(api, "fetchApiOrganizationCustomers").mockRejectedValue(new Error("La API no contesta."));

    pintar();

    await waitFor(() => expect(screen.getByText(/La API no contesta\./)).toBeInTheDocument());
  });
});
