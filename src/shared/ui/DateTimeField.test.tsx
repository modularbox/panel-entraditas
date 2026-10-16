import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DateTimeField } from "./DateTimeField";

describe("DateTimeField", () => {
  it("compone fecha y hora en el formato de datetime-local", () => {
    const onChange = vi.fn();
    render(<DateTimeField id="abre" label="Abre" value="2030-05-01T10:00" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Abre: horas"), { target: { value: "23" } });
    expect(onChange).toHaveBeenCalledWith("2030-05-01T23:00");
  });

  it("al elegir solo el día la hora empieza en 00:00", () => {
    const onChange = vi.fn();
    render(<DateTimeField id="abre" label="Abre" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Abre: día"), { target: { value: "2030-05-01" } });
    expect(onChange).toHaveBeenCalledWith("2030-05-01T00:00");
  });

  it("al elegir \"--\" en la hora vacía el campo en vez de poner 00:00", () => {
    const onChange = vi.fn();
    render(<DateTimeField id="abre" label="Abre" value="2030-05-01T10:30" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Abre: horas"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("al elegir \"--\" en los minutos también vacía el campo", () => {
    const onChange = vi.fn();
    render(<DateTimeField id="abre" label="Abre" value="2030-05-01T10:30" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Abre: minutos"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("no deja elegir un día anterior al mínimo", () => {
    render(<DateTimeField id="cierra" label="Cierra" value="" min="2030-05-01T10:00" onChange={() => {}} />);
    expect(screen.getByLabelText("Cierra: día")).toHaveAttribute("min", "2030-05-01");
  });
});
