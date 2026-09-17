import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiClient } from "@/shared/lib/apiClient";
import { canPublishToApi, isApiConfigured, publishEventToApi } from "@/shared/lib/entraditasApi";
import { db, resetDb, demoPasswordFor } from "@/mocks/state";
import { syncEventChangesToWeb } from "./publishToPublicSite";

vi.mock("@/shared/lib/entraditasApi", () => ({
  canPublishToApi: vi.fn(() => true),
  isApiConfigured: vi.fn(() => true),
  publishEventToApi: vi.fn(async () => {}),
  removeEventFromApi: vi.fn(async () => {})
}));

const publishMock = vi.mocked(publishEventToApi);
const isConfiguredMock = vi.mocked(isApiConfigured);
const canPublishMock = vi.mocked(canPublishToApi);

async function loginAs(email: string) {
  const result = await apiClient.post<{ accessToken: string }>("/auth/login", {
    email,
    password: demoPasswordFor(email)
  });
  return result.accessToken;
}

describe("syncEventChangesToWeb", () => {
  beforeEach(() => {
    // Que la firma de lo enviado no se cuele entre tests: cada uno empieza sin subidas previas.
    localStorage.clear();
  });

  afterEach(() => {
    resetDb();
    isConfiguredMock.mockReturnValue(true);
    canPublishMock.mockReturnValue(true);
    publishMock.mockClear();
    localStorage.clear();
  });

  it("re-publica un evento publicado cuando algo cambia", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    const evento = db.events.find((e) => e.id === "event-2")!;
    evento.startsAt = "2030-11-05T21:00:00.000Z";
    evento.endsAt = "2030-11-05T23:59:00.000Z";

    const outcome = await syncEventChangesToWeb("event-2", token);

    expect(outcome?.status).toBe("published");
    expect(publishMock).toHaveBeenCalledTimes(1);
    const [eventId, payload] = publishMock.mock.calls[0]!;
    expect(eventId).toBe("event-2");
    expect((payload as { title: string }).title).toBe("Rock en Directo");
  });

  it("deja en paz un borrador: no se puede reflotar lo que no debe aparecer", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    db.events.find((e) => e.id === "event-2")!.status = "draft";

    const outcome = await syncEventChangesToWeb("event-2", token);

    expect(outcome).toBeNull();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("ignora un evento ya celebrado", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    db.events.find((e) => e.id === "event-2")!.startsAt = "2020-11-05T21:00:00.000Z";
    db.events.find((e) => e.id === "event-2")!.endsAt = "2020-11-05T23:59:00.000Z";

    const outcome = await syncEventChangesToWeb("event-2", token);

    expect(outcome).toBeNull();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("no hace nada si la API publica no esta configurada", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    isConfiguredMock.mockReturnValue(false);

    const outcome = await syncEventChangesToWeb("event-2", token);

    expect(outcome).toBeNull();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("no hace nada si no hay sesion abierta en la API", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    canPublishMock.mockReturnValue(false);

    const outcome = await syncEventChangesToWeb("event-2", token);

    expect(outcome).toBeNull();
    expect(publishMock).not.toHaveBeenCalled();
  });

  it("no reenvia si el evento ya se mando tal y como esta", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    // Un evento publicado al que ya se envio y no se ha tocado: la firma coincide y no se
    // vuelve a hacer otro PUT, que es lo que permite revisar toda la lista sin coste.
    const primero = await syncEventChangesToWeb("event-2", token);
    expect(primero?.status).toBe("published");

    const segundo = await syncEventChangesToWeb("event-2", token);

    expect(segundo).toBeNull();
    expect(publishMock).toHaveBeenCalledTimes(1);
  });

  it("reenvia un cambio que llega despues del ultimo envio", async () => {
    const token = await loginAs("superadmin@entraditas.com");
    await syncEventChangesToWeb("event-2", token);

    db.events.find((e) => e.id === "event-2")!.startsAt = "2030-11-05T21:00:00.000Z";
    db.events.find((e) => e.id === "event-2")!.endsAt = "2030-11-05T23:59:00.000Z";

    const outcome = await syncEventChangesToWeb("event-2", token);

    expect(outcome?.status).toBe("published");
    expect(publishMock).toHaveBeenCalledTimes(2);
  });
});