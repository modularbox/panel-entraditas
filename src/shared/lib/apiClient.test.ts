import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@/mocks/server";
import { apiClient, AppError } from "./apiClient";

describe("apiClient", () => {
  it("unwraps the data envelope on success", async () => {
    server.use(
      http.get("http://localhost:4000/api/v1/scratch/ok", () =>
        HttpResponse.json({ data: { hello: "world" }, meta: { requestId: "req_1" } })
      )
    );
    const result = await apiClient.get<{ hello: string }>("/scratch/ok");
    expect(result).toEqual({ hello: "world" });
  });

  it("throws AppError carrying the domain error code on failure", async () => {
    server.use(
      http.get("http://localhost:4000/api/v1/scratch/fail", () =>
        HttpResponse.json(
          { error: { code: "NOT_FOUND", message: "No encontrado", requestId: "req_2" } },
          { status: 404 }
        )
      )
    );
    await expect(apiClient.get("/scratch/fail")).rejects.toThrow(AppError);
  });

  it("sends a JSON body on post", async () => {
    let receivedBody: unknown;
    server.use(
      http.post("http://localhost:4000/api/v1/scratch/echo", async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ data: { ok: true }, meta: { requestId: "req_3" } });
      })
    );
    await apiClient.post("/scratch/echo", { foo: "bar" });
    expect(receivedBody).toEqual({ foo: "bar" });
  });
});
