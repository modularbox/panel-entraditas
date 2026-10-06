import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event, SubEvent } from "@entraditas/types";
import { Step2Schedule } from "./Step2Schedule";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { ConfirmProvider } from "@/shared/ui/useConfirm";

/**
 * Crear sesiones escribe en el servidor, y copiar la hora de puertas lo cambia en todas de golpe:
 * ninguna de las tres acciones puede dispararse sola sin pasar por el aviso.
 */

const sync = vi.hoisted(() => vi.fn(async () => ({ status: "published" as const })));

vi.mock("@/features/publish/useSyncEventChangesToWeb", () => ({
  useSyncEventChangesToWeb: () => sync
}));

const EVENT = { id: "ev-1", startsAt: null, datePending: false } as unknown as Event;

const SESIONES = [
  { id: "se-1", name: "Viernes", startsAt: "2027-01-01T21:00:00.000Z", doorsOpenAt: "2027-01-01T19:30:00.000Z" },
  { id: "se-2", name: "Sábado", startsAt: "2027-01-02T21:00:00.000Z", doorsOpenAt: null }
] as unknown as SubEvent[];

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <Step2Schedule eventId="ev-1" onSaved={vi.fn()} />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

describe("Step2Schedule pide confirmacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ token: "token-de-prueba", user: { role: "superadmin" } as never });
    vi.spyOn(apiClient, "get").mockImplementation(async (path) =>
      String(path).includes("sub-events") ? SESIONES : EVENT
    );
  });

  it("al anadir una sesion avisa de como queda, y si se cancela no se envia nada", async () => {
    const crear = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Añadir sesión" }));

    // El aviso dice el nombre y que la fecha queda por confirmar, que es lo que hay aqui.
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent('la sesión "Sesión única"');
    expect(dialogo).toHaveTextContent("con la fecha por confirmar");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(crear).not.toHaveBeenCalled();

    // Ahora si: se vuelve a pulsar y se acepta.
    fireEvent.click(screen.getByRole("button", { name: "Añadir sesión" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, crearla" }));

    await waitFor(() => expect(crear).toHaveBeenCalledTimes(1));
    expect(crear).toHaveBeenCalledWith(
      "/events/ev-1/sub-events",
      expect.objectContaining({ name: "Sesión única" }),
      { token: "token-de-prueba" }
    );
  });

  it("al generar por patron dice cuantas sesiones salen, y un no no genera", async () => {
    const bulk = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });

    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Varias sesiones" }));
    fireEvent.change(await screen.findByLabelText("Fecha inicio"), { target: { value: "2027-03-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Generar sesiones" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Se crean 2 sesiones");
    expect(dialogo).toHaveTextContent("empezando el 2027-03-01");
    expect(dialogo).toHaveTextContent("hasta el 2027-03-08");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(bulk).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Generar sesiones" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, crear 2" }));

    await waitFor(() => expect(bulk).toHaveBeenCalledTimes(1));
    expect(bulk).toHaveBeenCalledWith(
      "/events/ev-1/sub-events/bulk",
      expect.objectContaining({ occurrences: 2 }),
      { token: "token-de-prueba" }
    );
  });

  it("copiar la hora de puertas toca todas las sesiones, asi que pregunta antes", async () => {
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({ ok: true });

    pintar();
    fireEvent.click(await screen.findByRole("button", { name: "Copiar hora de apertura de puertas a todas" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Las 2 sesiones pasan a abrir a las 19:30");
    expect(dialogo).toHaveTextContent('la hora de "Viernes"');

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(patch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Copiar hora de apertura de puertas a todas" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Sí, copiarlas" }));

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch).toHaveBeenCalledWith(
      "/sub-events/se-2",
      { doorsOpenAt: "2027-01-01T19:30:00.000Z" },
      { token: "token-de-prueba" }
    );
  });
});
