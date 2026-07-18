import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("sample screenplay survives source mode and exposes workspace tools", async ({ page }) => {
  await page.getByRole("button", { name: "Sample Project" }).click();

  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("THE LONG WAY HOME");
  const action = page.locator("textarea.blk-action").first();
  const edited = "E2E edit survives both screenplay modes.";
  await action.fill(edited);

  await page.getByRole("button", { name: "Fountain Source" }).click();
  await expect(page.locator("textarea.source-editor")).toHaveValue(new RegExp(edited));
  await page.getByRole("button", { name: "Formatted" }).click();
  await expect(page.locator("textarea.blk-action").first()).toHaveValue(edited);

  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Workspace layouts" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Panel composer" })).toBeVisible();
  await page.getByRole("button", { name: "Close layout manager" }).click();

  await page.getByRole("button", { name: "Team", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Local identity and roles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Comments and suggested changes" })).toBeVisible();

  await page.getByRole("button", { name: "Props", exact: true }).click();
  const manualObject = page.getByRole("textbox", { name: "Manual object name" });
  await manualObject.fill("E2E Compass");
  await page.getByRole("button", { name: "Add Object" }).click();
  await expect(manualObject).toHaveValue("");
  await expect(page.locator("summary.insp-card-title", { hasText: "E2E COMPASS" })).toBeVisible();
});

test("opening an FDX immediately still protects the in-memory project", async ({ page }) => {
  await page.getByRole("button", { name: "New Screenplay" }).click();
  await page.locator("textarea.blk").first().fill("Unsaved in-memory scene.");

  const confirmation = page.waitForEvent("dialog");
  const opening = page.getByRole("button", { name: "Open FDX", exact: true }).click();
  const dialog = await confirmation;
  expect(dialog.message()).toContain("Open a different project?");
  await dialog.dismiss();
  await opening;

  await expect(page.locator("textarea.blk").first()).toHaveValue("UNSAVED IN-MEMORY SCENE.");
});

test("duplicating the Companion layout keeps its dashboard", async ({ page }) => {
  await page.getByRole("button", { name: "Sample Project" }).click();
  const layouts = page.getByRole("combobox", { name: "Workspace layout" });
  await layouts.selectOption("companion");
  await expect(page.getByRole("heading", { name: "Development dashboard" })).toBeVisible();

  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Workspace layouts" });
  await dialog.getByRole("button", { name: "Duplicate as custom" }).click();
  await dialog.getByRole("button", { name: "Close layout manager" }).click();

  await expect(layouts).toHaveValue("companion-copy");
  await expect(page.getByRole("heading", { name: "Development dashboard" })).toBeVisible();
});

test("television workspace adds and switches episodes", async ({ page }) => {
  await page.getByRole("button", { name: "New Television Show" }).click();
  await expect(page.getByRole("textbox", { name: "Project name" })).toHaveValue("Untitled Show");

  await page.getByRole("button", { name: "New Episode", exact: true }).click();
  const episodes = page.locator('[aria-label="Television episodes"]');
  await expect(episodes.getByRole("button")).toHaveCount(2);

  await episodes.getByRole("button", { name: "Untitled Episode", exact: true }).click();
  await expect(episodes.locator("button.active")).toHaveText("Untitled Episode");
  await episodes.getByRole("button", { name: "Episode 2", exact: true }).click();
  await expect(episodes.locator("button.active")).toHaveText("Episode 2");
  await expect(page.locator("textarea.blk").first()).toBeEditable();
});

test("an episode-scoped version restores only the active television script", async ({ page }) => {
  await page.getByRole("button", { name: "New Television Show" }).click();
  const episodes = page.locator('[aria-label="Television episodes"]');
  await page.locator("textarea.blk").first().fill("Episode checkpoint text.");
  await page.getByRole("button", { name: "New Episode", exact: true }).click();
  await page.locator("textarea.blk").first().fill("Second episode before checkpoint.");
  await episodes.getByRole("button", { name: "Untitled Episode", exact: true }).click();
  await page.getByRole("button", { name: "Drafts", exact: true }).click();
  await page.getByPlaceholder(/Draft \d+ name/).fill("Episode checkpoint");
  await page.getByRole("combobox", { name: "Version scope" }).selectOption("episode");
  await page.getByRole("button", { name: "Save Draft Version" }).click();
  await expect(page.locator(".version-row", { hasText: "Episode checkpoint" })).toContainText("episode");

  await page.locator("textarea.blk").first().fill("Changed after checkpoint.");
  await episodes.getByRole("button", { name: "Episode 2", exact: true }).click();
  await page.locator("textarea.blk").first().fill("Second episode changed later.");
  await episodes.getByRole("button", { name: "Untitled Episode", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".version-row", { hasText: "Episode checkpoint" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.locator("textarea.blk").first()).toHaveValue("EPISODE CHECKPOINT TEXT.");
  await episodes.getByRole("button", { name: "Episode 2", exact: true }).click();
  await expect(page.locator("textarea.blk").first()).toHaveValue("SECOND EPISODE CHANGED LATER.");
});

test("a custom layout and targeted reference survive local recovery reopen", async ({ page }) => {
  await page.getByRole("button", { name: "Sample Project" }).click();
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Workspace layouts" });
  await dialog.getByRole("button", { name: "Duplicate as custom" }).click();
  await dialog.getByRole("combobox", { name: "Panel kind" }).selectOption("reference");
  await dialog.getByRole("button", { name: "Add panel" }).click();
  await dialog.getByRole("button", { name: "Add tab group" }).click();

  const panelRow = dialog.locator('input[value="Reference"]').last().locator("xpath=ancestor::div[contains(@class, 'layout-topology')]");
  await panelRow.getByLabel("Reference").selectOption("character");
  await panelRow.getByLabel("Target").selectOption({ index: 1 });
  await panelRow.getByLabel("Tab group").selectOption("tabs");
  await panelRow.getByLabel("Title").fill("Character scenes");
  await dialog.getByRole("combobox", { name: "Panel kind" }).selectOption("story");
  await dialog.getByRole("button", { name: "Add panel" }).click();
  const storyRow = dialog.locator('input[value="Story"]').last().locator("xpath=ancestor::div[contains(@class, 'layout-topology')]");
  await storyRow.getByLabel("Tab group").selectOption("main-tabs");
  await storyRow.getByLabel("Title").fill("Undo tab");
  await dialog.getByRole("button", { name: "Save layout" }).click();
  await dialog.getByRole("button", { name: "Close layout manager" }).click();

  await expect(page.getByRole("button", { name: "Character scenes", exact: true })).toBeVisible();
  await expect(page.getByLabel("Character scenes reference")).toContainText("Persistent reference");

  await page.getByRole("button", { name: "Screenplay", exact: true }).click();
  const action = page.locator("textarea.blk-action").first();
  const original = await action.inputValue();
  await action.fill("Undo survives a hidden screenplay tab.");
  await page.getByRole("button", { name: "Undo tab", exact: true }).click();
  await page.getByRole("button", { name: "Screenplay", exact: true }).click();
  await action.press("Control+z");
  await expect(action).toHaveValue(original);

  await expect.poll(() => page.evaluate(() => localStorage.getItem("scs.project-session.v3"))).toContain("Character scenes");
  await page.reload();
  await page.locator(".home-recent-item").click();
  await expect(page.getByRole("combobox", { name: "Workspace layout" })).toHaveValue(/-copy$/);
  await expect(page.getByRole("button", { name: "Character scenes", exact: true })).toBeVisible();
  await expect(page.getByLabel("Character scenes reference")).toContainText("Persistent reference");
});

test("multiple floating panels have independent saved frames", async ({ page }) => {
  await page.getByRole("button", { name: "Sample Project" }).click();
  await page.getByRole("button", { name: "Layouts", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Workspace layouts" });
  await dialog.getByRole("button", { name: "Duplicate as custom" }).click();

  await dialog.getByRole("combobox", { name: "Panel kind" }).selectOption("reference");
  await dialog.getByRole("button", { name: "Add panel" }).click();
  const referenceRow = dialog.locator('input[value="Reference"]').last().locator("xpath=ancestor::div[contains(@class, 'layout-topology')]");
  await referenceRow.getByLabel("Tab group").selectOption("floating");
  await referenceRow.getByLabel("Reference floating left").fill("30");
  await referenceRow.getByLabel("Reference floating top").fill("30");

  await dialog.getByRole("combobox", { name: "Panel kind" }).selectOption("breakdown");
  await dialog.getByRole("button", { name: "Add panel" }).click();
  const breakdownRow = dialog.locator('input[value="Breakdown"]').last().locator("xpath=ancestor::div[contains(@class, 'layout-topology')]");
  await breakdownRow.getByLabel("Tab group").selectOption("floating");
  await breakdownRow.getByLabel("Breakdown floating left").fill("500");
  await breakdownRow.getByLabel("Breakdown floating top").fill("90");

  await dialog.getByRole("button", { name: "Save layout" }).click();
  await dialog.getByRole("button", { name: "Close layout manager" }).click();
  const frames = page.locator(".workspace-floating-panel");
  await expect(frames).toHaveCount(2);
  await expect(frames.nth(0)).toHaveCSS("left", "30px");
  await expect(frames.nth(1)).toHaveCSS("left", "500px");
});

test("viewer role cannot edit screenplay text or enter source mode", async ({ page }) => {
  await page.getByRole("button", { name: "Sample Project" }).click();
  await page.getByRole("button", { name: "Team", exact: true }).click();
  const name = page.getByPlaceholder("Collaborator name");
  await name.fill("View Only");
  await name.locator("xpath=following-sibling::div[1]").getByRole("combobox").selectOption("viewer");
  await page.getByRole("button", { name: "Add Collaborator" }).click();
  await page.getByLabel("Acting as").selectOption({ label: "View Only · Viewer" });

  await expect(page.locator("textarea.blk").first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Fountain Source" })).toBeDisabled();
});
