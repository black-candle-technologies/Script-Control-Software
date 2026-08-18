import { expect, test } from "@playwright/test";
import { recoverySessionText, requireRecoverySessionKey } from "./recoveryStorage.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("sample screenplay survives source mode and exposes the mode workspaces", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();

  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("THE LONG WAY HOME");
  const action = page.locator("textarea.blk-action").first();
  const edited = "E2E edit survives both screenplay modes.";
  await action.fill(edited);

  await page.getByRole("tab", { name: "Fountain Source" }).click();
  await expect(page.locator("textarea.source-editor")).toHaveValue(new RegExp(edited));
  await page.getByRole("tab", { name: "Formatted" }).click();
  await expect(page.locator("textarea.blk-action").first()).toHaveValue(edited);

  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Local identity and roles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments and suggested changes" })).toBeVisible();

  await page.getByRole("button", { name: "Reference", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Assist", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Props" }).click();
  const manualObject = page.getByRole("textbox", { name: "Manual object name" });
  await manualObject.fill("E2E Compass");
  await page.getByRole("button", { name: "Add Object" }).click();
  await expect(manualObject).toHaveValue("");
  await expect(page.locator("summary.insp-card-title", { hasText: "E2E COMPASS" })).toBeVisible();
});

test("sequences stay compact and scenes can be assigned, cleared, and removed", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Sequence", exact: true }).click();

  await expect(page.getByText("No sequences yet. Add one when the story needs it.")).toBeVisible();
  await page.getByRole("button", { name: "Add Sequence" }).click();
  const sequence = page.locator("details.compact-sequence").first();
  await sequence.locator("summary").click();
  const sceneMenu = sequence.getByRole("combobox", { name: /Add scene to/ });
  await sceneMenu.selectOption({ index: 1 });
  await expect(sequence.locator(".compact-scene-list > div")).toHaveCount(1);
  await sequence.getByRole("button", { name: /^Remove .* from/ }).click();
  await expect(sequence.locator(".compact-scene-list > div")).toHaveCount(0);

  await sceneMenu.selectOption({ index: 1 });
  await sequence.getByRole("button", { name: "Clear All Scenes" }).click();
  await expect(sequence.locator(".compact-scene-list > div")).toHaveCount(0);
  await page.getByRole("button", { name: "Delete All Sequences" }).click();
  await page.getByRole("button", { name: "Confirm Delete All" }).click();
  await expect(page.locator("details.compact-sequence")).toHaveCount(0);
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator(".nav-sequence")).toHaveCount(0);
  await expect(page.getByText("Unassigned scenes", { exact: true })).toBeVisible();
});

test("sequence controls defer grouped scene order until the outline is applied", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await expect.poll(() => recoverySessionText(page)).toContain("THE LONG WAY HOME");
  const recoveryKey = await requireRecoverySessionKey(page);
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key)!);
    const blocks = session.documents[0].blocks;
    const starts = blocks.flatMap((block: { type: string }, index: number) => block.type === "scene_heading" ? [index] : []);
    session.documents[0].scenes = starts.map((blockStart: number, index: number) => ({
      id: blocks[blockStart].id,
      sceneNumber: String(index + 1),
      heading: blocks[blockStart].text,
      blockStart,
      blockEnd: (starts[index + 1] ?? blocks.length) - 1,
      characterIds: [],
      metadata: {},
    }));
    localStorage.setItem(key, JSON.stringify(session));
  }, recoveryKey);
  await page.reload();
  await page.locator(".launcher-recent").click();

  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  await page.getByRole("button", { name: "Add Sequence" }).click();
  await page.getByRole("button", { name: "Add Sequence" }).click();
  const sequences = page.locator("details.compact-sequence");
  await sequences.nth(0).locator("summary").click();
  await sequences.nth(1).locator("summary").click();
  await sequences.nth(0).getByRole("combobox", { name: /Add scene to/ }).selectOption({ label: "1. INT. GREYHOUND BUS - NIGHT" });
  await sequences.nth(1).getByRole("combobox", { name: /Add scene to/ }).selectOption({ label: "2. EXT. REST STOP - PARKING LOT - NIGHT" });
  await sequences.nth(1).getByRole("button", { name: "Move Sequence 2 earlier" }).click();
  await expect(page.getByText("Outline changes are not yet in the draft.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make Draft Match Outline" })).toBeEnabled();

  await page.getByRole("button", { name: "Write", exact: true }).click();
  const headings = page.locator("textarea.blk-scene_heading");
  await expect(headings.first()).toHaveValue("INT. GREYHOUND BUS - NIGHT");

  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Make Draft Match Outline" }).click();
  await expect(page.getByText("Draft matches outline.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Make Draft Match Outline" })).toBeDisabled();

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(headings.first()).toHaveValue("EXT. REST STOP - PARKING LOT - NIGHT");
  await expect(page.locator(".nav-sequence-title").first()).toHaveText("Sequence 2");
  await page.getByRole("button", { name: /INT\. GREYHOUND BUS - NIGHT/ }).first().click();
  await expect(headings.nth(1)).toBeFocused();
});

test("visual board drops assign an imported scene without appending or duplicating it", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await expect.poll(() => recoverySessionText(page)).toContain("THE LONG WAY HOME");
  const recoveryKey = await requireRecoverySessionKey(page);
  const importedSceneCount = await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key)!);
    session.documents[0].source = {
      type: "fdx",
      path: "C:\\Imported\\screenplay.fdx",
      fileName: "screenplay.fdx",
      lastImportedAt: new Date().toISOString(),
    };
    const blocks = session.documents[0].blocks;
    const starts = blocks.flatMap((block: { type: string }, index: number) => block.type === "scene_heading" ? [index] : []);
    session.documents[0].scenes = starts.map((blockStart: number, index: number) => ({
      id: `parsed-scene-${index + 1}`,
      heading: blocks[blockStart].text,
      blockStart,
      blockEnd: (starts[index + 1] ?? blocks.length) - 1,
      characterIds: [],
      metadata: {},
    }));
    localStorage.setItem(key, JSON.stringify(session));
    return starts.length;
  }, recoveryKey);
  await page.reload();
  await page.locator(".launcher-recent").click();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Visual Board" }).click();
  await page.getByRole("button", { name: "Add Sequence" }).click();

  const requestedScene = page.getByRole("img", { name: "Drag handle for Scene 3" });
  await requestedScene.dragTo(page.getByRole("article"));
  await expect(page.getByText("Outline changes are not yet in the draft.", { exact: true })).toBeVisible();
  await expect(page.getByRole("article").getByRole("button", { name: "Scene 3 · outline 1, draft 3: INT. GREYHOUND BUS - MOVING - LATER" })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "Unassigned scenes and beats" }).getByRole("button", { name: /GREYHOUND BUS - MOVING - LATER/ })).toHaveCount(0);
  await page.getByRole("img", { name: "Drag handle for Scene 1" }).dragTo(page.getByRole("article"));
  await expect(page.getByRole("article").getByRole("button", { name: "Scene 1 · outline 2, draft 1: INT. GREYHOUND BUS - NIGHT" })).toHaveCount(1);

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk-scene_heading").first()).toHaveValue("INT. GREYHOUND BUS - NIGHT");
  await expect(page.locator("textarea.blk-scene_heading").nth(1)).toHaveValue("EXT. REST STOP - PARKING LOT - NIGHT");

  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Make Draft Match Outline" }).click();
  await expect(page.getByText("The draft now matches the outline scene order.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk-scene_heading").first()).toHaveValue("INT. GREYHOUND BUS - MOVING - LATER");
  await expect(page.locator("textarea.blk-scene_heading").nth(1)).toHaveValue("INT. GREYHOUND BUS - NIGHT");
  await expect(page.locator("textarea.blk-scene_heading")).toHaveCount(importedSceneCount);
  await expect.poll(() => page.locator("textarea.blk-scene_heading").evaluateAll((nodes) => nodes.filter((node) => (node as HTMLTextAreaElement).value === "INT. GREYHOUND BUS - MOVING - LATER").length)).toBe(1);
});

test("treatments expose import and all portable export formats", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Treatment", exact: true }).click();
  await expect(page.getByRole("button", { name: "Import" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Markdown" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export Word" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export PDF" })).toBeVisible();
});

test("breakdown aggregates entities, uses readable labels, and opens character details", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Breakdown", exact: true }).click();
  await page.getByRole("tab", { name: "Global" }).click();

  await expect(page.getByRole("button", { name: /^Cast\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^Props\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^Weapons\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^Vehicles\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^Night scenes\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^Crowd scenes\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: /^High-complexity scenes\b/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText(/nightScenes|crowdScenes|highComplexityScenes/)).toHaveCount(0);

  const characterLink = page.locator('[data-section-id="global-breakdown-cast"] .collapsible-section-content [data-entity-id]').first();
  const characterName = (await characterLink.textContent())?.trim();
  const characterId = await characterLink.getAttribute("data-entity-id");
  expect(characterName).toBeTruthy();
  expect(characterId).toBeTruthy();
  await characterLink.click();

  await expect(page.getByRole("heading", { name: "Reference" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Cast" })).toHaveAttribute("aria-selected", "true");
  const focusedCard = page.locator(`details.insp-card[data-entity-id="${characterId}"][open]`);
  await expect(focusedCard).toBeVisible();
  await expect(focusedCard.getByText("Scenes and dialogue")).toBeVisible();

  await page.getByRole("button", { name: "Breakdown", exact: true }).click();
  await page.getByRole("tab", { name: "Global" }).click();
  const locationLink = page.locator('[data-section-id="global-breakdown-locations"] .collapsible-section-content [data-entity-id]').first();
  const locationId = await locationLink.getAttribute("data-entity-id");
  expect(locationId).toBeTruthy();
  await locationLink.click();
  await expect(page.getByRole("tab", { name: "Places" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(`details.insp-card[data-entity-id="${locationId}"][open]`).getByText("Scene appearances")).toBeVisible();
});

test("screenplay typing shortcuts preserve the current line", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();

  const heading = page.locator("textarea.blk").first();
  await heading.fill("INT. TEST ROOM - DAY");
  await heading.press("End");
  await heading.press("Enter");

  const action = page.locator("textarea.blk").nth(1);
  await expect(action).toHaveClass(/blk-action/);
  await action.press("Enter");
  await expect(action).toHaveClass(/blk-scene_heading/);
  await expect(page.locator("textarea.blk")).toHaveCount(2);

  await action.press("Enter");
  await expect(action).toHaveClass(/blk-action/);
  await action.press("Tab");
  await expect(action).toHaveClass(/blk-character/);
  await action.press("Enter");
  await expect(action).toHaveClass(/blk-action/);
  await expect(page.locator("textarea.blk")).toHaveCount(2);
  await expect(heading).toHaveValue("INT. TEST ROOM - DAY");

  await action.press("Tab");
  await expect(action).toHaveClass(/blk-character/);
  await action.press("Backspace");
  await expect(action).toHaveClass(/blk-action/);
  await expect(action).toBeFocused();
  await expect(page.locator("textarea.blk")).toHaveCount(2);
  await expect(heading).toHaveValue("INT. TEST ROOM - DAY");

  await action.press("Tab");
  await expect(action).toHaveClass(/blk-character/);
  await action.press("Tab");
  await expect(action).toHaveClass(/blk-character/);
  await expect(page.locator("textarea.blk")).toHaveCount(2);
});

test("scene headings tab through prefixes, prior locations, separators, and times", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();

  const firstHeading = page.locator("textarea.blk").first();
  await firstHeading.fill("INT. KITCHEN - DAWN");
  await firstHeading.press("End");
  await firstHeading.press("Enter");
  const secondHeading = page.locator("textarea.blk").nth(1);
  await secondHeading.press("Enter");
  await secondHeading.fill("EXT. ROOF - DUSK");
  await secondHeading.press("End");
  await secondHeading.press("Enter");
  const nextHeading = page.locator("textarea.blk").nth(2);
  await nextHeading.press("Enter");
  await expect(nextHeading).toHaveClass(/blk-scene_heading/);

  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT.");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("EXT.");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("I/E.");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT.");

  await nextHeading.press("Space");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. ROOF");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN");
  await nextHeading.press("Space");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN - ");

  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN - DAY");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN - NIGHT");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN - CONTINUOUS");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN - DAWN");
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("INT. KITCHEN - DUSK");
});

test("scene heading menus support mouse and arrow selection with staged advancement", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();

  const firstHeading = page.locator("textarea.blk").first();
  await firstHeading.fill("INT. KITCHEN - DAWN");
  await firstHeading.press("End");
  await firstHeading.press("Enter");
  const nextHeading = page.locator("textarea.blk").nth(1);
  await nextHeading.press("Enter");

  let menu = page.getByRole("listbox", { name: "Scene heading suggestions" });
  await expect(menu.getByRole("option")).toHaveText(["INT.", "EXT.", "I/E."]);
  await nextHeading.press("ArrowUp");
  await expect(menu.getByRole("option", { name: "I/E." })).toHaveAttribute("aria-selected", "true");
  await nextHeading.press("ArrowDown");
  await nextHeading.press("ArrowDown");
  await expect(menu.getByRole("option", { name: "EXT." })).toHaveAttribute("aria-selected", "true");
  await nextHeading.press("Enter");
  await expect(nextHeading).toHaveValue("EXT. ");

  menu = page.getByRole("listbox", { name: "Scene heading suggestions" });
  await menu.getByRole("option", { name: "KITCHEN" }).click();
  await expect(nextHeading).toHaveValue("EXT. KITCHEN ");
  await expect(menu).toHaveCount(0);
  await nextHeading.press("Tab");
  await expect(nextHeading).toHaveValue("EXT. KITCHEN - ");
  menu = page.getByRole("listbox", { name: "Scene heading suggestions" });
  await expect(menu.getByRole("option")).toHaveText(["DAY", "NIGHT", "CONTINUOUS", "DAWN"]);

  await nextHeading.press("ArrowRight");
  await expect(menu.getByRole("option", { name: "DAY" })).toHaveAttribute("aria-selected", "true");
  await nextHeading.press("ArrowRight");
  await expect(menu.getByRole("option", { name: "NIGHT" })).toHaveAttribute("aria-selected", "true");
  await nextHeading.press("ArrowLeft");
  await expect(menu.getByRole("option", { name: "DAY" })).toHaveAttribute("aria-selected", "true");
  await nextHeading.press("ArrowRight");
  await nextHeading.press("Enter");
  await expect(nextHeading).toHaveValue("EXT. KITCHEN - NIGHT");
  await expect(page.locator("textarea.blk-action").first()).toBeFocused();
});

test("scene location selection commits an exact match while Tab cycling waits for Space", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();

  const firstHeading = page.locator("textarea.blk").first();
  await firstHeading.fill("INT. SOMN NIGHTCLUB - NIGHT");
  await firstHeading.press("End");
  await firstHeading.press("Enter");
  const secondHeading = page.locator("textarea.blk").nth(1);
  await secondHeading.press("Enter");
  await secondHeading.fill("INT. SOMN NIGHTCLUB: BACK HALLWAY - NIGHT");
  await secondHeading.press("End");
  await secondHeading.press("Enter");

  const selectedHeading = page.locator("textarea.blk").nth(2);
  await selectedHeading.press("Enter");
  await selectedHeading.fill("INT. SOMN");
  let menu = page.getByRole("listbox", { name: "Scene heading suggestions" });
  await menu.getByRole("option", { name: "SOMN NIGHTCLUB", exact: true }).click();
  await expect(selectedHeading).toHaveValue("INT. SOMN NIGHTCLUB ");
  await selectedHeading.press("Tab");
  await expect(selectedHeading).toHaveValue("INT. SOMN NIGHTCLUB - ");

  await selectedHeading.fill("INT. SOMN");
  await selectedHeading.press("Tab");
  await expect(selectedHeading).toHaveValue("INT. SOMN NIGHTCLUB");
  await selectedHeading.press("Tab");
  await expect(selectedHeading).toHaveValue("INT. SOMN NIGHTCLUB: BACK HALLWAY");
  await selectedHeading.fill("INT. SOMN");
  await selectedHeading.press("Tab");
  await expect(selectedHeading).toHaveValue("INT. SOMN NIGHTCLUB");
  await selectedHeading.press("Space");
  await selectedHeading.press("Tab");
  await expect(selectedHeading).toHaveValue("INT. SOMN NIGHTCLUB - ");
  menu = page.getByRole("listbox", { name: "Scene heading suggestions" });
  await expect(menu.getByRole("option", { name: "DAY" })).toBeVisible();
});

test("dialogue enter flow and parenthetical tabbing follow screenplay context", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();

  const heading = page.locator("textarea.blk").first();
  await heading.fill("INT. TEST ROOM - DAY");
  await heading.press("End");
  await heading.press("Enter");

  const firstCharacter = page.locator("textarea.blk").nth(1);
  await firstCharacter.press("Tab");
  await firstCharacter.fill("MARA");
  await firstCharacter.press("Enter");
  const firstDialogue = page.locator("textarea.blk").nth(2);
  await firstDialogue.fill("Hello.");
  await firstDialogue.press("Enter");
  const secondCharacter = page.locator("textarea.blk").nth(3);
  await expect(secondCharacter).toHaveClass(/blk-action/);

  await secondCharacter.press("Tab");
  await secondCharacter.fill("DELL");
  await secondCharacter.press("Enter");
  const secondDialogue = page.locator("textarea.blk").nth(4);
  await secondDialogue.fill("Hi.");
  await secondDialogue.press("Enter");
  const continuingCharacter = page.locator("textarea.blk").nth(5);
  await expect(continuingCharacter).toHaveClass(/blk-character/);

  await continuingCharacter.press("Enter");
  await expect(continuingCharacter).toHaveClass(/blk-action/);
  await continuingCharacter.press("Tab");
  await continuingCharacter.fill("MARA");
  await continuingCharacter.press("Enter");
  const continuingDialogue = page.locator("textarea.blk").nth(6);
  await expect(continuingDialogue).toHaveClass(/blk-dialogue/);
  await continuingDialogue.press("Tab");
  await expect(continuingDialogue).toHaveClass(/blk-parenthetical/);
  await expect(continuingDialogue).toHaveValue("()");
  await expect(continuingDialogue).toBeFocused();
  await expect(continuingDialogue).toHaveJSProperty("selectionStart", 1);
  await expect(continuingDialogue).toHaveJSProperty("selectionEnd", 1);

  await continuingDialogue.press("Tab");
  await expect(continuingDialogue).toHaveClass(/blk-dialogue/);
  await expect(continuingDialogue).toHaveValue("");
  await continuingDialogue.press("Tab");
  await continuingDialogue.pressSequentially("softly");
  await expect(continuingDialogue).toHaveValue("(softly)");
  await continuingDialogue.press("Enter");
  await expect(continuingDialogue).toHaveValue("(softly)");
  await expect(page.locator("textarea.blk-dialogue").last()).toBeFocused();
});

test("character suggestions support arrows, Enter, Tab selection, and Tab cycling", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();

  const heading = page.locator("textarea.blk").first();
  await heading.fill("INT. TEST ROOM - DAY");
  await heading.press("End");
  await heading.press("Enter");
  const mara = page.locator("textarea.blk").nth(1);
  await mara.press("Tab");
  await mara.fill("MARA");
  await mara.press("Enter");
  const dialogueOne = page.locator("textarea.blk").nth(2);
  await dialogueOne.fill("Hello.");
  await dialogueOne.press("Enter");
  const dell = page.locator("textarea.blk").nth(3);
  await dell.press("Tab");
  await dell.fill("DELL");
  await dell.press("Enter");
  const dialogueTwo = page.locator("textarea.blk").nth(4);
  await dialogueTwo.fill("Hi.");
  await dialogueTwo.press("Enter");

  const character = page.locator("textarea.blk").nth(5);
  const menu = page.getByRole("listbox", { name: "Character suggestions" });
  await expect(menu.getByRole("option")).toHaveText(["MARA", "DELL"]);
  await character.press("ArrowUp");
  await expect(menu.getByRole("option", { name: "DELL" })).toHaveAttribute("aria-selected", "true");
  await character.press("ArrowDown");
  await expect(menu.getByRole("option", { name: "MARA" })).toHaveAttribute("aria-selected", "true");
  await character.press("ArrowDown");
  await character.press("Enter");
  await expect(character).toHaveValue("DELL");

  await character.fill("");
  await character.press("ArrowLeft");
  await expect(menu.getByRole("option", { name: "DELL" })).toHaveAttribute("aria-selected", "true");
  await character.press("ArrowRight");
  await expect(menu.getByRole("option", { name: "MARA" })).toHaveAttribute("aria-selected", "true");
  await character.press("Tab");
  await expect(character).toHaveValue("MARA");

  await character.fill("");
  await character.press("Tab");
  await expect(character).toHaveValue("MARA");
  await character.press("Tab");
  await expect(character).toHaveValue("DELL");

  await character.fill("");
  await character.press("Enter");
  await expect(character).toHaveClass(/blk-action/);
  await expect(character).toHaveValue("");
  await character.press("Tab");
  await expect(character).toHaveClass(/blk-character/);
  await character.press("Tab");
  await expect(character).toHaveValue("MARA");
});

test("Ctrl-drag selects contiguous screenplay blocks without changing ordinary selection", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();

  const blocks = page.locator("textarea.blk");
  const first = blocks.nth(0);
  const third = blocks.nth(2);
  await third.scrollIntoViewIfNeeded();
  const firstBox = await first.boundingBox();
  const thirdBox = await third.boundingBox();
  if (!firstBox || !thirdBox) throw new Error("Expected screenplay blocks to be visible");

  await page.keyboard.down("Control");
  await page.mouse.move(firstBox.x + 4, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdBox.x + 4, thirdBox.y + thirdBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Control");
  await expect(blocks.nth(0)).toHaveClass(/multi-selected/);
  await expect(blocks.nth(1)).toHaveClass(/multi-selected/);
  await expect(blocks.nth(2)).toHaveClass(/multi-selected/);
  await expect(blocks.nth(3)).not.toHaveClass(/multi-selected/);

  const expectedCopy = [await blocks.nth(0).inputValue(), await blocks.nth(1).inputValue(), await blocks.nth(2).inputValue()].join("\n");
  await page.evaluate(() => {
    const testWindow = window as typeof window & { __scsCopied?: string };
    document.addEventListener("copy", (event) => {
      testWindow.__scsCopied = event.clipboardData?.getData("text/plain") ?? "";
    }, { once: true });
  });
  await first.press("Control+c");
  await expect.poll(() => page.evaluate(() => (window as typeof window & { __scsCopied?: string }).__scsCopied)).toBe(expectedCopy);

  await first.press("Escape");
  await expect(page.locator("textarea.blk.multi-selected")).toHaveCount(0);

  await page.mouse.move(firstBox.x + 4, firstBox.y + firstBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(thirdBox.x + 4, thirdBox.y + thirdBox.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("textarea.blk.multi-selected")).toHaveCount(0);
});

test("opening an FDX immediately still protects the in-memory project", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();
  await page.locator("textarea.blk").first().fill("Unsaved in-memory scene.");

  await page.getByRole("button", { name: "Project", exact: true }).click();
  const confirmation = page.waitForEvent("dialog");
  const opening = page.getByRole("menuitem", { name: "Open FDX…" }).click();
  const dialog = await confirmation;
  expect(dialog.message()).toContain("Open a different project?");
  await dialog.dismiss();
  await opening;

  await expect(page.locator("textarea.blk").first()).toHaveValue("UNSAVED IN-MEMORY SCENE.");
});

test("the companion workspace is reachable from the mode rail", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Companion", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Development dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk").first()).toBeVisible();
});

test("television workspace adds and switches episodes", async ({ page }) => {
  await page.getByRole("button", { name: "New Television Project" }).click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Untitled Show");

  await page.getByRole("button", { name: "Screenplay", exact: true }).click();
  await page.getByRole("menuitem", { name: "New Blank Screenplay" }).click();
  const screenplayTabs = page.getByRole("tablist", { name: "Open screenplays" }).getByRole("tab");
  const firstEpisode = screenplayTabs.filter({ hasText: "Untitled Episode" });
  const secondEpisode = screenplayTabs.filter({ hasText: "Screenplay 2" });
  await expect(screenplayTabs).toHaveCount(2);

  await firstEpisode.click();
  await expect(firstEpisode).toHaveAttribute("aria-selected", "true");
  await secondEpisode.click();
  await expect(secondEpisode).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("textarea.blk").first()).toBeEditable();
});

test("an episode-scoped version restores only the active television script", async ({ page }) => {
  await page.getByRole("button", { name: "New Television Project" }).click();
  const screenplayTabs = page.getByRole("tablist", { name: "Open screenplays" }).getByRole("tab");
  const firstEpisode = screenplayTabs.filter({ hasText: "Untitled Episode" });
  const secondEpisode = screenplayTabs.filter({ hasText: "Screenplay 2" });
  await page.locator("textarea.blk").first().fill("Episode checkpoint text.");
  await page.getByRole("button", { name: "Screenplay", exact: true }).click();
  await page.getByRole("menuitem", { name: "New Blank Screenplay" }).click();
  await page.locator("textarea.blk").first().fill("Second episode before checkpoint.");
  await firstEpisode.click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Episode checkpoint");
  await page.getByRole("combobox", { name: "Version scope" }).selectOption("episode");
  await page.getByRole("button", { name: "Save Draft Version" }).click();
  await expect(page.locator(".version-row", { hasText: "Episode checkpoint" })).toContainText("episode");

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.locator("textarea.blk").first().fill("Changed after checkpoint.");
  await secondEpisode.click();
  await page.locator("textarea.blk").first().fill("Second episode changed later.");
  await firstEpisode.click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".version-row", { hasText: "Episode checkpoint" }).getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk").first()).toHaveValue("EPISODE CHECKPOINT TEXT.");
  await secondEpisode.click();
  await expect(page.locator("textarea.blk").first()).toHaveValue("SECOND EPISODE CHANGED LATER.");
});

test("a Draft Review gates conflicts, keeps comments, and applies into a non-active target", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Review baseline");
  await page.getByRole("button", { name: "Save Draft Version" }).click();

  await page.getByPlaceholder("Alternate draft name").fill("Storm Rewrite");
  await page.getByRole("button", { name: "Create Alternate Draft" }).click();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.locator("textarea.blk-action").first().fill("The alternate storm rattles every window.");
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Storm rewrite ready");
  await page.getByRole("button", { name: "Save Draft Version" }).click();

  await page.getByLabel("Working draft").selectOption({ label: "Main Draft" });
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.locator("textarea.blk-action").first().fill("The main draft keeps the room completely still.");
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Main draft changed");
  await page.getByRole("button", { name: "Save Draft Version" }).click();
  await page.getByLabel("Working draft").selectOption({ label: "Storm Rewrite" });

  await page.getByLabel("Draft Review title").fill("Storm choice");
  await page.getByLabel("Review target draft").selectOption({ label: "Main Draft" });
  await expect(page.getByLabel("Review source draft").locator("option:checked")).toHaveText("Storm Rewrite");
  await page.getByRole("button", { name: "Open Draft Review" }).click();
  const review = page.locator("details.draft-review", { hasText: "Storm choice" });
  await review.locator("summary").first().click();

  await review.getByLabel("Comment on Storm choice").fill("Keep the storm, but preserve this discussion with the applied draft.");
  await review.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(review).toContainText("Keep the storm, but preserve this discussion with the applied draft.");

  await expect(review.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  const conflictChoice = review.getByRole("combobox", { name: /^Resolve / }).first();
  await conflictChoice.selectOption("theirs");
  await expect(review.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await review.getByRole("button", { name: "Apply Draft", exact: true }).click();

  await expect(page.getByLabel("Working draft").locator("option:checked")).toHaveText("Main Draft");
  await expect(review).toContainText("applied");
  await expect(review).toContainText("No assigned reviewers");
  await expect(review).not.toContainText("This review is out of date");
  await expect(review).toContainText("Keep the storm, but preserve this discussion with the applied draft.");
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByText(/Draft Review · Storm choice · Storm Rewrite → Main Draft/)).toBeVisible();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk-action").first()).toHaveValue("The alternate storm rattles every window.");
});

test("an assigned approver without edit permission can comment and decide a Draft Review", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByPlaceholder("Collaborator name").fill("Dana Reviewer");
  await page.locator('input[placeholder="Collaborator name"] + .btn-row select').selectOption("director");
  await page.getByRole("button", { name: "Add Collaborator" }).click();

  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Review baseline");
  await page.getByRole("button", { name: "Save Draft Version" }).click();
  await page.getByPlaceholder("Alternate draft name").fill("Director Review Draft");
  await page.getByRole("button", { name: "Create Alternate Draft" }).click();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.locator("textarea.blk-action").first().fill("A clean alternate change for review.");
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Alternate ready");
  await page.getByRole("button", { name: "Save Draft Version" }).click();
  await page.getByLabel("Draft Review title").fill("Director decision");
  await page.getByLabel("Review target draft").selectOption({ label: "Main Draft" });
  await page.getByText(/Choose reviewers/).click();
  await page.getByRole("checkbox", { name: /Dana Reviewer/ }).check();
  await page.getByRole("button", { name: "Open Draft Review" }).click();

  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByLabel("Acting as").selectOption({ label: "Dana Reviewer · Director" });
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save Draft Version" })).toBeDisabled();
  const review = page.locator("details.draft-review", { hasText: "Director decision" });
  await review.locator("summary").first().click();
  await expect(review.getByLabel("Comment on Director decision")).toBeEditable();
  await review.getByLabel("Comment on Director decision").fill("Approved by the assigned director.");
  await review.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(review).toContainText("Approved by the assigned director.");
  await expect(review.getByRole("button", { name: "Approve", exact: true })).toBeEnabled();
  await review.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(review).toContainText("approved");
});

test("edits survive local recovery and reopen from the launcher", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  const action = page.locator("textarea.blk-action").first();
  await action.fill("Recovered across a full reload.");

  await expect.poll(() => recoverySessionText(page)).toContain("Recovered across a full reload.");
  await page.reload();
  await page.locator(".launcher-recent").click();
  await expect(page.locator("textarea.blk-action").first()).toHaveValue("Recovered across a full reload.");
});

test("a no-op Fountain source toggle preserves imported FDX metadata", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await expect.poll(() => recoverySessionText(page)).toContain("THE LONG WAY HOME");
  const recoveryKey = await requireRecoverySessionKey(page);
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key)!);
    const document = session.documents[0];
    document.source = {
      type: "fdx",
      path: "C:/Writer/sample.fdx",
      fileName: "sample.fdx",
      lastImportedAt: "2026-08-14T00:00:00.000Z",
      lastImportedFingerprint: "external-baseline",
    };
    document.titlePage.blocks = [{ type: "Contact", text: "writer@example.test", metadata: { Align: "Center" } }];
    document.blocks[0].originalType = "Scene Heading";
    document.blocks[0].metadata = { Id: "scene-1", Number: "1A" };
    document.blocks[0].textRuns = [{
      text: document.blocks[0].text,
      bold: true,
      italic: false,
      underline: false,
      strikeout: false,
      metadata: { Style: "Bold" },
    }];
    localStorage.setItem(key, JSON.stringify(session));
  }, recoveryKey);

  await page.reload();
  await page.locator(".launcher-recent").click();
  await page.getByRole("tab", { name: "Fountain Source" }).click();
  await page.getByRole("tab", { name: "Formatted" }).click();
  await expect.poll(() => page.evaluate((key) => {
      const session = JSON.parse(localStorage.getItem(key)!);
      const document = session.documents[0];
      return {
        baseline: document.source.lastImportedFingerprint,
        titleBlocks: document.titlePage.blocks,
        originalType: document.blocks[0].originalType,
        metadata: document.blocks[0].metadata,
        textRuns: document.blocks[0].textRuns,
      };
    }, recoveryKey)).toEqual({
    baseline: "external-baseline",
    titleBlocks: [{ type: "Contact", text: "writer@example.test", metadata: { Align: "Center" } }],
    originalType: "Scene Heading",
    metadata: { Id: "scene-1", Number: "1A" },
    textRuns: [{
      text: "INT. GREYHOUND BUS - NIGHT",
      bold: true,
      italic: false,
      underline: false,
      strikeout: false,
      metadata: { Style: "Bold" },
    }],
  });
});

test("import warnings jump to the affected screenplay block", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();
  const heading = page.locator("textarea.blk").first();
  await heading.fill("INT. TEST ROOM - DAY");
  await heading.press("End");
  await heading.press("Enter");
  const action = page.locator("textarea.blk-action").first();
  await action.fill("Warning target line.");

  await expect.poll(() => recoverySessionText(page)).toContain("Warning target line.");
  const recoveryKey = await requireRecoverySessionKey(page);
  await page.evaluate((key) => {
    const session = JSON.parse(localStorage.getItem(key)!);
    session.documents[0].warnings = [{
      code: "ImportedStyle",
      message: "Imported formatting was preserved.",
      blockIndex: 1,
      severity: "warning",
      dataPreserved: true,
    }];
    localStorage.setItem(key, JSON.stringify(session));
  }, recoveryKey);

  await page.reload();
  await page.locator(".launcher-recent").click();
  await page.getByText("1 import warning: source data was preserved where possible").click();
  const warningTarget = page.getByRole("button", { name: "ImportedStyle: Imported formatting was preserved." });
  await warningTarget.focus();
  await warningTarget.press("Enter");
  await expect(action).toBeFocused();
  await expect(action).toHaveValue("Warning target line.");
  await expect(action).toHaveAttribute("data-script-target-state", "block");
  await expect(page.locator(".script-target-status")).toContainText("opened its original paragraph");
});

test("panels collapse, reopen, and focus mode strips the chrome", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();

  await page.getByRole("button", { name: "Hide scene navigator" }).click();
  await expect(page.locator(".pane-nav")).toHaveCount(0);
  await page.getByRole("button", { name: "Show scene navigator" }).click();
  await expect(page.locator(".pane-nav")).toBeVisible();

  await page.getByRole("button", { name: "Hide inspector" }).first().click();
  await expect(page.locator(".pane-insp")).toHaveCount(0);
  await page.getByRole("button", { name: "Show inspector" }).click();
  await expect(page.locator(".pane-insp")).toBeVisible();

  await page.getByRole("button", { name: "Enter focus mode" }).click();
  await expect(page.locator(".titlebar")).toBeHidden();
  await expect(page.locator(".focus-pill")).toBeVisible();
  await expect(page.locator(".page").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".titlebar")).toBeVisible();
});

test("resizing either side panel preserves the script scroll position", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  const editor = page.locator(".editor-scroll");

  for (const resize of [
    { label: "Resize scene navigator", key: "ArrowRight", delta: 36 },
    { label: "Resize inspector", key: "ArrowLeft", delta: -36 },
  ]) {
    const handle = page.getByRole("separator", { name: resize.label });
    await handle.focus();
    const before = await editor.evaluate((element) => {
      element.scrollTop = Math.min(360, element.scrollHeight - element.clientHeight);
      return element.scrollTop;
    });
    expect(before).toBeGreaterThan(0);

    await handle.press(resize.key);
    await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBe(before);

    const box = await handle.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await page.mouse.down();
    await page.mouse.move(box!.x + box!.width / 2 + resize.delta, box!.y + box!.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBe(before);
  }
});

test("the scene navigator jumps to the selected scene", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.locator(".nav-scene", { hasText: "EXT. REST STOP" }).click();
  await expect(page.locator(".nav-scene.active")).toContainText("EXT. REST STOP");
  await expect(page.locator(".insp-scene-heading")).toContainText("EXT. REST STOP");
  await expect(page.locator("textarea.blk-scene_heading").nth(1)).toBeFocused();
});

test("viewer role cannot edit screenplay text or enter source mode", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  const name = page.getByPlaceholder("Collaborator name");
  await name.fill("View Only");
  await name.locator("xpath=following-sibling::div[1]").getByRole("combobox").selectOption("viewer");
  await page.getByRole("button", { name: "Add Collaborator" }).click();
  await page.getByLabel("Acting as").selectOption({ label: "View Only · Viewer" });

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk").first()).toBeDisabled();
  await expect(page.getByRole("tab", { name: "Fountain Source" })).toBeDisabled();
});

test("viewer role cannot reorder scenes through outline drag and drop", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Scene", exact: true }).click();
  let cards = page.locator(".story-card-grid .insp-card");
  await expect(cards).toHaveCount(3);
  const initialOrder = await cards.locator(".insp-card-title").allTextContents();

  await page.getByRole("button", { name: "Team", exact: true }).click();
  const name = page.getByPlaceholder("Collaborator name");
  await name.fill("Outline Viewer");
  await name.locator("xpath=following-sibling::div[1]").getByRole("combobox").selectOption("viewer");
  await page.getByRole("button", { name: "Add Collaborator" }).click();
  await page.getByLabel("Acting as").selectOption({ label: "Outline Viewer · Viewer" });
  await page.getByRole("button", { name: "Outline", exact: true }).click();

  cards = page.locator(".story-card-grid .insp-card");
  await expect(cards.first()).toHaveAttribute("draggable", "false");
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await cards.first().dispatchEvent("dragstart", { dataTransfer });
  await cards.nth(1).dispatchEvent("dragover", { dataTransfer });
  await cards.nth(1).dispatchEvent("drop", { dataTransfer });
  await cards.first().dispatchEvent("dragend", { dataTransfer });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

  await expect.poll(() => cards.locator(".insp-card-title").allTextContents()).toEqual(initialOrder);
  await dataTransfer.dispose();
});

test("the theme switch flips both palettes and is remembered across a reload", async ({ page }) => {
  const root = page.locator("html");
  const body = page.locator("body");

  // With nothing remembered, the palette follows the OS.
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(body).toHaveCSS("background-color", "rgb(20, 22, 26)");

  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(body).toHaveCSS("background-color", "rgb(201, 196, 183)");

  // The writer's choice sticks, beats the OS, and is painted before React mounts.
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(body).toHaveCSS("background-color", "rgb(201, 196, 183)");

  // It reaches the workspace chrome too, and switches back.
  await page.getByRole("button", { name: /sample project/i }).click();
  await expect(page.locator(".titlebar")).toHaveCSS("background-color", "rgb(186, 181, 168)");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".titlebar")).toHaveCSS("background-color", "rgb(13, 15, 18)");
});
