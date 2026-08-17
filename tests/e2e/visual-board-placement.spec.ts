import { expect, test, type Locator, type Page } from "@playwright/test";

async function openBoard(page: Page, sequenceCount = 1) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Visual Board" }).click();
  for (let index = 0; index < sequenceCount; index++) await page.getByRole("button", { name: "Add Sequence" }).click();
  const firstSequence = page.getByRole("article").first();
  const unassigned = page.getByRole("region", { name: "Unassigned scenes and beats" });
  const firstScene = unassigned.locator('.story-board-scene[data-scene-id]', { has: page.getByRole("button", { name: /^Scene 1(?:\s|:)/ }) });
  await firstScene.locator("summary").click();
  await firstScene.getByRole("button", { name: "Move to empty Sequence 1" }).click();
  const secondScene = unassigned.locator('.story-board-scene[data-scene-id]', { has: page.getByRole("button", { name: /^Scene 2(?:\s|:)/ }) });
  await secondScene.locator("summary").click();
  await secondScene.getByRole("button", { name: "Move to end of Sequence 1" }).click();
  await expect(firstSequence.locator(":scope .story-board-scenes > .story-board-scene")).toHaveCount(2);
}

function sceneCards(sequence: Locator) {
  return sequence.locator(":scope .story-board-scenes > .story-board-scene");
}

async function beginSceneDrag(page: Page, source: Locator) {
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await source.dispatchEvent("dragstart", { dataTransfer });
  return dataTransfer;
}

test("scene drag preview uses the card midpoint and mutates only when the matching placement is dropped", async ({ page }) => {
  await openBoard(page);
  const sequence = page.getByRole("article").first();
  const cards = sceneCards(sequence);
  const unassignedThird = page.getByRole("region", { name: "Unassigned scenes and beats" }).locator('.story-board-scene[data-scene-id]', { has: page.getByRole("button", { name: /Scene 3:/ }) });
  const second = cards.nth(1);
  const secondBounds = await second.boundingBox();
  expect(secondBounds).not.toBeNull();

  const firstTransfer = await beginSceneDrag(page, unassignedThird);
  await second.dispatchEvent("dragover", { dataTransfer: firstTransfer, clientY: secondBounds!.y + 1 });
  await expect(second).toHaveAttribute("data-drop-placement", "before");
  await expect(second.locator(".story-board-drop-indicator.is-before")).toBeVisible();
  await expect(cards).toHaveCount(2);
  await expect(unassignedThird).toHaveCount(1);
  await second.dispatchEvent("drop", { dataTransfer: firstTransfer, clientY: secondBounds!.y + 1 });
  await expect(cards).toHaveCount(3);
  await expect(cards.nth(1).getByRole("button", { name: /Scene 3/ }).first()).toBeVisible();

  const first = cards.nth(0);
  const last = cards.nth(2);
  const lastBounds = await last.boundingBox();
  expect(lastBounds).not.toBeNull();
  const secondTransfer = await beginSceneDrag(page, first);
  await last.dispatchEvent("dragover", { dataTransfer: secondTransfer, clientY: lastBounds!.y + lastBounds!.height - 1 });
  await expect(last).toHaveAttribute("data-drop-placement", "after");
  await expect(last.locator(".story-board-drop-indicator.is-after")).toBeVisible();
  await last.dispatchEvent("drop", { dataTransfer: secondTransfer, clientY: lastBounds!.y + lastBounds!.height - 1 });
  await expect(cards.nth(2).getByRole("button", { name: /Scene 1/ }).first()).toBeVisible();
  await expect(page.getByText("Outline changes are not yet in the draft.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk-scene_heading").first()).toHaveValue("INT. GREYHOUND BUS - NIGHT");
  await expect(page.locator("textarea.blk-scene_heading").nth(1)).toHaveValue("EXT. REST STOP - PARKING LOT - NIGHT");
});

test("keyboard move options support empty sequences and Unassigned with live announcements", async ({ page }) => {
  await openBoard(page, 2);
  const sequences = page.getByRole("article");
  const firstScene = sceneCards(sequences.first()).first();
  await firstScene.locator("summary").click();
  await firstScene.getByRole("button", { name: "Move to empty Sequence 2" }).click();
  await expect(sceneCards(sequences.nth(1))).toHaveCount(1);
  await expect(page.locator('[role="status"]', { hasText: /Moved Scene 1 to empty Sequence 2/ })).toBeAttached();

  const movedScene = sceneCards(sequences.nth(1)).first();
  await movedScene.locator("summary").click();
  await movedScene.getByRole("button", { name: "Move to Unassigned" }).click();
  await expect(page.getByRole("region", { name: "Unassigned scenes and beats" }).getByRole("button", { name: /Scene 1/ }).first()).toBeVisible();
  await expect(page.locator('[role="status"]', { hasText: /Moved Scene 1 to Unassigned/ })).toBeAttached();
});

test("drag previews survive internal leave and clear on Escape, drag end, board leave, and invalid typed data", async ({ page }) => {
  await openBoard(page);
  const board = page.locator(".story-board");
  const target = sceneCards(page.getByRole("article").first()).first();
  const source = page.getByRole("region", { name: "Unassigned scenes and beats" }).locator('.story-board-scene[data-scene-id]').first();
  const bounds = await target.boundingBox();
  expect(bounds).not.toBeNull();

  let dataTransfer = await beginSceneDrag(page, source);
  await target.dispatchEvent("dragover", { dataTransfer, clientY: bounds!.y + 1 });
  await board.evaluate((element) => {
    const relatedTarget = element.querySelector(".story-board-scene");
    element.dispatchEvent(new DragEvent("dragleave", { bubbles: true, relatedTarget }));
  });
  await expect(target).toHaveAttribute("data-drop-placement", "before");
  await page.keyboard.press("Escape");
  await expect(target).not.toHaveAttribute("data-drop-placement", "before");
  await expect(page.locator('[role="status"]', { hasText: "Story board move cancelled." })).toBeAttached();

  const appendZone = page.getByRole("article").first().locator(".story-board-append-zone");
  dataTransfer = await beginSceneDrag(page, source);
  await appendZone.dispatchEvent("dragover", { dataTransfer });
  await expect(appendZone).toHaveAttribute("data-drop-placement", "append");
  await expect(appendZone).toHaveClass(/is-drop-target/);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Add Sequence" }).click();
  const emptyZone = page.getByRole("article").nth(1).locator(".story-board-append-zone");
  dataTransfer = await beginSceneDrag(page, source);
  await emptyZone.dispatchEvent("dragover", { dataTransfer });
  await expect(emptyZone).toHaveAttribute("data-drop-placement", "empty");
  await page.keyboard.press("Escape");

  const unassigned = page.getByRole("region", { name: "Unassigned scenes and beats" });
  dataTransfer = await beginSceneDrag(page, target);
  await unassigned.dispatchEvent("dragover", { dataTransfer });
  await expect(unassigned).toHaveAttribute("data-drop-placement", "unassigned");
  await expect(unassigned.locator(".story-board-drop-slot.is-unassigned")).toBeVisible();
  await page.keyboard.press("Escape");

  dataTransfer = await beginSceneDrag(page, source);
  await target.dispatchEvent("dragover", { dataTransfer, clientY: bounds!.y + 1 });
  await source.dispatchEvent("dragend", { dataTransfer });
  await expect(target).not.toHaveAttribute("data-drop-placement", "before");

  dataTransfer = await beginSceneDrag(page, source);
  await target.dispatchEvent("dragover", { dataTransfer, clientY: bounds!.y + 1 });
  await board.dispatchEvent("dragleave", { dataTransfer, relatedTarget: null });
  await expect(target).not.toHaveAttribute("data-drop-placement", "before");

  const invalidTransfer = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.setData("application/x-scs-story-item", "not-json");
    return transfer;
  });
  await target.dispatchEvent("dragover", { dataTransfer: invalidTransfer, clientY: bounds!.y + 1 });
  await expect(target).not.toHaveAttribute("data-drop-placement", "before");
});
