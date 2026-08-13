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
