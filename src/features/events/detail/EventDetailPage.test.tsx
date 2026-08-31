import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { demoPasswordFor, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { EventDetailPage } from "./EventDetailPage";

async function renderDetail(id = "event-1") {
  await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/eventos/${id}`]}>
        <Routes>
          <Route path="/eventos/:id" element={<EventDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("EventDetailPage", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("renders the event tabs", async () => {
    await renderDetail();
    expect(await screen.findByRole("heading", { name: /noche de jazz/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /informacion general/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /codigos de descuento/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /puertas/i })).toBeInTheDocument();
  });
});
