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

/** Mirrors how SeatingPlanSection owns the assignments, so multi-step flows behave for real. */
function Harness({
  initial = {},
  groups = [GRATIS, VIP],
  assignedElsewhereByGroup = {}
}: {
  initial?: SeatAssignments;
  groups?: TicketTypeGroup[];
  assignedElsewhereByGroup?: Record<string, number>;
}) {
  const [assignments, setAssignments] = useState<SeatAssignments>(initial);
  return (
    <ZoneSeatEditor
      zone={ZONE}
      seats={buildSeatGrid({ capacity: ZONE.capacity, width: ZONE.width, height: ZONE.height, rows: ZONE.rows })}
      assignments={assignments}
      groups={groups}
      assignedElsewhereByGroup={assignedElsewhereByGroup}
      onChange={setAssignments}
    />
  );
}

describe("ZoneSeatEditor", () => {
  it("draws every seat of the zone with its physical row and number", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: /Asiento A1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Asiento E5/ })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Asiento/ })).toHaveLength(25);
  });

  it("starts with every seat unassigned", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Asiento A1 sin asignar" })).toBeInTheDocument();
    expect(screen.getByText(/25 plazas - 0 asignadas - 25 sin asignar/)).toBeInTheDocument();
  });

  it("places the typed quantity on the plan and leaves the rest unassigned", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Asientos de Entradas gratis en Zona 1"), { target: { value: "20" } });

    expect(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" })).toBeInTheDocument();
    expect(screen.getByText(/25 plazas - 20 asignadas - 5 sin asignar/)).toBeInTheDocument();
    expect(screen.getByText(/20\/50 en total/)).toBeInTheDocument();
  });

  it("counts the seats the other zones already took against the ticket type's total", () => {
    render(<Harness assignedElsewhereByGroup={{ gratis: 10 }} />);

    fireEvent.change(screen.getByLabelText("Asientos de Entradas gratis en Zona 1"), { target: { value: "20" } });

    expect(screen.getByText(/30\/50 en total/)).toBeInTheDocument();
  });

  it("caps the quantity at what is left of the ticket type across every zone", () => {
    render(<Harness assignedElsewhereByGroup={{ gratis: 40 }} />);

    // 50 total - 40 taken elsewhere leaves room for 10 here, even though the zone has 25 seats.
    fireEvent.change(screen.getByLabelText("Asientos de Entradas gratis en Zona 1"), { target: { value: "25" } });

    expect(screen.getByText(/50\/50 en total/)).toBeInTheDocument();
    expect(screen.getByText(/25 plazas - 10 asignadas - 15 sin asignar/)).toBeInTheDocument();
  });

  it("assigns a single seat with the active ticket type when clicking a free seat", () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Pintar asientos con VIP" }));
    fireEvent.click(screen.getByRole("button", { name: "Asiento B2 sin asignar" }));

    expect(screen.getByRole("button", { name: "Asiento B2 VIP" })).toBeInTheDocument();
  });

  it("removes the ticket type from a seat", () => {
    render(<Harness initial={{ "A-1": "gratis" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar tipo de entrada" }));

    expect(screen.getByRole("button", { name: "Asiento A1 sin asignar" })).toBeInTheDocument();
  });

  it("changes a seat's ticket type", () => {
    render(<Harness initial={{ "A-1": "gratis" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" }));
    fireEvent.change(screen.getByLabelText("Cambiar a"), { target: { value: "vip" } });

    expect(screen.getByRole("button", { name: "Asiento A1 VIP" })).toBeInTheDocument();
  });

  it("moves a seat's ticket type onto a free seat of the organizer's choice", () => {
    render(<Harness initial={{ "A-1": "gratis" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover a otro asiento" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Moviendo el asiento A1/);
    fireEvent.click(screen.getByRole("button", { name: "Asiento D4 sin asignar" }));

    expect(screen.getByRole("button", { name: "Asiento A1 sin asignar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asiento D4 Entradas gratis" })).toBeInTheDocument();
  });

  it("swaps the two ticket types when a move lands on an occupied seat", () => {
    render(<Harness initial={{ "A-1": "gratis", "B-2": "vip" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover a otro asiento" }));
    fireEvent.click(screen.getByRole("button", { name: "Asiento B2 VIP" }));

    expect(screen.getByRole("button", { name: "Asiento A1 VIP" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asiento B2 Entradas gratis" })).toBeInTheDocument();
  });

  it("lets the organizer cancel a move without touching the plan", () => {
    render(<Harness initial={{ "A-1": "gratis" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" }));
    fireEvent.click(screen.getByRole("button", { name: "Mover a otro asiento" }));
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" })).toBeInTheDocument();
  });

  it("lowering the quantity frees seats again", () => {
    render(<Harness />);
    const input = screen.getByLabelText("Asientos de Entradas gratis en Zona 1");

    fireEvent.change(input, { target: { value: "20" } });
    fireEvent.change(input, { target: { value: "12" } });

    expect(screen.getByText(/25 plazas - 12 asignadas - 13 sin asignar/)).toBeInTheDocument();
  });

  it("marks a seat as reduced mobility from the seat's own actions", () => {
    const onAccessibleChange = vi.fn();
    render(
      <ZoneSeatEditor
        zone={ZONE}
        seats={buildSeatGrid({ capacity: ZONE.capacity, width: ZONE.width, height: ZONE.height, rows: ZONE.rows })}
        assignments={{ "A-1": "gratis" }}
        groups={[GRATIS, VIP]}
        assignedElsewhereByGroup={{}}
        onChange={() => {}}
        accessibleSeatIds={[]}
        onAccessibleChange={onAccessibleChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Asiento A1 Entradas gratis" }));
    fireEvent.click(screen.getByLabelText("Movilidad reducida"));

    expect(onAccessibleChange).toHaveBeenCalledWith(["A-1"]);
  });

  it("labels an already reduced-mobility seat as such", () => {
    render(
      <ZoneSeatEditor
        zone={ZONE}
        seats={buildSeatGrid({ capacity: ZONE.capacity, width: ZONE.width, height: ZONE.height, rows: ZONE.rows })}
        assignments={{ "A-1": "gratis" }}
        groups={[GRATIS, VIP]}
        assignedElsewhereByGroup={{}}
        onChange={() => {}}
        accessibleSeatIds={["A-1"]}
        onAccessibleChange={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: "Asiento A1 Entradas gratis movilidad reducida" })).toBeInTheDocument();
  });

  it("lets a free seat be marked as reduced mobility too", () => {
    const onAccessibleChange = vi.fn();
    render(
      <ZoneSeatEditor
        zone={ZONE}
        seats={buildSeatGrid({ capacity: ZONE.capacity, width: ZONE.width, height: ZONE.height, rows: ZONE.rows })}
        assignments={{}}
        groups={[]}
        assignedElsewhereByGroup={{}}
        onChange={() => {}}
        accessibleSeatIds={[]}
        onAccessibleChange={onAccessibleChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Asiento C3 sin asignar" }));
    fireEvent.click(screen.getByLabelText("Movilidad reducida"));

    expect(onAccessibleChange).toHaveBeenCalledWith(["C-3"]);
  });

  it("asks for a ticket type first when the event has none", () => {
    render(<Harness groups={[]} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/Crea primero un tipo de entrada/);
  });
});
