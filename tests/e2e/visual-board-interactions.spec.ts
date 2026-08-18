import { expect, test, type Locator, type Page } from "@playwright/test";

async function openBoard(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Visual Board" }).click();
  await expect(page.getByLabel("Visual story board")).toBeVisible();
}

function sceneCard(page: Page, number: number): Locator {
  return page.locator('.story-board-scene[data-scene-id]').filter({
    has: page.getByRole("button", { name: new RegExp(`^Scene ${number}(?:\\s|:)`) }),
  }).first();
}

function beatTarget(page: Page): Locator {
  return page.locator(".story-board-beat-target");
}

test("double-click selection persists while a single click navigates, and selected scene wins beat targeting", async ({ page }) => {
  await openBoard(page);
  const secondScene = sceneCard(page, 2);
  const thirdScene = sceneCard(page, 3);

  await expect(beatTarget(page)).toContainText("Unassigned");
  await secondScene.getByRole("button", { name: /^Scene 2(?:\s|:)/ }).dblclick();
  await expect(page.getByLabel("Visual story board")).toBeVisible();
  await expect(secondScene).toHaveAttribute("aria-selected", "true");
  await expect(secondScene).toHaveClass(/is-selected/);
  await expect(beatTarget(page)).toContainText("Selected Scene 2");

  await thirdScene.getByRole("button", { name: /^Scene 3(?:\s|:)/ }).click();
  await expect(page.locator("textarea.blk-scene_heading").nth(2)).toHaveValue("INT. GREYHOUND BUS - MOVING - LATER");

  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await expect(page.getByLabel("Visual story board")).toBeVisible();
  const restoredSecondScene = sceneCard(page, 2);
  await expect(restoredSecondScene).toHaveAttribute("aria-selected", "true");
  await expect(beatTarget(page)).toContainText("Selected Scene 2");

  await restoredSecondScene.getByRole("button", { name: "Scene options for Scene 2" }).click();
  await page.getByRole("menu", { name: "Scene 2 options" }).getByRole("menuitem", { name: "Deselect Scene" }).click();
  await expect(beatTarget(page)).toContainText("Active Scene 3");
  await restoredSecondScene.getByRole("button", { name: /^Scene 2(?:\s|:)/ }).dblclick();
  await expect(beatTarget(page)).toContainText("Selected Scene 2");

  await page.getByRole("button", { name: "Add Beat", exact: true }).click();
  const editor = restoredSecondScene.locator(".story-board-beat-editor");
  await expect(editor).toBeVisible();
  await editor.getByLabel("Title").fill("Rest-stop decision");
  await editor.getByLabel("Body").fill("Mara chooses the selected scene.");
  await editor.getByRole("button", { name: "Save beat" }).click();
  await expect(restoredSecondScene.locator(".story-board-beat", { hasText: "Rest-stop decision" })).toBeVisible();
  await expect(page.getByText("Draft matches outline.", { exact: true })).toBeVisible();
});

test("inline beat editor supports every accessible entry path, validation, normalized fields, save, and cancel", async ({ page }) => {
  await openBoard(page);
  let beat = page.locator(".story-board-beat").filter({ hasText: /Mara decides to engage/i }).first();

  await beat.dblclick();
  await expect(beat.locator(".story-board-beat-editor")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(beat).toBeFocused();

  await beat.press("F2");
  let editor = page.locator(".story-board-beat-editor");
  await editor.getByLabel("Title").fill("");
  await editor.getByLabel("Body").fill("");
  await editor.getByRole("button", { name: "Save beat" }).click();
  await expect(editor.getByRole("alert")).toHaveText("A beat needs a title or body.");

  await editor.getByLabel("Title").fill("Mara accepts the detour");
  await editor.getByLabel("Body").fill("She chooses to answer Dell.");
  await editor.getByLabel("Status").selectOption("complete");
  await editor.getByLabel("Color").fill("#336699");
  const placement = editor.getByLabel("Placement");
  const sceneTwoValue = await placement.locator("option").filter({ hasText: /^Scene 2(?:\s|:)/ }).getAttribute("value");
  expect(sceneTwoValue).toBeTruthy();
  await placement.selectOption(sceneTwoValue!);
  await editor.getByRole("button", { name: "Add moment" }).click();
  await editor.getByRole("textbox", { name: "Moment 1", exact: true }).fill("Mara reaches for the box.");
  await editor.getByLabel("Body").press("Control+Enter");

  beat = sceneCard(page, 2).locator(".story-board-beat", { hasText: "Mara accepts the detour" });
  await expect(beat).toBeVisible();
  await beat.focus();
  await beat.press("Enter");
  editor = page.locator(".story-board-beat-editor");
  await expect(editor.getByLabel("Status")).toHaveValue("complete");
  await expect(editor.getByLabel("Color")).toHaveValue("#336699");
  await expect(editor.getByLabel("Placement")).toHaveValue(sceneTwoValue!);
  await expect(editor.getByRole("textbox", { name: "Moment 1", exact: true })).toHaveValue("Mara reaches for the box.");
  await page.keyboard.press("Escape");

  await beat.click({ button: "right" });
  await expect(page.locator(".story-board-beat-editor")).toBeVisible();
  await page.locator(".story-board-beat-editor").getByRole("button", { name: "Cancel" }).click();
  await beat.getByRole("button", { name: "Edit Mara accepts the detour" }).click();
  await expect(page.locator(".story-board-beat-editor")).toBeVisible();
  await page.locator(".story-board-beat-editor").getByRole("button", { name: "Cancel" }).click();
  await expect(beat).toContainText("Mara accepts the detour");
});

test("scene menu opens from keyboard, pointer, and overflow trigger with focus restoration and safe outline operations", async ({ page }) => {
  await openBoard(page);
  await page.getByRole("button", { name: "Add Sequence" }).click();
  const firstScene = sceneCard(page, 1);
  const secondScene = sceneCard(page, 2);
  await firstScene.locator("summary").click();
  await firstScene.getByRole("button", { name: "Move to empty Sequence 1" }).click();
  await secondScene.locator("summary").click();
  await secondScene.getByRole("button", { name: "Move to end of Sequence 1" }).click();

  await firstScene.focus();
  await firstScene.press("Shift+F10");
  let menu = page.getByRole("menu", { name: "Scene 1 options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Select Scene" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Open in Write" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(firstScene).toBeFocused();

  const overflow = firstScene.getByRole("button", { name: "Scene options for Scene 1" });
  await overflow.click();
  menu = page.getByRole("menu", { name: "Scene 1 options" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /delete/i })).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: "Select Scene" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(overflow).toBeFocused();

  await firstScene.locator(".story-board-scene-heading").click({ button: "right" });
  menu = page.getByRole("menu", { name: "Scene 1 options" });
  await menu.getByRole("menuitem", { name: "Move After Next Scene" }).click();
  await expect(page.getByText("Outline changes are not yet in the draft.", { exact: true })).toBeVisible();
  await expect(page.locator('.story-board-scene[data-scene-id]').first().getByRole("button", { name: /^Scene 2(?:\s|:)/ })).toBeVisible();

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk-scene_heading").first()).toHaveValue("INT. GREYHOUND BUS - NIGHT");
  await expect(page.locator("textarea.blk-scene_heading").nth(1)).toHaveValue("EXT. REST STOP - PARKING LOT - NIGHT");
});
