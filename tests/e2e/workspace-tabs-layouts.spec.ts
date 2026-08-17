import { expect, test, type Page } from "@playwright/test";
import { recoverySessionText, requireRecoverySessionKey } from "./recoveryStorage.ts";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /sample project/i }).click();
});

function documentTabs(page: Page) {
  return page.getByRole("tablist", { name: "Open screenplays" }).getByRole("tab");
}

async function openWindowMenu(page: Page) {
  await page.getByRole("button", { name: "Window", exact: true }).click();
  return page.getByRole("menu", { name: "Window" });
}

test("document tabs activate, reorder, close, reopen, and retain document-local editor state", async ({ page }) => {
  await page.getByRole("button", { name: "Screenplay", exact: true }).click();
  await page.getByRole("menuitem", { name: "New Blank Screenplay" }).click();

  const tabs = documentTabs(page);
  await expect(tabs).toHaveCount(2);
  const sampleTab = tabs.filter({ hasText: "THE LONG WAY HOME" });
  let blankTab = tabs.filter({ hasText: "Screenplay 2" });
  await expect(blankTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tablist", { name: "Editor view" }).getByRole("tab", { name: "Fountain Source" }).click();
  const sourceEditor = page.locator("textarea.source-editor");
  await sourceEditor.fill("Title: Screenplay 2\n\nINT. SECOND SCREENPLAY - DAY\n\nSelection is local to this screenplay view.");
  await sourceEditor.evaluate((editor: HTMLTextAreaElement) => {
    editor.focus();
    editor.setSelectionRange(5, 21);
    editor.dispatchEvent(new Event("select", { bubbles: true }));
  });

  await blankTab.focus();
  await blankTab.press("ArrowLeft");
  await expect(sampleTab).toHaveAttribute("aria-selected", "true");
  await expect(sampleTab).toBeFocused();
  await expect(page.locator("textarea.source-editor")).toHaveCount(0);

  await sampleTab.press("ArrowRight");
  await expect(blankTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("textarea.source-editor")).toBeVisible();
  await expect.poll(() => page.locator("textarea.source-editor").evaluate((editor: HTMLTextAreaElement) => [editor.selectionStart, editor.selectionEnd])).toEqual([5, 21]);

  await blankTab.press("Alt+Shift+ArrowLeft");
  await expect(tabs.nth(0)).toContainText("Screenplay 2");
  await expect(tabs.nth(0)).toBeFocused();
  await tabs.nth(0).press("Control+Delete");
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toContainText("THE LONG WAY HOME");

  await page.getByRole("combobox", { name: "Open screenplay" }).selectOption({ label: "Screenplay 2" });
  blankTab = tabs.filter({ hasText: "Screenplay 2" });
  await expect(blankTab).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("textarea.source-editor")).toBeVisible();

  await expect.poll(() => recoverySessionText(page)).toContain("Screenplay 2");
  await page.reload();
  await page.locator(".launcher-recent").click();
  await expect(documentTabs(page)).toHaveCount(2);
  await expect(documentTabs(page).filter({ hasText: "Screenplay 2" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tablist", { name: "Editor view" }).getByRole("tab", { name: "Fountain Source" })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("textarea.source-editor")).toHaveValue(/Selection is local to this screenplay view\./);
  await expect.poll(() => page.locator("textarea.source-editor").evaluate((editor: HTMLTextAreaElement) => [editor.selectionStart, editor.selectionEnd])).toEqual([5, 21]);
});

test("the final tab stays open and closing a project materializes an unsaved Fountain buffer", async ({ page }) => {
  const onlyTab = documentTabs(page).first();
  await onlyTab.focus();
  await onlyTab.press("Control+Delete");
  await expect(documentTabs(page)).toHaveCount(1);
  await expect(onlyTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tablist", { name: "Editor view" }).getByRole("tab", { name: "Fountain Source" }).click();
  const source = page.locator("textarea.source-editor");
  await source.fill("Title: Lifecycle Draft\n\nINT. SAFE CLOSE - DAY\n\nThe source buffer survives the window lifecycle.");

  await page.getByRole("button", { name: "Project", exact: true }).click();
  await page.getByRole("menuitem", { name: "Close Project" }).click();
  await expect(page.locator(".launcher-recent")).toBeVisible();
  await expect.poll(() => recoverySessionText(page)).toContain("SAFE CLOSE");
  await page.reload();
  await page.locator(".launcher-recent").click();

  await page.getByRole("tablist", { name: "Editor view" }).getByRole("tab", { name: "Fountain Source" }).click();
  await expect(page.locator("textarea.source-editor")).toHaveValue(/The source buffer survives the window lifecycle\./);
});

test("removing a screenplay materializes its unsaved Fountain buffer into the protected recovery snapshot", async ({ page }) => {
  await page.getByRole("button", { name: "Screenplay", exact: true }).click();
  await page.getByRole("menuitem", { name: "New Blank Screenplay" }).click();
  await page.getByRole("tablist", { name: "Editor view" }).getByRole("tab", { name: "Fountain Source" }).click();
  await page.locator("textarea.source-editor").fill([
    "Title: Protected Removal",
    "",
    "INT. RECOVERY VAULT - NIGHT",
    "",
    "Unsaved source survives document removal.",
  ].join("\n"));

  await page.getByRole("button", { name: /Actions for (Screenplay 2|Protected Removal)/ }).click();
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await page.getByRole("menuitem", { name: /Remove from project/ }).click();

  await expect(documentTabs(page)).toHaveCount(1);
  await expect(documentTabs(page).first()).toContainText("THE LONG WAY HOME");
  await expect.poll(async () => {
    const stored = await recoverySessionText(page);
    if (!stored) return null;
    const recovered = JSON.parse(stored);
    return {
      liveTitles: recovered.documents.map((document: { titlePage: { title: string } }) => document.titlePage.title),
      protectedSource: recovered.versionHistory.snapshots.some((snapshot: { session: { documents: Array<{ titlePage: { title: string }; blocks: Array<{ text: string }> }> } }) =>
        snapshot.session.documents.some((document) => document.titlePage.title === "Protected Removal"
          && document.blocks.some((block) => block.text === "Unsaved source survives document removal."))),
    };
  }).toEqual({ liveTitles: ["THE LONG WAY HOME"], protectedSource: true });
});

test("layout manager restores panels and persists custom layout CRUD and shortcuts", async ({ page }) => {
  let windowMenu = await openWindowMenu(page);
  await windowMenu.getByRole("menuitem", { name: /Layout: Development$/ }).click();
  await expect(page.getByLabel("Development workspace layout")).toBeVisible();

  const developmentTabs = page.getByRole("tablist", { name: "Workspace panels" }).filter({
    has: page.getByRole("tab", { name: "Story", exact: true }),
  });
  const storyTab = developmentTabs.getByRole("tab", { name: "Story", exact: true });
  const treatmentTab = developmentTabs.getByRole("tab", { name: "Treatment", exact: true });
  await storyTab.focus();
  await storyTab.press("ArrowRight");
  await expect(treatmentTab).toHaveAttribute("aria-selected", "true");
  await expect(treatmentTab).toBeFocused();
  await treatmentTab.press("ArrowLeft");
  await expect(storyTab).toHaveAttribute("aria-selected", "true");
  await storyTab.press("Alt+Shift+ArrowRight");
  await expect(developmentTabs.getByRole("tab").nth(1)).toHaveText("Story");
  await expect(developmentTabs.getByRole("tab").nth(1)).toBeFocused();

  await page.getByRole("button", { name: "Hide Story" }).click();
  await expect(page.getByRole("tab", { name: "Story", exact: true })).toHaveCount(0);

  windowMenu = await openWindowMenu(page);
  await windowMenu.getByRole("menuitem", { name: "Manage Layouts…" }).click();
  let manager = page.getByRole("dialog", { name: "Workspace layout manager" });
  await expect(manager.getByRole("button", { name: "Restore hidden panels (1)" })).toBeEnabled();
  await manager.getByRole("button", { name: "Restore hidden panels (1)" }).click();
  await expect(page.getByRole("tab", { name: "Story", exact: true })).toHaveCount(1);
  await expect(manager.getByRole("button", { name: "Restore hidden panels (0)" })).toBeDisabled();

  let storyPlacement = manager.getByLabel("Place Story");
  await storyPlacement.focus();
  await storyPlacement.press("ArrowDown");
  await expect(page.getByLabel("Story, floating panel")).toBeVisible();
  storyPlacement = manager.getByLabel("Place Story");
  const joinValue = await storyPlacement.locator("option").filter({ hasText: "Join group" }).first().getAttribute("value");
  expect(joinValue).toBeTruthy();
  await storyPlacement.selectOption(joinValue!);
  await expect(page.getByLabel("Story, floating panel")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Story", exact: true })).toHaveCount(1);

  await manager.getByRole("textbox", { name: "Name", exact: true }).fill("E2E Layout");
  await manager.getByRole("button", { name: "Save current layout" }).click();
  let layoutRow = manager.getByRole("button", { name: "E2E Layout", exact: true }).locator("..");
  await expect(layoutRow).toBeVisible();
  await layoutRow.getByRole("textbox", { name: "Shortcut for E2E Layout" }).fill("Ctrl+Alt+9");
  await expect(layoutRow.getByRole("textbox", { name: "Shortcut for E2E Layout" })).toHaveValue("ctrl+alt+9");

  await layoutRow.getByRole("button", { name: "Duplicate" }).click();
  await expect(manager.getByRole("button", { name: "E2E Layout Copy", exact: true })).toHaveAttribute("aria-current", "true");

  page.once("dialog", (dialog) => dialog.accept("Renamed E2E Layout"));
  await layoutRow.getByRole("button", { name: "Rename" }).click();
  layoutRow = manager.getByRole("button", { name: "Renamed E2E Layout", exact: true }).locator("..");
  await expect(layoutRow).toBeVisible();
  await layoutRow.getByRole("button", { name: "Delete" }).click();
  await expect(manager.getByRole("button", { name: "Renamed E2E Layout", exact: true })).toHaveCount(0);

  await expect.poll(() => recoverySessionText(page)).toContain("E2E Layout Copy");
  await manager.getByRole("button", { name: "Close layout manager" }).click();
  await expect(page.getByRole("heading", { name: "E2E Layout Copy" })).toBeVisible();

  await page.reload();
  await page.locator(".launcher-recent").click();
  windowMenu = await openWindowMenu(page);
  await windowMenu.getByRole("menuitem", { name: "Manage Layouts…" }).click();
  manager = page.getByRole("dialog", { name: "Workspace layout manager" });
  await expect(manager.getByRole("button", { name: "E2E Layout Copy", exact: true })).toHaveAttribute("aria-current", "true");
});

test("read-only roles can apply window layouts but cannot mutate portable layouts", async ({ page }) => {
  await expect.poll(() => recoverySessionText(page)).not.toBeNull();
  const recoveryKey = await requireRecoverySessionKey(page);
  await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) throw new Error("Missing recovery session.");
    const session = JSON.parse(raw) as {
      workspace: {
        collaborators: Array<{ id: string; name: string; role: string }>;
        currentUserId: string;
      };
    };
    session.workspace.collaborators.push({ id: "layout-viewer", name: "Layout viewer", role: "viewer" });
    session.workspace.currentUserId = "layout-viewer";
    localStorage.setItem(key, JSON.stringify(session));
  }, recoveryKey);
  await page.reload();
  await page.locator(".launcher-recent").click();

  const windowMenu = await openWindowMenu(page);
  await windowMenu.getByRole("menuitem", { name: "Manage Layouts…" }).click();
  const manager = page.getByRole("dialog", { name: "Workspace layout manager" });
  await expect(manager.getByRole("textbox", { name: "Name", exact: true })).toBeDisabled();
  await expect(manager.getByRole("button", { name: "Save current layout" })).toBeDisabled();
  await expect(manager.getByRole("button", { name: "Duplicate" }).first()).toBeDisabled();
  await expect(manager.getByLabel("Shortcut for Writer")).toBeDisabled();
  await expect(manager.getByRole("button", { name: "Writer (built-in)" })).toBeEnabled();
  await expect.poll(() => recoverySessionText(page)).not.toContain("Writer Copy");
});
