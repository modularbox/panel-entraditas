import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Event } from "@entraditas/types";
import { EventStatusBadge } from "./EventStatusBadge";

const cases: { status: Event["status"]; label: string; border: string; bg: string; text: string }[] = [
  { status: "draft", label: "Borrador", border: "border-status-draft", bg: "bg-status-draft-bg", text: "text-status-draft" },
  { status: "published", label: "Publicado", border: "border-status-published", bg: "bg-status-published-bg", text: "text-status-published" },
  { status: "on_sale", label: "A la venta", border: "border-status-on-sale", bg: "bg-status-on-sale-bg", text: "text-status-on-sale" },
  { status: "sold_out", label: "Agotado", border: "border-status-sold-out", bg: "bg-status-sold-out-bg", text: "text-status-sold-out" },
  { status: "paused", label: "Pausado", border: "border-status-paused", bg: "bg-status-paused-bg", text: "text-status-paused" },
  { status: "finished", label: "Finalizado", border: "border-status-finished", bg: "bg-status-finished-bg", text: "text-status-finished" },
  { status: "cancelled", label: "Cancelado", border: "border-status-cancelled", bg: "bg-status-cancelled-bg", text: "text-status-cancelled" }
];

describe("EventStatusBadge", () => {
  it.each(cases)("renders $label with the $status color tokens", ({ status, label, border, bg, text }) => {
    render(<EventStatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass("inline-block", "rounded-pill", "border-2", "font-bold", "uppercase");
    expect(badge).toHaveClass(border, bg, text);
  });
});