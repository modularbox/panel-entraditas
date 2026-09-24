import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { TicketDesignSection } from "./TicketDesignSection";

function renderSection(eventId: string, onValidationChange?: (saved: boolean) => void) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TicketDesignSection eventId={eventId} onValidationChange={onValidationChange} />
    </QueryClientProvider>
  );
}

describe("TicketDesignSection", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("prefills the form from the default design and renders the A4 preview with sample data", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const { container } = renderSection("event-2");

    expect(await screen.findByLabelText("Tipografía")).toHaveValue("Inter");
    expect(screen.getByLabelText(/Datos del titular/)).toBeChecked();
    expect(screen.getByText("Términos y Condiciones Generales")).toBeInTheDocument();
    expect(screen.getByText(/Los datos del asistente/)).toBeInTheDocument();
    expect(screen.getByText("Datos de ejemplo")).toBeInTheDocument();
    expect(container.querySelector("svg")).not.toBeNull(); // QR de la vista previa
    // La información del evento sale del propio evento, no del diseño.
    expect(await screen.findByText("Entrada: Rock en Directo")).toBeInTheDocument();
    expect(screen.getByText("Rock en Directo")).toBeInTheDocument(); // bloque Evento
  });

  it("lets the user toggle a block and save it to the event", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    renderSection("event-2");

    fireEvent.click(await screen.findByRole("checkbox", { name: /Código QR/ }));
    expect(screen.getByRole("checkbox", { name: /Código QR/ })).not.toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "Guardar diseño" }));

    expect(await screen.findByText("Diseño de la entrada guardado.")).toBeInTheDocument();
    await waitFor(() => {
      expect(db.events.find((e) => e.id === "event-2")!.ticketDesign?.mostrarQR).toBe(false);
    });
  });

  it("reports the design as not saved until it is saved, then as saved", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const onValidationChange = vi.fn();
    renderSection("event-2", onValidationChange);

    await screen.findByLabelText("Tipografía");
    await waitFor(() => expect(onValidationChange).toHaveBeenCalledWith(false));

    fireEvent.click(screen.getByRole("button", { name: "Guardar diseño" }));
    await screen.findByText("Diseño de la entrada guardado.");
    await waitFor(() => expect(onValidationChange).toHaveBeenCalledWith(true));
  });

  it("hides the QR and PIN from the preview when their blocks are disabled", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    const { container } = renderSection("event-2");

    const qrToggle = await screen.findByRole("checkbox", { name: /Código QR/ });
    fireEvent.click(qrToggle);
    fireEvent.click(screen.getByRole("checkbox", { name: /PIN de acceso/ }));

    await waitFor(() => {
      expect(screen.queryByText("Introduzca este PIN en el teclado del acceso.")).not.toBeInTheDocument();
    });
    await waitFor(() => {
      expect(container.querySelector("svg")).toBeNull();
    });
    // El bloque legal y los datos del titular siguen viéndose.
    expect(screen.getByText("Términos y Condiciones Generales")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Datos del titular/ })).toBeChecked();
  });
});