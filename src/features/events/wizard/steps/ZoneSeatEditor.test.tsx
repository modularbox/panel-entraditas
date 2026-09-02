import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Zone } from "@entraditas/types";
import { buildSeatGrid, type SeatAssignments } from "./seatMap";
import type { TicketTypeGroup } from "./Step4TicketTypes";
import { ZoneSeatEditor } from "./ZoneSeatEditor";

const ZONE: Zone = {
  id: "zone-1",
  venueId: "venue-1",
  name: "Zona 1",
  kind: "numbered",
  capacity: 25,
  rows: 5,
  x: 5,
  y: 20,
  width: 20,
  height: 20
};

const GRATIS: TicketTypeGroup = {
  id: "tt-gratis",
  groupId: "gratis",
  name: "Entradas gratis",
  basePrice: 0,
  quantityTotal: 50,
  quantitySold: 0,
  sortOrder: 0,
  color: "#0f766e"
};

const VIP: TicketTypeGroup = {
  id: "tt-vip",
  groupId: "vip",
  name: "VIP",
  basePrice: 2500,
  quantityTotal: 10,
  quantitySold: 0,
  sortOrder: 1,
  color: "#e13d25"
};

const seatsOf = (zone: Zone = ZONE) =>
  buildSeatGrid({ capacity: zone.capacity, width: zone.width, height: zone.height, rows: zone.rows });

/** Mirrors how SeatingPlanSection owns the assignments, so multi-step flows behave for real. */
function Harness({
  initial = {},
  groups = [GRATIS, VIP],
  assignedElsewhereByGroup = {},
  accessible = [],
  onAccessibleChange
}: {
  initial?: SeatAssignments;
  groups?: TicketTypeGroup[];
  assignedElsewhereByGroup?: Record<string, number>;
  accessible?: string[];
  onAccessibleChange?: (next: string[]) => void;
}) {
  const [assignments, setAssignments] = useState<SeatAssignments>(initial);
  const [accessibleSeatIds, setAccessibleSeatIds] = useState<string[]>(accessible);
  return (
    <ZoneSeatEditor
      zone={ZONE}
      seats={seatsOf()}
      assignments={assignments}
      groups={groups}
      assignedElsewhereByGroup={assignedElsewhereByGroup}
      onChange={setAssignments}
      accessibleSeatIds={accessibleSeatIds}
      onAccessibleChange={(next) => {
        setAccessibleSeatIds(next);
        onAccessibleChange?.(next);
      }}
    />
  );
}

const seat = (label: string, suffix = "sin asignar") => screen.getByRole("button", { name: `Asiento ${label} ${suffix}` });
const quantityInput = () => screen.getByLabelText("Asientos de Entradas gratis en Zona 1");

describe("ZoneSeatEditor", () => {
  it("draws every seat of the zone with its physical row and number", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /Asiento A1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Asiento E5/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Asiento/ })).toHaveLength(25);
  });

  it("starts with every seat unassigned", () => {
    render(<Harness />);
    expect(screen.getByText(/25 plazas - 0 asignadas - 25 sin asignar/)).toBeInTheDocument();
  });

  describe("typed quantity", () => {
    it("does not apply anything until it is confirmed", () => {
      render(<Harness />);

      fireEvent.change(quantityInput(), { target: { value: "20" } });

      expect(screen.getByText(/25 plazas - 0 asignadas - 25 sin asignar/)).toBeInTheDocument();
      expect(quantityInput()).toHaveValue(20);
    });

    it("applies the quantity when Enter is pressed", () => {
      render(<Harness />);

      fireEvent.change(quantityInput(), { target: { value: "20" } });
      fireEvent.keyDown(quantityInput(), { key: "Enter" });

      expect(screen.getByText(/25 plazas - 20 asignadas - 5 sin asignar/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" })).toBeInTheDocument();
    });

    it("applies the quantity with the OK button", () => {
      render(<Harness />);

      fireEvent.change(quantityInput(), { target: { value: "12" } });
      fireEvent.click(screen.getByRole("button", { name: "Aplicar cantidad de Entradas gratis" }));

      expect(screen.getByText(/25 plazas - 12 asignadas - 13 sin asignar/)).toBeInTheDocument();
    });

    it("keeps two-digit typing intact instead of reverting between keystrokes", () => {
      render(<Harness />);

      fireEvent.change(quantityInput(), { target: { value: "2" } });
      fireEvent.change(quantityInput(), { target: { value: "20" } });

      expect(quantityInput()).toHaveValue(20);
    });

    it("caps the quantity at what is left of the ticket type across every zone", () => {
      render(<Harness assignedElsewhereByGroup={{ gratis: 40 }} />);

      fireEvent.change(quantityInput(), { target: { value: "25" } });
      fireEvent.keyDown(quantityInput(), { key: "Enter" });

      expect(screen.getByText(/50\/50 en total/)).toBeInTheDocument();
      expect(screen.getByText(/25 plazas - 10 asignadas - 15 sin asignar/)).toBeInTheDocument();
    });

    it("lowering the quantity frees seats again", () => {
      render(<Harness />);

      fireEvent.change(quantityInput(), { target: { value: "20" } });
      fireEvent.keyDown(quantityInput(), { key: "Enter" });
      fireEvent.change(quantityInput(), { target: { value: "12" } });
      fireEvent.keyDown(quantityInput(), { key: "Enter" });

      expect(screen.getByText(/25 plazas - 12 asignadas - 13 sin asignar/)).toBeInTheDocument();
    });
  });

  describe("selecting seats", () => {
    it("assigns a ticket type to several seats at once", () => {
      render(<Harness />);

      fireEvent.click(seat("A1"));
      fireEvent.click(seat("A2"));
      fireEvent.click(seat("B3"));
      fireEvent.click(screen.getByRole("button", { name: "Asignar VIP" }));

      expect(screen.getByRole("button", { name: "Asiento A1 VIP" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asiento A2 VIP" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asiento B3 VIP" })).toBeInTheDocument();
      expect(screen.getByText(/25 plazas - 3 asignadas/)).toBeInTheDocument();
    });

    it("selects a whole row from its label", () => {
      render(<Harness />);

      fireEvent.click(screen.getByRole("button", { name: "Seleccionar la fila C" }));

      expect(screen.getByText("5 asientos seleccionados")).toBeInTheDocument();
    });

    it("clears the ticket type from every selected seat", () => {
      render(<Harness initial={{ "A-1": "gratis", "A-2": "gratis" }} />);

      fireEvent.click(seat("A1", "Entradas gratis"));
      fireEvent.click(seat("A2", "Entradas gratis"));
      fireEvent.click(screen.getByRole("button", { name: "Quitar tipo de entrada" }));

      expect(seat("A1")).toBeInTheDocument();
      expect(seat("A2")).toBeInTheDocument();
    });

    it("deselects a seat when it is clicked again", () => {
      render(<Harness />);

      fireEvent.click(seat("A1"));
      expect(screen.getByText(/Asiento A1/)).toBeInTheDocument();
      fireEvent.click(seat("A1"));

      expect(screen.queryByRole("group", { name: /Acciones sobre los asientos/ })).not.toBeInTheDocument();
    });

    it("never places more of a ticket type than it has left", () => {
      // VIP has 10 in total and 8 are already taken elsewhere, so only 2 of the 5 fit.
      render(<Harness assignedElsewhereByGroup={{ vip: 8 }} />);

      fireEvent.click(screen.getByRole("button", { name: "Seleccionar la fila A" }));
      fireEvent.click(screen.getByRole("button", { name: "Asignar VIP" }));

      expect(screen.getByText(/25 plazas - 2 asignadas - 23 sin asignar/)).toBeInTheDocument();
    });

    it("marks several seats as reduced mobility at once", () => {
      const onAccessibleChange = vi.fn();
      render(<Harness onAccessibleChange={onAccessibleChange} />);

      fireEvent.click(seat("A1"));
      fireEvent.click(seat("A2"));
      fireEvent.click(screen.getByLabelText("Movilidad reducida"));

      expect(onAccessibleChange).toHaveBeenCalledWith(["A-1", "A-2"]);
    });

    it("labels an already reduced-mobility seat as such", () => {
      render(<Harness accessible={["A-1"]} />);
      expect(screen.getByRole("button", { name: "Asiento A1 sin asignar movilidad reducida" })).toBeInTheDocument();
    });
  });

  describe("moving a seat", () => {
    it("moves the ticket type onto a free seat", () => {
      render(<Harness initial={{ "A-1": "gratis" }} />);

      fireEvent.click(seat("A1", "Entradas gratis"));
      fireEvent.click(screen.getByRole("button", { name: "Mover a otro asiento" }));
      expect(screen.getByRole("status")).toHaveTextContent(/Moviendo el asiento A1/);
      fireEvent.click(seat("D4"));

      expect(seat("A1")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asiento D4 Entradas gratis" })).toBeInTheDocument();
    });

    it("swaps the two ticket types when the move lands on an occupied seat", () => {
      render(<Harness initial={{ "A-1": "gratis", "B-2": "vip" }} />);

      fireEvent.click(seat("A1", "Entradas gratis"));
      fireEvent.click(screen.getByRole("button", { name: "Mover a otro asiento" }));
      fireEvent.click(seat("B2", "VIP"));

      expect(screen.getByRole("button", { name: "Asiento A1 VIP" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asiento B2 Entradas gratis" })).toBeInTheDocument();
    });

    it("only offers moving when exactly one seat is selected", () => {
      render(<Harness initial={{ "A-1": "gratis", "A-2": "gratis" }} />);

      fireEvent.click(seat("A1", "Entradas gratis"));
      fireEvent.click(seat("A2", "Entradas gratis"));

      expect(screen.getByRole("button", { name: "Mover a otro asiento" })).toBeDisabled();
    });

    it("lets the organizer cancel a move without touching the plan", () => {
      render(<Harness initial={{ "A-1": "gratis" }} />);

      fireEvent.click(seat("A1", "Entradas gratis"));
      fireEvent.click(screen.getByRole("button", { name: "Mover a otro asiento" }));
      fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Cancelar" }));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" })).toBeInTheDocument();
    });
  });

  // Ticket types are created in the next step of the wizard, so having none here is normal and
  // must not read as an error: the seats are still numbered and usable.
  it("explains that ticket types come later when the event has none yet", () => {
    render(<Harness groups={[]} />);
    expect(screen.getByText(/crea antes los tipos en el paso siguiente/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
