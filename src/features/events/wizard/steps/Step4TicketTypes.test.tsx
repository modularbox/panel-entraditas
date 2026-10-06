import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { TicketType } from "@entraditas/types";
import { Step4TicketTypes } from "./Step4TicketTypes";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { ConfirmProvider } from "@/shared/ui/useConfirm";

/**
 * Un tipo de entrada se borra al instante, y con el van el resto de sesiones del grupo: por eso
 * tiene que preguntar antes. Se vigila la API: si algo se borra sin haber pasado por el modal,
 * la llamada sale y esta prueba falla.
 */

const sync = vi.hoisted(() => vi.fn(async () => ({ status: "published" as const })));

vi.mock("@/features/publish/useSyncEventChangesToWeb", () => ({
  useSyncEventChangesToWeb: () => sync
}));

/** Dos filas del mismo grupo (una por sesion) y otra de otro grupo. */
const TIPOS: TicketType[] = [
  { id: "tt-1", groupId: "g-1", name: "General", basePrice: 2500, quantityTotal: 100, quantitySold: 30, sortOrder: 0, color: "#0f766e" },
  { id: "tt-2", groupId: "g-1", name: "General", basePrice: 2500, quantityTotal: 100, quantitySold: 12, sortOrder: 0, color: "#0f766e" },
  { id: "tt-3", groupId: "g-2", name: "VIP", basePrice: 6000, quantityTotal: 20, quantitySold: 0, sortOrder: 1, color: "#e13d25" }
] as unknown as TicketType[];

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <Step4TicketTypes eventId="ev-1" onSaved={vi.fn()} />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

/** El boton de una fila concreta: hay uno por cada tipo de entrada. */
function botonDeLaFila(nombre: string, etiqueta: RegExp) {
  const fila = screen.getByText(new RegExp(`^${nombre} -`)).closest("li")!;
  return within(fila).getByRole("button", { name: etiqueta });
}

/** Espera a que lleguen los tipos de entrada antes de buscar botones. */
async function esperarFilas() {
  await screen.findByText(/^General -/);
}

describe("Step4TicketTypes pide confirmacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSessionStore.setState({ token: "token-de-prueba", user: { role: "superadmin" } as never });
    vi.spyOn(apiClient, "get").mockImplementation(async (path) =>
      String(path).includes("ticket-types") ? TIPOS : []
    );
  });

  it("al eliminar avisa de las entradas vendidas, y si se dice que no no borra nada", async () => {
    const borrar = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });

    pintar();
    await esperarFilas();
    fireEvent.click(botonDeLaFila("General", /^Eliminar$/));

    // El aviso tiene que decir las dos cosas: que se va y que hay gente que ya compro.
    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent('Se elimina "General"');
    expect(dialogo).toHaveTextContent("42 entradas vendidas");

    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(borrar).not.toHaveBeenCalled();
    // La fila sigue donde estaba.
    expect(screen.getByText(/^General -/)).toBeInTheDocument();
  });

  it("al confirmar el borrado se van todas las sesiones del grupo, y solo esas", async () => {
    const borrar = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });

    pintar();
    await esperarFilas();
    fireEvent.click(botonDeLaFila("General", /^Eliminar$/));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: /^Sí, eliminar$/ }));

    await waitFor(() => expect(borrar).toHaveBeenCalledTimes(2));
    expect(borrar).toHaveBeenCalledWith("/ticket-types/tt-1", { token: "token-de-prueba" });
    expect(borrar).toHaveBeenCalledWith("/ticket-types/tt-2", { token: "token-de-prueba" });
    // El VIP es de otro grupo: no se toca.
    expect(borrar).not.toHaveBeenCalledWith("/ticket-types/tt-3", expect.anything());
  });

  it("un tipo sin ventas no necesita que el aviso mencione comprador", async () => {
    vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });

    pintar();
    await esperarFilas();
    fireEvent.click(botonDeLaFila("VIP", /^Eliminar$/));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("Nadie ha comprado de este tipo todavia");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
  });

  it("al guardar cambios dice que precio baja, y solo entonces guarda", async () => {
    const patch = vi.spyOn(apiClient, "patch").mockResolvedValue({ ok: true });

    pintar();
    await esperarFilas();
    fireEvent.click(botonDeLaFila("General", /^Editar$/));

    // Se edita el precio del primer tipo de entrada. El formulario de editar va dentro de la
    // fila, asi que se busca ahi: abajo hay otro campo "Precio" para crear uno nuevo.
    const fila = screen.getByText(/^General -/).closest("li")!;
    const precio = within(fila).getByLabelText(/^Precio/);
    fireEvent.change(precio, { target: { value: "20.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    const dialogo = await screen.findByRole("dialog");
    expect(dialogo).toHaveTextContent("el precio pasa de 25.00 a 20.00 EUR");
    expect(dialogo).toHaveTextContent("baja lo que pagan las que se vendan después");

    // Si se responde que no, no se guarda y el editor sigue abierto.
    fireEvent.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    expect(patch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar" })).toBeInTheDocument();

    // Ahora se dice que si.
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /^Sí, guardar$/ }));

    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch).toHaveBeenCalledWith(
      "/ticket-types/tt-1",
      expect.objectContaining({ basePrice: 2000 }),
      { token: "token-de-prueba" }
    );
  });
});
