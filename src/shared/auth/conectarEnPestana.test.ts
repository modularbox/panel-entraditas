import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { abrirPestanaDeConexion, consumirConexionEnPestana, limpiarTraspasosCaducados } from "./conectarEnPestana";

const NONCE = "11111111-2222-3333-4444-555555555555";
const CLAVE = `entraditas.panel.conexion.${NONCE}`;
const URL_CON_TRASPASO = `/conectar?llave=${NONCE}`;
const TOKEN_DE_PESTANA = "entraditas.panel.apiToken.pestana";
const TOKEN_COMPARTIDO = "entraditas.panel.apiToken";

const SESION = {
  token: "organizer-token",
  user: { id: "org-1", email: "org@example.com", fullName: "Organizador", role: "organizador" as const, organizationId: "org-1" }
};

function traspaso(creadoEn = Date.now()) {
  return JSON.stringify({ token: "organizer-token", session: SESION, creadoEn });
}

/** La pestana en blanco que devuelve `window.open`, con lo que el modulo le toca. */
function pestanaFalsa() {
  return {
    opener: {} as unknown,
    document: { title: "", body: { innerHTML: "" } },
    location: { replace: vi.fn() },
    close: vi.fn()
  };
}

function poner(url: string, contenido?: string) {
  window.history.replaceState(null, "", url);
  if (contenido !== undefined) localStorage.setItem(CLAVE, contenido);
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/organizaciones");
  vi.spyOn(crypto, "randomUUID").mockReturnValue(NONCE);
});

afterEach(() => vi.restoreAllMocks());

describe("abrirPestanaDeConexion", () => {
  it("pide la pestana de golpe y en blanco, sin pedirle nada todavia", () => {
    // Que no lleve ruta es lo importante: si se abriera ya en /conectar, llegaria antes de que el
    // traspaso este escrito y se encontraria la pagina sin sesion.
    const abrir = vi.spyOn(window, "open").mockReturnValue(pestanaFalsa() as unknown as Window);

    abrirPestanaDeConexion();

    expect(abrir).toHaveBeenCalledWith("", "_blank");
  });

  it("corta la referencia al reves, que si no la pestana nueva podria mandar en esta", () => {
    const pestana = pestanaFalsa();
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);

    abrirPestanaDeConexion();

    expect(pestana.opener).toBeNull();
  });

  it("enseña algo mientras llega la sesion, para que la pestana no parezca rota", () => {
    const pestana = pestanaFalsa();
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);

    abrirPestanaDeConexion();

    expect(pestana.document.title).toBe("Conectando...");
    expect(pestana.document.body.innerHTML).toContain("Abriendo el panel");
  });

  it("avisa en vez de fingir, si el navegador no deja abrir la pestana", () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    expect(abrirPestanaDeConexion()).toBeNull();
  });

  it("navega a /conectar con el nonce cuando por fin llega la sesion", () => {
    const pestana = pestanaFalsa();
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);

    abrirPestanaDeConexion()!.conectar(SESION);

    expect(pestana.location.replace).toHaveBeenCalledWith(URL_CON_TRASPASO);
    expect(JSON.parse(localStorage.getItem(CLAVE)!).token).toBe("organizer-token");
  });

  it("cierra la pestana en blanco si la sesion llega sin token", () => {
    const pestana = pestanaFalsa();
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);

    abrirPestanaDeConexion()!.conectar({ user: SESION.user });

    expect(pestana.close).toHaveBeenCalled();
    expect(pestana.location.replace).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it("cerrar() manda a la pestana en blanco al canasto", () => {
    const pestana = pestanaFalsa();
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);

    abrirPestanaDeConexion()!.cerrar();

    expect(pestana.close).toHaveBeenCalled();
  });

  it("aguanta que la pestana no deje tocarse al abrirla", () => {
    const pestana = pestanaFalsa();
    Object.defineProperty(pestana.document, "title", {
      get: () => "solo lectura",
      set: () => {
        throw new Error("acceso denegado");
      }
    });
    vi.spyOn(window, "open").mockReturnValue(pestana as unknown as Window);

    // Lo que no se puede no es motivo para que "Conectar" deje de funcionar.
    expect(abrirPestanaDeConexion()).not.toBeNull();
    expect(pestana.close).not.toHaveBeenCalled();
  });
});

describe("consumirConexionEnPestana", () => {
  it("guarda el token en el sessionStorage de ESTA pestana, sin tocar el compartido", () => {
    localStorage.setItem(TOKEN_COMPARTIDO, "superadmin-token");
    poner(URL_CON_TRASPASO, traspaso());

    expect(consumirConexionEnPestana()?.token).toBe("organizer-token");
    expect(sessionStorage.getItem(TOKEN_DE_PESTANA)).toBe("organizer-token");
    // Lo del superadmin sigue intacto en localStorage: es lo que hace que sobreviva su pestana.
    expect(localStorage.getItem(TOKEN_COMPARTIDO)).toBe("superadmin-token");
  });

  it("gasta el traspaso: un segundo intento con la misma llave no encuentra nada", () => {
    poner(URL_CON_TRASPASO, traspaso());
    consumirConexionEnPestana();

    sessionStorage.clear();
    window.history.replaceState(null, "", URL_CON_TRASPASO);

    expect(consumirConexionEnPestana()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_DE_PESTANA)).toBeNull();
  });

  it("quita la llave de la URL para que no se pueda reutilizar con el boton de atras", () => {
    poner(`/conectar?llave=${NONCE}&otro=1`, traspaso());

    consumirConexionEnPestana();

    expect(window.location.href).not.toContain("llave");
    // Lo que no era del traspaso se respeta.
    expect(window.location.href).toContain("otro=1");
  });

  it("no hace nada en una visita normal, sin llave en la URL", () => {
    window.history.replaceState(null, "", "/organizaciones");

    expect(consumirConexionEnPestana()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it("rechaza un traspaso caducado", () => {
    poner(URL_CON_TRASPASO, traspaso(Date.now() - 10 * 60 * 1000));

    expect(consumirConexionEnPestana()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_DE_PESTANA)).toBeNull();
  });

  it("no se fia de una llave puesta a mano que no corresponde a ningun traspaso", () => {
    window.history.replaceState(null, "", "/conectar?llave=inventada");

    expect(consumirConexionEnPestana()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_DE_PESTANA)).toBeNull();
  });

  it("aguanta un traspaso con basura guardada debajo", () => {
    poner(URL_CON_TRASPASO, "{esto no es json");

    expect(consumirConexionEnPestana()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_DE_PESTANA)).toBeNull();
  });
});

describe("limpiarTraspasosCaducados", () => {
  it("se lleva los traspasos viejos y deja los que todavia estan en plazo", () => {
    localStorage.setItem("entraditas.panel.conexion.viejo", traspaso(Date.now() - 10 * 60 * 1000));
    localStorage.setItem("entraditas.panel.conexion.fresco", traspaso());
    localStorage.setItem("entraditas.panel.conexion.basura", "no soy un traspaso");
    // Esto no es un traspaso: no se toca.
    localStorage.setItem(TOKEN_COMPARTIDO, "superadmin-token");

    limpiarTraspasosCaducados();

    expect(localStorage.getItem("entraditas.panel.conexion.viejo")).toBeNull();
    expect(localStorage.getItem("entraditas.panel.conexion.basura")).toBeNull();
    expect(localStorage.getItem("entraditas.panel.conexion.fresco")).not.toBeNull();
    expect(localStorage.getItem(TOKEN_COMPARTIDO)).toBe("superadmin-token");
  });
});