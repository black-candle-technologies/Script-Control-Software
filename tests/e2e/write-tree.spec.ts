import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: /sample project/i }).click();
});

test("Write exposes empty hierarchy nodes, Unassigned, beats, and keyboard traversal", async ({ page }) => {
  const tree = page.getByRole("tree", { name: /story structure/i });
  await expect(tree).toBeVisible();
  const act = tree.getByRole("treeitem", { name: /Act I/ });
  const emptyAct = tree.getByRole("treeitem", { name: "No sequences in this act" });
  const unassigned = tree.getByRole("treeitem", { name: /Unassigned scenes/ });
  const firstScene = tree.getByRole("treeitem", { name: /INT\. GREYHOUND BUS - NIGHT/ });
  const beat = tree.getByRole("treeitem", { name: /Mara decides to engage/ });

  await expect(act).toHaveAttribute("aria-expanded", "true");
  await expect(emptyAct).toHaveAttribute("aria-disabled", "true");
  await expect(unassigned).toHaveAttribute("aria-expanded", "true");
  await expect(firstScene).not.toHaveAttribute("aria-current", "location");
  await expect(beat).toBeVisible();

  await act.focus();
  await act.press("ArrowDown");
  await expect(unassigned).toBeFocused();
  await unassigned.press("ArrowRight");
  await expect(firstScene).toBeFocused();
  await firstScene.press("ArrowRight");
  await expect(beat).toBeFocused();
  await beat.press("Enter");
  await expect(firstScene).toHaveAttribute("aria-current", "location");
  await expect(page.locator("textarea.blk-scene_heading").first()).toBeFocused();
});

test("a single empty sequence stays labeled and supports tree collapse keys", async ({ page }) => {
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  await page.getByRole("button", { name: "Sequence", exact: true }).click();
  await page.getByRole("button", { name: "Add Sequence" }).click();
  await page.getByRole("button", { name: "Write", exact: true }).click();

  const tree = page.getByRole("tree", { name: /story structure/i });
  const act = tree.getByRole("treeitem", { name: /Act I/ });
  const sequence = tree.getByRole("treeitem", { name: "Sequence 1" });
  const emptySequence = tree.getByRole("treeitem", { name: "Empty sequence" });
  await expect(sequence).toBeVisible();
  await expect(emptySequence).toBeVisible();
  await expect(tree.getByRole("treeitem", { name: /Unassigned scenes/ })).toBeVisible();

  await sequence.focus();
  await sequence.press(" ");
  await expect(sequence).toHaveAttribute("aria-expanded", "false");
  await expect(emptySequence).toBeHidden();
  await sequence.press("ArrowLeft");
  await expect(act).toBeFocused();
  await act.press("End");
  await expect(tree.getByRole("treeitem").last()).toBeFocused();
  await tree.getByRole("treeitem").last().press("Home");
  await expect(act).toBeFocused();
});
