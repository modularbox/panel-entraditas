/**
 * Cómo se pagó un pedido, a partir de su `paymentReference`.
 *
 * La web guarda hoy `sin-pasarela:<método>` (tarjeta, bizum...): todavía no hay pasarela y el
 * prefijo es a propósito, para que un pago de prueba no se confunda nunca con uno de verdad. Una
 * referencia sin prefijo es de una pasarela real, que hoy solo puede ser de tarjeta.
 */
const NOMBRES: Record<string, string> = {
  tarjeta: "Tarjeta",
  bizum: "Bizum",
  monedero: "Monedero"
};

export interface MetodoDePago {
  nombre: string;
  /** El cobro no pasó por una pasarela: es una compra de prueba. */
  dePrueba: boolean;
}

export function metodoDePago(referencia: string | null | undefined): MetodoDePago | null {
  const valor = referencia?.trim() ?? "";
  if (valor === "") return null;
  const [prefijo, metodo = ""] = valor.split(":");
  if (prefijo === "sin-pasarela") {
    return { nombre: NOMBRES[metodo] ?? (metodo || "Sin indicar"), dePrueba: true };
  }
  return { nombre: "Tarjeta", dePrueba: false };
}

/** El método en una línea, para tablas y exportaciones. */
export function textoDeMetodoDePago(referencia: string | null | undefined): string {
  const metodo = metodoDePago(referencia);
  if (!metodo) return "—";
  return metodo.nombre;
}
