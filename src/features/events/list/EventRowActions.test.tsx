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
    it("aprueba un evento en revision y lo publica", async () => {
      await loginAs("superadmin@entraditas.com");
      eventById("event-5").status = "in_review";

      renderActions(eventById("event-5"));
      fireEvent.click(screen.getByRole("button", { name: "Aprobar y publicar" }));
      await waitFor(() => expect(eventById("event-5").status).toBe("published"));
    });

    it("dice que quedo aprobado pero sin salir a la web cuando la API publica no esta configurada", async () => {
      await loginAs("superadmin@entraditas.com");
      eventById("event-5").status = "in_review";

      renderActions(eventById("event-5"));
      fireEvent.click(screen.getByRole("button", { name: "Aprobar y publicar" }));

      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/no se envio a la web/));
      expect(eventById("event-5").status).toBe("published");
    });

    it("un admin de organizacion no puede revisar su propio evento", async () => {
      await loginAs("admin@entraditas.com");
      eventById("event-5").status = "in_review";

      renderActions(eventById("event-5"));

      expect(screen.queryByRole("button", { name: "Aprobar y publicar" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Rechazar" })).not.toBeInTheDocument();
    });
  });

  describe("retirar de revision", () => {
    // El evento sigue siendo del organizador hasta que se aprueba: sin esto, mandarlo a revision
    // lo dejaba bloqueado y la unica salida era pedirle a un superadmin que lo rechazara.
    it("un admin retira de revision su propio evento y vuelve a borrador", async () => {
      await loginAs("admin@entraditas.com");
      eventById("event-5").status = "in_review";

      renderActions(eventById("event-5"));
      fireEvent.click(screen.getByRole("button", { name: "Retirar de revisión" }));

      await waitFor(() => expect(eventById("event-5").status).toBe("draft"));
      expect(screen.getByRole("status")).toHaveTextContent(/ya puedes editarlo/);
    });

    it("no se ofrece retirar de revision un borrador", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5")); // borrador

      expect(screen.queryByRole("button", { name: "Retirar de revisión" })).not.toBeInTheDocument();
    });
  });

  describe("cambiar el estado a mano", () => {
    it("un superadmin lleva un evento publicado de vuelta a revision", async () => {
      await loginAs("superadmin@entraditas.com");
      renderActions(eventById("event-1")); // publicado

      fireEvent.change(screen.getByLabelText("Cambiar estado"), { target: { value: "in_review" } });

      await waitFor(() => expect(eventById("event-1").status).toBe("in_review"));
      expect(eventById("event-1").publishedAt).toBeNull();
    });

    it("quien no revisa no ve el selector de estado", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-1"));

      expect(screen.queryByLabelText("Cambiar estado")).not.toBeInTheDocument();
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

  describe("cancelar (antes eliminar)", () => {
    it("ya no hay boton de eliminar", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5"));
      expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
    });

    it("pide confirmacion antes de cancelar", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5"));

      fireEvent.click(screen.getByRole("button", { name: "Cancelar evento" }));

      expect(screen.getByRole("button", { name: "Confirmar cancelación" })).toBeInTheDocument();
      expect(screen.getByText(/se retira de entraditas.com/)).toBeInTheDocument();
      expect(eventById("event-5").status).toBe("draft");
    });

    it("se puede volver atras sin cancelar nada", async () => {
      await loginAs("admin@entraditas.com");
      renderActions(eventById("event-5"));

      fireEvent.click(screen.getByRole("button", { name: "Cancelar evento" }));
      fireEvent.click(screen.getByRole("button", { name: "Volver" }));

      expect(screen.queryByRole("button", { name: "Confirmar cancelación" })).not.toBeInTheDocument();
      expect(eventById("event-5").status).toBe("draft");
    });

    it("un evento con ventas se cancela sin perder nada de lo vendido", async () => {
      await loginAs("admin@entraditas.com");
      const conVentas = db.orders[0]!.eventId;
      const pedidos = db.orders.filter((o) => o.eventId === conVentas).length;
      renderActions(eventById(conVentas));

      fireEvent.click(screen.getByRole("button", { name: "Cancelar evento" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));

      await waitFor(() => expect(eventById(conVentas).status).toBe("cancelled"));
      expect(eventById(conVentas).publishedAt).toBeNull();
      expect(db.orders.filter((o) => o.eventId === conVentas)).toHaveLength(pedidos);
      expect(screen.getByRole("status")).toHaveTextContent(/cancelado/i);
    });

    it("un evento ya cancelado no ofrece cancelarlo otra vez", async () => {
      await loginAs("admin@entraditas.com");
      eventById("event-5").status = "cancelled";
      renderActions(eventById("event-5"));
      expect(screen.queryByRole("button", { name: "Cancelar evento" })).not.toBeInTheDocument();
    });

    it("un admin no puede cancelar el evento de otra organizacion", async () => {
      await loginAs("admin@entraditas.com"); // org-1
      renderActions(eventById("event-4")); // org-2

      fireEvent.click(screen.getByRole("button", { name: "Cancelar evento" }));
      fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));

      await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
      expect(eventById("event-4").status).toBe("published");
    });
  });

  it("quien no administra no ve ninguna accion", async () => {
    await loginAs("marta.gutierrez@entraditas.com");
    const { container } = renderActions(eventById("event-1"));
    expect(container).toBeEmptyDOMElement();
  });
});
