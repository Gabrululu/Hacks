import { test, expect } from "@playwright/test";
import { localAdminSession } from "./local-admin-helper";
import { mockFreighter } from "./wallet-helper";

test("language translates filters and wallet UI, persists across routes and reloads, and syncs tabs", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.getByLabel("Buscar eventos").fill("no-such-event-i18n");
  await page
    .getByLabel("Modalidad", { exact: true })
    .selectOption("Presencial");
  await page.getByLabel("Idioma", { exact: true }).selectOption("en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(
    page.getByRole("heading", { name: "No events found", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Search events")).toHaveValue(
    "no-such-event-i18n",
  );
  await expect(page.getByLabel("Location type", { exact: true })).toHaveValue(
    "Presencial",
  );
  await expect(
    page.getByLabel("Location type").locator("option[value=Presencial]"),
  ).toHaveText("In person");
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await page.locator(".header-actions .wallet-button").click();
  await expect(page.getByRole("dialog")).toContainText(
    "Your wallet, your identity.",
  );
  await expect(
    page.getByRole("button", { name: "Choose wallet and sign in" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "How it works", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.reload();
  await expect(page.getByLabel("Language", { exact: true })).toHaveValue("en");
  await expect(
    page.getByRole("heading", { name: "Find. Connect. Build.", exact: true }),
  ).toBeVisible();
  const second = await context.newPage();
  await second.goto("/perfil");
  await expect(second.getByLabel("Language", { exact: true })).toHaveValue(
    "en",
  );
  await page.getByLabel("Language", { exact: true }).selectOption("es");
  await expect(second.locator("html")).toHaveAttribute("lang", "es");
  await expect(
    second.getByRole("heading", { name: "Conecta y construye.", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Hacks — Ideas que se construyen");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByLabel("Idioma", { exact: true }).selectOption("en");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/i18n-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("invalid or unavailable storage falls back to Spanish and still permits switching", async ({
  browser,
}) => {
  for (const unavailable of [false, true]) {
    const context = await browser.newContext({
      baseURL: "http://127.0.0.1:5173",
    });
    try {
      await context.addInitScript((blocked) => {
        localStorage.setItem("hacks.language.v1", "invalid-language");
        if (blocked) {
          const get = Storage.prototype.getItem,
            set = Storage.prototype.setItem;
          Storage.prototype.getItem = function (key) {
            if (key === "hacks.language.v1") throw new Error("Storage blocked");
            return get.call(this, key);
          };
          Storage.prototype.setItem = function (key, value) {
            if (key === "hacks.language.v1") throw new Error("Storage blocked");
            set.call(this, key, value);
          };
        }
      }, unavailable);
      const page = await context.newPage();
      await page.goto("/");
      await expect(page.getByLabel("Idioma", { exact: true })).toHaveValue(
        "es",
      );
      await page.getByLabel("Idioma", { exact: true }).selectOption("en");
      await expect(page.getByLabel("Language", { exact: true })).toHaveValue(
        "en",
      );
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
    } finally {
      await context.close();
    }
  }
});

test("authenticated admin tabs translate without resetting tab, identity or authored profile fields", async ({
  browser,
}) => {
  test.setTimeout(60000);
  const fixture = await localAdminSession();
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
  });
  try {
    await context.addInitScript(
      (session) =>
        localStorage.setItem(
          "hacks.wallet-session.v1",
          JSON.stringify(session),
        ),
      fixture.session,
    );
    const page = await context.newPage();
    await mockFreighter(page, { publicKey: () => fixture.session.wallet });
    await page.goto("/admin");
    await page.getByRole("button", { name: "Usuarios", exact: true }).click();
    await page.getByLabel("Idioma", { exact: true }).selectOption("en");
    await expect(
      page.getByRole("button", { name: "Users", exact: true }),
    ).toHaveClass("active");
    await expect(
      page.getByRole("heading", {
        name: "The community, in perspective.",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.locator(".header-actions .wallet-button")).toContainText(
      fixture.session.wallet.slice(0, 5),
    );
    await page.goto("/perfil");
    const name = await page.getByLabel("Name", { exact: true }).inputValue();
    const bio = await page.getByLabel("Bio", { exact: true }).inputValue();
    await page.getByLabel("Language", { exact: true }).selectOption("es");
    await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(name);
    await expect(page.getByLabel("Biografía", { exact: true })).toHaveValue(
      bio,
    );
  } finally {
    await context.close();
    await fixture.dispose();
  }
});
