import { test, expect } from "@playwright/test";
test("real catalog filters, empty search, absent demo details and wallet notice work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByLabel("Buscar eventos")).toBeVisible();
  await expect(page.locator(".demo-card-label")).toHaveCount(0);
  await page.getByRole("button", { name: "Hackathons", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Hackathons", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Modalidad", { exact: true }).selectOption("Online");
  await page.getByLabel("Buscar eventos").fill(`no-such-event-${Date.now()}`);
  await expect(page.locator(".event-card")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No encontramos eventos", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Limpiar filtros", exact: true })
    .click();
  await expect(page.getByLabel("Buscar eventos")).toHaveValue("");
  await expect(page.getByLabel("Modalidad", { exact: true })).toHaveValue(
    "Todos",
  );
  await expect(
    page.getByRole("button", { name: "Todos los eventos", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goto("/e/stellar-build-latam");
  await expect(
    page.getByRole("heading", { name: "Evento no encontrado", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Volver a explorar", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Conectar wallet", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});
test("mobile layout stays within viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:5173");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir navegación" }).click();
  await expect(page.getByRole("link", { name: "Cómo funciona" })).toBeVisible();
  await page.screenshot({ path: "/tmp/hacks-mobile.png", fullPage: true });
});
test("desktop visual preview", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("http://127.0.0.1:5173");
  await page.screenshot({ path: "/tmp/hacks-desktop.png", fullPage: true });
});
