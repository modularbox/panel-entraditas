import { useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/shared/lib/apiClient";

/**
 * Eliminar, bloquear y la papelera (tanda 21), contra api.entraditas.com (api/papelera.php).
 *
 * Eliminar no borra: lo manda a la papelera, y mientras esta ahi no sale en el panel, ni en la web,
 * ni cuenta en las cifras (tampoco lo que cuelga de ello: las ventas de un evento eliminado, los
 * eventos de una organizacion eliminada). Desde la Papelera se restaura tal cual o se borra para
 * siempre.
 */
export type TipoEnPapelera = "event" | "order" | "customer" | "organization";

export interface ElementoEnPapelera {
  type: TipoEnPapelera;
  id: string;
  title: string;
  /** Que es, ya escrito: "Producciones Norte · 16/10/2026 21:00 · 12 ventas". */
  detail: string;
  deletedAt: string | null;
  deletedBy: string | null;
  /** Lo que se borra con el si se borra para siempre. */
  purge: string;
  note?: string | null;
}

export const NOMBRE_DEL_TIPO: Record<TipoEnPapelera, string> = {
  event: "Evento",
  order: "Venta",
  customer: "Cliente",
  organization: "Organización"
};

/** Donde vive cada cosa en la API. Los clientes van por correo, como el resto del panel. */
function ruta(tipo: TipoEnPapelera, id: string): string {
  const base = { event: "/events", order: "/orders", customer: "/customers", organization: "/organizations" }[tipo];
  return `${base}/${encodeURIComponent(id)}`;
}

export const VER_PAPELERA = { a: "/papelera", texto: "Ver la papelera" };

export async function enviarAPapelera(tipo: TipoEnPapelera, id: string, token: string): Promise<void> {
  await apiClient.delete(ruta(tipo, id), { token });
}

export async function cambiarBloqueo(tipo: "customer" | "organization", id: string, bloquear: boolean, token: string): Promise<void> {
  await apiClient.post(`${ruta(tipo, id)}/${bloquear ? "block" : "unblock"}`, undefined, { token });
}

export function listarPapelera(token: string): Promise<ElementoEnPapelera[]> {
  return apiClient.get<ElementoEnPapelera[]>("/trash", { token });
}

/** Devuelve la nota de la API si la hay (una venta cuyo evento sigue en la papelera). */
export async function restaurar(tipo: TipoEnPapelera, id: string, token: string): Promise<string | null> {
  const respuesta = await apiClient.post<{ ok: boolean; note?: string | null }>(`/trash/${tipo}/${encodeURIComponent(id)}/restore`, undefined, { token });
  return respuesta?.note ?? null;
}

export async function borrarParaSiempre(tipo: TipoEnPapelera, id: string, token: string): Promise<void> {
  await apiClient.delete(`/trash/${tipo}/${encodeURIComponent(id)}`, { token });
}

/**
 * Despues de eliminar, restaurar o bloquear se vuelve a pedir TODO lo que haya en pantalla: un
 * evento eliminado se lleva sus ventas del dashboard, de Ventas y de los clientes, y no hay una
 * lista corta de que pantallas tocar.
 */
export function useRefrescarTodo(): () => Promise<void> {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries();
}
