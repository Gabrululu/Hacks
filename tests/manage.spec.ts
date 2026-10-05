import { cleanupTests } from "./fixture-cleanup";
import { registrationWorkflow } from "./registration-workflow";
import { contentWorkflow } from "./content-workflow";
import { test, expect } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { localAdminSession } from "./local-admin-helper";
import { mockFreighter, startLogin } from "./wallet-helper";
test("management routes require wallet login", async ({ page }) => {
  await page.goto("/manage");
  await expect(
    page.getByRole("heading", { name: "Tu próximo evento empieza aquí." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Conectar wallet", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/organizar");
  await page
    .getByRole("link", { name: "Solicitar acceso", exact: true })
    .click();
  await expect(page).toHaveURL(/organizar\/solicitud/);
});
test("organizer approval, event settings, wallet invitation, staff permissions and revocation work end to end", async ({
  page,
  browser,
}) => {
  test.setTimeout(300000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mockFreighter(page, Keypair.random());
  await startLogin(page);
  await expect(page.getByText("Sesión iniciada · Testnet")).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("link", { name: "Ir a mi panel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Crear evento", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Solicitar acceso", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Completar perfil", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Completar perfil", exact: true })
    .click();
  await page
    .getByLabel("Nombre", { exact: true })
    .fill("Comunidad de builders");
  await page
    .getByRole("button", { name: "Guardar perfil", exact: true })
    .click();
  await expect(
    page.getByText("Perfil guardado.", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Correo", { exact: true })
    .fill("comunidad@example.com");
  await page
    .getByRole("button", { name: "Solicitar código", exact: true })
    .click();
  await page.getByText("Buzón local de desarrollo", { exact: true }).click();
  const code = page.locator(".development-mailbox output");
  await expect(code).toHaveText(/^[0-9]{6}$/);
  await page
    .getByLabel("Código de 6 dígitos")
    .fill((await code.textContent())!);
  await page
    .getByRole("button", { name: "Verificar correo", exact: true })
    .click();
  await expect(
    page.getByText("✓ Verificado: comunidad@example.com", { exact: true }),
  ).toBeVisible();
  await page.goto("/organizar/solicitud");
  const org = `Prueba Comunidad Stellar ${Date.now()}`;
  await page.getByLabel("Organización o comunidad").fill(org);
  await page
    .getByLabel("¿Qué evento quieres organizar?")
    .fill(
      "Queremos organizar un buildathon para nuestra comunidad de desarrolladores Stellar.",
    );
  await page
    .getByLabel("Enlaces de tu comunidad", { exact: false })
    .fill("https://stellar.org");
  await page
    .getByRole("button", { name: "Enviar solicitud", exact: true })
    .click();
  await expect(
    page.getByText("Tu solicitud está en revisión.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Enviar solicitud", exact: true }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(org, { exact: true })).toBeVisible();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hacks.wallet-session.v1")!),
  );
  const client = new ConvexHttpClient("http://127.0.0.1:3210");
  client.setAuth(stored.token);
  await expect(
    client.mutation(api.manage.create, {
      name: "Evento sin permiso",
      slug: "sin-permiso",
      type: "hackathon",
      timezone: "UTC",
    }),
  ).rejects.toThrow("FORBIDDEN");
  await expect(
    client.query(api.organizers.list, {
      status: "pending",
      paginationOpts: { numItems: 10, cursor: null },
    }),
  ).rejects.toThrow("FORBIDDEN");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/application-mobile.png",
    fullPage: true,
  });
  await page.goto("/manage");
  await expect(
    page.getByRole("heading", { name: "El próximo evento puede ser el tuyo." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/manage-mobile.png",
    fullPage: true,
  });
  await page.goto("/e/privado-inexistente/manage");
  await expect(
    page.getByRole("heading", { name: "Evento no disponible." }),
  ).toBeVisible();

  const adminFixture = await localAdminSession();
  const adminContext = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
  });
  const staffContext = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
  });
  try {
    await adminContext.addInitScript(
      (session) =>
        localStorage.setItem(
          "hacks.wallet-session.v1",
          JSON.stringify(session),
        ),
      adminFixture.session,
    );
    const adminPage = await adminContext.newPage();
    await mockFreighter(adminPage, {
      publicKey: () => adminFixture.session.wallet,
    });
    await adminPage.goto("/manage");
    await adminPage
      .getByRole("button", { name: "Solicitudes de organizador", exact: true })
      .click();
    const application = adminPage.locator(".manage-list article").filter({
      has: adminPage.getByRole("heading", { name: org, exact: true }),
    });
    await application.getByLabel("Eventos activos permitidos").fill("2");
    await application
      .getByLabel("Respuesta al solicitante")
      .fill("Solicitud de prueba aprobada.");
    await application
      .getByRole("button", { name: "Aprobar organizador", exact: true })
      .click();
    await expect(application).toHaveCount(0);
    await page.goto("/manage");
    await page
      .getByRole("button", { name: "Crear evento", exact: true })
      .click();
    const slug = `build-browser-${Date.now()}`,
      name = "Prueba Buildathon Stellar";
    await page.getByLabel("Idioma", { exact: true }).selectOption("en");
    await expect(
      page.getByText("Build and deploy a project with weekly updates.", {
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByLabel("Event type", { exact: true })
      .selectOption("buildathon");
    await expect(
      page.getByText("Build and deploy a project with weekly updates.", {
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Language", { exact: true }).selectOption("es");
    await page.getByLabel("Nombre del evento", { exact: true }).fill(name);
    await page.getByLabel("URL del evento", { exact: true }).fill(slug);
    await page
      .getByLabel("Tipo de evento", { exact: true })
      .selectOption("buildathon");
    await page
      .getByRole("button", { name: "Crear borrador", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await page.getByLabel("Idioma", { exact: true }).selectOption("en");
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Settings", exact: true }),
    ).toBeVisible();
    await page.getByLabel("Language", { exact: true }).selectOption("es");
    await page
      .getByRole("button", { name: "Configuración", exact: true })
      .click();
    await expect(
      page.getByLabel("Checkpoints requeridos", { exact: true }),
    ).toHaveValue("4");
    await page
      .getByLabel("Frase de presentación")
      .fill("Construimos en comunidad.");
    await page.getByLabel("Tamaño máximo de equipo").fill("6");
    await page
      .getByRole("button", { name: "Guardar configuración", exact: true })
      .click();
    await expect(
      page.getByText("Configuración guardada.", { exact: true }),
    ).toBeVisible();
    await contentWorkflow(page, browser, slug, client);
    await registrationWorkflow(page, browser, slug, client);
    const detail = await client.query(api.manage.detail, { slug });
    const current = detail!.event;
    await client.mutation(api.manage.update, {
      eventId: current._id,
      name: current.name,
      tagline: current.tagline ?? "",
      description: current.description ?? "",
      format: current.format,
      location: current.location ?? "",
      timezone: current.timezone,
      timeline: current.timeline,
      settings: { ...current.settings, publicGallery: true },
    });
    await client.mutation(api.content.status, {
      eventId: current._id,
      status: "published",
    });
    const publicGallery = await browser.newPage({
      baseURL: "http://127.0.0.1:5173",
    });
    await publicGallery.goto(`/e/${slug}/projects`);
    await expect(
      publicGallery.getByRole("heading", { name: "Galería de proyectos." }),
    ).toBeVisible();
    await expect(
      publicGallery.getByRole("heading", {
        name: "Remesas Stellar v2",
        exact: true,
      }),
    ).toBeVisible();
    await publicGallery.close();
    await adminPage.goto("/admin");
    await expect(adminPage.getByText("Inicializando métricas…")).toHaveCount(
      0,
      { timeout: 30000 },
    );
    await adminPage
      .getByRole("button", { name: "Eventos", exact: true })
      .click();
    const adminEvent = adminPage
      .locator(".admin-list article")
      .filter({ has: adminPage.getByRole("heading", { name, exact: true }) });
    await adminEvent
      .getByRole("button", { name: "Suspender", exact: true })
      .click();
    await adminEvent.getByLabel("Motivo").fill("Revisión de prueba del evento");
    await adminEvent
      .getByRole("button", { name: "Confirmar suspensión", exact: true })
      .click();
    await expect(
      adminEvent.getByText("Suspendido", { exact: true }),
    ).toBeVisible();
    await adminEvent
      .getByRole("button", { name: "Restaurar", exact: true })
      .click();
    await adminEvent.getByLabel("Motivo").fill("Revisión de prueba completada");
    await adminEvent
      .getByRole("button", { name: "Confirmar restauración", exact: true })
      .click();
    await expect(
      adminEvent.getByText("Publicado", { exact: true }),
    ).toBeVisible();
    await adminPage.setViewportSize({ width: 390, height: 844 });
    expect(
      await adminPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await adminPage.screenshot({
      path: "test-results/admin-mobile.png",
      fullPage: true,
    });
    await adminEvent
      .getByRole("button", { name: "Entrar al evento", exact: true })
      .click();
    await expect(adminPage).toHaveURL(new RegExp(`/e/${slug}/manage`));
    await page.goto(`/e/${slug}/manage`);
    await page.getByRole("button", { name: "Staff", exact: true }).click();
    const staffWallet = Keypair.random();
    await page.getByLabel("Rol de la invitación").selectOption("judge");
    await page
      .getByLabel("Wallet invitada (opcional)")
      .fill(staffWallet.publicKey());
    await page
      .getByRole("button", { name: "Crear invitación", exact: true })
      .click();
    await expect(
      page.getByLabel("Enlace de invitación", { exact: true }),
    ).toHaveValue(/\/invite\/[a-f0-9]{64}$/);
    const inviteLink = await page
      .getByLabel("Enlace de invitación", { exact: true })
      .inputValue();
    await expect(
      client.action(api.staffActions.accept, {
        token: inviteLink.split("/").at(-1)!,
      }),
    ).rejects.toThrow("WALLET_MISMATCH");
    const staffPage = await staffContext.newPage();
    await mockFreighter(staffPage, staffWallet);
    await startLogin(staffPage);
    await expect(staffPage.getByText("Sesión iniciada · Testnet")).toBeVisible({
      timeout: 20000,
    });
    await staffPage
      .getByRole("link", { name: "Ir a mi panel", exact: true })
      .click();
    await staffPage.goto(inviteLink);
    await staffPage
      .getByRole("button", { name: "Aceptar invitación", exact: true })
      .click();
    await expect(
      staffPage.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("button", { name: "Configuración", exact: true }),
    ).toHaveCount(0);
    await expect(
      staffPage.getByRole("button", { name: "Staff", exact: true }),
    ).toHaveCount(0);
    const member = page
      .locator(".manage-list")
      .first()
      .locator("article")
      .filter({ hasText: staffWallet.publicKey() });
    await member.getByText("Editar rol y permisos", { exact: true }).click();
    await member.getByLabel("Rol del miembro").selectOption("co_organizer");
    await member
      .getByRole("button", { name: "Guardar permisos", exact: true })
      .click();
    await expect(
      member.getByText("Permisos guardados.", { exact: true }),
    ).toBeVisible();
    await expect(
      staffPage.getByRole("button", { name: "Configuración", exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "test-results/staff-desktop.png",
      fullPage: true,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/staff-mobile.png",
      fullPage: true,
    });
    await member
      .getByRole("button", { name: "Revocar acceso", exact: true })
      .click();
    await expect(
      staffPage.getByRole("heading", {
        name: "Evento no disponible.",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Auditoría", exact: true }).click();
    await expect(
      page.getByText("Acceso de staff revocado", { exact: true }),
    ).toBeVisible();
    await page.goto("/manage");
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await adminContext.close();
    await staffContext.close();
    await adminFixture.dispose();
  }
  expect(errors).toEqual([]);
});

test.afterEach(async ({ context }) => {
  await context.close();
  await cleanupTests();
});
