import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichTextEditor } from "./publicEventPreview";

describe("RichTextEditor", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, "execCommand");
    Reflect.deleteProperty(document, "queryCommandState");
  });

  it("toggles Puntos on and off when pressing the button again", async () => {
    let listState = false;
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn((command: string) => {
      if (command === "insertUnorderedList") listState = !listState;
      return true;
      })
    });
    Object.defineProperty(document, "queryCommandState", {
      configurable: true,
      value: vi.fn((command: string) => (command === "insertUnorderedList" ? listState : false))
    });

    render(<RichTextEditor id="description" label="Descripcion" value="Texto" onChange={() => {}} />);

    const puntos = screen.getByRole("button", { name: /Puntos/ });
    expect(puntos).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(puntos);
    await waitFor(() => expect(puntos).toHaveAttribute("aria-pressed", "true"));

    fireEvent.click(puntos);
    await waitFor(() => expect(puntos).toHaveAttribute("aria-pressed", "false"));
  });
});
