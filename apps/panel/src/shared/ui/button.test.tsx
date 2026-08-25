import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("renders its children and forwards onClick", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies the destructive variant class", () => {
    render(<Button variant="destructive">Eliminar</Button>);
    expect(screen.getByRole("button", { name: "Eliminar" })).toHaveClass("bg-destructive");
  });
});
