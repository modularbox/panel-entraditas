import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { decimalOnly, digitsOnly, NumericInput } from "../ui/NumericInput";

describe("digitsOnly", () => {
  it("quita todo lo que no es un digito", () => {
    expect(digitsOnly("12e-3,4")).toBe("1234");
  });

  it("acota los caracteres al maxLength", () => {
    expect(digitsOnly("123456", 3)).toBe("123");
  });
});

describe("decimalOnly", () => {
  it("permite un unico separador decimal y normaliza la coma a punto", () => {
    expect(decimalOnly("12,50")).toBe("12.50");
    expect(decimalOnly("9.99")).toBe("9.99");
  });

  it("descarta separadores decimales repetidos", () => {
    expect(decimalOnly("1.2.3")).toBe("1.23");
  });

  it("acota los caracteres al maxLength", () => {
    expect(decimalOnly("12345.67", 6)).toBe("12345.");
  });
});

describe("NumericInput", () => {
  it("acota el numero de caracteres al maxLength", () => {
    render(<NumericInput aria-label="cantidad" maxLength={3} />);
    const input = screen.getByLabelText("cantidad");
    fireEvent.change(input, { target: { value: "123456" } });
    expect(input).toHaveValue(123);
  });

  it("quita el separador decimal cuando allowDecimal no esta activo", () => {
    render(<NumericInput aria-label="cantidad" />);
    const input = screen.getByLabelText("cantidad");
    fireEvent.change(input, { target: { value: "9.99" } });
    expect(input).toHaveValue(999);
  });

  it("conserva el punto como separador decimal cuando allowDecimal esta activo", () => {
    render(<NumericInput aria-label="precio" allowDecimal />);
    const input = screen.getByLabelText("precio");
    fireEvent.change(input, { target: { value: "12.50" } });
    expect(input).toHaveValue("12.50");
  });

  it("acepta la coma como separador decimal y la normaliza a punto", () => {
    render(<NumericInput aria-label="precio" allowDecimal />);
    const input = screen.getByLabelText("precio");
    fireEvent.change(input, { target: { value: "12,50" } });
    expect(input).toHaveValue("12.50");
  });
});