/**
 * Cuántos caracteres cabe escribir en cada casilla del panel.
 *
 * Sin un tope, una casilla acepta un libro: el texto se va desplazando y deja de verse el
 * principio de lo escrito, que es justo lo que hace falta para revisarlo antes de guardar. Y lo
 * que se escriba aquí acaba en la web, en una entrada y en una factura.
 *
 * Están juntos y no repartidos por cada formulario para que "el nombre" mida lo mismo en el
 * asistente de eventos, en el equipo y en los códigos de descuento. Son los mismos valores que
 * usa la web pública (`ENTRADITAS/src/lib/formLimits.ts`): los dos lados guardan en las mismas
 * columnas, así que un tope distinto solo serviría para que una de las dos pantallas mintiera.
 */
export const LIMITES = {
  /** Nombre de pila. */
  nombre: 40,
  /** Apellidos: en España son dos, y los compuestos existen. */
  apellidos: 60,
  /** Nombre completo en una sola casilla. */
  nombreCompleto: 100,
  /** Lo que admite un correo por norma (RFC 5321). */
  email: 254,
  /** Prefijo incluido, con espacios. */
  telefono: 20,
  /** DNI, NIE, CIF o pasaporte. */
  documento: 20,
  /** Contraseña. */
  contrasena: 64,
  /** Búsquedas y filtros. */
  busqueda: 80,
  /** Título de un evento, nombre de un recinto, de una zona o de un tipo de entrada. */
  titulo: 120,
  /** Localidad, dirección, cargo: una línea. */
  linea: 120,
  /** Un código de descuento. */
  codigo: 32,
  /** Una descripción corta (la que se lee en la tarjeta del evento). */
  descripcionCorta: 300,
  /** Un texto largo: la ficha del evento, los términos de una entrada. */
  texto: 2000,
  /** Una nota interna o un motivo de reembolso. */
  nota: 500
} as const;

export type LimiteCampo = keyof typeof LIMITES;
