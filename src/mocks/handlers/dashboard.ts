import { http, HttpResponse } from "msw";
import { resolveEffectivePermissions } from "@/shared/auth/permissions";
import { getSessionUserId } from "../authContext";
import { db } from "../state";

const BASE = "http://localhost:4000/api/v1";
const metric = (value: number, change: number, trend: "up" | "down" = change >= 0 ? "up" : "down") => ({ value, change, trend });
const formatMoney = (value: number) => `${value.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}€`;
const formatDate = (value: string) => {
  const date = new Date(value);
  return `${String(date.getUTCDate()).padStart(2, "0")}/${String(date.getUTCMonth() + 1).padStart(2, "0")}/${date.getUTCFullYear()}`;
};
const statusLabels: Record<string, string> = {
  draft: "Borrador",
  published: "Publicado",
  on_sale: "A la venta",
  sold_out: "Agotado",
  paused: "Pausado",
  finished: "Finalizado",
  cancelled: "Cancelado"
};

function toCsvBlock(title: string, rows: string[][]): string {
  return [title, ...rows.map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(","))].join("\n");
}
function toHtmlTable(title: string, rows: string[][]): string {
  return `<h3>${title}</h3><table>${rows.map((row) => `<tr>${row.map((value) => `<td>${value}</td>`).join("")}</tr>`).join("")}</table>`;
}

function pdfText(text: string, x: number, y: number, size = 10) {
  const safeText = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E€]/g, "").replace(/[\\()]/g, "\\$&").replaceAll("€", "\\200");
  return `BT /F1 ${size} Tf ${x} ${y} Td (${safeText}) Tj ET`;
}

function createPdf(rows: string[][], events: { label: string; status: string; date: string; sold: number; capacity: number; revenue: string }[], salesSeries: { label: string; value: number }[]): string {
  const firstPage: string[] = ["0.98 0.97 0.95 rg", "0 0 595 842 re f", "0 0 0 rg", pdfText("ENTRADITAS / INFORME DASHBOARD", 40, 800, 18), pdfText("Datos de prueba · resumen comercial", 40, 780, 10), "0.89 0.34 0.18 rg", "40 748 515 2 re f", "0 0 0 rg", pdfText("Indicador", 40, 730, 10), pdfText("Valor", 260, 730, 10), pdfText("Variacion", 400, 730, 10)];
  let y = 710;
  rows.slice(1, 9).forEach((row, index) => {
    if (index % 2 === 0) firstPage.push("0.93 0.92 0.89 rg", `40 ${y - 5} 515 20 re f`);
    firstPage.push("0 0 0 rg", pdfText(row[0] ?? "", 40, y, 9), pdfText(row[1] ?? "", 260, y, 9), pdfText(row[2] ?? "", 400, y, 9));
    y -= 22;
  });
  firstPage.push("0 0 0 rg", pdfText("Detalle de eventos", 40, 500, 12), pdfText("Evento", 40, 480, 8), pdfText("Estado", 230, 480, 8), pdfText("Fecha", 305, 480, 8), pdfText("Vendidas", 385, 480, 8), pdfText("Aforo", 445, 480, 8), pdfText("Ingresos", 490, 480, 8));
  events.slice(0, 6).forEach((event, index) => {
    const eventY = 460 - index * 24;
    firstPage.push("0 0 0 rg", pdfText(event.label.slice(0, 27), 40, eventY, 7), pdfText(event.status, 230, eventY, 7), pdfText(event.date, 305, eventY, 7), pdfText(`${event.sold}`, 385, eventY, 7), pdfText(`${event.capacity}`, 445, eventY, 7), pdfText(event.revenue, 490, eventY, 7));
  });
  firstPage.push(pdfText("Pagina 1 de 2", 500, 35, 8));

  const secondPage: string[] = ["0.98 0.97 0.95 rg", "0 0 595 842 re f", pdfText("GRAFICOS OPERATIVOS", 40, 800, 18), pdfText("Los valores muestran unidades y escala del periodo", 40, 780, 10)];
  secondPage.push(pdfText("Aforo por evento · entradas / capacidad", 45, 735, 12), "0.2 0.2 0.2 RG", "1 w", "70 500 m 70 700 l S", "70 500 m 275 500 l S");
  const maxCapacity = Math.max(...events.map((event) => event.capacity), 1);
  [0, 25, 50, 75, 100].forEach((tick) => {
    const tickY = 500 + tick * 2;
    secondPage.push("0.82 0.81 0.78 RG", "0.5 w", `70 ${tickY} m 275 ${tickY} l S`, pdfText(`${Math.round((maxCapacity * tick) / 100)}`, 35, tickY - 3, 7));
  });
  events.slice(0, 4).forEach((event, index) => {
    const barX = 88 + index * 45;
    const barHeight = Math.max(2, (event.sold / maxCapacity) * 200);
    secondPage.push("0.89 0.34 0.18 rg", `${barX} 500 24 ${barHeight} re f`, pdfText(`${event.sold}`, barX + 3, 508 + barHeight, 7), pdfText(event.label.slice(0, 8), barX - 2, 485, 7));
  });
  secondPage.push(pdfText("Entradas", 35, 715, 7), pdfText("Ventas acumuladas", 330, 735, 12), "0.2 0.2 0.2 RG", "1 w", "340 500 m 340 700 l S", "340 500 m 555 500 l S");
  const salesValues = salesSeries.map((point) => point.value);
  const maxSales = Math.max(800, ...salesValues);
  [0, 200, 400, 600, 800].forEach((tick) => {
    const tickY = 500 + (tick / maxSales) * 200;
    secondPage.push("0.82 0.81 0.78 RG", "0.5 w", `340 ${tickY} m 555 ${tickY} l S`, pdfText(`${tick}`, 310, tickY - 3, 7));
  });
  secondPage.push("0.16 0.62 0.56 RG", "2 w", `340 ${500 + ((salesValues[0] ?? 0) / maxSales) * 200} m ${salesValues.slice(1).map((value, index) => `${340 + (index + 1) * 43} ${500 + (value / maxSales) * 200} l`).join(" ")} S`);
  salesSeries.forEach((point, index) => { const pointX = 337 + index * 43; const pointY = 497 + (point.value / maxSales) * 200; secondPage.push("0.89 0.34 0.18 rg", `${pointX} ${pointY} 6 6 re f`, pdfText(`${point.value}`, pointX - 2, pointY + 12, 7), pdfText(point.label, pointX - 7, 485, 7)); });
  secondPage.push(pdfText("Entradas vendidas", 310, 715, 7), pdfText("Escala vertical: entradas", 425, 465, 7), pdfText("Pagina 2 de 2", 500, 35, 8));

  const pageObjects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 6 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 6 0 R >> >> /Contents 7 0 R >>",
    `<< /Length ${firstPage.join("\n").length} >>\nstream\n${firstPage.join("\n")}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${secondPage.join("\n").length} >>\nstream\n${secondPage.join("\n")}\nendstream`
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  pageObjects.forEach((object, index) => { offsets.push(pdf.length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = pdf.length;
  const entries = offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n ").join("\n");
  pdf += `xref\n0 ${pageObjects.length + 1}\n0000000000 65535 f \n${entries}\ntrailer\n<< /Size ${pageObjects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

export const dashboardHandlers = [
  http.get(`${BASE}/dashboard/overview`, ({ request }) => {
    const user = db.users.find((candidate) => candidate.id === getSessionUserId(request));
    const permissions = user ? resolveEffectivePermissions(user.role, user.permissionOverrides) : new Set<string>();
    if (!user) return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesión no válida", requestId: "req_dashboard" } }, { status: 401 });
    if (!permissions.has("reports:read")) return HttpResponse.json({ error: { code: "FORBIDDEN", message: "No tienes permiso para consultar métricas", requestId: "req_dashboard" } }, { status: 403 });
    const events = db.events.filter((event) => (user.role === "superadmin" || event.organizationId === user.organizationId) && (user.eventScopes.length === 0 || user.eventScopes.includes(event.id)));
    const factor = user.eventScopes.length > 0 ? 0.42 : events.length / 5;
    const sold = Math.round(842 * factor);
    const gross = Math.round(1284500 * factor);
    const capacity = Math.round(1240 * factor) || 1;
    const eventMetrics = events.map((event, index) => { const eventSold = Math.round(sold * (0.18 + index * 0.09)); const eventGross = Math.round(gross * (0.18 + index * 0.09)); return { id: event.id, title: event.title, status: event.status, startsAt: event.startsAt, grossRevenue: eventGross, netRevenue: Math.round(eventGross * 0.91), ticketsSold: eventSold, averageTicket: eventSold ? Math.round(eventGross / eventSold) : 0, occupancy: Math.round(68 * factor), conversion: Number((4.8 + index * 0.3).toFixed(1)), attendance: Math.min(98, 68 + index * 4), refunds: Math.round(38200 * (0.18 + index * 0.09)) }; });
    return HttpResponse.json({ data: { kpis: { grossRevenue: metric(gross, 12.4), netRevenue: metric(Math.round(gross * 0.91), 9.8), ticketsSold: metric(sold, 18.2), averageTicket: metric(1525, 3.1), occupancy: metric(Math.round(68 * factor), 5.6), conversion: metric(4.8, 0.7), attendance: metric(74, 2.9), refunds: metric(38200, -4.2, "down") }, salesTimeline: [{ label: "01 ago", actual: 60 }, { label: "08 ago", actual: 145 }, { label: "15 ago", actual: 230 }, { label: "22 ago", actual: 390 }, { label: "29 ago", actual: 535 }, { label: "05 sep", actual: sold, projection: sold }, { label: "12 sep", actual: 0, projection: Math.round(sold * 1.18) }], ticketMix: [{ label: "General", value: 48, color: "#e4572e" }, { label: "VIP", value: 27, color: "#f2c14e" }, { label: "Abono", value: 15, color: "#2a9d8f" }, { label: "Cortesia", value: 10, color: "#52606d" }], occupancy: events.slice(0, 4).map((event, index) => ({ label: event.title, sold: Math.round(sold * (0.18 + index * 0.09)), capacity: Math.max(capacity, 100) })), attendanceCurve: [{ label: "20:00", value: 4 }, { label: "20:30", value: 16 }, { label: "21:00", value: 38 }, { label: "21:30", value: 66 }, { label: "22:00", value: 82 }, { label: "22:30", value: 91 }], channels: [{ label: "Web", value: 64, color: "#e4572e" }, { label: "Taquilla", value: 21, color: "#2a9d8f" }, { label: "Cortesias", value: 15, color: "#f2c14e" }], geoHeat: [{ label: "Madrid", value: 82 }, { label: "Barcelona", value: 61 }, { label: "Sevilla", value: 44 }, { label: "Valencia", value: 28 }, { label: "Bilbao", value: 17 }], funnel: [{ label: "Visitas", value: 10000 }, { label: "Ficha de evento", value: 6800 }, { label: "Seleccion", value: 2400 }, { label: "Checkout", value: 920 }, { label: "Compra", value: 480 }], eventMetrics, lastUpdated: new Date().toISOString() }, meta: { requestId: "req_dashboard" } });
  }),
  http.post(`${BASE}/reports/export`, async ({ request }) => {
    const user = db.users.find((candidate) => candidate.id === getSessionUserId(request));
    if (!user) return HttpResponse.json({ error: { code: "UNAUTHENTICATED", message: "Sesion no valida", requestId: "req_export" } }, { status: 401 });
    const permissions = resolveEffectivePermissions(user.role, user.permissionOverrides);
    if (!permissions.has("reports:export")) return HttpResponse.json({ error: { code: "FORBIDDEN", message: "No tienes permiso para exportar informes", requestId: "req_export" } }, { status: 403 });
    const body = await request.json() as { report?: string; format?: string };
    const events = db.events.filter((event) => user.role === "superadmin" || event.organizationId === user.organizationId);
    const factor = user.eventScopes.length > 0 ? 0.42 : events.length / 5;
    const gross = Math.round(1284500 * factor);
    const sold = Math.round(842 * factor);
    const kpiRows = [["Indicador", "Valor", "Variacion"], ["Ingresos brutos", formatMoney(gross), "+12.4%"], ["Ingresos netos", formatMoney(Math.round(gross * 0.91)), "+9.8%"], ["Entradas vendidas", `${sold}`, "+18.2%"], ["Ticket medio", formatMoney(1525), "+3.1%"], ["Aforo ocupado", `${Math.round(68 * factor)}%`, "+5.6%"], ["Conversion", "4.8%", "+0.7%"], ["Asistencia", "74%", "+2.9%"], ["Reembolsos", formatMoney(38200), "-4.2%"]];
    const exportEvents = events.map((event, index) => ({ label: event.title, status: statusLabels[event.status] ?? event.status, date: formatDate(event.startsAt), sold: Math.round(sold * (0.18 + index * 0.09)), capacity: Math.max(Math.round(1240 * factor), 100), revenue: formatMoney(Math.round(gross * (0.18 + index * 0.09))) }));
    const eventRows = [["Evento", "Estado", "Fecha", "Vendidas", "Aforo", "Ingresos"], ...exportEvents.map((event) => [event.label, event.status, event.date, `${event.sold}`, `${event.capacity}`, event.revenue])];
    const salesSeries = [{ label: "01 ago", value: 60 }, { label: "08 ago", value: 145 }, { label: "15 ago", value: 230 }, { label: "22 ago", value: 390 }, { label: "29 ago", value: 535 }, { label: "05 sep", value: sold }];
    const salesRows = [["Fecha", "Entradas"], ...salesSeries.map((point) => [point.label, `${point.value}`])];
    const format = body.format === "xlsx" || body.format === "pdf" ? body.format : "csv";
    const csv = [toCsvBlock("Resumen", kpiRows), toCsvBlock("Detalle de eventos", eventRows), toCsvBlock("Ventas acumuladas", salesRows)].join("\n\n");
    const xlsx = [toHtmlTable("Resumen", kpiRows), toHtmlTable("Detalle de eventos", eventRows), toHtmlTable("Ventas acumuladas", salesRows)].join("");
    const content = format === "csv" ? csv : format === "xlsx" ? xlsx : createPdf(kpiRows, exportEvents, salesSeries);
    return HttpResponse.json({ data: { id: `export-${Date.now()}`, status: "completed", report: body.report, format, filename: `entraditas-dashboard.${format}`, mimeType: format === "csv" ? "text/csv;charset=utf-8" : format === "xlsx" ? "application/vnd.ms-excel" : "application/pdf", content, message: "Exportacion generada con los datos de prueba." }, meta: { requestId: "req_export" } });
  })
];
