import { expect, type Page, type Browser } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
export async function contentWorkflow(
  page: Page,
  browser: Browser,
  slug: string,
  client: ConvexHttpClient,
) {
  const anonymousContext = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
    }),
    anonymous = await anonymousContext.newPage();
  try {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await anonymous.goto(`/e/${slug}`);
    await expect(
      anonymous.getByRole("heading", {
        name: "Evento no encontrado",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tema", exact: true }).click();
    await page.getByLabel("Color accent", { exact: true }).fill("#f4b860");
    await page
      .getByLabel("Fuente de títulos", { exact: true })
      .selectOption("Space Grotesk");
    await page.getByLabel("Subir Logo", { exact: true }).setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a28sAAAAASUVORK5CYII=",
        "base64",
      ),
    });
    await expect(
      page.getByText("Archivo subido. Guarda el contenido para utilizarlo.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Guardar tema", exact: true })
      .click();
    await expect(
      page.getByText("Cambios guardados.", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".design-preview .event-page")).toHaveCSS(
      "--event-accent",
      "#f4b860",
    );
    await page.getByRole("button", { name: "Tracks", exact: true }).click();
    await page
      .getByLabel("Nombre del track", { exact: true })
      .fill("Soroban para todos");
    await page
      .getByLabel("Descripción del track", { exact: true })
      .fill("Contratos que resuelven problemas reales.");
    await page.getByLabel("Premio", { exact: true }).fill("1,000 USDC");
    await page
      .getByRole("button", { name: "Guardar track", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Soroban para todos", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Mentores", exact: true }).click();
    await page
      .getByLabel("Nombre del mentor", { exact: true })
      .fill("Mentora Stellar");
    await page
      .getByLabel("Áreas (una por línea, hasta ocho)", { exact: true })
      .fill("Soroban\nStellar");
    await page
      .getByLabel("Contacto", { exact: true })
      .fill("contacto-privado@example.com");
    await page
      .getByLabel("Disponibilidad", { exact: true })
      .fill("Martes de 16:00 a 18:00 UTC");
    await page
      .getByRole("button", { name: "Guardar mentor", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Mentora Stellar", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Recursos", exact: true }).click();
    await page
      .getByLabel("Título del recurso", { exact: true })
      .fill("Guía pública de Stellar");
    await page
      .getByLabel("Tipo de recurso", { exact: true })
      .selectOption("markdown");
    await page
      .getByLabel("Contenido Markdown", { exact: true })
      .fill(
        "**Construye** con seguridad. <script>window.__unsafe = true</script> [enlace inseguro](javascript:alert(1))",
      );
    await page
      .getByRole("button", { name: "Guardar recurso", exact: true })
      .click();
    await expect(
      page.getByRole("heading", {
        name: "Guía pública de Stellar",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel("Título del recurso", { exact: true })
      .fill("Archivo de staff");
    await page
      .getByLabel("Tipo de recurso", { exact: true })
      .selectOption("file");
    await page.getByLabel("Visibilidad", { exact: true }).selectOption("staff");
    await page
      .getByLabel("Subir Archivo del recurso", { exact: true })
      .setInputFiles({
        name: "staff.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Contenido privado del staff"),
      });
    await expect(
      page.getByText("Archivo subido. Guarda el contenido para utilizarlo.", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Guardar recurso", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Archivo de staff", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Página", exact: true }).click();
    const hero = page.locator(".block-editor-row").first();
    await hero
      .getByLabel("Título", { exact: true })
      .fill("Construye el futuro con Stellar");
    await expect(
      page.locator(".design-preview").getByRole("heading", {
        name: "Construye el futuro con Stellar",
        exact: true,
      }),
    ).toBeVisible();
    for (const type of ["tracks", "mentors", "resources", "faq"]) {
      await page.getByLabel("Nuevo bloque", { exact: true }).selectOption(type);
      await page
        .getByRole("button", { name: "Añadir bloque", exact: true })
        .click();
    }
    const faq = page.locator(".block-editor-row").last();
    await faq
      .getByLabel("Preguntas (una por línea)", { exact: true })
      .fill("¿Necesito experiencia?");
    await faq
      .getByLabel("Respuestas (una por línea)", { exact: true })
      .fill("Puedes aprender con mentores.");
    const handle = faq.getByRole("button", {
      name: "Arrastrar bloque",
      exact: true,
    });
    await handle.focus();
    await page.keyboard.press("Space");
    await expect(page.locator(".block-editor-row.dragging")).toHaveCount(1);
    // KeyboardSensor attaches listeners on the next task; wait for layout frames.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.keyboard.press("ArrowUp");
    await expect(
      page.getByRole("status").filter({ hasText: "Sobre Recursos." }),
    ).toHaveCount(1);
    await page.keyboard.press("Space");
    await expect(
      page
        .locator(".block-editor-row")
        .nth(5)
        .getByRole("heading", { name: "Preguntas frecuentes", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Bajar Preguntas frecuentes", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: "Subir bloque Preguntas frecuentes",
        exact: true,
      })
      .click();
    await expect(
      page
        .locator(".block-editor-row")
        .nth(5)
        .getByRole("heading", { name: "Preguntas frecuentes", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Guardar página", exact: true })
      .click();
    await expect(
      page.getByText("Cambios guardados.", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "/tmp/hacks-phase3-editor-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "/tmp/hacks-phase3-editor-mobile.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole("button", { name: "Resumen", exact: true }).click();
    await page
      .getByRole("button", { name: "Publicar evento", exact: true })
      .click();
    await expect(
      page.getByText("Evento publicado.", { exact: true }),
    ).toBeVisible();
    await anonymous.reload();
    await expect(
      anonymous.getByRole("heading", {
        name: "Construye el futuro con Stellar",
        exact: true,
      }),
    ).toBeVisible();
    await expect(anonymous.locator(".event-page")).toHaveCSS(
      "--event-accent",
      "#f4b860",
    );
    await expect(
      anonymous.getByRole("heading", {
        name: "Soroban para todos",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      anonymous.getByRole("heading", { name: "Mentora Stellar", exact: true }),
    ).toBeVisible();
    await expect(
      anonymous.getByText("contacto-privado@example.com", { exact: true }),
    ).toHaveCount(0);
    await expect(
      anonymous.getByRole("heading", {
        name: "Guía pública de Stellar",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      anonymous.getByRole("heading", { name: "Archivo de staff", exact: true }),
    ).toHaveCount(0);
    expect(
      await anonymous.evaluate(() => Object.hasOwn(window, "__unsafe")),
    ).toBe(false);
    await expect(anonymous.locator('a[href^="javascript:"]')).toHaveCount(0);
    await expect(
      anonymous.getByRole("img", {
        name: "Logo de Prueba Buildathon Stellar",
        exact: true,
      }),
    ).toBeVisible();
    await anonymous
      .getByText("¿Necesito experiencia?", { exact: true })
      .click();
    await expect(
      anonymous.getByText("Puedes aprender con mentores.", { exact: true }),
    ).toBeVisible();
    await anonymous.screenshot({
      path: "/tmp/hacks-phase3-public-desktop.png",
      fullPage: true,
    });
    await anonymous.setViewportSize({ width: 390, height: 844 });
    expect(
      await anonymous.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await anonymous.screenshot({
      path: "/tmp/hacks-phase3-public-mobile.png",
      fullPage: true,
    });
    await anonymous.goto("/");
    await expect(anonymous.locator(`a[href="/e/${slug}"]`)).toBeVisible();
    const event = (await client.query(api.manage.detail, { slug }))!.event;
    const resources = await client.query(api.content.resourcesList, {
      eventId: event._id,
    });
    const file = resources.find((r) => r.title === "Archivo de staff")!;
    expect(
      (
        await anonymous.request.get(
          `http://127.0.0.1:3211/event-file?resourceId=${file._id}`,
        )
      ).status(),
    ).toBe(404);
    const session = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("hacks.wallet-session.v1")!),
    );
    const download = await page.request.get(
      `http://127.0.0.1:3211/event-file?resourceId=${file._id}`,
      { headers: { Authorization: `Bearer ${session.token}` } },
    );
    expect(download.status()).toBe(200);
    expect(await download.text()).toBe("Contenido privado del staff");
    await page
      .getByRole("button", { name: "Archivar evento", exact: true })
      .click();
    await expect(
      page.getByText("Evento archivado.", { exact: true }),
    ).toBeVisible();
    await anonymous.goto(`/e/${slug}`);
    await expect(
      anonymous.getByRole("heading", {
        name: "Evento no encontrado",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Restaurar borrador", exact: true })
      .click();
    await expect(
      page.getByText("Evento restaurado como borrador.", { exact: true }),
    ).toBeVisible();
  } finally {
    await anonymousContext.close();
  }
}
