import { expect, test } from "@playwright/test";

test("admin logs in, creates a full event through the wizard, and publishes it", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Correo electrónico").fill("admin@entraditas.com");
  await page.getByLabel("Contraseña").fill("admin1234");
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { name: "Eventos" })).toBeVisible();
  await page.getByRole("link", { name: "Crear evento" }).click();

  // Step 1 — Datos básicos
  await page.getByLabel("Título").fill("Evento E2E");
  await page.getByLabel("Descripción").fill("Creado por el test E2E del camino feliz");
  await page.getByRole("button", { name: "Guardar y continuar" }).click();

  // Step 2 — Fechas y subeventos: generate the event's one function
  await page.getByLabel("Fecha de inicio").fill("2026-12-05");
  await page.getByLabel("Número de funciones").fill("1");
  await page.getByRole("button", { name: "Generar funciones" }).click();
  await expect(page.getByRole("list", { name: "Funciones" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 3 — Tipos de entrada
  await page.getByLabel("Nombre").fill("General");
  await page.getByLabel("Precio (céntimos)").fill("1000");
  await page.getByRole("button", { name: "Crear tipo de entrada" }).click();
  await expect(page.getByRole("list", { name: "Tipos de entrada" }).getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 4 — Aforos y zonas: defaults are fine for the smoke test
  await page.getByRole("button", { name: "Continuar" }).click();

  // Step 5 — Control de acceso
  await page.getByRole("button", { name: "Siguiente" }).click();

  // Step 6 — Códigos de descuento
  await page.getByRole("button", { name: "Siguiente" }).click();

  // Step 7 — Diseño de entradas: se guarda el diseño por defecto para poder seguir
  await page.getByRole("button", { name: "Guardar diseño" }).click();
  await expect(page.getByText("Diseño de la entrada guardado.")).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();

  // Step 8 — Publicación
  await expect(page.getByText("Hay al menos un tipo de entrada")).toBeVisible();
  await page.getByRole("button", { name: "Enviar a revisión" }).click();
  await page.getByRole("button", { name: "Sí, enviar" }).click();
  await expect(page.getByRole("heading", { name: "Evento E2E" })).toBeVisible();

  // The published event shows up back in the list.
  // Use in-app navigation (not page.goto) so the SPA's in-memory auth
  // session and MSW-mocked data survive — a full page load would reset both.
  await page.getByRole("link", { name: "Eventos" }).click();
  await expect(page.getByRole("cell", { name: "Evento E2E" })).toBeVisible();
});
