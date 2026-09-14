import { afterEach, describe, expect, it } from "vitest";
import type { Event } from "@entraditas/types";
import { apiClient } from "@/shared/lib/apiClient";
import { db, resetDb, demoPasswordFor } from "@/mocks/state";
import { describePublishOutcome, publishToPublicSite } from "./publishToPublicSite";

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", {
    email,
    password: demoPasswordFor(email)
  });
  return result.accessToken;
}

describe("aprobacion de eventos", () => {
  afterEach(() => resetDb());

  it("un superadmin aprueba un evento en revision y pasa a publicado", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    db.events.find((e) => e.id === "event-5")!.status = "in_review";

    const event = await apiClient.post<Event>("/events/event-5/approve", undefined, { token });

    expect(event.status).toBe("published");
    expect(event.publishedAt).not.toBeNull();
  });

  it("un superadmin pone en revision un evento pendiente de aprobacion", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    db.events.find((e) => e.id === "event-5")!.status = "pending_review";

    const event = await apiClient.post<Event>("/events/event-5/start-review", undefined, { token });

    expect(event.status).toBe("in_review");
  });

  it("revisar es tarea de la plataforma: un admin no puede poner ni aprobar su propio evento", async () => {
    const token = await loginAs("admin@entraditas.com");
    db.events.find((e) => e.id === "event-5")!.status = "pending_review";

    await expect(apiClient.post("/events/event-5/start-review", undefined, { token })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(db.events.find((e) => e.id === "event-5")!.status).toBe("pending_review");

    db.events.find((e) => e.id === "event-5")!.status = "in_review";
    await expect(apiClient.post("/events/event-5/approve", undefined, { token })).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    expect(db.events.find((e) => e.id === "event-5")!.status).toBe("in_review");
  });

  it("no se puede aprobar un borrador que nunca se mando a revision", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    db.events.find((e) => e.id === "event-5")!.status = "draft";

    await expect(apiClient.post("/events/event-5/approve", undefined, { token })).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("un superadmin puede rechazar un evento en revision", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    db.events.find((e) => e.id === "event-5")!.status = "in_review";

    const event = await apiClient.post<Event>("/events/event-5/reject", undefined, { token });

    expect(event.status).toBe("rejected");
  });
});

describe("publishToPublicSite", () => {
  afterEach(() => resetDb());

  it("no intenta publicar cuando la API publica no esta configurada", async () => {
    // En desarrollo VITE_API_URL esta vacia: aprobar en el panel funciona igual, pero el evento
    // no sale a la web y hay que decirlo en vez de fingir que se publico.
    const token = await loginAs("superadmin@entraditas.com");

    const outcome = await publishToPublicSite("event-2", token);

    expect(outcome.status).toBe("skipped");
    expect(describePublishOutcome(outcome)).toMatch(/no se envio a la web/);
  });
});

describe("describePublishOutcome", () => {
  it("confirma la publicacion", () => {
    expect(describePublishOutcome({ status: "published" })).toMatch(/ya aparece en entraditas.com/);
  });

  it("dice exactamente que falta cuando el evento esta incompleto", () => {
    const message = describePublishOutcome({ status: "incomplete", missing: ["fecha y hora", "titulo"] });
    expect(message).toMatch(/fecha y hora, titulo/);
  });

  it("distingue un fallo de envio de un evento incompleto", () => {
    expect(describePublishOutcome({ status: "failed", error: "timeout" })).toMatch(/fallo el envio/);
  });
});
