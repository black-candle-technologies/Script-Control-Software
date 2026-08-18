import assert from "node:assert/strict";
import test from "node:test";
import { defaultProjectWorkspace } from "./projectWorkspace.ts";
import {
  activateDockPanel,
  dockPanel,
  dockTreeNodes,
  floatDockPanel,
  updateFloatingPanelRect,
  getWorkspaceDockLayout,
  hideDockPanel,
  migrateWorkspaceLayoutToDockTree,
  moveDockPanelToTabs,
  reorderDockTab,
  resizeDockSplit,
  restoreAllHiddenPanels,
  restoreHiddenPanel,
  restoreOffscreenFloatingPanels,
  validateDockLayout,
  type WorkspaceDockLayout,
} from "./dockTree.ts";
import { normalizeWorkspaceLayout } from "./workspaceLayouts.ts";

function developmentLayout() {
  return migrateWorkspaceLayoutToDockTree(normalizeWorkspaceLayout(defaultProjectWorkspace().layouts.find((layout) => layout.id === "development")!));
}

test("legacy flat presets migrate to a valid nested dock tree with ratios and panel ownership", () => {
  for (const legacy of defaultProjectWorkspace().layouts) {
    const flat = normalizeWorkspaceLayout(legacy);
    const tree = migrateWorkspaceLayoutToDockTree(flat);
    assert.equal(tree.layoutVersion, 2);
    assert.equal(validateDockLayout(tree).valid, true, legacy.id);
    const owned = dockTreeNodes(tree.root).flatMap((node) => node.kind === "tabs" ? node.panelIds : []).concat(tree.floatingPanels.map((panel) => panel.panelId));
    assert.equal(new Set(owned).size, owned.length);
    if (flat.splits[0]) assert.deepEqual(tree.root.kind === "split" ? tree.root.sizes : [], flat.splits[0].sizes);
  }
});

test("malformed, duplicate, and cyclic persisted trees fall back to a recoverable Writer topology", () => {
  const layout = developmentLayout();
  const malformed = structuredClone(layout);
  if (malformed.root.kind === "split") malformed.root.children.push(malformed.root.children[0]);
  const repaired = migrateWorkspaceLayoutToDockTree(malformed);
  assert.equal(validateDockLayout(repaired).valid, true);
  assert.deepEqual(repaired.panels.map((panel) => panel.kind), ["navigator", "screenplay", "inspector"]);

  const cyclic = structuredClone(layout) as WorkspaceDockLayout;
  if (cyclic.root.kind === "split") cyclic.root.children[0] = cyclic.root;
  assert.equal(validateDockLayout(cyclic).valid, false);
});

test("tabs activate, reorder, and move while keeping one owner", () => {
  let layout = developmentLayout();
  const developmentTabs = dockTreeNodes(layout.root).find((node) => node.id === "development-tabs")!;
  assert.equal(developmentTabs.kind, "tabs");
  layout = activateDockPanel(layout, "breakdown");
  layout = reorderDockTab(layout, "breakdown", 0);
  const tabs = dockTreeNodes(layout.root).find((node) => node.id === "development-tabs")!;
  assert.equal(tabs.kind === "tabs" && tabs.activePanelId, "breakdown");
  assert.equal(tabs.kind === "tabs" && tabs.panelIds[0], "breakdown");
  layout = moveDockPanelToTabs(layout, "breakdown", "main-tabs", 1);
  const owners = dockTreeNodes(layout.root).flatMap((node) => node.kind === "tabs" && node.panelIds.includes("breakdown") ? [node.id] : []);
  assert.deepEqual(owners, ["main-tabs"]);
  assert.equal(validateDockLayout(layout).valid, true);
});

test("panels dock on every edge, float with portable coordinates, hide, and restore", () => {
  let layout = developmentLayout();
  const defaultFloating = floatDockPanel(layout, "story");
  assert.equal(defaultFloating.floatingPanels[0]?.panelId, "story");
  assert.equal(validateDockLayout(defaultFloating).valid, true);
  layout = dockPanel(layout, "story", "main-tabs", "top");
  assert.equal(dockTreeNodes(layout.root).some((node) => node.kind === "split" && node.direction === "vertical"), true);
  layout = floatDockPanel(layout, "story", { x: 2, y: -1, width: 0.5, height: 0.5 });
  assert.deepEqual(layout.floatingPanels.find((panel) => panel.panelId === "story"), { panelId: "story", x: 0.5, y: 0, width: 0.5, height: 0.5 });
  layout = updateFloatingPanelRect(layout, "story", { x: 0.25, y: 0.2, width: 0.6, height: 0.55 });
  assert.deepEqual(layout.floatingPanels.find((panel) => panel.panelId === "story"), { panelId: "story", x: 0.25, y: 0.2, width: 0.6, height: 0.55 });
  layout = hideDockPanel(layout, "story");
  assert.deepEqual(layout.hiddenPanelIds, ["story"]);
  layout = restoreHiddenPanel(layout, "story", "main-tabs");
  assert.equal(layout.hiddenPanelIds.length, 0);
  assert.equal(validateDockLayout(layout).valid, true);
  assert.equal(hideDockPanel(layout, "screenplay"), layout);
});

test("split resizing is keyboard-friendly and preserves totals and minimums", () => {
  const layout = developmentLayout();
  assert.equal(layout.root.kind, "split");
  if (layout.root.kind !== "split") return;
  const resized = resizeDockSplit(layout, layout.root.id, 0, 0.08);
  assert.equal(resized.root.kind, "split");
  if (resized.root.kind !== "split") return;
  assert.ok(Math.abs(resized.root.sizes.reduce((sum, size) => sum + size, 0) - 1) < 0.0001);
  assert.ok(resized.root.sizes[0] >= 0.12);
});

test("saved dock layouts preserve valid nested ratios and normalized floating rectangles", () => {
  const workspace = defaultProjectWorkspace();
  let layout = developmentLayout();
  layout = dockPanel(layout, "story", "main-tabs", "top");
  layout = floatDockPanel(layout, "breakdown", { x: 0.61, y: 0.13, width: 0.31, height: 0.42 });
  const stored = {
    ...workspace,
    layouts: [...workspace.layouts, { ...layout, id: "nested-desk", name: "Nested Desk" }],
  };
  const restored = getWorkspaceDockLayout(JSON.parse(JSON.stringify(stored)), "nested-desk")!;

  assert.equal(restored.layoutVersion, 2);
  assert.equal(restored.root.kind, "split");
  assert.deepEqual(restored.floatingPanels.find((panel) => panel.panelId === "breakdown"), {
    panelId: "breakdown", x: 0.61, y: 0.13, width: 0.31, height: 0.42,
  });
  assert.equal(validateDockLayout(restored).valid, true);

  const prototypeV2 = structuredClone(restored) as WorkspaceDockLayout & Record<string, unknown>;
  delete prototypeV2.navigator;
  delete prototypeV2.inspector;
  delete prototypeV2.reference;
  delete prototypeV2.navigatorWidth;
  delete prototypeV2.inspectorWidth;
  const upgradedPrototype = migrateWorkspaceLayoutToDockTree(prototypeV2);
  assert.equal(upgradedPrototype.panels.some((panel) => panel.kind === "breakdown"), true);
  assert.equal(validateDockLayout(upgradedPrototype).valid, true);
});

test("ratio repair preserves proportions and offscreen restore clamps portable frames", () => {
  const malformedRatios = developmentLayout();
  assert.equal(malformedRatios.root.kind, "split");
  if (malformedRatios.root.kind !== "split") return;
  malformedRatios.root.sizes = malformedRatios.root.sizes.map((size) => size * 3);
  const repairedRatios = migrateWorkspaceLayoutToDockTree(malformedRatios);
  assert.equal(repairedRatios.root.kind, "split");
  if (repairedRatios.root.kind !== "split") return;
  assert.ok(Math.abs(repairedRatios.root.sizes.reduce((sum, size) => sum + size, 0) - 1) < 0.0001);
  assert.ok(Math.abs(repairedRatios.root.sizes[0] / repairedRatios.root.sizes[1]
    - malformedRatios.root.sizes[0] / malformedRatios.root.sizes[1]) < 0.0001);

  let floating = floatDockPanel(developmentLayout(), "story", { x: 0.4, y: 0.4, width: 0.4, height: 0.4 });
  floating = {
    ...floating,
    floatingPanels: floating.floatingPanels.map((panel) => panel.panelId === "story"
      ? { ...panel, x: 0.92, y: -0.4, width: 0.4, height: 0.4 }
      : panel),
  };
  assert.equal(validateDockLayout(floating).valid, false);
  const restored = restoreOffscreenFloatingPanels(floating);
  assert.deepEqual(restored.floatingPanels.find((panel) => panel.panelId === "story"), {
    panelId: "story", x: 0.6, y: 0, width: 0.4, height: 0.4,
  });
  assert.equal(validateDockLayout(restored).valid, true);
});

test("restore all hidden panels is pure and returns ownership to one tab group", () => {
  const original = developmentLayout();
  const hidden = hideDockPanel(hideDockPanel(original, "story"), "breakdown");
  assert.deepEqual(hidden.hiddenPanelIds, ["story", "breakdown"]);
  const restored = restoreAllHiddenPanels(hidden, "main-tabs");
  const owners = dockTreeNodes(restored.root).flatMap((node) => node.kind === "tabs"
    ? node.panelIds.filter((panelId) => panelId === "story" || panelId === "breakdown")
    : []);
  assert.deepEqual(owners.sort(), ["breakdown", "story"]);
  assert.deepEqual(restored.hiddenPanelIds, []);
  assert.deepEqual(original.hiddenPanelIds, []);
  assert.equal(validateDockLayout(restored).valid, true);
});
