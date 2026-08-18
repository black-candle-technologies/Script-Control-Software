import { expect, test, type Locator, type Page } from "@playwright/test";

interface MarkMeasurement {
  frame: { x: number; y: number };
  lettering: { x: number; y: number };
  svg: { x: number; y: number };
  userFrame: { x: number; y: number };
  userLettering: { x: number; y: number };
}

async function measure(mark: Locator): Promise<MarkMeasurement> {
  return mark.evaluate((svg) => {
    const frame = svg.querySelector<SVGGraphicsElement>('[data-brand-part="frame"]');
    const lettering = svg.querySelector<SVGGraphicsElement>('[data-brand-part="lettering"]');
    if (!frame || !lettering) throw new Error("Brand mark geometry hooks are missing.");
    const center = (rect: DOMRect | SVGRect) => ({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
    return {
      frame: center(frame.getBoundingClientRect()),
      lettering: center(lettering.getBoundingClientRect()),
      svg: center(svg.getBoundingClientRect()),
      userFrame: center(frame.getBBox()),
      userLettering: center(lettering.getBBox()),
    };
  });
}

async function expectCentered(mark: Locator, tolerance = 0.25) {
  const result = await measure(mark);
  expect(Math.abs(result.userFrame.x - result.userLettering.x)).toBeLessThan(0.001);
  expect(Math.abs(result.userFrame.y - result.userLettering.y)).toBeLessThan(0.001);
  expect(Math.abs(result.frame.x - result.lettering.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(result.frame.y - result.lettering.y)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(result.svg.x - result.lettering.x)).toBeLessThanOrEqual(tolerance);
  expect(Math.abs(result.svg.y - result.lettering.y)).toBeLessThanOrEqual(tolerance);
}

async function openCleanLauncher(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

test("launcher brand geometry stays centered across sizes, themes, and zoom", async ({ page }) => {
  await openCleanLauncher(page);
  const mark = page.locator('[data-brand-mark="scs"]').first();
  await expect(mark).toBeVisible();
  await expect(page.getByRole("heading", { name: "Script Control Software" })).toBeVisible();
  await expect(mark).toHaveAttribute("aria-hidden", "true");

  for (const theme of ["dark", "light"] as const) {
    await page.locator("html").evaluate((root, value) => root.setAttribute("data-theme", value), theme);
    for (const zoom of [0.8, 1, 1.25, 2]) {
      await page.locator("html").evaluate((root, value) => { root.style.zoom = String(value); }, zoom);
      for (const size of [16, 20, 32, 56, 112]) {
        await mark.evaluate((svg, value) => svg.style.setProperty("--brand-mark-size", `${value}px`), size);
        await expectCentered(mark);
      }
    }
  }
});

test("brand geometry remains centered at high-DPI scaling", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, deviceScaleFactor: 2, viewport: { width: 1100, height: 760 } });
  const page = await context.newPage();
  try {
    await openCleanLauncher(page);
    const mark = page.locator('[data-brand-mark="scs"]').first();
    await expect(mark).toBeVisible();
    await expectCentered(mark, 0.25);
  } finally {
    await context.close();
  }
});
