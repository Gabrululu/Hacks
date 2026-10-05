import { test, expect } from "@playwright/test";
import { localAdminSession } from "./local-admin-helper";
import { mockFreighter } from "./wallet-helper";

test("global administration requires login and renders metrics, protected users and audit on mobile", async ({
  page,
  browser,
}) => {
  test.setTimeout(60000);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Tu próximo evento empieza aquí." }),
  ).toBeVisible();
  const fixture = await localAdminSession();
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 390, height: 844 },
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
    const admin = await context.newPage();
    await mockFreighter(admin, { publicKey: () => fixture.session.wallet });
    await admin.goto("/admin");
    await expect(
      admin.getByRole("heading", { name: "La comunidad, en perspectiva." }),
    ).toBeVisible();
    await expect(admin.locator(".admin-metrics strong")).toHaveCount(4);
    for (const counter of await admin.locator(".admin-metrics strong").all())
      await expect(counter).toHaveText(/^\d+$/, { timeout: 15000 });
    expect(
      await admin.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await admin.screenshot({
      path: "test-results/admin-metrics-mobile.png",
      fullPage: true,
    });
    await admin.getByRole("button", { name: "Usuarios", exact: true }).click();
    const protectedUser = admin
      .locator(".admin-list article")
      .filter({ hasText: fixture.session.wallet });
    await expect(admin.locator(".admin-list article").first()).toBeVisible();
    for (let i = 0; i < 50 && (await protectedUser.count()) === 0; i++) {
      const more = admin.getByRole("button", {
        name: "Cargar más",
        exact: true,
      });
      if (!(await more.count())) break;
      const count = await admin.locator(".admin-list article").count();
      await more.click();
      await expect
        .poll(() => admin.locator(".admin-list article").count())
        .toBeGreaterThan(count);
    }
    await expect(protectedUser).toBeVisible();
    await expect(
      protectedUser.getByRole("button", {
        name: "Suspender usuario",
        exact: true,
      }),
    ).toHaveCount(0);
    await admin.getByRole("button", { name: "Auditoría", exact: true }).click();
    await expect(admin.locator(".admin-list")).toBeVisible();
  } finally {
    await context.close();
    await fixture.dispose();
  }
});
