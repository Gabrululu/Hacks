import { expect, type Page, type Browser } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { mockFreighter, startLogin } from "./wallet-helper";

export async function judgingWorkflow(
  owner: Page,
  builder: Page,
  browser: Browser,
  slug: string,
  client: ConvexHttpClient,
) {
  const contexts = await Promise.all(
    [0, 1, 2].map(() =>
      browser.newContext({
        baseURL: "http://127.0.0.1:5173",
        viewport: { width: 390, height: 844 },
      }),
    ),
  );
  try {
    const detail = (await client.query(api.manage.detail, { slug }))!,
      e = detail.event,
      now = Date.now();
    await client.mutation(api.manage.update, {
      eventId: e._id,
      name: e.name,
      tagline: e.tagline ?? "",
      description: e.description ?? "",
      format: e.format,
      location: e.location ?? "",
      timezone: e.timezone,
      settings: e.settings,
      timeline: {
        ...e.timeline,
        registrationClosesAt: now - 1000,
        submissionClosesAt: now - 500,
        judgingClosesAt: now + 3600000,
        resultsAt: now + 7200000,
      },
    });
    const judges: Page[] = [],
      ids = [];
    for (let i = 0; i < 2; i++) {
      const wallet = Keypair.random(),
        page = await contexts[i].newPage();
      await mockFreighter(page, wallet);
      await startLogin(page);
      await expect(page.getByText("Sesión iniciada · Testnet")).toBeVisible({
        timeout: 20000,
      });
      const token = await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("hacks.wallet-session.v1")!).token,
      );
      const judgeClient = new ConvexHttpClient("http://127.0.0.1:3210");
      judgeClient.setAuth(token);
      await judgeClient.mutation(api.users.updateProfile, {
        name: `Juez de fase seis ${i + 1}`,
        bio: "",
        links: {},
      });
      ids.push((await judgeClient.query(api.users.me, {})).id);
      const invite = await client.action(api.staffActions.invite, {
        eventId: e._id,
        role: "judge",
        wallet: wallet.publicKey(),
      });
      await page.goto(`/invite/${invite.token}`);
      await page
        .getByRole("button", { name: "Aceptar invitación", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Mis evaluaciones", exact: true }),
      ).toBeVisible();
      judges.push(page);
    }
    await owner
      .getByRole("button", { name: "Evaluación", exact: true })
      .click();
    await owner
      .getByLabel("Nombre de la ronda", { exact: true })
      .fill("Final de prueba");
    await owner
      .getByRole("button", { name: "Guardar ronda y rúbrica", exact: true })
      .click();
    await expect(
      owner.getByRole("heading", { name: "Rúbrica de la ronda", exact: true }),
    ).toBeVisible();
    await owner
      .getByLabel("Proyecto admitido", { exact: true })
      .selectOption({ label: "Remesas Stellar v2 · Equipo Stellar E2E" });
    await owner
      .getByLabel("Juez para asignación manual", { exact: true })
      .selectOption(ids[0]);
    await owner
      .getByRole("button", { name: "Asignar juez", exact: true })
      .click();
    await expect(
      owner.getByText("Asignación creada.", { exact: true }),
    ).toBeVisible();
    await owner.getByLabel("Jueces por proyecto", { exact: true }).fill("2");
    await owner
      .getByRole("button", { name: "Asignar automáticamente", exact: true })
      .click();
    await expect(
      owner.getByText(/Asignación automática: completada/),
    ).toBeVisible({ timeout: 20000 });
    await owner
      .getByRole("button", { name: "Abrir ronda", exact: true })
      .click();
    for (const page of judges) {
      await page
        .getByRole("button", { name: "Mis evaluaciones", exact: true })
        .click();
      await page.getByRole("button", { name: /Remesas Stellar v2/ }).click();
      await expect(
        page.getByLabel("Puntaje: Impacto", { exact: true }),
      ).toBeEnabled();
    }
    const first = judges[0],
      second = judges[1];
    const download = first.waitForEvent("download");
    await first
      .getByRole("button", { name: "Descargar archivo privado", exact: true })
      .click();
    expect((await download).suggestedFilename()).toBe("documentacion.txt");
    await first.getByLabel("Puntaje: Impacto", { exact: true }).fill("8");
    await first
      .getByLabel("Puntaje: Calidad técnica", { exact: true })
      .fill("9");
    await first
      .getByLabel("Nota privada para organizadores", { exact: true })
      .fill("Esta nota privada no se publica.");
    await first
      .getByLabel("Feedback público para el equipo", { exact: true })
      .fill("Buen trabajo para la comunidad.");
    await first
      .getByRole("button", { name: "Guardar evaluación", exact: true })
      .click();
    await expect(
      first.getByText("Evaluación guardada.", { exact: true }),
    ).toBeVisible();
    expect(
      await first.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await first.screenshot({
      path: "test-results/judge-mobile.png",
      fullPage: true,
    });
    await second
      .getByLabel("Motivo de abstención", { exact: true })
      .fill("Conflicto de interés declarado.");
    await second
      .getByRole("button", { name: "Registrar abstención", exact: true })
      .click();
    await expect(
      second.getByText("Abstención registrada.", { exact: true }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Cerrar ronda", exact: true })
      .click();
    await expect(
      owner.getByRole("button", { name: "Cerrar evaluación", exact: true }),
    ).toBeEnabled({ timeout: 20000 });
    await expect(
      owner.getByText("Nota privada: Esta nota privada no se publica.", {
        exact: true,
      }),
    ).toBeVisible();
    await owner
      .getByRole("button", { name: "Cerrar evaluación", exact: true })
      .click();
    await owner.getByLabel("Número de ganadores", { exact: true }).fill("1");
    await owner
      .getByRole("button", { name: "Publicar resultados", exact: true })
      .click();
    const publicPage = await contexts[2].newPage();
    await publicPage.goto(`/e/${slug}`);
    const results = publicPage.locator("#resultados");
    await expect(
      results.getByText("Remesas Stellar v2", { exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText("85.00 / 100", { exact: false }),
    ).toBeVisible();
    await expect(results.getByText("Ganador", { exact: true })).toBeVisible();
    await results.getByText("Feedback del jurado", { exact: true }).click();
    await expect(
      results.getByText("Buen trabajo para la comunidad.", { exact: true }),
    ).toBeVisible();
    await expect(
      publicPage.getByText("Esta nota privada no se publica.", { exact: true }),
    ).toHaveCount(0);
    await expect(
      publicPage.getByText("Conflicto de interés declarado.", { exact: true }),
    ).toHaveCount(0);
    expect(
      await publicPage.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await publicPage.screenshot({
      path: "test-results/results-mobile.png",
      fullPage: true,
    });
    await expect(
      builder
        .locator("#resultados")
        .getByText("Remesas Stellar v2", { exact: true }),
    ).toBeVisible({ timeout: 15000 });
    await expect(
      first.getByRole("button", { name: "Guardar evaluación", exact: true }),
    ).toBeDisabled();
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
}
