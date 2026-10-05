import { projectWorkflow } from "./project-workflow";
import { expect, type Page, type Browser } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { mockFreighter, startLogin } from "./wallet-helper";
import { readFile } from "node:fs/promises";
export async function registrationWorkflow(
  page: Page,
  browser: Browser,
  slug: string,
  client: ConvexHttpClient,
) {
  const context = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
    }),
    participant = await context.newPage();
  try {
    const detail = (await client.query(api.manage.detail, { slug }))!;
    const e = detail.event,
      now = Date.now();
    await client.mutation(api.manage.update, {
      eventId: e._id,
      name: e.name,
      tagline: e.tagline ?? "",
      description: e.description ?? "",
      format: e.format,
      location: e.location ?? "",
      timezone: e.timezone,
      settings: { ...e.settings, admission: "manual", capacity: 1 },
      timeline: {
        registrationOpensAt: now - 3600000,
        registrationClosesAt: now + 3600000,
        startsAt: now - 1800000,
        submissionOpensAt: now - 1800000,
        submissionClosesAt: now + 7200000,
        judgingClosesAt: now + 10800000,
        resultsAt: now + 14400000,
      },
    });
    await page
      .getByRole("button", { name: "Formularios", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Añadir campo", exact: true })
      .click();
    const first = page.locator(".form-editor-field").first();
    await first
      .getByLabel("Etiqueta del campo", { exact: true })
      .fill("¿Qué quieres construir?");
    await first.getByText("Obligatorio", { exact: true }).click();
    await page.getByLabel("Nuevo campo", { exact: true }).selectOption("file");
    await page
      .getByRole("button", { name: "Añadir campo", exact: true })
      .click();
    const second = page.locator(".form-editor-field").nth(1);
    await second
      .getByLabel("Etiqueta del campo", { exact: true })
      .fill("Tu presentación");
    await second
      .getByLabel("Formatos permitidos", { exact: true })
      .fill("text/plain");
    await page
      .getByLabel("Nuevo campo", { exact: true })
      .selectOption("short_text");
    await page
      .getByRole("button", { name: "Añadir campo", exact: true })
      .click();
    const third = page.locator(".form-editor-field").nth(2);
    await third
      .getByLabel("Etiqueta del campo", { exact: true })
      .fill("Dato privado para organización");
    await third
      .getByLabel("Acceso del staff", { exact: true })
      .selectOption("organizers");
    await page
      .getByRole("button", { name: "Guardar formulario", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Publicar formulario", exact: true })
      .click();
    await expect(
      page.getByText("Formulario publicado.", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("Versión 1 · Publicada.", { exact: false }),
    ).toBeVisible();
    await client.mutation(api.content.status, {
      eventId: e._id,
      status: "published",
    });
    await mockFreighter(participant, Keypair.random());
    await startLogin(participant);
    await expect(
      participant.getByText("Sesión iniciada · Testnet"),
    ).toBeVisible({ timeout: 20000 });
    await participant
      .getByRole("link", { name: "Completar mi perfil", exact: true })
      .click();
    await participant
      .getByLabel("Nombre", { exact: true })
      .fill("Builder de fase cuatro");
    await participant
      .getByRole("button", { name: "Guardar perfil", exact: true })
      .click();
    await expect(
      participant.getByText("Perfil guardado.", { exact: true }),
    ).toBeVisible();
    await participant
      .getByLabel("Correo", { exact: true })
      .fill("fase-cuatro@example.com");
    await participant
      .getByRole("button", { name: "Solicitar código", exact: true })
      .click();
    await participant
      .getByText("Buzón local de desarrollo", { exact: true })
      .click();
    const code = participant.locator(".development-mailbox output");
    await expect(code).toHaveText(/^[0-9]{6}$/);
    await participant
      .getByLabel("Código de 6 dígitos")
      .fill((await code.textContent())!);
    await participant
      .getByRole("button", { name: "Verificar correo", exact: true })
      .click();
    await expect(
      participant.getByText("✓ Verificado: fase-cuatro@example.com", {
        exact: true,
      }),
    ).toBeVisible();
    await participant.goto(`/e/${slug}`);
    await participant
      .getByRole("link", { name: "Inscribirme", exact: true })
      .first()
      .click();
    await participant
      .getByLabel("¿Qué quieres construir?", { exact: true })
      .fill("=Proyecto Stellar seguro");
    await participant
      .getByLabel("Tu presentación", { exact: true })
      .setInputFiles({
        name: "presentacion.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Presentación privada del builder"),
      });
    await expect(
      participant.getByText("Archivo preparado: presentacion.txt", {
        exact: true,
      }),
    ).toBeVisible();
    await participant
      .getByLabel("Dato privado para organización", { exact: true })
      .fill("Información reservada");
    await participant
      .getByText("Acepto las reglas del evento", { exact: true })
      .click();
    await participant
      .getByText("Acepto el tratamiento de mis datos personales", {
        exact: true,
      })
      .click();
    await participant.setViewportSize({ width: 390, height: 844 });
    expect(
      await participant.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await participant.screenshot({
      path: "test-results/registration-mobile.png",
      fullPage: true,
    });
    await participant
      .getByRole("button", { name: "Enviar inscripción", exact: true })
      .click();
    await expect(participant).toHaveURL(new RegExp(`/e/${slug}/dashboard`));
    await expect(
      participant.getByText("En revisión", { exact: true }),
    ).toBeVisible();
    await expect(
      participant.getByRole("button", {
        name: "Mostrar Hacker Pass",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Participantes", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Builder de fase cuatro",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Seleccionar Builder de fase cuatro", { exact: true })
      .check();
    await page
      .getByRole("button", { name: "Aprobar selección", exact: true })
      .click();
    await expect(
      page.locator(".registration-row").getByText("Aprobada", { exact: true }),
    ).toBeVisible();
    await expect(
      participant.getByText("Aprobada", { exact: true }),
    ).toBeVisible();
    await participant
      .getByRole("button", { name: "Mostrar Hacker Pass", exact: true })
      .click();
    const qr = participant.getByAltText(
      "QR del Hacker Pass de Builder de fase cuatro",
      { exact: true },
    );
    await expect(qr).toBeVisible();
    expect(
      await participant.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await participant.screenshot({
      path: "test-results/hacker-pass-mobile.png",
      fullPage: true,
    });
    const csvPromise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar CSV", exact: true })
      .click();
    const csvDownload = await csvPromise,
      csv = await readFile((await csvDownload.path())!, "utf8");
    expect(csv).toContain("¿Qué quieres construir?");
    expect(csv).toContain("'=Proyecto Stellar seguro");
    expect(csv).toContain("Información reservada");
    const qrSource = await qr.getAttribute("src");
    await page.getByLabel("Imagen del QR", { exact: true }).setInputFiles({
      name: "pase.png",
      mimeType: "image/png",
      buffer: Buffer.from(qrSource!.split(",")[1], "base64"),
    });
    await expect(
      page.getByText("QR válido. Check-in confirmado.", { exact: true }),
    ).toBeVisible({ timeout: 20000 });
    await expect(
      participant.getByText("Check-in confirmado", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Formularios", exact: true })
      .click();
    await page
      .locator(".form-editor-field")
      .first()
      .getByLabel("Etiqueta del campo", { exact: true })
      .fill("La nueva pregunta");
    await page
      .getByRole("button", { name: "Guardar formulario", exact: true })
      .click();
    await expect(
      page.getByText("Borrador guardado.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Publicar formulario", exact: true })
      .click();
    await expect(
      page.getByText("Formulario publicado.", { exact: true }),
    ).toBeVisible();
    await expect(
      participant
        .getByRole("term")
        .filter({ hasText: "¿Qué quieres construir?" }),
    ).toBeVisible();
    await participant.goto("/manage");
    await participant
      .getByRole("button", { name: "Mis inscripciones", exact: true })
      .click();
    await participant
      .getByRole("link", { name: /Check-in confirmado/ })
      .click();
    await expect(participant).toHaveURL(new RegExp(`/e/${slug}/dashboard`));
    await projectWorkflow(page, participant, slug, client, browser);
  } finally {
    const detail = await client.query(api.manage.detail, { slug });
    if (detail?.event.status === "published")
      await client.mutation(api.content.status, {
        eventId: detail.event._id,
        status: "draft",
      });
    await context.close();
  }
}
