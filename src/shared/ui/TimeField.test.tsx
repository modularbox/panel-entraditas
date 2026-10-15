import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { opcionesHoras, opcionesMinutos, TimeField } from "../ui/TimeField";

describe("opcionesHoras", () => {
  it("devuelve las 24 horas en orden, del 00 al 23 y sin dar la vuelta", () => {
    const horas = opcionesHoras();
    expect(horas).toHaveLength(24);
    expect(horas[0]).toBe("00");
    expect(horas[23]).toBe("23");
    expect(horas).toEqual([...horas].sort());
  });
});

describe("opcionesMinutos", () => {
  it("devuelve los minutos de paso en paso", () => {
    expect(opcionesMinutos(15)).toEqual(["00", "15", "30", "45"]);
  });

  it("añade el minuto actual si no cae en el paso, para no perderlo", () => {
    expect(opcionesMinutos(5, "07")).toContain("07");
  });
});

describe("TimeField", () => {
  it("compone la hora al elegir las horas", () => {
    const onChange = vi.fn();
    render(<TimeField id="hora" label="Hora" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Hora: horas"), { target: { value: "14" } });
    expect(onChange).toHaveBeenCalledWith("14:00");
  });

  it("respeta los minutos ya elegidos al cambiar la hora", () => {
    const onChange = vi.fn();
    render(<TimeField id="hora" label="Hora" value="09:30" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Hora: horas"), { target: { value: "14" } });
    expect(onChange).toHaveBeenCalledWith("14:30");
  });

  it("muestra un minuto que no cae en el paso de 5", () => {
    render(<TimeField id="hora" label="Hora" value="18:07" onChange={() => {}} />);
    expect(screen.getByLabelText("Hora: minutos")).toHaveValue("07");
  });

  it("vacia el valor con la opcion en blanco", () => {
    const onChange = vi.fn();
    render(<TimeField id="hora" label="Hora" value="14:30" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Hora: horas"), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });
});
