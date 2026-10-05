import { communicationWorkflow } from "./communication-workflow";
import { expect, type Page, type Browser } from "@playwright/test";
import { judgingWorkflow } from "./judging-workflow";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { DEFAULT_RULES, DEFAULT_CONSENT } from "../convex/lib/formEngine";
export async function projectWorkflow(
  page: Page,
  participant: Page,
  slug: string,
  client: ConvexHttpClient,
  browser: Browser,
) {
  const detail = (await client.query(api.manage.detail, { slug }))!,
    e = detail.event;
  await client.mutation(api.manage.update, {
    eventId: e._id,
    name: e.name,
    tagline: e.tagline ?? "",
    description: e.description ?? "",
    format: e.format,
    location: e.location ?? "",
    timezone: e.timezone,
    timeline: e.timeline,
    settings: {
      ...e.settings,
      teamSizeMin: 1,
      teamSizeMax: 4,
      requiredCheckpoints: 1,
    },
  });
  const formId = await client.mutation(api.forms.save, {
    eventId: e._id,
    kind: "submission",
    expectedRevision: 0,
    rulesText: DEFAULT_RULES,
    consentText: DEFAULT_CONSENT,
    fields: [
      {
        id: "impact",
        label: "Impacto del proyecto",
        type: "long_text",
        required: true,
      },
      {
        id: "attachment",
        label: "Documentación privada",
        type: "file",
        required: true,
        validation: { accept: "text/plain", maxFileMB: 1 },
      },
    ],
  });
  await client.mutation(api.forms.publish, {
    eventId: e._id,
    id: formId,
    expectedRevision: 1,
  });
  await page.getByRole("button", { name: "Checkpoints", exact: true }).click();
  await page
    .getByLabel("Título del checkpoint", { exact: true })
    .fill("Primer prototipo");
  await page
    .getByLabel("Descripción del checkpoint", { exact: true })
    .fill("Muestra el primer avance del proyecto.");
  await page
    .getByLabel("Fecha límite del checkpoint (UTC)", { exact: true })
    .fill(new Date(Date.now() + 3600000).toISOString().slice(0, 16));
  await page
    .getByRole("button", { name: "Guardar checkpoint", exact: true })
    .click();
  await expect(
    page.getByText("Checkpoint guardado.", { exact: true }),
  ).toBeVisible();
  await participant
    .getByLabel("Nombre del equipo", { exact: true })
    .fill("Equipo Stellar E2E");
  await participant
    .getByLabel("Descripción del equipo", { exact: true })
    .fill("Construimos una aplicación de remesas.");
  await participant
    .getByRole("button", { name: "Crear mi equipo", exact: true })
    .click();
  await expect(
    participant.getByRole("heading", {
      name: "Equipo Stellar E2E",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    participant.getByLabel("Código de invitación del equipo", { exact: true }),
  ).toHaveValue(/^[A-F0-9]{12}$/);
  await expect(
    participant.getByLabel("Enlace de invitación del equipo", { exact: true }),
  ).toHaveValue(new RegExp(`/e/${slug}/join/`));
  await participant
    .getByRole("button", { name: "Checkpoints", exact: true })
    .click();
  await participant
    .getByLabel("Avance del equipo", { exact: true })
    .fill("El prototipo permite simular una remesa con Stellar.");
  await participant
    .getByRole("button", { name: "Enviar checkpoint", exact: true })
    .click();
  await expect(
    participant.getByText("Checkpoint enviado a revisión.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Aceptar checkpoint", exact: true })
    .click();
  await expect(page.getByText("Aceptado", { exact: true })).toBeVisible();
  await expect(
    participant.getByText("Aceptado", { exact: true }),
  ).toBeVisible();
  await participant
    .getByRole("button", { name: "Proyecto", exact: true })
    .click();
  await participant
    .getByLabel("Título del proyecto", { exact: true })
    .fill("Remesas Stellar");
  await participant
    .getByLabel("Resumen del proyecto", { exact: true })
    .fill(
      "Nuestra aplicación facilita remesas con Stellar y un seguimiento transparente de cada pago.",
    );
  await participant
    .getByLabel("Repositorio HTTPS", { exact: true })
    .fill("https://github.com/stellar/stellar-sdk");
  await participant
    .getByLabel("Impacto del proyecto", { exact: true })
    .fill("Reducimos el costo y tiempo de las remesas.");
  await participant
    .getByLabel("Documentación privada", { exact: true })
    .setInputFiles({
      name: "documentacion.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Documentación privada del proyecto de prueba."),
    });
  await expect(
    participant.getByText("Archivo preparado: documentacion.txt", {
      exact: true,
    }),
  ).toBeVisible();
  await participant
    .getByLabel("Imágenes del proyecto", { exact: true })
    .setInputFiles({
      name: "proyecto.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a42kAAAAASUVORK5CYII=",
        "base64",
      ),
    });
  await expect(
    participant.getByText("Imagen preparada.", { exact: true }),
  ).toBeVisible();
  await participant
    .getByRole("button", { name: "Guardar borrador", exact: true })
    .click();
  await expect(
    participant.getByText("Borrador guardado.", { exact: true }),
  ).toBeVisible();
  await expect(
    participant.getByText("Todavía no hay una entrega final.", { exact: true }),
  ).toBeVisible();
  await participant
    .getByRole("button", { name: "Entregar proyecto", exact: true })
    .click();
  await expect(
    participant.getByText("Proyecto entregado. Se guardó una nueva versión.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    participant.getByText(/Versión 1 · Remesas Stellar/),
  ).toBeVisible();
  expect(
    await participant.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await participant.screenshot({
    path: "test-results/project-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Proyectos", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Remesas Stellar · Equipo Stellar E2E",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "Imagen del proyecto" }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Descargar archivo privado", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toBe("documentacion.txt");
  await page
    .getByLabel("Motivo del proyecto de Equipo Stellar E2E")
    .fill("Completa la descripción del impacto.");
  await page
    .getByRole("button", { name: "Descalificar proyecto", exact: true })
    .click();
  await expect(
    page
      .locator(".project-review-card .manage-badge")
      .filter({ hasText: "Descalificado" }),
  ).toBeVisible();
  await expect(
    participant.getByText("Revisión: Completa la descripción del impacto.", {
      exact: true,
    }),
  ).toBeVisible();
  await participant
    .getByRole("button", { name: "Recargar proyecto guardado", exact: true })
    .click();
  await participant
    .getByLabel("Título del proyecto", { exact: true })
    .fill("Remesas Stellar v2");
  await participant
    .getByRole("button", { name: "Entregar proyecto", exact: true })
    .click();
  await expect(
    participant.getByText(/Versión 2 · Remesas Stellar v2/),
  ).toBeVisible();
  await expect(
    participant.getByText(/Versión 1 · Remesas Stellar/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Admitir proyecto", exact: true })
    .click();
  await expect(
    page
      .locator(".project-review-card .manage-badge")
      .filter({ hasText: "Admitido" }),
  ).toBeVisible();
  await participant
    .getByRole("button", { name: "Mi equipo", exact: true })
    .click();
  await expect(
    participant.getByText(/El equipo queda cerrado tras su primera entrega/),
  ).toBeVisible();
  await expect(
    participant.getByRole("button", { name: "Salir del equipo", exact: true }),
  ).toHaveCount(0);
  await judgingWorkflow(page, participant, browser, slug, client);
  await communicationWorkflow(page, participant, browser, slug, client);
}
