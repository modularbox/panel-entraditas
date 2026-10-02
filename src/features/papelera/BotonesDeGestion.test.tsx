import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoleSlug } from "@entraditas/types";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { AvisoGlobal, useAvisoGlobal } from "@/shared/ui/AvisoGlobal";
import { EliminarEvento, GestionCliente, GestionOrganizacion } from "./BotonesDeGestion";

function pintar(contenido: React.ReactNode, rol: RoleSlug = "superadmin") {
  useSessionStore.setState({
    token: "token-de-prueba",
    user: { id: "usr-1", email: "quien@entraditas.com", fullName: "Quien Mira", role: rol, organizationId: null },
    effectivePermissions: new Set<string>(),
    eventScopes: []
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AvisoGlobal />
        {contenido}
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Eliminar y bloquear", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useAvisoGlobal.setState({ aviso: null });
  });

  it("eliminar un evento pide confirmación y lo manda a la papelera", async () => {
    const borrar = vi.spyOn(apiClient, "delete").mockResolvedValue({ ok: true });
    pintar(<EliminarEvento id="ev-1" titulo="Noche de Jazz" />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(screen.getByText(/Va a la papelera/)).toBeInTheDocument();
    expect(borrar).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Sí, a la papelera" }));

    await waitFor(() => expect(borrar).toHaveBeenCalledWith("/events/ev-1", { token: "token-de-prueba" }));
    expect(await screen.findByText('"Noche de Jazz" está en la papelera.')).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver la papelera" })).toHaveAttribute("href", "/papelera");
  });

  it("si la API lo rechaza, lo dice y no se cierra", async () => {
    vi.spyOn(apiClient, "delete").mockRejectedValue(new AppError("FORBIDDEN", "Tu cuenta no puede eliminar ni restaurar nada."));
    pintar(<EliminarEvento id="ev-1" titulo="Noche de Jazz" />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, a la papelera" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Tu cuenta no puede eliminar ni restaurar nada.");
    expect(screen.getByRole("button", { name: "Sí, a la papelera" })).toBeInTheDocument();
  });

  it("el suborganizador no ve el botón", () => {
    pintar(<EliminarEvento id="ev-1" titulo="Noche de Jazz" />, "suborganizador");
    expect(screen.queryByRole("button", { name: "Eliminar" })).not.toBeInTheDocument();
  });

  // Bloquear y eliminar clientes u organizaciones es de la plataforma entera: solo el superadmin.
  it("al organizador no le ofrece bloquear clientes ni organizaciones", () => {
    pintar(
      <>
        <GestionCliente email="ana@ejemplo.es" nombre="Ana" bloqueado={false} />
        <GestionOrganizacion id="org-1" nombre="Sur Live" bloqueado={false} />
      </>,
      "organizador"
    );
    expect(screen.queryByRole("button", { name: "Bloquear" })).not.toBeInTheDocument();
  });

  it("bloquea un cliente por su correo", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });
    pintar(<GestionCliente email="ana@ejemplo.es" nombre="Ana" bloqueado={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Bloquear" }));
    expect(screen.getByText(/No podrá entrar en entraditas.com ni comprar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sí, bloquear" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/customers/ana%40ejemplo.es/block", undefined, { token: "token-de-prueba" }));
  });

  it("una organización bloqueada ofrece desbloquearla", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({ ok: true });
    pintar(<GestionOrganizacion id="org-1" nombre="Sur Live" bloqueado />);

    fireEvent.click(screen.getByRole("button", { name: "Desbloquear" }));
    fireEvent.click(screen.getByRole("button", { name: "Sí, desbloquear" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/organizations/org-1/unblock", undefined, { token: "token-de-prueba" }));
  });
});
