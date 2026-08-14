import { expect, test } from "@playwright/test";

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
  await page.getByRole("tab", { name: "Props" }).click();
  const manualObject = page.getByRole("textbox", { name: "Manual object name" });
  await manualObject.fill("E2E Compass");
  await page.getByRole("button", { name: "Add Object" }).click();
  await expect(manualObject).toHaveValue("");
  await expect(page.locator("summary.insp-card-title", { hasText: "E2E COMPASS" })).toBeVisible();
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

  await page.getByRole("button", { name: "Episode", exact: true }).click();
  await page.getByRole("menuitem", { name: "New Blank Episode" }).click();
  const episodes = page.locator('[aria-label="Television episodes"]');
  await expect(episodes.locator(".episode-tab")).toHaveCount(2);

  await episodes.getByRole("button", { name: "Untitled Episode", exact: true }).click();
  await expect(episodes.locator("button.active")).toHaveText("Untitled Episode");
  await episodes.getByRole("button", { name: "Episode 2", exact: true }).click();
  await expect(episodes.locator("button.active")).toHaveText("Episode 2");
  await expect(page.locator("textarea.blk").first()).toBeEditable();
});

test("an episode-scoped version restores only the active television script", async ({ page }) => {
  await page.getByRole("button", { name: "New Television Project" }).click();
  const episodes = page.locator('[aria-label="Television episodes"]');
  await page.locator("textarea.blk").first().fill("Episode checkpoint text.");
  await page.getByRole("button", { name: "Episode", exact: true }).click();
  await page.getByRole("menuitem", { name: "New Blank Episode" }).click();
  await page.locator("textarea.blk").first().fill("Second episode before checkpoint.");
  await episodes.getByRole("button", { name: "Untitled Episode", exact: true }).click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Episode checkpoint");
  await page.getByRole("combobox", { name: "Version scope" }).selectOption("episode");
  await page.getByRole("button", { name: "Save Draft Version" }).click();
  await expect(page.locator(".version-row", { hasText: "Episode checkpoint" })).toContainText("episode");

  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.locator("textarea.blk").first().fill("Changed after checkpoint.");
  await episodes.getByRole("button", { name: "Episode 2", exact: true }).click();
  await page.locator("textarea.blk").first().fill("Second episode changed later.");
  await episodes.getByRole("button", { name: "Untitled Episode", exact: true }).click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".version-row", { hasText: "Episode checkpoint" }).getByRole("button", { name: "Restore" }).click();
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(page.locator("textarea.blk").first()).toHaveValue("EPISODE CHECKPOINT TEXT.");
  await episodes.getByRole("button", { name: "Episode 2", exact: true }).click();
  await expect(page.locator("textarea.blk").first()).toHaveValue("SECOND EPISODE CHANGED LATER.");
});

test("edits survive local recovery and reopen from the launcher", async ({ page }) => {
  await page.getByRole("button", { name: /sample project/i }).click();
  const action = page.locator("textarea.blk-action").first();
  await action.fill("Recovered across a full reload.");

  await expect.poll(() => page.evaluate(() => localStorage.getItem("scs.project-session.v3"))).toContain("Recovered across a full reload.");
  await page.reload();
  await page.locator(".launcher-recent").click();
  await expect(page.locator("textarea.blk-action").first()).toHaveValue("Recovered across a full reload.");
});

test("import warnings jump to the affected screenplay block", async ({ page }) => {
  await page.getByRole("button", { name: "New Feature Screenplay" }).click();
  const heading = page.locator("textarea.blk").first();
  await heading.fill("INT. TEST ROOM - DAY");
  await heading.press("End");
  await heading.press("Enter");
  const action = page.locator("textarea.blk-action").first();
  await action.fill("Warning target line.");

  await expect.poll(() => page.evaluate(() => localStorage.getItem("scs.project-session.v3"))).toContain("Warning target line.");
  await page.evaluate(() => {
    const key = "scs.project-session.v3";
    const session = JSON.parse(localStorage.getItem(key)!);
    session.documents[0].warnings = [{
      code: "ImportedStyle",
      message: "Imported formatting was preserved.",
      blockIndex: 1,
      severity: "warning",
      dataPreserved: true,
    }];
    localStorage.setItem(key, JSON.stringify(session));
  });

  await page.reload();
  await page.locator(".launcher-recent").click();
  await page.getByText("1 import warning: source data was preserved where possible").click();
  await page.getByRole("button", { name: "ImportedStyle: Imported formatting was preserved." }).click();
  await expect(action).toBeFocused();
  await expect(action).toHaveValue("Warning target line.");
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
  await expect(body).toHaveCSS("background-color", "rgb(221, 216, 205)");

  // The writer's choice sticks, beats the OS, and is painted before React mounts.
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(body).toHaveCSS("background-color", "rgb(221, 216, 205)");

  // It reaches the workspace chrome too, and switches back.
  await page.getByRole("button", { name: /sample project/i }).click();
  await expect(page.locator(".titlebar")).toHaveCSS("background-color", "rgb(179, 174, 163)");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".titlebar")).toHaveCSS("background-color", "rgb(13, 15, 18)");
});
