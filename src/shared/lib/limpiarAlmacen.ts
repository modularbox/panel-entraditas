/**
 * Lo que el panel guardaba en el navegador y ya no usa (tanda 20).
 *
 * Mientras el panel tuvo su simulador (MSW), toda su base de datos vivia en `localStorage`, con las
 * portadas de los eventos en base64 dentro: varios megas. El simulador se quito, pero esos datos
 * seguian ahi ocupando casi todo el sitio que da el navegador (unos 5 MB por web), y lo poco que
 * quedaba no llegaba ni para apuntar que evento ya se habia publicado. En la captura de Axel:
 * "Setting the value of 'entraditas.panel.ultimasFirmas' exceeded the quota".
 *
 * Se borra al arrancar. Son copias de datos que ahora viven en la base de datos del servidor.
 */
const CLAVES_QUE_YA_NO_SE_USAN = [
  "entraditas.mock.db.v2",
  "entraditas.mock.db.v1",
  "entraditas.mock.db",
  // Las firmas antiguas guardaban el cuerpo entero de cada evento; ahora es una huella.
  "entraditas.panel.ultimasFirmas"
];

export function limpiarAlmacenViejo(almacen: Pick<Storage, "removeItem"> | undefined = globalThis.localStorage): void {
  if (!almacen) return;
  for (const clave of CLAVES_QUE_YA_NO_SE_USAN) {
    try {
      almacen.removeItem(clave);
    } catch {
      // Sin acceso al almacenamiento no hay nada que liberar.
    }
  }
}
