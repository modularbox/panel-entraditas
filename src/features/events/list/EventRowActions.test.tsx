import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { Event } from "@entraditas/types";
import { db, demoPasswordFor, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { EventRowActions } from "./EventRowActions";

function renderActions(event: Event) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <EventRowActions event={event} />
    </QueryClientProvider>
  );
}

function eventById(id: string): Event {
  return db.events.find((event) => event.id === id)!;
}

async function loginAs(email: string) {
  await useSessionStore.getState().login(email, demoPasswordFor(email));
}

describe("EventRowActions", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  describe("revision", () => {
    it("un superadmin aprueba un evento en revision y pasa a publicado", async () => {
      await loginAs("superadmin@entraditas.com");
      eventById("event-5").status = "pending_review";

      renderActions(eventById("event-5"));
      fireEvent.click(screen.getByRole("button", { name: "Aprobar y publicar" }));

      await waitFor(() => expect(eventById("event-5").status).toBe("published"));
    });

    it("dice que quedo aprobado pero sin salir a la web cuando la API publica no esta configurada", async () => {
      await loginAs("superadmin@entraditas.com");
      eventById("event-5").status = "pending_review";

      renderActions(eventById("event-5"));
      fireEvent.click(screen.getByRole("button", { name: "Aprobar y publicar" }));

      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/no se envio a la web/));
      expect(eventById("event-5").status).toBe("published");
    });

    it("un admin de organizacion no puede aprobar su propio evento", async () => {
      await loginAs("admin@entraditas.com");
      eventById("event-5").status = "pending_review";

      renderActions(eventById("event-5"));

      expect(screen.queryByRole("button", { name: "Aprobar y publicar" })).not.toBeInTheDocument();
    });
  });

  describe("retirar", () => {
    it("retirar de la web devuelve el evento a borrador", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-1"));

      fireEvent.click(screen.getByRole("button", { name: "Retirar de la web" }));

      await waitFor(() => expect(eventById("event-1").status).toBe("draft"));
      expect(eventById("event-1").publishedAt).toBeNull();
    });

    it("un admin no puede tocar el evento de otra organizacion", async () => {
      // El servidor responde 404 para no confirmar siquiera que ese evento existe.
      await loginAs("admin@entraditas.com"); // org-1
      renderActions(eventById("event-4")); // org-2

      fireEvent.click(screen.getByRole("button", { name: "Retirar de la web" }));

      await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
      expect(eventById("event-4").status).toBe("published");
    });

    it("no se ofrece retirar un evento que nunca se publico", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5")); // borrador

      expect(screen.queryByRole("button", { name: "Retirar de la web" })).not.toBeInTheDocument();
    });
  });

  describe("eliminar", () => {
    it("pide confirmacion antes de borrar", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5"));

      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));

      expect(screen.getByRole("button", { name: "Confirmar borrado" })).toBeInTheDocument();
      expect(screen.getByText(/No se puede deshacer/)).toBeInTheDocument();
      expect(eventById("event-5")).toBeDefined();
    });

    it("se puede cancelar la confirmacion sin borrar nada", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5"));

      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByRole("button", { name: "Confirmar borrado" })).not.toBeInTheDocument();
      expect(eventById("event-5")).toBeDefined();
    });

    it("borra el evento y todo lo que colgaba de el", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5"));

      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirmar borrado" }));

      await waitFor(() => expect(db.events.find((e) => e.id === "event-5")).toBeUndefined());
      expect(db.subEvents.filter((s) => s.eventId === "event-5")).toEqual([]);
      expect(db.ticketTypes.filter((t) => t.eventId === "event-5")).toEqual([]);
      expect(db.gates.filter((g) => g.eventId === "event-5")).toEqual([]);
    });

    it("no borra un evento que ya ha vendido, y explica por que", async () => {
      // Borrarlo destruiria pedidos y entradas de gente que ha pagado.
      await loginAs("admin@entraditas.com");
      const conVentas = db.orders[0]!.eventId;
      renderActions(eventById(conVentas));

      fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirmar borrado" }));

      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/pedido/i));
      expect(db.events.find((e) => e.id === conVentas)).toBeDefined();
    });
  });

  it("quien no administra no ve ninguna accion", async () => {
    await loginAs("marta.gutierrez@entraditas.com");
    const { container } = renderActions(eventById("event-1"));
    expect(container).toBeEmptyDOMElement();
  });
});
