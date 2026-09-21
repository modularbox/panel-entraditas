import { afterEach, describe, expect, it } from "vitest";
import { resetDb } from "@/mocks/state";
import { useSessionStore } from "@/shared/auth/sessionStore";
import { apiClient } from "@/shared/lib/apiClient";
import type { DashboardOverview } from "@/features/dashboard/dashboardTypes";

describe("dashboard overview filters", () => {
  afterEach(() => {
    resetDb();
    useSessionStore.setState({ token: null, user: null, effectivePermissions: new Set(), eventScopes: [], status: "idle" });
  });

  async function login(email: string, password: string) {
    await useSessionStore.getState().login(email, password);
    return useSessionStore.getState().token!;
  }

  it("narrows revenue figures to orders created within the given date range", async () => {
    const token = await login("admin@entraditas.com", "admin1234");
    // Noche de Jazz: order-1 (2026-08-05, paid, 5000) is in range, order-2 (2026-08-07) is not.
    const overview = await apiClient.get<DashboardOverview>("/dashboard/overview?from=2026-08-01&to=2026-08-06", { token });
    expect(overview.kpis.grossRevenue.value).toBe(5000);
  });

  it("leaves occupancy (inventory, not order-dated) unaffected by the date range filter", async () => {
    const token = await login("admin@entraditas.com", "admin1234");
    const overview = await apiClient.get<DashboardOverview>("/dashboard/overview?from=2026-08-01&to=2026-08-06", { token });
    expect(overview.occupancy.find((entry) => entry.label === "Noche de Jazz")).toEqual({ label: "Noche de Jazz", sold: 5, capacity: 400 });
  });

  it("restricts a superadmin's overview to a single organization", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    const overview = await apiClient.get<DashboardOverview>("/dashboard/overview?organizationId=org-2", { token });
    expect(overview.eventMetrics.map((event) => event.title)).toEqual(["Festival del Sur"]);
    expect(overview.kpis.grossRevenue.value).toBe(36000); // order-8 (18000) + order-10 (18000)
  });

  it("restricts the overview to a single event", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    const overview = await apiClient.get<DashboardOverview>("/dashboard/overview?eventId=event-2", { token });
    expect(overview.eventMetrics.map((event) => event.title)).toEqual(["Rock en Directo"]);
    expect(overview.kpis.grossRevenue.value).toBe(28000); // order-5 (22000) + order-6 (6000)
  });

  it("ignores an eventId outside the requesting user's own scope instead of leaking it", async () => {
    const token = await login("admin@entraditas.com", "admin1234"); // org-1
    const overview = await apiClient.get<DashboardOverview>("/dashboard/overview?eventId=event-4", { token }); // event-4 is org-2's
    expect(overview.eventMetrics).toEqual([]);
    expect(overview.kpis.grossRevenue.value).toBe(0);
  });

  it("ignores an organizationId outside a non-superadmin's own organization", async () => {
    const token = await login("admin@entraditas.com", "admin1234"); // org-1
    const overview = await apiClient.get<DashboardOverview>("/dashboard/overview?organizationId=org-2", { token });
    expect(overview.eventMetrics).toEqual([]);
  });

  it("applies the same filters to the exported report", async () => {
    const token = await login("superadmin@entraditas.com", "superadmin1234");
    const result = await apiClient.post<{ content: string }>(
      "/reports/export",
      { report: "dashboard", format: "csv", organizationId: "org-2" },
      { token }
    );
    expect(result.content).toContain("Festival del Sur");
    expect(result.content).not.toContain("Rock en Directo");
  });

  it("gives every export format the same look as the PDF (title, sections and brand style)", async () => {
    const token = await login("admin@entraditas.com", "admin1234");
    const csv = await apiClient.post<{ content: string }>("/reports/export", { report: "dashboard", format: "csv" }, { token });
    const xlsx = await apiClient.post<{ content: string }>("/reports/export", { report: "dashboard", format: "xlsx" }, { token });
    const pdf = await apiClient.post<{ content: string }>("/reports/export", { report: "dashboard", format: "pdf" }, { token });

    // El PDF conserva su cabecera canónica.
    expect(pdf.content).toContain("ENTRADITAS / INFORME DASHBOARD");
    expect(pdf.content).toContain("Detalle de eventos");

    // El CSV comparte con el PDF la cabecera y los mismos bloques.
    expect(csv.content).toContain("ENTRADITAS / INFORME DASHBOARD");
    expect(csv.content).toContain("Datos de prueba");
    expect(csv.content).toContain("Detalle de eventos");
    expect(csv.content).toContain("Ventas acumuladas");

    // El XLSX replica el diseño del PDF (colores de marca, filas alternadas y gráficos).
    expect(xlsx.content).toContain("ENTRADITAS / INFORME DASHBOARD");
    expect(xlsx.content).toContain("#e3572e");
    expect(xlsx.content).toContain("#faf7f2");
    expect(xlsx.content).toContain("Detalle de eventos");
    expect(xlsx.content).toContain("Gráficos operativos");
    expect(xlsx.content).toContain("Aforo por evento");
    expect(xlsx.content).toContain("Ventas acumuladas");
  });
});
