import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { demoPasswordFor, resetDb } from "@/mocks/state";
import { server } from "@/mocks/server";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { Step1BasicInfo, type Step1BasicInfoProps } from "./Step1BasicInfo";

function renderStep1(props: Step1BasicInfoProps) {
  const queryClient = new QueryClient();
  const utils = render(
    <QueryClientProvider client={queryClient}>
      <Step1BasicInfo {...props} />
    </QueryClientProvider>
  );
  return { ...utils, queryClient };
}

function fillRequiredLocation() {
  fireEvent.change(screen.getByLabelText(/Ubicaci.n/), { target: { value: "Teatro Principal" } });
  fireEvent.change(screen.getByLabelText("Localidad"), { target: { value: "Alicante" } });
}

function fillDescription(value: string) {
  const editor = screen.getByRole("textbox", { name: /Descripci.n/ });
  editor.innerHTML = `<p>${value}</p>`;
  fireEvent.input(editor);
}

describe("Step1BasicInfo", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  it("shows a validation error when the title is too short", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    const onSaved = vi.fn();
    const goNext = vi.fn();
    renderStep1({ eventId: null, onSaved, goNext });

    fireEvent.change(screen.getByLabelText(/T.tulo/), { target: { value: "Hi" } });
    fillDescription("Una descripcion");
    fillRequiredLocation();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(screen.getByText(/El t.tulo debe tener al menos 3 caracteres/)).toBeInTheDocument());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("creates a draft event on first submit and advances to the next step", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    const onSaved = vi.fn();
    const goNext = vi.fn();
    renderStep1({ eventId: null, onSaved, goNext });

    fireEvent.change(screen.getByLabelText(/T.tulo/), { target: { value: "Concierto de prueba" } });
    fillDescription("Una descripcion valida");
    fillRequiredLocation();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.any(String)));
    expect(goNext).toHaveBeenCalledOnce();
  });

  it("patches the existing draft when eventId is already set", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    const onSaved = vi.fn();
    const goNext = vi.fn();
    renderStep1({ eventId: "event-5", onSaved, goNext });

    await waitFor(() => expect(screen.getByLabelText(/T.tulo/)).toHaveValue("Evento sin configurar"));
    fireEvent.change(screen.getByLabelText(/T.tulo/), { target: { value: "Titulo editado" } });
    fillDescription("Descripcion editada");
    fillRequiredLocation();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("event-5"));
  });

  it("pre-fills the form from the existing event when resuming a draft (e.g. after a page refresh)", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    renderStep1({ eventId: "event-3", onSaved: vi.fn(), goNext: vi.fn() });

    await waitFor(() => expect(screen.getByLabelText(/T.tulo/)).toHaveValue("La Casa de Bernarda Alba"));
    expect(screen.getByRole("textbox", { name: /Descripci.n/ })).toHaveTextContent("Obra de teatro con funciones semanales.");
  });

  it("keeps in-progress edits when the pre-fill fetch resolves after the user has started typing", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    const { queryClient } = renderStep1({ eventId: "event-3", onSaved: vi.fn(), goNext: vi.fn() });

    fireEvent.change(screen.getByLabelText(/T.tulo/), { target: { value: "Editado antes de que cargue" } });

    await waitFor(() => {
      expect(queryClient.getQueryState(["event", "event-3"])?.status).toBe("success");
    });

    expect(screen.getByLabelText(/T.tulo/)).toHaveValue("Editado antes de que cargue");
  });

  it("shows an alert and does not advance when saving fails", async () => {
    await useSessionStore.getState().login("admin@entraditas.com", demoPasswordFor("admin@entraditas.com"));
    server.use(
      http.post("http://localhost:4000/api/v1/events", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION_ERROR", message: "No se pudo guardar el evento", requestId: "req_fail" } },
          { status: 422 }
        )
      )
    );
    const onSaved = vi.fn();
    const goNext = vi.fn();
    renderStep1({ eventId: null, onSaved, goNext });

    fireEvent.change(screen.getByLabelText(/T.tulo/), { target: { value: "Concierto de prueba" } });
    fillDescription("Una descripcion valida");
    fillRequiredLocation();
    fireEvent.click(screen.getByRole("button", { name: "Guardar y continuar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("No se pudo guardar el evento"));
    expect(onSaved).not.toHaveBeenCalled();
    expect(goNext).not.toHaveBeenCalled();
  });
});
