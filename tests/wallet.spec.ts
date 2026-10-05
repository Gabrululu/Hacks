import { cleanupTests } from "./fixture-cleanup";
import { test, expect } from "@playwright/test";
import { Keypair } from "@stellar/stellar-sdk";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { mockFreighter, startLogin } from "./wallet-helper";
const base = "http://127.0.0.1:5173";
test("Wallets Kit login, real Convex identity, refresh restore and cross-tab logout", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const wallet = Keypair.random();
  const errors: string[] = [];
  const warnings: string[] = [],
    sockets: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("TWIND_INVALID_CLASS"))
      warnings.push(message.text());
  });
  page.on("websocket", (socket) => sockets.push(socket.url()));
  page.on("pageerror", (e) => errors.push(e.message));
  await mockFreighter(page, wallet);
  await startLogin(page);
  await expect(page.getByText("Sesión iniciada · Testnet")).toBeVisible({
    timeout: 20_000,
  });
  expect(warnings).toEqual([]);
  expect(sockets.some((url) => url.includes("/__convex/api/"))).toBe(true);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page
    .getByRole("button", { name: "Copiar dirección", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Dirección copiada", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/hacks-session-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("link", { name: "Ir a mi panel", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/hacks-session-mobile.png" });
  await page.setViewportSize({ width: 1280, height: 720 });
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("hacks.wallet-session.v1")!),
  );
  const client = new ConvexHttpClient("http://127.0.0.1:3210");
  client.setAuth(stored.token);
  expect(await client.query(api.users.me, {})).toMatchObject({
    wallet: wallet.publicKey(),
    platformRole: "user",
  });
  await page.reload();
  await expect(page.locator(".header-actions .wallet-button")).toContainText(
    wallet.publicKey().slice(0, 5),
  );
  const second = await context.newPage();
  await mockFreighter(second, wallet);
  await second.goto(base);
  await expect(second.locator(".header-actions .wallet-button")).toContainText(
    wallet.publicKey().slice(0, 5),
  );
  await page.locator(".header-actions .wallet-button").click();
  await page
    .getByRole("button", { name: "Cerrar sesión", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Elegir wallet e iniciar sesión" }),
  ).toBeVisible();
  await expect(second.locator(".header-actions .wallet-button")).toHaveText(
    /Conectar wallet/,
  );
  await expect
    .poll(
      async () => {
        try {
          await client.query(api.users.me, {});
          return "session-active";
        } catch (error) {
          return String(error);
        }
      },
      { timeout: 10000 },
    )
    .toContain("SESSION_EXPIRED");
  expect(errors).toEqual([]);
});
test("rejected wallet signature leaves the user signed out with a retry", async ({
  page,
}) => {
  const wallet = Keypair.random();
  await mockFreighter(page, wallet, true);
  await startLogin(page);
  await expect(page.getByRole("alert")).toContainText("cancelada", {
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Elegir wallet e iniciar sesión" }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => localStorage.getItem("hacks.wallet-session.v1")),
  ).toBeNull();
});

test("profile onboarding saves details and verifies email locally", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await mockFreighter(page, Keypair.random());
  await startLogin(page);
  await expect(page.getByText("Sesión iniciada · Testnet")).toBeVisible({
    timeout: 20000,
  });
  await page.getByRole("link", { name: "Completar mi perfil" }).click();
  await page.getByLabel("Nombre", { exact: true }).fill("Builder Stellar");
  await page.getByLabel("Biografía").fill("Construyendo en comunidad.");
  await page.getByLabel("GitHub").fill("https://github.com/stellar");
  await page.getByRole("button", { name: "Guardar perfil" }).click();
  await expect(
    page.getByText("Perfil guardado.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Idioma", { exact: true }).selectOption("en");
  await expect(page.getByText("Profile saved.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Builder Stellar",
  );
  await expect(
    page.getByRole("textbox", { name: "Bio", exact: true }),
  ).toHaveValue("Construyendo en comunidad.");
  await page.getByLabel("Language", { exact: true }).selectOption("es");
  await expect(
    page.getByText("Perfil guardado.", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Correo", { exact: true }).fill("builder@example.com");
  await page.getByRole("button", { name: "Solicitar código" }).click();
  await page.getByText("Buzón local de desarrollo", { exact: true }).click();
  const output = page.locator(".development-mailbox output");
  await expect(output).toHaveText(/^[0-9]{6}$/);
  await page
    .getByLabel("Código de 6 dígitos")
    .fill((await output.textContent())!);
  await page.getByRole("button", { name: "Verificar correo" }).click();
  await expect(
    page.getByText("✓ Verificado: builder@example.com", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Perfil completo. Ya estás listo para participar."),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue(
    "Builder Stellar",
  );
  await expect(
    page.getByText("✓ Verificado: builder@example.com", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/profile-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Guardar perfil" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/profile-mobile.png",
    fullPage: true,
  });
});

test.afterEach(async ({ context }) => {
  await context.close();
  await cleanupTests();
});
