import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import type { TicketDesign } from "@entraditas/types";
import { formatTicketDate, formatTicketTime } from "@/features/ticketDesign/format";
import {
  TICKET_DESIGN_COLOR_PRIMARIO,
  TICKET_DESIGN_TERMINOS_POR_DEFECTO,
  defaultTicketDesign
} from "./ticketDesign";

describe("ticket design handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("admin@entraditas.com", "admin1234");
    return useSessionStore.getState().token!;
  }

  it("formats dates and times as day/month/year and hour:minute h", () => {
    expect(formatTicketDate("2026-08-28T13:00:00.000Z")).toBe("28/08/2026");
    expect(formatTicketTime("2026-08-28T13:00:00.000Z")).toBe("13:00 h");
    expect(formatTicketDate(null)).toBe("");
  });

  it("builds a default institutional design with all blocks enabled and no ticket data", () => {
    const design = defaultTicketDesign();

    expect(design.colorPrimario).toBe(TICKET_DESIGN_COLOR_PRIMARIO);
    expect(design.fuente).toBe("Inter");
    expect(design.opacidadMarcaAgua).toBeLessThanOrEqual(0.08);
    expect(design.mostrarInformacion).toBe(true);
    expect(design.mostrarQR).toBe(true);
    expect(design.mostrarPIN).toBe(true);
    expect(design.mostrarSesion).toBe(true);
    expect(design.mostrarTerminos).toBe(true);
    expect(design).not.toHaveProperty("titular");
    expect(design).not.toHaveProperty("evento");
    expect(design.terminos).toEqual(TICKET_DESIGN_TERMINOS_POR_DEFECTO);
    expect(design.pie).toContain("Verificación segura");
  });

  it("returns the default design on first read and persists a saved one afterwards", async () => {
    const token = await login();
    const initial = await apiClient.get<TicketDesign>("/events/event-2/ticket-design", { token });
    expect(initial.colorPrimario).toBe(TICKET_DESIGN_COLOR_PRIMARIO);

    const saved: TicketDesign = {
      ...initial,
      colorPrimario: "#0d6e6e",
      mostrarQR: false,
      mostrarPIN: false
    };
    const returned = await apiClient.put<TicketDesign>("/events/event-2/ticket-design", saved, { token });
    expect(returned.colorPrimario).toBe("#0d6e6e");
    expect(db.events.find((e) => e.id === "event-2")!.ticketDesign?.mostrarQR).toBe(false);

    const reread = await apiClient.get<TicketDesign>("/events/event-2/ticket-design", { token });
    expect(reread.colorPrimario).toBe("#0d6e6e");
    expect(reread.mostrarPIN).toBe(false);
  });

  it("rejects a non-hex corporate color and empty terms", async () => {
    const token = await login();
    const initial = await apiClient.get<TicketDesign>("/events/event-2/ticket-design", { token });

    await expect(
      apiClient.put("/events/event-2/ticket-design", { ...initial, colorPrimario: "verde" }, { token })
    ).rejects.toThrow(AppError);

    await expect(
      apiClient.put("/events/event-2/ticket-design", { ...initial, terminos: [] }, { token })
    ).rejects.toThrow(AppError);

    expect(db.events.find((e) => e.id === "event-2")!.ticketDesign).toBeUndefined();
  });

  it("requires a session to read or write the design", async () => {
    const token = await login();
    await useSessionStore.getState().logout();
    await expect(apiClient.get("/events/event-2/ticket-design", { token })).rejects.toThrow(AppError);
    await expect(
      apiClient.put("/events/event-2/ticket-design", {} as TicketDesign, { token })
    ).rejects.toThrow(AppError);
  });
});