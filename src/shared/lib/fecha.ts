/**
 * La fecha de hoy en formato YYYY-MM-DD, en la hora del navegador. No vale `toISOString()`: con
 * un evento "hoy a las 00:30" en verano, el UTC ya es del día anterior y la fecha se colaría en el
 * pasado. Se usa como `min` de los campos de fecha para no dejar elegir días anteriores.
 */
export function hoyIso(): string {
  const dosCifras = (valor: number) => String(valor).padStart(2, "0");
  const hoy = new Date();
  return `${hoy.getFullYear()}-${dosCifras(hoy.getMonth() + 1)}-${dosCifras(hoy.getDate())}`;
}
