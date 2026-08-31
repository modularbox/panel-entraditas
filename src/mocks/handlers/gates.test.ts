import { afterEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient, AppError } from "@/shared/lib/apiClient";
import type { Gate, User } from "@entraditas/types";

describe("gates handlers", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login() {
    await useSessionStore.getState().login("admin@entraditas.com", "N8@kP4!wY6#sD2&");
    return useSessionStore.getState().token!;
  }

  it("lists gates for an event", async () => {
    const token = await login();
    const gates = await apiClient.get<Gate[]>("/events/event-2/gates", { token });
    expect(gates).toHaveLength(1);
    expect(gates[0]!.code).toBe("NORTE");
  });

  it("creates a gate open to every sub-event and ticket type, with no operators", async () => {
    const token = await login();
    const created = await apiClient.post<Gate>(
      "/events/event-2/gates",
      {
        name: "Puerta Sur",
        code: "SUR",
        subEventId: null,
        zoneId: null,
        direction: "in",
        allowReentry: false,
        maxScansPerTicket: 1,
        allowedTicketTypeGroupIds: null,
        opensAt: null,
        closesAt: null
      },
      { token }
    );
    expect(created.isActive).toBe(true);
    expect(created.operatorUserIds).toEqual([]);
    expect(db.gates.some((g) => g.code === "SUR")).toBe(true);
  });

  it("rejects a duplicate code within the same event (case-insensitive)", async () => {
    const token = await login();
    await expect(
      apiClient.post(
        "/events/event-2/gates",
        {
          name: "Duplicada", code: "norte", subEventId: null, zoneId: null, direction: "in",
          allowReentry: false, maxScansPerTicket: 1, allowedTicketTypeGroupIds: null, opensAt: null, closesAt: null
        },
        { token }
      )
    ).rejects.toThrow(AppError);
    expect(db.gates.filter((g) => g.eventId === "event-2")).toHaveLength(1);
  });

  it("patches a gate's isActive flag", async () => {
    const token = await login();
    const updated = await apiClient.patch<Gate>("/gates/gate-2-norte", { isActive: false }, { token });
    expect(updated.isActive).toBe(false);
    expect(db.gates.find((g) => g.id === "gate-2-norte")!.isActive).toBe(false);
  });

  it("patches a gate's operatorUserIds", async () => {
    const token = await login();
    const updated = await apiClient.patch<Gate>("/gates/gate-2-norte", { operatorUserIds: [] }, { token });
    expect(updated.operatorUserIds).toEqual([]);
  });

  it("deletes a gate", async () => {
    const token = await login();
    await apiClient.delete("/gates/gate-2-norte", { token });
    expect(db.gates.some((g) => g.id === "gate-2-norte")).toBe(false);
  });

  it("GET /events/:eventId/team returns only the subusers of the event's organization", async () => {
    const token = await login();
    const members = await apiClient.get<User[]>("/events/event-2/team", { token });
    expect(members).toHaveLength(1);
    expect(members[0]!.role).toBe("subuser");
    expect(members[0]!.fullName).toBe("Personal de puerta");
  });

  it("rejects access to an out-of-scope event's gates", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "T6#bW8@cL2!pZ9&"); // scoped to event-1 only
    const token = useSessionStore.getState().token!;
    await expect(apiClient.get("/events/event-2/gates", { token })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("GET /gates returns only the gates whose event the admin can access, enriched with event/zone/operator names", async () => {
    const token = await login(); // admin@entraditas.com, org-1
    const gates = await apiClient.get<Array<Gate & { eventTitle: string; zoneName: string | null; operatorNames: string[] }>>(
      "/gates",
      { token }
    );
    expect(gates.map((g) => g.id)).toEqual(["gate-2-norte"]);
    const norte = gates[0]!;
    expect(norte.eventTitle).toBe("Rock en Directo");
    expect(norte.zoneName).toBe("Pista");
    expect(norte.operatorNames).toEqual(["Personal de puerta"]);
  });

  it("GET /gates returns gates across every organization to a superadmin", async () => {
    await useSessionStore.getState().login("superadmin@entraditas.com", "vQ7!mZ2#Lr9@Tx5$");
    const token = useSessionStore.getState().token!;
    const gates = await apiClient.get<{ id: string }[]>("/gates", { token });
    expect(gates.map((g) => g.id).sort()).toEqual(["gate-2-norte", "gate-4-entrada"]);
  });

  it("GET /gates returns none when the event-scoped user's events have no gates", async () => {
    await useSessionStore.getState().login("subusuario@entraditas.com", "T6#bW8@cL2!pZ9&"); // scoped to event-1 only, which has no gates
    const token = useSessionStore.getState().token!;
    const gates = await apiClient.get<{ id: string }[]>("/gates", { token });
    expect(gates).toEqual([]);
  });
});
