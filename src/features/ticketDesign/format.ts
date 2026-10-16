/** "2026-08-28T13:00:00.000Z" -> "28/08/2026". Se formatea en UTC para que una máquina en otra
 * zona horaria no cambie la fecha mostrada en la plantilla (los eventos se guardan en UTC). */
export function formatTicketDate(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getUTCFullYear()}`;
}

/** "2026-08-28T13:00:00.000Z" -> "13:00 h". */
export function formatTicketTime(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes} h`;
}
/**
 * La marca de agua es un fondo tenue: su opacidad real va de 0 a 0.10. La barra del panel la
 * enseña de 0% a 100%, así que el 100% de la barra es una opacidad real de 0.10 (un 10%).
 * Lo que se guarda (y lo que pintan la vista previa y el PDF) es siempre la opacidad real.
 */
export const OPACIDAD_MAXIMA_MARCA_AGUA = 0.1;

/** Opacidad real (0..0.10) -> posición de la barra (0..100). */
export function opacidadEnBarra(opacidad: number): number {
  const valor = Number.isFinite(opacidad) ? opacidad : 0;
  return Math.round(Math.min(100, Math.max(0, (valor / OPACIDAD_MAXIMA_MARCA_AGUA) * 100)));
}

/** Posición de la barra (0..100) -> opacidad real (0..0.10). */
export function opacidadReal(porcentajeBarra: number): number {
  const porcentaje = Math.min(100, Math.max(0, Number.isFinite(porcentajeBarra) ? porcentajeBarra : 0));
  return Math.round(porcentaje * OPACIDAD_MAXIMA_MARCA_AGUA * 10) / 1000;
}
