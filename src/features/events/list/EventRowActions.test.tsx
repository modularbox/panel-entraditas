import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Event } from "@entraditas/types";
import { EventRowActions } from "./EventRowActions";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import { ConfirmProvider } from "@/shared/ui/useConfirm";

/**
 * Cada accion que cambia un evento tiene que preguntar antes. Se prueba con la API vigilada: si
 * algo se llama sin haber pasado por el modal, el POST sale y el aviso no aparece, que es
 * justo lo que se quiere evitar.
 */

const publicacion = vi.hoisted(() => ({
  removeFromPublicSite: vi.fn(async () => ({ status: "removed" as const })),
  publishToPublicSite: vi.fn(async () => ({ status: "published" as const }))
}));

vi.mock("@/features/publish/publishToPublicSite", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/features/publish/publishToPublicSite")>();
  return {
    ...real,
    removeFromPublicSite: publicacion.removeFromPublicSite,
    publishToPublicSite: publicacion.publishToPublicSite
  };
});

const evento = {
  id: "ev-1",
  title: "Noche de Jazz",
  status: "in_review"
} as Event;

function pintar() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ConfirmProvider>
        <EventRowActions event={evento} />
      </ConfirmProvider>
    </QueryClientProvider>
  );
}

/** Pulsa el boton de la accion y responde al modal que se abre. */
async function pedirYConfirmar(boton: string, aviso: string, confirmacion: string | RegExp) {
  fireEvent.click(screen.getByRole("button", { name: boton }));
  const dialogo = await screen.findByRole("dialog");
  // El aviso se comprueba antes de confirmar: es la parte que dice lo que va a pasar.
  expect(dialogo).toHaveTextContent(aviso);
  fireEvent.click(within(dialogo).getByRole("button", { name: confirmacion }));
}

function superadmin() {
  useSessionStore.setState({ token: "token-de-prueba", user: { role: "superadmin" } as never });
}

describe("EventRowActions pide confirmacion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aprobar avisa de que se anuncia en la web y luego publica", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });
    superadmin();

    pintar();
    await pedirYConfirmar("Aprobar", "se anuncia en entraditas.com", /^S[ií],/);

    expect(post).toHaveBeenCalledWith("/events/ev-1/approve", undefined, { token: "token-de-prueba" });
  });

  it("rechazar vuelve al organizador y no publica", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });
    superadmin();

    pintar();
    await pedirYConfirmar("Rechazar", "vuelve al organizador", /^S[ií],/);

    expect(post).toHaveBeenCalledWith("/events/ev-1/reject", undefined, { token: "token-de-prueba" });
    expect(publicacion.publishToPublicSite).not.toHaveBeenCalled();
  });

  it("retirar de revision avisa de que vuelve a borrador", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });
    superadmin();

    pintar();
    await pedirYConfirmar("Retirar de revisión", "vuelve a borrador", /^S[ií],/);

    expect(post).toHaveBeenCalledWith("/events/ev-1/withdraw", undefined, { token: "token-de-prueba" });
  });

  it("cancelar avisa de que deja de venderse y lo retira de la web", async () => {
    // Solo se cancela un evento publicado: el boton no sale para los demas estados.
    evento.status = "published";
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });
    superadmin();

    pintar();
    await pedirYConfirmar("Cancelar", "Deja de venderse", "Confirmar cancelación");

    // Cancelar va en dos pasos: primero se retira de la web y despues se marca en el panel, asi
    // que el POST llega un poco despues del clic.
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith("/events/ev-1/cancel", undefined, { token: "token-de-prueba" })
    );
    expect(publicacion.removeFromPublicSite).toHaveBeenCalledWith("ev-1");
  });

  it("un evento que no esta publicado no ofrece cancelar", () => {
    evento.status = "draft";
    superadmin();

    pintar();
    expect(screen.queryByRole("button", { name: "Cancelar" })).not.toBeInTheDocument();
  });

  it("eliminar avisa de que se puede restaurar desde la Papelera", async () => {
    const borrar = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });
    superadmin();

    pintar();
    await pedirYConfirmar("Eliminar", "Se puede restaurar desde la Papelera", /^S[ií],/);

    await waitFor(() => expect(borrar).toHaveBeenCalledWith("/events/ev-1", { token: "token-de-prueba" }));
  });
});