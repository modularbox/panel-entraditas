import type { Event } from "@entraditas/types";

/**
 * El texto sin el HTML que pinta el editor enriquecido de la descripcion: un "<p></p>"
 * vacio cuenta como descripcion en blanco y, por tanto, obligatoria sin rellenar.
 */
export function plainText(value?: string | null): string {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Los campos obligatorios de la plantilla: los que exige Publicar a la hora de crear un evento y
 * el detalle antes de guardar. Debajo del nombre con el que los ve la lista de la revision.
 */
export function camposObligatoriosFaltantes(event?: Event | null): string[] {
  return [
    !event?.title?.trim() ? "título" : null,
    !event?.category?.trim() ? "categoría" : null,
    !plainText(event?.description) ? "descripción" : null,
    !event?.location?.trim() ? "ubicación" : null,
    !event?.locality?.trim() ? "localidad" : null
  ].filter((x): x is string => Boolean(x));
}

/** La fecha cuenta como lista cuando esta confirmada o el evento avisa de que se confirma luego. */
export function fechaDelEventoLista(event?: Event | null): boolean {
  return Boolean(event?.datePending || event?.startsAt);
}