import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event, Gate, SubEvent, Zone } from "@entraditas/types";
import { GatesSection } from "./GatesSection";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { ConfirmProvider } from "@/shared/ui/useConfirm";

/**
 * Crear una puerta la pone en marcha para el aforo del evento, y desactivar o borrar una deja a
 * la gente sin control de acceso: por eso las tres acciones pasan por el aviso.
 */

const PUERTA = {
  id: "gt-1",
  name: "Puerta Norte",
  code: "NOR",
  isActive: true,
  direction: "in",
  allowReentry: false,
  zoneId: null,
  subEventId: null,
  allowedTicketTypeGroupIds: null
} as unknown as Gate;

const EVENT = { id: "ev-1", venueId: "vn-1" } as unknown as Event;
const ZONAS = [{ id: "zn-1", name: "Platea" }] as unknown as Zone[];
const SESIONES = [{ id: "se-1", name: "Viernes" }] as unknown as SubEvent[];

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <GatesSection eventId="ev-1" />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

function responder(path: string) {
  if (path.includes("/gates")) return [PUERTA];
  if (path.includes("/venues/")) return ZONAS;
  if (path.includes("/sub-events")) return SESIONES;
  if (path.includes("/ticket-types")) return [];
  if (path.includes("/team")) return [];
  if (path.includes("/events/")) return EVENT;
  return [];
}

describe("GatesSection pide confirmacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ token: "token-de-prueba", user: { role: "superadmin" } as never });
    vi.spyOn(apiClient, "get").mockImplementation(async (path) => responder(String(path)));
  });

  it("al crear una puerta dice como queda, y un cancelar no la crea", async () => {
    const crear = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    pintar();
    fireEvent.change(await screen.findByLabelText("Nombre"), { target: { value: "Puerta Sur" } });
    fireEvent.change(screen.getByLabelText("Código"), { target: { value: "SUR" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear puerta" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent('Se crea la puerta "Puerta Sur"');
    expect(dialogo).toHaveTextContent('código "SUR"');
    expect(dialogo).toHaveTextContent("entrada");
    expect(dialogo).toHaveTextContent("sin zona asignada todavía");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(crear).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Crear puerta" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, crear la puerta" }));

    await waitFor(() => expect(crear).toHaveBeenCalledTimes(1));
    expect(crear).toHaveBeenCalledWith(
      "/events/ev-1/gates",
      expect.objectContaining({ name: "Puerta Sur", code: "SUR", direction: "in" }),
      { token: "token-de-prueba" }
    );
  });

  it("al eliminar una puerta avisa de que deja de controlar el acceso", async () => {
    const borrar = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });

    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Eliminar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Puerta Norte");
    expect(dialogo).toHaveTextContent("deja de aparecer en el control de acceso");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(borrar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Sí, eliminar$/ }));

    await waitFor(() => expect(borrar).toHaveBeenCalledTimes(1));
    expect(borrar).toHaveBeenCalledWith("/gates/gt-1", { token: "token-de-prueba" });
  });

  it("desactivar una puerta tambien pregunta", async () => {
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({ ok: true });

    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Desactivar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Puerta Norte");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(patch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Desactivar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Sí, desactivar$/ }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch).toHaveBeenCalledWith(
      "/gates/gt-1",
      { isActive: false },
      { token: "token-de-prueba" }
    );
  });
});
