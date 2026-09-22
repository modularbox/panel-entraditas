import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { PanelLayout } from "./PanelLayout";

/** Una pantalla cualquiera que pide datos, para ver si el botón la hace volver a pedirlos. */
function PantallaConDatos({ traer }: { traer: () => Promise<string> }) {
  const { data } = useQuery({ queryKey: ["algo"], queryFn: traer });
  return <p>Valor: {data ?? "…"}</p>;
}

function pintar(traer: () => Promise<string>) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/eventos"]}>
        <Routes>
          <Route element={<PanelLayout />}>
            <Route path="/eventos" element={<PantallaConDatos traer={traer} />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Actualizar información", () => {
  afterEach(() => {
    resetDb();
    localStorage.clear();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle", impersonatorToken: null });
  });

  /**
   * Lo que pidió Axel: volver a leer de la base sin recargar la página entera. Antes la única
   * forma era F5, y recargar en cualquier pantalla del panel daba un 404 de Apache.
   */
  it("vuelve a pedir los datos de la pantalla sin recargar", async () => {
    let vuelta = 0;
    const traer = vi.fn(async () => `dato-${++vuelta}`);
    pintar(traer);

    await waitFor(() => expect(screen.getByText("Valor: dato-1")).toBeInTheDocument());
    expect(traer).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Actualizar información" }));

    await waitFor(() => expect(screen.getByText("Valor: dato-2")).toBeInTheDocument());
    expect(traer).toHaveBeenCalledTimes(2);
  });

  /**
   * Con `clear()` la cache se tira entera y la pantalla se queda en blanco mientras vuelve a
   * pedir, que se lee como que el panel se ha roto. Lo de antes tiene que seguir puesto hasta que
   * llegue lo nuevo.
   */
  it("no deja la pantalla en blanco mientras llega lo nuevo", async () => {
    let resolver: ((valor: string) => void) | null = null;
    let vuelta = 0;
    const traer = vi.fn(() => {
      vuelta++;
      if (vuelta === 1) return Promise.resolve("dato-1");
      return new Promise<string>((res) => { resolver = res; });
    });
    pintar(traer);

    await waitFor(() => expect(screen.getByText("Valor: dato-1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Actualizar información" }));

    // A mitad de la actualizacion, lo de antes sigue en pantalla.
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizando…" })).toBeInTheDocument());
    expect(screen.getByText("Valor: dato-1")).toBeInTheDocument();

    resolver!("dato-2");
    await waitFor(() => expect(screen.getByText("Valor: dato-2")).toBeInTheDocument());
  });

  it("mientras actualiza no se puede volver a pulsar", async () => {
    let resolver: ((valor: string) => void) | null = null;
    let vuelta = 0;
    const traer = vi.fn(() => {
      vuelta++;
      if (vuelta === 1) return Promise.resolve("dato-1");
      return new Promise<string>((res) => { resolver = res; });
    });
    pintar(traer);

    await waitFor(() => expect(screen.getByText("Valor: dato-1")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Actualizar información" }));

    const boton = await screen.findByRole("button", { name: "Actualizando…" });
    expect(boton).toBeDisabled();

    resolver!("dato-2");
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualizar información" })).toBeEnabled());
  });

  it("lo tiene cualquiera, no solo el superadmin", async () => {
    await useSessionStore.getState().login("javier.ortega@entraditas.com", "javier1234");
    pintar(async () => "x");

    expect(screen.getByRole("button", { name: "Actualizar información" })).toBeInTheDocument();
  });
});
