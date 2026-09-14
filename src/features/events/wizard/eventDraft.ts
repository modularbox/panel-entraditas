/**
 * Lo que alguien estaba escribiendo de un evento y todavía no se ha guardado en ningún sitio.
 *
 * Existe porque el paso 1 del asistente se puede tener abierto un buen rato -portada, galería,
 * descripción- y hasta que se pulsa "Guardar y continuar" no existe en ninguna parte. Si la
 * sesión se cae en ese rato, o se recarga la página sin querer, se pierde entero y hay que
 * volver a escribirlo todo.
 *
 * Se guarda según se escribe, no solo al fallar: un fallo no es la única forma de perderlo.
 */
const CLAVE = "entraditas.panel.borradorEvento";

/**
 * Una portada y una galería en data URL ocupan megas, y localStorage tiene unos 5 MB para todo
 * el dominio. Pasado este tamaño se guarda el borrador SIN las imágenes: es mejor recuperar el
 * texto y volver a adjuntar la portada que no recuperar nada porque el navegador se negó.
 */
const LIMITE_CON_IMAGENES = 700_000;

export interface EventDraft {
  /** El evento al que pertenece, o null cuando todavía no se ha creado. */
  eventId: string | null;
  valores: Record<string, unknown>;
  guardadoEn: string;
  /** Se quedaron fuera por tamaño; hay que decirlo al recuperarlo. */
  imagenesOmitidas: boolean;
}

const CAMPOS_DE_IMAGEN = ["coverImageUrl", "gallery"] as const;

function sinImagenes(valores: Record<string, unknown>): Record<string, unknown> {
  const copia = { ...valores };
  for (const campo of CAMPOS_DE_IMAGEN) delete copia[campo];
  return copia;
}

export function guardarBorrador(eventId: string | null, valores: Record<string, unknown>): void {
  const escribir = (cuerpo: EventDraft) => localStorage.setItem(CLAVE, JSON.stringify(cuerpo));
  const completo: EventDraft = { eventId, valores, guardadoEn: new Date().toISOString(), imagenesOmitidas: false };
  const ligero: EventDraft = { ...completo, valores: sinImagenes(valores), imagenesOmitidas: true };
  try {
    escribir(JSON.stringify(completo).length > LIMITE_CON_IMAGENES ? ligero : completo);
  } catch {
    // Casi siempre es la cuota: se reintenta sin las imágenes, que es lo que la llena.
    try {
      escribir(ligero);
    } catch {
      // Un navegador con el almacenamiento bloqueado no puede guardar borradores. Que no se
      // pueda guardar lo que se escribe no es motivo para romper lo que se está escribiendo.
    }
  }
}

/** El borrador guardado, si es de este evento. Uno de otro evento no pinta nada aquí. */
export function leerBorrador(eventId: string | null): EventDraft | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const borrador = JSON.parse(crudo) as EventDraft;
    if (!borrador || typeof borrador !== "object" || typeof borrador.valores !== "object") return null;
    return borrador.eventId === eventId ? borrador : null;
  } catch {
    return null;
  }
}

export function borrarBorrador(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que hacer; se sobrescribirá con el siguiente.
  }
}

/** "hace un momento", "hace 12 minutos", "el 14/09 a las 17:05". */
export function describirGuardado(guardadoEn: string, ahora: Date = new Date()): string {
  const fecha = new Date(guardadoEn);
  if (Number.isNaN(fecha.getTime())) return "hace un momento";
  const minutos = Math.floor((ahora.getTime() - fecha.getTime()) / 60_000);
  if (minutos < 1) return "hace un momento";
  if (minutos < 60) return `hace ${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;
  const dosCifras = (valor: number) => String(valor).padStart(2, "0");
  const mismoDia = fecha.toDateString() === ahora.toDateString();
  const hora = `${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`;
  return mismoDia ? `hoy a las ${hora}` : `el ${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)} a las ${hora}`;
}
