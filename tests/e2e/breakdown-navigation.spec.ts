import { expect, test } from "@playwright/test";
import { recoverySessionText } from "./recoveryStorage.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("Breakdown disclosures stay mounted, support bulk controls, and persist per document", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Breakdown", exact: true }).click();

  const overview = page.getByRole("button", { name: /^Overview\b/ });
  const production = page.getByRole("button", { name: /^Production reports\b/ });
  await expect(overview).toHaveAttribute("aria-expanded", "true");
  await expect(production).toHaveAttribute("aria-expanded", "false");

  await overview.focus();
  await overview.press("Space");
  await expect(overview).toHaveAttribute("aria-expanded", "false");
  await overview.press("Enter");
  await expect(overview).toHaveAttribute("aria-expanded", "true");

  await page.getByRole("button", { name: "Collapse All" }).click();
  await expect(page.getByRole("status")).toHaveText("All breakdown sections collapsed.");
  await expect(overview).toHaveAttribute("aria-expanded", "false");
  await expect(production).toHaveAttribute("aria-expanded", "false");
  const summaries = page.locator(".collapsible-section-summary");
  await expect(summaries).toHaveCount(10);
  await expect.poll(() => summaries.evaluateAll((elements) => elements.every((element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }))).toBe(true);
  const overviewFacts = page.locator('[data-section-id="breakdown-overview"] .insp-facts');
  await expect(overviewFacts).toHaveCount(1);
  await expect(overviewFacts).toBeHidden();

  await page.getByRole("button", { name: "Expand All" }).click();
  await expect.poll(() => page.locator(".collapsible-section-trigger").evaluateAll((buttons) => buttons.every((button) => button.getAttribute("aria-expanded") === "true"))).toBe(true);
  await page.getByRole("button", { name: "Collapse All" }).click();

  await overview.click();
  await expect(overviewFacts).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("scs.ui.v2"))).not.toBeNull();
  await expect.poll(() => recoverySessionText(page)).not.toBeNull();

  await page.reload();
  await page.locator(".launcher-recent").click();
  await page.getByRole("button", { name: "Breakdown", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Overview\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^Production reports\b/ })).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: /^Production reports\b/ }).click();
  await expect(page.getByRole("button", { name: /^Production reports\b/ })).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Reset Sections" }).click();
  await expect(page.getByRole("button", { name: /^Production reports\b/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /^Detailed scenes/ })).toHaveAttribute("aria-expanded", "false");
});

test("Props and Breakdown occurrence buttons select the exact screenplay range and Escape clears it", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await page.getByRole("tab", { name: "Props" }).click();

  const busSummary = page.locator("summary.insp-card-title").filter({ hasText: /^BUS\b/ }).first();
  await expect(busSummary).toBeVisible();
  const busCard = busSummary.locator("..");
  if (await busCard.getAttribute("open") === null) await busSummary.click();
  await busCard.getByText(/^Continuity \(/).click();
  await busCard.getByRole("button", { name: /Open BUS occurrence 1 in Scene/ }).first().click();

  const exactTarget = page.locator("textarea.blk:focus");
  await expect(exactTarget).toHaveAttribute("data-script-target-state", "exact");
  await expect(page.locator(".script-target-status")).toContainText("Opened exact reference");
  await expect.poll(() => exactTarget.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).toUpperCase();
  })).toBe("BUS");

  await page.keyboard.press("Escape");
  await expect(page.locator("textarea[data-script-target-state]")).toHaveCount(0);
  await expect.poll(() => page.locator("textarea.blk:focus").evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return textarea.selectionStart === textarea.selectionEnd;
  })).toBe(true);

  await page.getByRole("button", { name: "Breakdown", exact: true }).click();
  const production = page.getByRole("button", { name: /^Production reports\b/ });
  if (await production.getAttribute("aria-expanded") !== "true") await production.click();
  const vehicles = page.locator("details.insp-card", { has: page.getByText(/^Vehicles \(/) });
  await vehicles.locator("summary").click();
  await vehicles.getByRole("button", { name: /Open BUS occurrence 1 in Scene/ }).first().click();
  await expect(page.locator('textarea[data-script-target-state="exact"]')).toHaveCount(1);
});

test("dialogue, location, and production references are keyboard-operable exact targets", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await page.getByRole("tab", { name: "Cast" }).click();

  const dialogue = page.getByRole("button", { name: /Open .* dialogue 1 in Scene/ }).first();
  await dialogue.focus();
  await dialogue.press("Enter");
  const dialogueTarget = page.locator('textarea[data-script-target-state="exact"]');
  await expect(dialogueTarget).toBeFocused();
  await expect.poll(() => dialogueTarget.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  })).not.toBe("");

  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await page.getByRole("tab", { name: "Places" }).click();
  const location = page.getByRole("button", { name: /Open .* appearance in Scene/ }).first();
  await location.focus();
  await location.press("Space");
  const locationTarget = page.locator('textarea[data-script-target-state="exact"]');
  await expect.poll(() => locationTarget.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  })).toBe("GREYHOUND BUS");

  await page.getByRole("button", { name: "Breakdown", exact: true }).click();
  const production = page.getByRole("button", { name: /^Production reports\b/ });
  if (await production.getAttribute("aria-expanded") !== "true") await production.click();
  const cast = page.locator("details.insp-card", { has: page.getByText(/^Cast \(/) }).first();
  await cast.locator("summary").click();
  const productionEvidence = cast.getByRole("button", { name: /Open MARA production evidence 1 in Scene 1/ });
  await productionEvidence.focus();
  await productionEvidence.press("Enter");
  await expect(page.locator('textarea[data-script-target-state="exact"]')).toHaveCount(1);
  await expect(page.locator(".script-target-status")).toContainText("Opened exact reference");
});

test("a project-search ScriptTarget activates its non-active document before focusing the exact range", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Screenplay" }).click();
  await page.getByRole("menuitem", { name: "New Blank Screenplay" }).click();

  const secondTab = page.getByRole("tab", { name: /Screenplay 2/ });
  await expect(secondTab).toHaveAttribute("aria-selected", "true");
  const heading = page.locator("textarea.blk").first();
  await heading.fill("INT. SECOND DOCUMENT - DAY");
  await heading.press("End");
  await heading.press("Enter");
  await page.locator("textarea.blk-action").first().fill("Cross-document rendezvous.");

  await page.getByRole("tab", { name: /long way home/i }).click();
  await expect(secondTab).toHaveAttribute("aria-selected", "false");
  await page.getByRole("button", { name: "Find in project" }).first().click();
  await page.getByPlaceholder("Find scenes, dialogue, characters, drafts…").fill("cross-document rendezvous");
  const result = page.getByRole("button", { name: /Screenplay 2 · Action: Cross-document rendezvous/ });
  await result.focus();
  await result.press("Enter");

  await expect(secondTab).toHaveAttribute("aria-selected", "true");
  const exactTarget = page.locator('textarea[data-script-target-state="exact"]');
  await expect(exactTarget).toBeFocused();
  await expect.poll(() => exactTarget.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement;
    return textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
  })).toBe("Cross-document rendezvous");
});
