import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { Event } from "@entraditas/types";
import { db, demoPasswordFor, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { EventReviewActions } from "./EventReviewActions";

function renderActions(event: Event) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <EventReviewActions event={event} />
    </QueryClientProvider>
  );
}

function eventById(id: string): Event {
  return db.events.find((event) => event.id === id)!;
}

describe("EventReviewActions", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("un superadmin aprueba un evento en revision y pasa a publicado", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", demoPasswordFor("superadmin@entraditas.com"));
    eventById("event-5").status = "pending_review";

    renderActions(eventById("event-5"));
    fireEvent.click(screen.getByRole("button", { name: "Aprobar y publicar" }));

    await waitFor(() => expect(eventById("event-5").status).toBe("published"));
  });

  it("dice que quedo aprobado pero sin salir a la web cuando la API publica no esta configurada", async () => {
    // En desarrollo VITE_API_URL esta vacia. Aprobar funciona igual, pero el evento no llega a
    // entraditas.com y hay que decirlo en vez de dejar creer que ya esta en la calle.
    await useSessionStore.getState().login("superadmin@entraditas.com", demoPasswordFor("superadmin@entraditas.com"));
    eventById("event-5").status = "pending_review";

    renderActions(eventById("event-5"));
    fireEvent.click(screen.getByRole("button", { name: "Aprobar y publicar" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/no se envio a la web/));
    expect(eventById("event-5").status).toBe("published");
  });

  it("un superadmin puede rechazar y el evento vuelve al organizador", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", demoPasswordFor("superadmin@entraditas.com"));
    eventById("event-5").status = "pending_review";

    renderActions(eventById("event-5"));
    fireEvent.click(screen.getByRole("button", { name: "Rechazar" }));

    await waitFor(() => expect(eventById("event-5").status).toBe("rejected"));
    expect(screen.getByRole("status")).toHaveTextContent(/vuelve al organizador/);
  });

  it("un admin de organizacion no ve los botones: no puede aprobarse a si mismo", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    eventById("event-5").status = "pending_review";

    const { container } = renderActions(eventById("event-5"));

    expect(container).toBeEmptyDOMElement();
  });

  it("no ofrece revisar un borrador que nunca se envio", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", demoPasswordFor("superadmin@entraditas.com"));
    eventById("event-5").status = "draft";

    const { container } = renderActions(eventById("event-5"));

    expect(container).toBeEmptyDOMElement();
  });

  it("tampoco ofrece revisar uno ya publicado", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", demoPasswordFor("superadmin@entraditas.com"));
    eventById("event-5").status = "published";

    const { container } = renderActions(eventById("event-5"));

    expect(container).toBeEmptyDOMElement();
  });
});
