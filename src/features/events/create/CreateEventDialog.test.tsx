import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EVENT_RULE_DEFAULTS } from "@entraditas/types";
import { useWizardStore } from "../wizard/wizardStore";
import { CreateEventDialog, RULE_GROUPS, withRuleDefaults } from "./CreateEventDialog";

function renderDialog() {
  const onClose = vi.fn();
  const onContinue = vi.fn();
  const onSkip = vi.fn();
  render(<CreateEventDialog onClose={onClose} onContinue={onContinue} onSkip={onSkip} />);
  return { onClose, onContinue, onSkip };
}

describe("CreateEventDialog", () => {
  afterEach(() => {
    useWizardStore.setState({ eventId: null, draftRules: null });
  });

  it("muestra las 6 preguntas de respuesta cerrada y los botones para continuar", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Antes de crear el evento" })).toBeInTheDocument();
    for (const group of ["Venta", "Asientos", "Titular de la entrada", "Acceso en puerta", "Reembolsos", "Lo que ve el comprador"]) {
      expect(screen.getByText(group)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(/Minimo de entradas por pedido/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continuar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empezar sin responder" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("una pregunta de si/no se responde y viaja al continuar", () => {
    const { onContinue } = renderDialog();
    // Por defecto no se permiten huecos sueltos; se cambia a que si se permiten.
    expect(screen.getByRole("button", { name: "La venta impide dejar huecos de un asiento" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Se permite dejar huecos de un asiento" }));
    expect(screen.getByRole("button", { name: "Se permite dejar huecos de un asiento" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ allowIsolatedSeats: true }));
  });

  it("las cantidades se responden con su input numerico", () => {
    const { onContinue } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Maximo de entradas por pedido/), { target: { value: "8" } });
    expect(screen.getByLabelText(/Maximo de entradas por pedido/)).toHaveValue(8);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ maxPerOrder: 8 }));
  });

  it("Empezar sin responder deja las respuestas por defecto", () => {
    const { onContinue, onSkip } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Empezar sin responder" }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("Cancelar cierra el dialogo sin continuar", () => {
    const { onClose, onContinue, onSkip } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("retoma las respuestas guardadas cuando un evento quedo a medio contestar", () => {
    useWizardStore.setState({ draftRules: { allowGuestCheckout: false } });
    const { onContinue } = renderDialog();
    expect(screen.getByRole("button", { name: "Hay que registrarse para comprar" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ allowGuestCheckout: false }));
  });

  it("continuar sin tocar nada envia el juego completo de reglas por defecto", () => {
    const { onContinue } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(EVENT_RULE_DEFAULTS);
  });

  it("los campos de cantidad arrancan con su valor por defecto", () => {
    renderDialog();
    expect(screen.getByLabelText(/Minimo de entradas por pedido/)).toHaveValue(EVENT_RULE_DEFAULTS.minPerOrder);
    expect(screen.getByLabelText(/Maximo de entradas por pedido/)).toHaveValue(EVENT_RULE_DEFAULTS.maxPerOrder);
    expect(screen.getByLabelText(/Maximo de entradas por comprador/)).toHaveValue(EVENT_RULE_DEFAULTS.maxPerCustomer);
    expect(screen.getByLabelText(/Maximo de asientos seguidos por pedido/)).toHaveValue(EVENT_RULE_DEFAULTS.maxContiguousSeats);
    expect(screen.getByLabelText(/Escaneos permitidos por entrada/)).toHaveValue(EVENT_RULE_DEFAULTS.maxScansPerTicket);
    expect(screen.getByLabelText(/Dias antes del evento hasta los que se devuelve/)).toHaveValue(EVENT_RULE_DEFAULTS.refundDeadlineDays);
    expect(screen.getByLabelText(/Edad minima/)).toHaveValue(EVENT_RULE_DEFAULTS.minimumAge);
    expect(screen.getByLabelText(/Avisar de ultimas entradas cuando queden/)).toHaveValue(EVENT_RULE_DEFAULTS.lowStockThreshold);
  });

  it("los botones de si/no arrancan con el estado por defecto de cada regla", () => {
    renderDialog();
    // [etiqueta del "no", etiqueta del "si", cual arranca pulsado]
    const cases: Array<[string, string, "no" | "yes"]> = [
      ["Hay que registrarse para comprar", "Se puede comprar como invitado", "yes"],
      ["La venta impide dejar huecos de un asiento", "Se permite dejar huecos de un asiento", "no"],
      ["El sistema asigna la butaca", "El comprador elige su butaca", "yes"],
      ["Basta con los datos del comprador", "Se pide el nombre de cada asistente", "no"],
      ["No se pide documento", "Se pide DNI/NIE de cada asistente", "no"],
      ["La entrada no se puede ceder", "Se puede ceder", "yes"],
      ["Una vez dentro, no se puede reentrar", "Se permite salir y volver a entrar", "no"],
      ["No se admiten devoluciones", "Se admiten devoluciones", "yes"],
      ["No se muestra el numero", "Se muestran las entradas que quedan", "yes"],
      ["El recinto no es accesible", "El recinto es accesible", "no"]
    ];
    for (const [no, yes, pressed] of cases) {
      expect(screen.getByRole("button", { name: no })).toHaveAttribute("aria-pressed", pressed === "no" ? "true" : "false");
      expect(screen.getByRole("button", { name: yes })).toHaveAttribute("aria-pressed", pressed === "yes" ? "true" : "false");
    }
  });

  it("una cantidad por debajo del minimo se aferra al minimo", () => {
    const { onContinue } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Minimo de entradas por pedido/), { target: { value: "0" } });
    expect(screen.getByLabelText(/Minimo de entradas por pedido/)).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ minPerOrder: 1 }));
  });

  it("una cantidad por encima de 100 se recorta a 100", () => {
    const { onContinue } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Maximo de entradas por pedido/), { target: { value: "250" } });
    expect(screen.getByLabelText(/Maximo de entradas por pedido/)).toHaveValue(100);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ maxPerOrder: 100 }));
  });

  it("vaciar un campo numerico recupera su caso base: 0 si es 'sin tope', el minimo si no", () => {
    const { onContinue } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Maximo de entradas por comprador/), { target: { value: "" } });
    expect(screen.getByLabelText(/Maximo de entradas por comprador/)).toHaveValue(0);
    fireEvent.change(screen.getByLabelText(/Escaneos permitidos por entrada/), { target: { value: "" } });
    expect(screen.getByLabelText(/Escaneos permitidos por entrada/)).toHaveValue(1);
    // maxPerCustomer (0 = sin tope) es un valor valido y ademas esta en el esquema.
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(
      expect.objectContaining({ maxPerCustomer: 0, maxScansPerTicket: 1 })
    );
  });

  it("caracteres no numericos no dejan un valor invalido: el campo cae a su minimo", () => {
    const { onContinue } = renderDialog();
    fireEvent.change(screen.getByLabelText(/Escaneos permitidos por entrada/), { target: { value: "1a" } });
    expect(screen.getByLabelText(/Escaneos permitidos por entrada/)).toHaveValue(1);
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ maxScansPerTicket: 1 }));
  });

  it("alternar una respuesta de ida y vuelta deja el estado original", () => {
    const { onContinue } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Se permite dejar huecos de un asiento" }));
    fireEvent.click(screen.getByRole("button", { name: "La venta impide dejar huecos de un asiento" }));
    expect(screen.getByRole("button", { name: "La venta impide dejar huecos de un asiento" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Se permite dejar huecos de un asiento" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith(expect.objectContaining({ allowIsolatedSeats: false }));
  });

  it("el boton de cerrar de la cabecera cierra el dialogo", () => {
    const { onClose, onContinue, onSkip } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
    expect(onSkip).not.toHaveBeenCalled();
  });

  it("un click en el fondo oscuro cierra el dialogo", () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("un click dentro del dialogo no lo cierra", () => {
    const { onClose } = renderDialog();
    fireEvent.mouseDown(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("responder y luego saltarse el cuestionario descarta lo respondido", () => {
    const { onContinue, onSkip } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Se pide DNI/NIE de cada asistente" }));
    fireEvent.click(screen.getByRole("button", { name: "Empezar sin responder" }));
    expect(onSkip).toHaveBeenCalledOnce();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("un borrador parcial conserva los valores por defecto del resto", () => {
    useWizardStore.setState({ draftRules: { maxPerOrder: 3 } });
    const { onContinue } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(onContinue).toHaveBeenCalledWith({ ...EVENT_RULE_DEFAULTS, maxPerOrder: 3 });
  });
});

describe("withRuleDefaults", () => {
  it("null devuelve el juego completo de valores por defecto", () => {
    expect(withRuleDefaults(null)).toEqual(EVENT_RULE_DEFAULTS);
  });

  it("undefined devuelve el juego completo de valores por defecto", () => {
    expect(withRuleDefaults(undefined)).toEqual(EVENT_RULE_DEFAULTS);
  });

  it("un borrador parcial se mezcla sobre los valores por defecto", () => {
    expect(withRuleDefaults({ allowIsolatedSeats: true })).toEqual({ ...EVENT_RULE_DEFAULTS, allowIsolatedSeats: true });
  });
});

describe("RULE_GROUPS", () => {
  it("cada regla del esquema aparece una sola vez en el cuestionario", () => {
    const asked = RULE_GROUPS.flatMap((group) => group.questions).map((question) => question.key);
    expect(RULE_GROUPS).toHaveLength(6);
    expect(new Set(asked).size).toBe(asked.length);
    for (const key of Object.keys(EVENT_RULE_DEFAULTS)) {
      expect(asked).toContain(key);
    }
  });
});