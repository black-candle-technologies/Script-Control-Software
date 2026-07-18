import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSession, defaultProjectWorkspace, normalizeProjectSession } from "./projectWorkspace.ts";
import {
  deleteCustomLayout,
  duplicateWorkspaceLayout,
  getWorkspaceLayout,
  keyboardShortcutMatches,
  normalizeKeyboardShortcut,
  normalizeWorkspaceLayout,
  saveCustomLayout,
  setKeyboardShortcut,
  validateKeyboardShortcuts,
  validateWorkspaceLayout,
  type WorkspacePanelDefinition,
  type WorkspaceLayout,
} from "./workspaceLayouts.ts";

test("every existing SavedLayout preset upgrades to a valid panel and tab layout", () => {
  const workspace = defaultProjectWorkspace();
  for (const preset of workspace.layouts) {
    const layout = normalizeWorkspaceLayout(preset);
    assert.equal(validateWorkspaceLayout(layout).valid, true, preset.id);
    assert.ok(layout.panels.some((panel) => panel.kind === "screenplay"));
  }
  const television = normalizeWorkspaceLayout(workspace.layouts.find((layout) => layout.id === "television")!);
  assert.deepEqual(television.synchronizedPanels[0].panelIds, ["screenplay", "reference"]);
});

test("custom layouts save, duplicate, and delete without mutating the workspace or built-ins", () => {
  const original = defaultProjectWorkspace();
  const notes: WorkspacePanelDefinition = { id: "notes", title: "Notes", kind: "treatment", closable: true };
  const custom: WorkspaceLayout = {
    ...normalizeWorkspaceLayout(original.layouts[0]),
    id: "focus-room",
    name: "Focus Room",
    panels: [...normalizeWorkspaceLayout(original.layouts[0]).panels, notes],
    floatingPanels: [{ panelId: "notes", x: 20, y: 30, width: 480, height: 320 }],
    synchronizedPanels: [{ id: "script-inspector", panelIds: ["screenplay", "inspector"], mode: "active-scene" }],
  };

  const saved = saveCustomLayout(original, custom);
  const duplicated = duplicateWorkspaceLayout(saved, "focus-room");
  const deleted = deleteCustomLayout(duplicated, "focus-room");

  assert.equal(original.layouts.some((layout) => layout.id === "focus-room"), false);
  assert.equal(getWorkspaceLayout(saved, "focus-room")?.floatingPanels[0].width, 480);
  assert.equal(duplicated.activeLayoutId, "focus-room-copy");
  assert.equal(deleted.layouts.some((layout) => layout.id === "focus-room"), false);
  assert.equal(deleted.layouts.some((layout) => layout.id === "focus-room-copy"), true);
  assert.throws(() => deleteCustomLayout(deleted, "writer"), /built-in/i);
});

test("layout validation catches broken panel, split, floating, and sync relationships", () => {
  const layout = normalizeWorkspaceLayout(defaultProjectWorkspace().layouts[0]);
  const invalid: WorkspaceLayout = {
    ...layout,
    id: "broken",
    tabGroups: [{ id: "main-tabs", panelIds: ["screenplay", "missing"], activePanelId: "missing-active" }],
    splits: [{ id: "bad-split", direction: "horizontal", groupIds: ["main-tabs", "missing-group"], sizes: [0.9, 0.9] }],
    floatingPanels: [{ panelId: "screenplay", x: 0, y: 0, width: 100, height: 100 }],
    synchronizedPanels: [{ id: "bad-sync", panelIds: ["screenplay", "missing"], mode: "scroll" }],
  };
  const codes = new Set(validateWorkspaceLayout(invalid).errors.map((error) => error.code));
  assert.ok(codes.has("invalid-tab-group"));
  assert.ok(codes.has("missing-panel"));
  assert.ok(codes.has("invalid-split"));
  assert.ok(codes.has("missing-tab-group"));
  assert.ok(codes.has("invalid-floating-panel"));
  assert.ok(codes.has("invalid-sync-group"));
});

test("keyboard shortcuts normalize, detect collisions, update, and clear purely", () => {
  assert.equal(normalizeKeyboardShortcut("Shift + Mod + S"), "mod+shift+s");
  const validation = validateKeyboardShortcuts({ save: "mod+shift+s", snapshot: "SHIFT+MOD+S" });
  assert.deepEqual(validation.collisions, [{ shortcut: "mod+shift+s", actions: ["save", "snapshot"] }]);

  const original = defaultProjectWorkspace();
  const updated = setKeyboardShortcut(original, "print", "Alt + Mod + P");
  const cleared = setKeyboardShortcut(updated, "print", "");
  assert.equal(updated.shortcuts.print, "mod+alt+p");
  assert.equal(original.shortcuts.print, undefined);
  assert.equal(cleared.shortcuts.print, undefined);
  assert.throws(() => setKeyboardShortcut(original, "quickSave", "MOD+S"), /already assigned/i);
  assert.throws(() => normalizeKeyboardShortcut("mod+shift"), /exactly one/i);
  const key = (overrides: Partial<Parameters<typeof keyboardShortcutMatches>[1]> = {}) => ({
    key: "s", ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...overrides,
  });
  assert.equal(keyboardShortcutMatches("mod+s", key({ ctrlKey: true })), true);
  assert.equal(keyboardShortcutMatches("mod+s", key({ metaKey: true })), true);
  assert.equal(keyboardShortcutMatches("mod+shift+s", key({ ctrlKey: true, shiftKey: true })), true);
  assert.equal(keyboardShortcutMatches("mod+s", key({ ctrlKey: true, altKey: true })), false);
  assert.equal(keyboardShortcutMatches("broken+shortcut+value", key()), false);
});

test("custom layouts and shortcuts survive project normalization", () => {
  const session = createProjectSession();
  const custom = {
    ...normalizeWorkspaceLayout(session.workspace.layouts[2]),
    id: "review-desk",
    name: "Review Desk",
    inspector: "floating" as const,
  };
  session.workspace = setKeyboardShortcut(saveCustomLayout(session.workspace, normalizeWorkspaceLayout({
    id: custom.id,
    name: custom.name,
    navigator: custom.navigator,
    inspector: custom.inspector,
    reference: custom.reference,
    navigatorWidth: custom.navigatorWidth,
    inspectorWidth: custom.inspectorWidth,
  })), "toggleInspector", "mod+i");

  const restored = normalizeProjectSession(JSON.parse(JSON.stringify(session)));
  assert.equal(restored.workspace.activeLayoutId, "review-desk");
  assert.equal(getWorkspaceLayout(restored.workspace, "review-desk")?.inspector, "floating");
  assert.equal(restored.workspace.shortcuts.toggleInspector, "mod+i");
});
