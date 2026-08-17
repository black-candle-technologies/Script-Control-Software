import assert from "node:assert/strict";
import test from "node:test";
import { createProjectSession, defaultProjectWorkspace, normalizeProjectSession } from "./projectWorkspace.ts";
import {
  activateWorkspaceLayout,
  deleteCustomLayout,
  duplicateWorkspaceLayout,
  getWorkspaceLayout,
  getWorkspaceLayoutShortcut,
  keyboardShortcutMatches,
  normalizeKeyboardShortcut,
  normalizeWorkspaceLayout,
  renameCustomLayout,
  resetCustomLayoutToBuiltIn,
  resetWorkspaceLayout,
  resizeWorkspaceSplit,
  saveCustomLayout,
  setKeyboardShortcut,
  setWorkspaceLayoutShortcut,
  validateKeyboardShortcuts,
  validateWorkspaceLayout,
  type WorkspacePanelDefinition,
  type WorkspaceLayout,
  uniqueWorkspaceLayoutId,
} from "./workspaceLayouts.ts";
import {
  dockPanel,
  getWorkspaceDockLayout,
  isWorkspaceDockLayout,
  migrateWorkspaceLayoutToDockTree,
  validateDockLayout,
} from "./dockTree.ts";

test("every existing SavedLayout preset upgrades to a valid panel and tab layout", () => {
  const workspace = defaultProjectWorkspace();
  for (const preset of workspace.layouts) {
    const layout = normalizeWorkspaceLayout(preset);
    assert.equal(validateWorkspaceLayout(layout).valid, true, preset.id);
    assert.ok(layout.panels.some((panel) => panel.kind === (preset.id === "companion" ? "companion" : "screenplay")));
  }
  const television = normalizeWorkspaceLayout(workspace.layouts.find((layout) => layout.id === "television")!);
  assert.deepEqual(television.synchronizedPanels[0].panelIds, ["screenplay", "reference"]);
  assert.deepEqual(television.panels.filter((panel) => ["screenplay", "reference", "series"].includes(panel.kind)).map((panel) => panel.kind), ["screenplay", "reference", "series"]);
  assert.deepEqual(normalizeWorkspaceLayout(workspace.layouts.find((layout) => layout.id === "development")!).tabGroups.find((group) => group.id === "development-tabs")?.panelIds, ["story", "treatment", "breakdown"]);
  assert.deepEqual(normalizeWorkspaceLayout(workspace.layouts.find((layout) => layout.id === "revision")!).panels.find((panel) => panel.kind === "reference")?.referenceKind, "previous-draft");
  assert.deepEqual(normalizeWorkspaceLayout(workspace.layouts.find((layout) => layout.id === "production")!).tabGroups.find((group) => group.id === "production-tabs")?.panelIds, ["breakdown", "production"]);
  const companionCopy = duplicateWorkspaceLayout(workspace, "companion");
  assert.equal(getWorkspaceLayout(companionCopy, "companion-copy")?.panels[0].kind, "companion");
});

test("split resizing keeps the total stable and enforces adjacent panel minimums", () => {
  const split = normalizeWorkspaceLayout(defaultProjectWorkspace().layouts[0]).splits[0];
  const resized = resizeWorkspaceSplit(split, 0, 0.1, 0.12);
  assert.equal(resized.sizes.reduce((sum, size) => sum + size, 0), 1);
  assert.equal(resized.sizes[0], split.sizes[0] + 0.1);
  assert.equal(resizeWorkspaceSplit(split, 0, -1, 0.12).sizes[0], 0.12);

  const session = createProjectSession();
  const writer = normalizeWorkspaceLayout(session.workspace.layouts[0]);
  session.workspace.layouts[0] = { ...writer, splits: [{ ...writer.splits[0], sizes: [0.2, 0.5, 0.3] }] };
  assert.deepEqual(normalizeProjectSession(JSON.parse(JSON.stringify(session))).workspace.layouts[0].splits[0].sizes, [0.2, 0.5, 0.3]);
});

test("reference panels persist independent sources and targets while legacy layouts still upgrade", () => {
  const legacy = normalizeWorkspaceLayout({
    ...defaultProjectWorkspace().layouts[0],
    id: "legacy-next",
    reference: "next-episode",
  });
  assert.equal(legacy.panels.find((panel) => panel.kind === "reference")?.referenceKind, "next-episode");

  const first: WorkspacePanelDefinition = { id: "character-ref", title: "Lead", kind: "reference", closable: true, referenceKind: "character", targetId: "maya" };
  const second: WorkspacePanelDefinition = { id: "timeline-ref", title: "Timeline", kind: "reference", closable: true, referenceKind: "timeline" };
  const custom = normalizeWorkspaceLayout({
    ...defaultProjectWorkspace().layouts[0],
    id: "reference-wall",
    name: "Reference Wall",
    reference: "character",
    panels: [first, second],
    tabGroups: [{ id: "reference-tabs", panelIds: [first.id, second.id], activePanelId: second.id }],
    splits: [],
    floatingPanels: [],
    synchronizedPanels: [],
  });
  const saved = getWorkspaceLayout(saveCustomLayout(defaultProjectWorkspace(), custom), custom.id)!;
  assert.deepEqual(saved.panels.map(({ referenceKind, targetId }) => ({ referenceKind, targetId })), [
    { referenceKind: "character", targetId: "maya" },
    { referenceKind: "timeline", targetId: undefined },
  ]);
  assert.equal(validateWorkspaceLayout(saved).valid, true);
});

test("malformed persisted topology falls back safely and semantic invalidity is rejected", () => {
  const workspace = defaultProjectWorkspace();
  const malformed = {
    ...workspace.layouts[0],
    id: "hostile-layout",
    panels: [null],
    tabGroups: [{}],
    splits: [],
    floatingPanels: [],
    synchronizedPanels: [],
  } as unknown as WorkspaceLayout;
  const repaired = normalizeWorkspaceLayout(malformed);
  assert.equal(validateWorkspaceLayout(repaired).valid, true);
  assert.ok(repaired.panels.some((panel) => panel.kind === "screenplay"));
  assert.equal(getWorkspaceLayout({ ...workspace, layouts: [malformed] }, malformed.id)?.panels[0].kind, "screenplay");

  const invalid = { ...repaired, panels: repaired.panels.map((panel, index) => index ? panel : { ...panel, kind: "alien-panel" }) } as unknown as WorkspaceLayout;
  assert.equal(getWorkspaceLayout({ ...workspace, layouts: [invalid] }, invalid.id), undefined);
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
  assert.equal(uniqueWorkspaceLayoutId(saved, "Focus Room"), "focus-room-2");
  assert.equal(uniqueWorkspaceLayoutId(saved, "Writer"), "writer-2");
  const duplicated = duplicateWorkspaceLayout(saved, "focus-room");
  const deleted = deleteCustomLayout(duplicated, "focus-room");

  assert.equal(original.layouts.some((layout) => layout.id === "focus-room"), false);
  assert.equal(getWorkspaceLayout(saved, "focus-room")?.floatingPanels[0].width, 480);
  assert.equal(duplicated.activeLayoutId, original.activeLayoutId);
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
  const custom: WorkspaceLayout = {
    ...normalizeWorkspaceLayout(session.workspace.layouts[2]),
    id: "review-desk",
    name: "Review Desk",
    inspector: "floating" as const,
    panels: [
      ...normalizeWorkspaceLayout(session.workspace.layouts[2]).panels,
      { id: "lead-reference", title: "Lead", kind: "reference", closable: true, referenceKind: "character", targetId: "lead" },
    ],
    tabGroups: [
      ...normalizeWorkspaceLayout(session.workspace.layouts[2]).tabGroups,
      { id: "lead-tabs", panelIds: ["lead-reference"], activePanelId: "lead-reference" },
    ],
  };
  custom.splits = [{ id: "review-split", direction: "vertical", groupIds: custom.tabGroups.map((group) => group.id), sizes: custom.tabGroups.map(() => 1 / custom.tabGroups.length) }];
  session.workspace = activateWorkspaceLayout(
    setKeyboardShortcut(saveCustomLayout(session.workspace, custom), "toggleInspector", "mod+i"),
    custom.id,
  );

  const restored = normalizeProjectSession(JSON.parse(JSON.stringify(session)));
  assert.equal(restored.workspace.activeLayoutId, "review-desk");
  assert.equal(getWorkspaceLayout(restored.workspace, "review-desk")?.inspector, "floating");
  assert.equal(getWorkspaceLayout(restored.workspace, "review-desk")?.panels.find((panel) => panel.id === "lead-reference")?.targetId, "lead");
  assert.equal(getWorkspaceLayout(restored.workspace, "review-desk")?.splits[0].direction, "vertical");
  assert.equal(restored.workspace.shortcuts.toggleInspector, "mod+i");
});

test("custom saves persist a versioned tree while legacy flat callers retain a projection", () => {
  const workspace = defaultProjectWorkspace();
  const flat = {
    ...normalizeWorkspaceLayout(workspace.layouts.find((layout) => layout.id === "development")!),
    id: "portable-development",
    name: "Portable Development",
  };
  const saved = saveCustomLayout(workspace, flat);
  const persisted = saved.layouts.find((layout) => layout.id === flat.id)!;
  const dock = getWorkspaceDockLayout(saved, flat.id)!;

  assert.equal(isWorkspaceDockLayout(persisted), true);
  assert.equal(dock.layoutVersion, 2);
  assert.equal(validateDockLayout(dock).valid, true);
  assert.deepEqual(getWorkspaceLayout(saved, flat.id)?.tabGroups.map((group) => group.id), flat.tabGroups.map((group) => group.id));
});

test("duplicate and rename preserve nested custom topology while built-ins remain protected", () => {
  const workspace = defaultProjectWorkspace();
  const development = migrateWorkspaceLayoutToDockTree(normalizeWorkspaceLayout(workspace.layouts.find((layout) => layout.id === "development")!));
  const nested = dockPanel({ ...development, id: "nested-room", name: "Nested Room" }, "story", "main-tabs", "top");
  const saved = saveCustomLayout(workspace, nested);
  const duplicated = duplicateWorkspaceLayout(saved, nested.id);
  const renamed = renameCustomLayout(duplicated, "nested-room-copy", "Second Room");
  const source = getWorkspaceDockLayout(renamed, nested.id)!;
  const copy = getWorkspaceDockLayout(renamed, "nested-room-copy")!;

  assert.deepEqual(copy.root, source.root);
  assert.equal(copy.name, "Second Room");
  assert.throws(() => renameCustomLayout(renamed, "writer", "Changed"), /built-in/i);
  assert.throws(() => saveCustomLayout(renamed, { ...source, id: "writer" }), /reserved/i);
  assert.throws(() => deleteCustomLayout(renamed, "development"), /built-in/i);
});

test("layout reset and layout-specific shortcuts are pure and clean up on deletion", () => {
  const original = defaultProjectWorkspace();
  const custom = {
    ...normalizeWorkspaceLayout(original.layouts[0]),
    id: "shortcut-room",
    name: "Shortcut Room",
  };
  const saved = saveCustomLayout(original, custom);
  const assigned = setWorkspaceLayoutShortcut(saved, custom.id, "mod+alt+1");
  const activated = activateWorkspaceLayout(resetWorkspaceLayout(assigned), custom.id);
  const reset = resetWorkspaceLayout(assigned, "development");
  const resetCustom = resetCustomLayoutToBuiltIn(assigned, custom.id, "production");
  const deleted = deleteCustomLayout(assigned, custom.id);

  assert.equal(getWorkspaceLayoutShortcut(assigned, custom.id), "mod+alt+1");
  assert.equal(activated.activeLayoutId, custom.id);
  assert.equal(reset.activeLayoutId, "development");
  assert.deepEqual(getWorkspaceDockLayout(resetCustom, custom.id)?.panels.map((panel) => panel.kind),
    getWorkspaceDockLayout(resetCustom, "production")?.panels.map((panel) => panel.kind));
  assert.equal(getWorkspaceLayoutShortcut(resetCustom, custom.id), "mod+alt+1");
  assert.equal(getWorkspaceLayoutShortcut(deleted, custom.id), "");
  assert.equal(original.activeLayoutId, "writer");
  assert.throws(() => setWorkspaceLayoutShortcut(saved, "missing", "mod+1"), /does not exist/i);
  assert.throws(() => activateWorkspaceLayout(saved, "missing"), /does not exist/i);
});

test("legacy custom layouts migrate and hostile saved trees recover during project normalization", () => {
  const session = createProjectSession();
  const legacy = {
    ...normalizeWorkspaceLayout(session.workspace.layouts[0]),
    id: "legacy-custom",
    name: "Legacy Custom",
  };
  session.workspace.layouts.push(legacy);
  session.workspace.activeLayoutId = legacy.id;
  session.workspace.shortcuts[`layout:${legacy.id}`] = "mod+alt+9";
  session.workspace.shortcuts["layout:missing"] = "mod+alt+8";
  session.workspace.shortcuts.invalid = "mod+only+broken";
  const migrated = normalizeProjectSession(JSON.parse(JSON.stringify(session)));
  assert.equal(isWorkspaceDockLayout(migrated.workspace.layouts.find((layout) => layout.id === legacy.id)), true);
  assert.equal(getWorkspaceLayoutShortcut(migrated.workspace, legacy.id), "mod+alt+9");
  assert.equal(migrated.workspace.shortcuts["layout:missing"], undefined);
  assert.equal(migrated.workspace.shortcuts.invalid, undefined);

  const hostile = structuredClone(getWorkspaceDockLayout(migrated.workspace, legacy.id)!);
  hostile.id = "hostile-tree";
  hostile.name = "Hostile Tree";
  if (hostile.root.kind === "split") {
    const firstTabs = hostile.root.children.find((node) => node.kind === "tabs");
    if (firstTabs?.kind === "tabs") hostile.root.children.push({ ...firstTabs, id: "duplicate-owner" });
    hostile.root.sizes = hostile.root.children.map(() => 1 / hostile.root.children.length);
  }
  migrated.workspace.layouts.push(hostile);
  const repaired = normalizeProjectSession(JSON.parse(JSON.stringify(migrated)));
  const recovered = getWorkspaceDockLayout(repaired.workspace, hostile.id)!;
  assert.deepEqual(recovered.panels.map((panel) => panel.kind), ["navigator", "screenplay", "inspector"]);
  assert.equal(validateDockLayout(recovered).valid, true);
});
