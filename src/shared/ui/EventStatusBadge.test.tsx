import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Event } from "@entraditas/types";
import { EventStatusBadge } from "./EventStatusBadge";

const cases: { status: Event["status"]; label: string; border: string; bg: string; text: string }[] = [
  { status: "draft", label: "Borrador", border: "border-status-draft", bg: "bg-status-draft-bg", text: "text-status-draft" },
  { status: "pending_review", label: "En revisión", border: "border-status-published", bg: "bg-status-published-bg", text: "text-status-published" },
  { status: "published", label: "Publicado", border: "border-status-published", bg: "bg-status-published-bg", text: "text-status-published" },
  { status: "rejected", label: "Rechazado", border: "border-status-cancelled", bg: "bg-status-cancelled-bg", text: "text-status-cancelled" },
  { status: "finished", label: "Finalizado", border: "border-status-finished", bg: "bg-status-finished-bg", text: "text-status-finished" }
];

describe("EventStatusBadge", () => {
  it.each(cases)("renders $label with the $status color tokens", ({ status, label, border, bg, text }) => {
    render(<EventStatusBadge status={status} />);
    const badge = screen.getByText(label);
    expect(badge).toHaveClass("inline-block", "rounded-pill", "border-2", "font-bold", "uppercase");
    expect(badge).toHaveClass(border, bg, text);
  });
});