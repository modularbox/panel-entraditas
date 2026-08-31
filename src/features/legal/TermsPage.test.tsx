import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { TermsPage } from "./TermsPage";

describe("TermsPage", () => {
  it("renders the terms and conditions heading and a link back to login", () => {
    render(
      <MemoryRouter>
        <TermsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("heading", { name: "Términos y condiciones" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver" })).toHaveAttribute("href", "/login");
  });
});
