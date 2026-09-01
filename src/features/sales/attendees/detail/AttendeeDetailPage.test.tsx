import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AttendeeDetailPage } from "./AttendeeDetailPage";

function renderDetail(email: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/ventas/asistentes/${encodeURIComponent(email)}`]}>
        <Routes>
          <Route path="/ventas/asistentes/:email" element={<AttendeeDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AttendeeDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows the attendee's metrics and order history", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("diego.molina@example.com");
    expect(await screen.findByRole("heading", { name: "Diego Molina" })).toBeInTheDocument();
    expect(screen.getByText("0,00 €")).toBeInTheDocument(); // fully refunded, net spend 0
    expect(await screen.findByText("PED-2026-0004")).toBeInTheDocument();
  });

  it("shows a not-found message for an email with no qualifying orders", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderDetail("lucia.fernandez@example.com"); // only a pending order
    expect(await screen.findByText("Asistente no encontrado.")).toBeInTheDocument();
  });
});
