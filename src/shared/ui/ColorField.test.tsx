import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ColorField, normalizarHex } from "./ColorField";

describe("normalizarHex", () => {
  it("acepta el código con o sin #, en mayúsculas y con espacios", () => {
    expect(normalizarHex("#FF00AA")).toBe("#ff00aa");
    expect(normalizarHex("FF00AA")).toBe("#ff00aa");
    expect(normalizarHex("  #ff00aa \n")).toBe("#ff00aa");
    expect(normalizarHex("ff 00 aa")).toBe("#ff00aa");
  });

  it("expande la forma corta", () => {
    expect(normalizarHex("#F0A")).toBe("#ff00aa");
  });

  it("rechaza lo que no es un hexadecimal", () => {
    expect(normalizarHex("#GG00AA")).toBeNull();
    expect(normalizarHex("#FF00A")).toBeNull();
    expect(normalizarHex("rojo")).toBeNull();
  });
});

describe("ColorField", () => {
  it("propaga el color al pegar un hexadecimal sin # y con espacios", () => {
    const onChange = vi.fn();
    render(<ColorField id="c" label="Color" value="#000000" onChange={onChange} />);
    const campo = screen.getByLabelText("Color: código hexadecimal");
    fireEvent.paste(campo, { clipboardData: { getData: () => "  FF00AA " } });
    expect(onChange).toHaveBeenCalledWith("#ff00aa");
    expect(campo).toHaveValue("#ff00aa");
  });

  it("propaga el color al escribirlo", () => {
    const onChange = vi.fn();
    render(<ColorField id="c" label="Color" value="#000000" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Color: código hexadecimal"), { target: { value: "#12AB34" } });
    expect(onChange).toHaveBeenCalledWith("#12ab34");
  });
});
