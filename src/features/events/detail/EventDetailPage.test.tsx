import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { EventDetailPage } from "./EventDetailPage";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { ConfirmProvider } from "@/shared/ui/useConfirm";

const sync = vi.fn();

vi.mock("@/features/publish/useSyncEventChangesToWeb", () => ({
  useSyncEventChangesToWeb: () => sync
}));

/**
 * En el detalle, "Guardar" vive al lado de las secciones (no dentro de Informacion general):
 * pregunta antes, comprueba los campos obligatorios como Publicar y solo entonces guarda todo.
 */

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <MemoryRouter initialEntries={["/eventos/ev-1"]}>
          <Routes>
            <Route path="/eventos/:id" element={<EventDetailPage />} />
          </Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

const EVENTO_COMPLETO = {
  id: "ev-1",
  venueId: "vn-1",
  status: "draft",
  title: "Concierto de verano",
  category: "concierto",
  description: "<p>Un concierto al aire libre.</p>",
  location: "Parque El Retiro",
  locality: "Madrid",
  datePending: true
} as unknown as Event;

const EVENTO_INCOMPLETO = {
  id: "ev-1",
  venueId: "vn-1",
  status: "draft",
  title: "",
  category: "",
  description: "",
  location: "",
  locality: "",
  datePending: false,
  startsAt: null
} as unknown as Event;

describe("EventDetailPage: Guardar al lado de las secciones", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sync.mockResolvedValue(undefined);
    useSessionStore.setState({ token: "token-de-prueba", user: { role: "organizer" } as never });
    vi.spyOn(apiClient, "patch").mockResolvedValue({ id: "ev-1" });
  });

  it("no pide guardar dentro de Informacion general y el Guardar pregunta primero", async () => {
    vi.spyOn(apiClient, "get").mockResolvedValue(EVENTO_COMPLETO);
    pintar();

    expect(screen.queryByRole("button", { name: "Guardar y continuar" })).toBeNull();
    await screen.findByDisplayValue("Concierto de verano");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Se guardan los cambios de");
  });

  it("con campos obligatorios vacios avisa de lo que falta y no guarda", async () => {
    const parchear = apiClient.patch;
    vi.spyOn(apiClient, "get").mockResolvedValue(EVENTO_INCOMPLETO);
    pintar();

    await screen.findByLabelText("Título");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, guardar" }));

    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent("No se puede guardar");
    expect(aviso).toHaveTextContent("título");
    expect(aviso).toHaveTextContent("localidad");
    expect(aviso).toHaveTextContent("Falta la fecha");
    expect(parchear).not.toHaveBeenCalled();
  });

  it("completo, confirma y guarda la informacion general", async () => {
    const parchear = vi.spyOn(apiClient, "patch").mockResolvedValue({ id: "ev-1" });
    vi.spyOn(apiClient, "get").mockResolvedValue(EVENTO_COMPLETO);
    pintar();

    await screen.findByDisplayValue("Concierto de verano");

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, guardar" }));

    await waitFor(() => expect(parchear).toHaveBeenCalledTimes(1));
    expect(parchear).toHaveBeenCalledWith(
      "/events/ev-1",
      expect.objectContaining({ title: "Concierto de verano", location: "Parque El Retiro" }),
      expect.objectContaining({ token: "token-de-prueba" })
    );
    expect(await screen.findByRole("status")).toHaveTextContent("Cambios guardados");
  });
});