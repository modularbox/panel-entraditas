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