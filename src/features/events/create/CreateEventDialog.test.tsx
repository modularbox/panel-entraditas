import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWizardStore } from "../wizard/wizardStore";
import { CreateEventDialog } from "./CreateEventDialog";

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
});