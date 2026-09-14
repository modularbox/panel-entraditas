import { afterEach, describe, expect, it } from "vitest";
import { borrarBorrador, describirGuardado, guardarBorrador, leerBorrador } from "./eventDraft";

afterEach(() => borrarBorrador());

describe("el borrador de un evento a medio escribir", () => {
  it("guarda y devuelve lo que se estaba escribiendo", () => {
    guardarBorrador(null, { title: "Concierto de otoño", locality: "Albacete" });
    expect(leerBorrador(null)?.valores).toEqual({ title: "Concierto de otoño", locality: "Albacete" });
  });

  it("no saca el borrador de un evento en otro: cada uno es el suyo", () => {
    guardarBorrador("event-1", { title: "Uno" });
    expect(leerBorrador("event-2")).toBeNull();
    expect(leerBorrador(null)).toBeNull();
    expect(leerBorrador("event-1")?.valores).toEqual({ title: "Uno" });
  });

  it("se borra cuando el evento ya se ha guardado de verdad", () => {
    guardarBorrador(null, { title: "Uno" });
    borrarBorrador();
    expect(leerBorrador(null)).toBeNull();
  });

  // Una portada y una galeria en data URL ocupan megas y localStorage tiene unos 5 MB para todo.
  // Vale mas recuperar el texto y volver a adjuntar la imagen que no recuperar nada.
  it("suelta las imagenes antes que perder el texto, y lo dice", () => {
    const enorme = `data:image/png;base64,${"A".repeat(900_000)}`;
    guardarBorrador(null, { title: "Con portada", coverImageUrl: enorme, gallery: enorme });

    const borrador = leerBorrador(null)!;
    expect(borrador.valores).toEqual({ title: "Con portada" });
    expect(borrador.imagenesOmitidas).toBe(true);
  });

  it("con una portada pequena se guarda entera", () => {
    guardarBorrador(null, { title: "Con portada", coverImageUrl: "https://ejemplo/portada.jpg" });
    const borrador = leerBorrador(null)!;
    expect(borrador.valores.coverImageUrl).toBe("https://ejemplo/portada.jpg");
    expect(borrador.imagenesOmitidas).toBe(false);
  });

  it("no se cree cualquier cosa que haya en el almacenamiento", () => {
    localStorage.setItem("entraditas.panel.borradorEvento", "{no es json");
    expect(leerBorrador(null)).toBeNull();
  });
});

describe("describirGuardado", () => {
  const ahora = new Date("2026-09-14T17:30:00");

  it("lo recien guardado es 'hace un momento'", () => {
    expect(describirGuardado("2026-09-14T17:29:40", ahora)).toBe("hace un momento");
  });

  it("cuenta los minutos", () => {
    expect(describirGuardado("2026-09-14T17:18:00", ahora)).toBe("hace 12 minutos");
  });

  it("pasada una hora, dice la hora del dia", () => {
    expect(describirGuardado("2026-09-14T09:05:00", ahora)).toBe("hoy a las 09:05");
  });

  it("de otro dia, tambien la fecha", () => {
    expect(describirGuardado("2026-09-12T22:40:00", ahora)).toBe("el 12/09 a las 22:40");
  });

  it("con una fecha ilegible no inventa nada raro", () => {
    expect(describirGuardado("cualquier cosa", ahora)).toBe("hace un momento");
  });
});
