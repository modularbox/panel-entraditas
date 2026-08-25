import { http, HttpResponse } from "msw";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";

const BASE = "http://localhost:4000/api/v1";
const metric = (value: number, change: number, trend: "up" | "down" = change >= 0 ? "up" : "down") => ({ value, change, trend });

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/overview`, ({ request }) => {
    const user = db.users.find((candidate) => candidate.id === getSessionUserId(request));
    const permissions = user ? resolveEffectivePermissions(user.role, user.permissionOverrides) : new Set<string>();
    if (!user) return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_dashboard" } }, { status: 401 });
    if (!permissions.has("reports:read")) return HttpResponse.json({ error: { code: "FORBIDDEN", message: "No tienes permiso para consultar métricas", requestId: "req_dashboard" } }, { status: 403 });

    const events = db.events.filter((event) => event.organizationId === user.organizationId && (user.eventScopes.length === 0 || user.eventScopes.includes(event.id)));
    const isScoped = user.eventScopes.length > 0;
    const factor = isScoped ? 0.42 : events.length / 5;
    const sold = Math.round(842 * factor);
    const gross = Math.round(1284500 * factor);
    const capacity = Math.round(1240 * factor) || 1;
    return HttpResponse.json({
      data: {
        kpis: {
          grossRevenue: metric(gross, 12.4), netRevenue: metric(Math.round(gross * 0.91), 9.8), ticketsSold: metric(sold, 18.2),
          averageTicket: metric(1525, 3.1), occupancy: metric(Math.round(68 * factor), 5.6), conversion: metric(4.8, 0.7),
          attendance: metric(74, 2.9), refunds: metric(38200, -4.2, "down")
        },
        salesTimeline: [
          { label: "01 ago", actual: 60 }, { label: "08 ago", actual: 145 }, { label: "15 ago", actual: 230 },
          { label: "22 ago", actual: 390 }, { label: "29 ago", actual: 535 }, { label: "05 sep", actual: sold, projection: sold },
          { label: "12 sep", actual: 0, projection: Math.round(sold * 1.18) }
        ],
        ticketMix: [{ label: "General", value: 48, color: "#e4572e" }, { label: "VIP", value: 27, color: "#f2c14e" }, { label: "Abono", value: 15, color: "#2a9d8f" }, { label: "Cortesía", value: 10, color: "#52606d" }],
        occupancy: events.slice(0, 4).map((event, index) => ({ label: event.title, sold: Math.round(sold * (0.18 + index * 0.09)), capacity: Math.max(capacity, 100) })),
        attendanceCurve: [{ label: "20:00", value: 4 }, { label: "20:30", value: 16 }, { label: "21:00", value: 38 }, { label: "21:30", value: 66 }, { label: "22:00", value: 82 }, { label: "22:30", value: 91 }],
        channels: [{ label: "Web", value: 64, color: "#e4572e" }, { label: "Taquilla", value: 21, color: "#2a9d8f" }, { label: "Cortesías", value: 15, color: "#f2c14e" }],
        geoHeat: [{ label: "Madrid", value: 82 }, { label: "Barcelona", value: 61 }, { label: "Sevilla", value: 44 }, { label: "Valencia", value: 28 }, { label: "Bilbao", value: 17 }],
        funnel: [{ label: "Visitas", value: 10000 }, { label: "Ficha de evento", value: 6800 }, { label: "Selección", value: 2400 }, { label: "Checkout", value: 920 }, { label: "Compra", value: 480 }],
        lastUpdated: new Date().toISOString()
      },
      meta: { requestId: "req_dashboard" }
    });
  }),
  http.post(`${BASE}/reports/export`, async ({ request }) => {
    const user = db.users.find((candidate) => candidate.id === getSessionUserId(request));
    if (!user) return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_export" } }, { status: 401 });
    const body = await request.json() as { report?: string; format?: string };
    return HttpResponse.json({ data: { id: `export-${Date.now()}`, status: "queued", report: body.report, format: body.format, message: "La exportación estará disponible cuando termine." }, meta: { requestId: "req_export" } }, { status: 202 });
  })
];
