import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import { EVENT_RULE_DEFAULTS } from "@entraditas/types";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { EventRulesSection, RULE_GROUPS, withRuleDefaults } from "./EventRulesSection";

function renderSection(eventId: string | null) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <EventRulesSection eventId={eventId} />
    </QueryClientProvider>
  );
}

describe("withRuleDefaults", () => {
  it("fills every unanswered rule with its default", () => {
    expect(withRuleDefaults(undefined)).toEqual(EVENT_RULE_DEFAULTS);
  });

  it("keeps what the organizer already answered", () => {
    const rules = withRuleDefaults({ allowIsolatedSeats: true, maxPerOrder: 2 });
    expect(rules.allowIsolatedSeats).toBe(true);
    expect(rules.maxPerOrder).toBe(2);
    expect(rules.isRefundable).toBe(EVENT_RULE_DEFAULTS.isRefundable);
  });
});

describe("RULE_GROUPS", () => {
  // El objetivo del cuestionario es que nada requiera interpretacion humana: solo si/no o
  // cantidades. Si alguien anade una pregunta de texto libre, este test la caza.
  it("only asks closed questions: yes/no or a quantity", () => {
    for (const group of RULE_GROUPS) {
      for (const question of group.questions) {
        expect(["boolean", "number"]).toContain(question.kind);
      }
    }
  });

  it("every question maps to a real rule with a default", () => {
    for (const group of RULE_GROUPS) {
      for (const question of group.questions) {
        expect(EVENT_RULE_DEFAULTS).toHaveProperty(question.key);
      }
    }
  });

  it("does not ask the same thing twice", () => {
    const keys = RULE_GROUPS.flatMap((group) => group.questions.map((question) => question.key));
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("EventRulesSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("asks to save the event first when there is no event yet", () => {
    renderSection(null);
    expect(screen.getByText(/Guarda la informacion del evento/)).toBeInTheDocument();
  });

  it("shows the defaults for an event that has never answered them", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2");

    // "No" is preselected for isolated seats, which is the safe default.
    const isolatedNo = await screen.findByRole("button", { name: "La venta impide dejar huecos de un asiento" });
    expect(isolatedNo).toHaveAttribute("aria-pressed", "true");
    expect(await screen.findByLabelText("Maximo de entradas por pedido")).toHaveValue(EVENT_RULE_DEFAULTS.maxPerOrder);
  });

  it("saves a yes/no answer on the event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2");

    fireEvent.click(await screen.findByRole("button", { name: "Se permite dejar huecos de un asiento" }));

    await waitFor(() => expect(db.events.find((e) => e.id === "event-2")!.rules?.allowIsolatedSeats).toBe(true));
  });

  it("saves a quantity answer when the field loses focus", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2");
    const input = await screen.findByLabelText("Maximo de entradas por pedido");

    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.blur(input);

    await waitFor(() => expect(db.events.find((e) => e.id === "event-2")!.rules?.maxPerOrder).toBe(4));
  });

  it("keeps a quantity within its minimum", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2");
    const input = await screen.findByLabelText("Escaneos permitidos por entrada");

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.blur(input);

    // A ticket has to be scannable at least once, so 0 is clamped up to the minimum.
    await waitFor(() => expect(db.events.find((e) => e.id === "event-2")!.rules?.maxScansPerTicket).toBe(1));
  });

  it("loads back the rules an event already had", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    db.events.find((e) => e.id === "event-2")!.rules = { minimumAge: 18, allowReentry: true };
    renderSection("event-2");

    // El formulario se pinta con los valores por defecto antes de que llegue el evento, asi que
    // hay que esperar al valor cargado y no solo a que exista el campo.
    await waitFor(() => expect(screen.getByLabelText("Edad minima")).toHaveValue(18));
    expect(screen.getByRole("button", { name: "Se permite salir y volver a entrar" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });
});
