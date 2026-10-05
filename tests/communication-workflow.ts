import { expect, type Page, type Browser } from "@playwright/test";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
export async function communicationWorkflow(
  owner: Page,
  builder: Page,
  browser: Browser,
  slug: string,
  client: ConvexHttpClient,
) {
  const detail = (await client.query(api.manage.detail, { slug }))!,
    eventId = detail.event._id;
  await owner.goto(`/e/${slug}/manage`);
  await owner
    .getByRole("button", { name: "Comunicación", exact: true })
    .click();
  await expect(
    owner.getByRole("heading", { name: "Comunicación del evento" }),
  ).toBeVisible();
  await owner
    .getByLabel("Asunto", { exact: true })
    .fill("Aviso de comunicación {{eventName}}");
  await owner
    .getByLabel("Mensaje en Markdown")
    .fill("Hola {{name}}, novedades para {{teamName}}.");
  await owner
    .getByRole("button", { name: "Enviarme una prueba", exact: true })
    .click();
  await expect(
    owner.getByText("Prueba encolada para tu correo verificado.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    owner.locator(".recipient-list").getByText("Buzón local", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await owner
    .getByRole("button", { name: "Enviar campaña", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        const campaigns = await client.query(api.communication.campaigns, {
          eventId,
        });
        return campaigns.find(
          (c) => c.subject === "Aviso de comunicación {{eventName}}",
        )?.status;
      },
      { timeout: 30000 },
    )
    .toBe("sent");
  await builder.goto(`/e/${slug}/dashboard`);
  await builder.getByText(/Correos del buzón local/).click();
  const mail = builder
    .locator("details")
    .filter({
      has: builder
        .locator("summary")
        .filter({ hasText: "Correos del buzón local" }),
    });
  await expect(
    mail.getByText("Resultados publicados:", { exact: false }),
  ).toBeVisible();
  await expect(
    mail.getByText(/Hola Builder de fase cuatro, novedades para/),
  ).toBeVisible();
  const link = mail.getByRole("link", { name: /Dejar de recibir anuncios/ });
  const href = await link.first().getAttribute("href");
  expect(href).toMatch(/\/unsubscribe\/[a-f0-9]{64}/);
  await builder.goto(new URL(href!).pathname);
  await builder
    .getByRole("button", { name: "Confirmar baja", exact: true })
    .click();
  await expect(builder.getByText(/Baja confirmada/)).toBeVisible();
  await builder.goto(`/e/${slug}/dashboard`);
  await expect(
    builder.getByRole("checkbox", {
      name: "Recibir anuncios de este evento por correo",
    }),
  ).not.toBeChecked();
  await builder
    .getByRole("checkbox", {
      name: "Recibir anuncios de este evento por correo",
    })
    .check();
  await expect(
    builder.getByText("Preferencia guardada.", { exact: true }),
  ).toBeVisible();
  await owner
    .getByRole("button", { name: "Anuncios en la app", exact: true })
    .click();
  await owner
    .getByLabel("Título del anuncio")
    .fill("Aviso público de fase siete");
  await owner
    .getByLabel("Contenido del anuncio")
    .fill("Ya están publicados los resultados.");
  await owner
    .getByRole("button", { name: "Publicar anuncio", exact: true })
    .click();
  await expect(
    owner.getByText("Anuncio publicado.", { exact: true }),
  ).toBeVisible();
  await owner
    .getByLabel("Título del anuncio")
    .fill("Aviso privado para participantes");
  await owner
    .getByLabel("Contenido del anuncio")
    .fill("Próxima reunión del equipo.");
  await owner.getByLabel("Visible para").selectOption("participants");
  await owner
    .getByRole("button", { name: "Publicar anuncio", exact: true })
    .click();
  await expect(
    builder.getByRole("heading", {
      name: "Aviso privado para participantes",
      exact: true,
    }),
  ).toBeVisible();
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto(`/e/${slug}`);
    await expect(
      page.getByRole("heading", {
        name: "Aviso público de fase siete",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Aviso privado para participantes",
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/communication-mobile.png",
      fullPage: true,
    });
  } finally {
    await context.close();
  }
  await owner
    .getByRole("button", { name: "Campañas de correo", exact: true })
    .click();
  await owner
    .getByRole("button", { name: "Nueva campaña", exact: true })
    .click();
  await owner
    .getByLabel("Asunto", { exact: true })
    .fill("Campaña programada cancelable");
  const future = new Date(Date.now() + 3600000);
  const local = new Date(future.getTime() - future.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
  await owner.getByLabel("Programar para (hora local, opcional)").fill(local);
  await owner
    .getByRole("button", { name: "Programar campaña", exact: true })
    .click();
  await expect(
    owner.getByRole("button", { name: "Cancelar campaña", exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await owner
    .getByRole("button", { name: "Cancelar campaña", exact: true })
    .click();
  await expect(
    owner.getByText(/Campaña cancelada\. Los correos/),
  ).toBeVisible();
}
