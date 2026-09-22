import { describe, expect, it } from "vitest";
import type { ApiPanelOrder } from "@/shared/lib/entraditasApi";
import { filtrarPedidos, pedidoDesdeLaApi } from "./desdeLaApi";

function pedidoApi(extra: Partial<ApiPanelOrder> = {}): ApiPanelOrder {
  return {
    id: "ped-1",
    number: "ENT-A1B2C3",
    eventId: "evt-1",
    organizationId: "org-1",
    eventTitle: "Noche de Jazz",
    eventStartsAt: "2026-12-01T20:00:00+00:00",
    status: "paid",
    channel: "web",
    customerName: "Axel Fassio",
    customerEmail: "axel@entraditas.com",
    customerPhone: null,
    subtotal: 6000,
    discount: 500,
    serviceFee: 300,
    total: 5800,
    refunded: 0,
    currency: "EUR",
    createdAt: "2026-09-22T10:00:00+00:00",
    items: [{ id: "li-1", ticketTypeId: "tier-1", name: "General", quantity: 2, unitPrice: 3000, subtotal: 6000 }],
    tickets: [
      { id: "t-1", orderItemId: "li-1", reference: "ENT-A1B2C3-1", seat: null, status: "valid" },
      { id: "t-2", orderItemId: "li-1", reference: "ENT-A1B2C3-2", seat: null, status: "valid" }
    ],
    ...extra
  };
}

describe("pedidoDesdeLaApi", () => {
  it("conserva los importes en céntimos, sin convertir", () => {
    const pedido = pedidoDesdeLaApi(pedidoApi());
    expect(pedido.subtotal).toBe(6000);
    expect(pedido.discountAmount).toBe(500);
    expect(pedido.serviceFee).toBe(300);
    expect(pedido.total).toBe(5800);
  });

  it("trae las líneas con el nombre que se copió al comprar", () => {
    const pedido = pedidoDesdeLaApi(pedidoApi());
    expect(pedido.items).toHaveLength(1);
    expect(pedido.items[0]!.ticketTypeName).toBe("General");
    expect(pedido.items[0]!.orderId).toBe("ped-1");
  });

  it("marca como pagado el momento de la compra solo si está pagado", () => {
    expect(pedidoDesdeLaApi(pedidoApi()).paidAt).toBe("2026-09-22T10:00:00+00:00");
    expect(pedidoDesdeLaApi(pedidoApi({ status: "pending" })).paidAt).toBeNull();
  });

  it("no deja pasar un estado ni un canal que la pantalla no sepa pintar", () => {
    const raro = pedidoDesdeLaApi(pedidoApi({ status: "loquesea", channel: "telepatia" }));
    expect(raro.status).toBe("pending");
    expect(raro.channel).toBe("web");
  });

  it("la venta no la tramitó nadie del panel: viene de la web", () => {
    expect(pedidoDesdeLaApi(pedidoApi()).userId).toBeNull();
  });
});

describe("filtrarPedidos", () => {
  const pedidos = [
    pedidoDesdeLaApi(pedidoApi({ id: "a", number: "ENT-AAA", status: "paid", channel: "web", customerName: "Ana" })),
    pedidoDesdeLaApi(pedidoApi({ id: "b", number: "ENT-BBB", status: "refunded", channel: "box_office", customerName: "Bruno", customerEmail: "bruno@correo.com" }))
  ];

  it("sin filtros los devuelve todos", () => {
    expect(filtrarPedidos(pedidos, {})).toHaveLength(2);
  });

  it("filtra por estado y por canal", () => {
    expect(filtrarPedidos(pedidos, { status: "refunded" }).map((p) => p.id)).toEqual(["b"]);
    expect(filtrarPedidos(pedidos, { channel: "web" }).map((p) => p.id)).toEqual(["a"]);
  });

  it("busca por número, por nombre y por correo, sin distinguir mayúsculas", () => {
    expect(filtrarPedidos(pedidos, { q: "ent-bbb" }).map((p) => p.id)).toEqual(["b"]);
    expect(filtrarPedidos(pedidos, { q: "ana" }).map((p) => p.id)).toEqual(["a"]);
    expect(filtrarPedidos(pedidos, { q: "BRUNO@correo" }).map((p) => p.id)).toEqual(["b"]);
  });

  it("combina los filtros en vez de quedarse con el último", () => {
    expect(filtrarPedidos(pedidos, { status: "paid", q: "bruno" })).toHaveLength(0);
  });
});
