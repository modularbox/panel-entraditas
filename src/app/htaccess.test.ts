import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * El `.htaccess` no lo ejecuta ninguna prueba: lo lee Apache en el hosting. Pero es el fichero que
 * hace que recargar en cualquier pantalla del panel funcione, y su ausencia no se nota hasta que
 * alguien recarga en `/clientes/...` y se come un 404 de Apache. Estuvo faltando desde el primer
 * despliegue.
 *
 * Esto no comprueba que Apache lo interprete —eso se ve en produccion—, sino que siga existiendo y
 * que no se le quiten por error las piezas de las que depende.
 */
const htaccess = readFileSync(resolve(__dirname, "../../public/.htaccess"), "utf8");

describe("public/.htaccess", () => {
  it("manda a index.html lo que no sea un fichero de verdad", () => {
    expect(htaccess).toMatch(/RewriteEngine\s+On/);
    expect(htaccess).toMatch(/RewriteRule\s+\^\s+index\.html\s+\[L\]/);
  });

  it("deja pasar los ficheros y carpetas que existen", () => {
    // Sin estas dos condiciones, el propio JS del panel y el mockServiceWorker.js acabarian
    // sirviendo el index.html, y el panel no arrancaria en absoluto.
    expect(htaccess).toMatch(/RewriteCond\s+%\{REQUEST_FILENAME\}\s+-f\s+\[OR\]/);
    expect(htaccess).toMatch(/RewriteCond\s+%\{REQUEST_FILENAME\}\s+-d/);
  });

  it("no cachea el index.html ni el simulador", () => {
    const bloque = htaccess.match(/<FilesMatch "\^\(index\\\.html\|mockServiceWorker\\\.js\)\$">([\s\S]*?)<\/FilesMatch>/);
    expect(bloque, "falta el bloque que evita cachear index.html y mockServiceWorker.js").not.toBeNull();
    expect(bloque![1]).toMatch(/no-store/);
  });

  /**
   * El orden importa y es facil de romper: `Header set` pisa al anterior, asi que la regla de
   * caché larga de los `.js` tiene que ir ANTES que la excepcion. Al reves, mockServiceWorker.js
   * quedaria cacheado un año por terminar en .js, que es justo lo contrario de lo que hace falta.
   */
  it("la excepcion va despues de la regla general, o no serviria de nada", () => {
    const general = htaccess.indexOf('<FilesMatch "\\.(js|css');
    const excepcion = htaccess.indexOf('<FilesMatch "^(index\\.html');
    expect(general).toBeGreaterThan(-1);
    expect(excepcion).toBeGreaterThan(general);
  });
});
