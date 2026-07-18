import type { ProjectWorkspace, SavedLayout } from "./projectWorkspace.ts";

export const BUILTIN_LAYOUT_IDS = ["writer", "development", "revision", "television", "production", "companion"] as const;

export type WorkspacePanelKind =
  | "navigator"
  | "screenplay"
  | "inspector"
  | "reference"
  | "story"
  | "treatment"
  | "breakdown"
  | "versions"
  | "series"
  | "production";

export interface WorkspacePanelDefinition {
  id: string;
  title: string;
  kind: WorkspacePanelKind;
  closable: boolean;
}

export interface WorkspaceTabGroup {
  id: string;
  panelIds: string[];
  activePanelId: string;
}

export interface WorkspaceSplitState {
  id: string;
  direction: "horizontal" | "vertical";
  groupIds: string[];
  /** Fractions totaling 1, in the same order as `groupIds`. */
  sizes: number[];
}

export interface FloatingPanelState {
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SynchronizedPanelState {
  id: string;
  panelIds: string[];
  mode: "active-scene" | "selection" | "scroll";
}

export interface WorkspaceLayout extends SavedLayout {
  panels: WorkspacePanelDefinition[];
  tabGroups: WorkspaceTabGroup[];
  splits: WorkspaceSplitState[];
  floatingPanels: FloatingPanelState[];
  synchronizedPanels: SynchronizedPanelState[];
}

export type LayoutValidationCode =
  | "invalid-id"
  | "invalid-name"
  | "invalid-placement"
  | "invalid-width"
  | "duplicate-id"
  | "missing-panel"
  | "unassigned-panel"
  | "invalid-tab-group"
  | "invalid-split"
  | "missing-tab-group"
  | "invalid-floating-panel"
  | "invalid-sync-group";

export interface LayoutValidationError {
  code: LayoutValidationCode;
  path: string;
  message: string;
}

export interface LayoutValidationResult {
  valid: boolean;
  errors: LayoutValidationError[];
}

export interface ShortcutCollision {
  shortcut: string;
  actions: string[];
}

export interface ShortcutValidationResult {
  valid: boolean;
  invalid: { action: string; shortcut: string; message: string }[];
  collisions: ShortcutCollision[];
}

const builtinIds = new Set<string>(BUILTIN_LAYOUT_IDS);
const panel = (id: string, title: string, kind: WorkspacePanelKind, closable = true): WorkspacePanelDefinition => ({ id, title, kind, closable });

function legacyLayoutState(layout: SavedLayout): Pick<WorkspaceLayout, "panels" | "tabGroups" | "splits" | "floatingPanels" | "synchronizedPanels"> {
  const panels = [panel("screenplay", "Screenplay", "screenplay", false)];
  const tabGroups: WorkspaceTabGroup[] = [{ id: "main-tabs", panelIds: ["screenplay"], activePanelId: "screenplay" }];
  const floatingPanels: FloatingPanelState[] = [];
  if (layout.reference !== "none") {
    panels.push(panel("reference", layout.reference === "previous-episode" ? "Previous Episode" : "Previous Draft", "reference"));
    tabGroups.push({ id: "reference-tabs", panelIds: ["reference"], activePanelId: "reference" });
  }
  if (layout.navigator !== "hidden") {
    panels.push(panel("navigator", "Navigator", "navigator", false));
    const group = { id: "navigator-tabs", panelIds: ["navigator"], activePanelId: "navigator" };
    layout.navigator === "left" ? tabGroups.unshift(group) : tabGroups.push(group);
  }
  if (layout.inspector !== "hidden") {
    panels.push(panel("inspector", "Inspector", "inspector", false));
    if (layout.inspector === "floating") floatingPanels.push({ panelId: "inspector", x: 80, y: 80, width: layout.inspectorWidth, height: 640 });
    else {
      const group = { id: "inspector-tabs", panelIds: ["inspector"], activePanelId: "inspector" };
      layout.inspector === "left" ? tabGroups.unshift(group) : tabGroups.push(group);
    }
  }
  const splits = tabGroups.length > 1 ? [{ id: "main-split", direction: "horizontal" as const, groupIds: tabGroups.map((group) => group.id), sizes: tabGroups.map(() => 1 / tabGroups.length) }] : [];
  const synchronizedPanels = layout.reference === "none" ? [] : [{ id: "script-reference", panelIds: ["screenplay", "reference"], mode: "active-scene" as const }];
  return { panels, tabGroups, splits, floatingPanels, synchronizedPanels };
}

/** Upgrade a legacy preset without changing its existing SavedLayout fields. */
export function normalizeWorkspaceLayout(layout: SavedLayout | WorkspaceLayout): WorkspaceLayout {
  const fallback = legacyLayoutState(layout);
  const extended = layout as Partial<WorkspaceLayout>;
  return {
    ...layout,
    panels: Array.isArray(extended.panels) ? extended.panels.map((item) => ({ ...item })) : fallback.panels,
    tabGroups: Array.isArray(extended.tabGroups) ? extended.tabGroups.map((item) => ({ ...item, panelIds: [...item.panelIds] })) : fallback.tabGroups,
    splits: Array.isArray(extended.splits) ? extended.splits.map((item) => ({ ...item, groupIds: [...item.groupIds], sizes: [...item.sizes] })) : fallback.splits,
    floatingPanels: Array.isArray(extended.floatingPanels) ? extended.floatingPanels.map((item) => ({ ...item })) : fallback.floatingPanels,
    synchronizedPanels: Array.isArray(extended.synchronizedPanels) ? extended.synchronizedPanels.map((item) => ({ ...item, panelIds: [...item.panelIds] })) : fallback.synchronizedPanels,
  };
}

export function validateWorkspaceLayout(input: SavedLayout | WorkspaceLayout): LayoutValidationResult {
  const layout = normalizeWorkspaceLayout(input);
  const errors: LayoutValidationError[] = [];
  const add = (code: LayoutValidationCode, path: string, message: string) => errors.push({ code, path, message });
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(layout.id)) add("invalid-id", "id", "Layout id must contain only letters, numbers, underscores, or hyphens.");
  if (!layout.name.trim()) add("invalid-name", "name", "Layout name is required.");
  if (!["left", "right", "hidden"].includes(layout.navigator) || !["left", "right", "floating", "hidden"].includes(layout.inspector) || !["none", "previous-episode", "previous-draft"].includes(layout.reference)) add("invalid-placement", "placement", "A panel placement is invalid.");
  if (![layout.navigatorWidth, layout.inspectorWidth].every((width) => Number.isFinite(width) && width >= 160 && width <= 1200)) add("invalid-width", "width", "Panel widths must be between 160 and 1200 pixels.");

  const panelIds = new Set<string>();
  layout.panels.forEach((item, index) => {
    if (panelIds.has(item.id)) add("duplicate-id", `panels.${index}.id`, `Panel id ${item.id} is duplicated.`);
    panelIds.add(item.id);
    if (!item.id || !item.title.trim()) add("invalid-name", `panels.${index}`, "Panels need an id and title.");
  });
  const groupIds = new Set<string>();
  const groupedPanels = new Set<string>();
  layout.tabGroups.forEach((group, index) => {
    if (groupIds.has(group.id)) add("duplicate-id", `tabGroups.${index}.id`, `Tab-group id ${group.id} is duplicated.`);
    groupIds.add(group.id);
    if (!group.panelIds.length || !group.panelIds.includes(group.activePanelId) || new Set(group.panelIds).size !== group.panelIds.length) add("invalid-tab-group", `tabGroups.${index}`, "A tab group needs unique panels and an active panel it contains.");
    group.panelIds.forEach((id) => {
      if (!panelIds.has(id)) add("missing-panel", `tabGroups.${index}.panelIds`, `Tab group references missing panel ${id}.`);
      if (groupedPanels.has(id)) add("invalid-tab-group", `tabGroups.${index}.panelIds`, `Panel ${id} belongs to more than one tab group.`);
      groupedPanels.add(id);
    });
  });
  const floatingPanels = new Set<string>();
  layout.floatingPanels.forEach((floating, index) => {
    if (floatingPanels.has(floating.panelId) || groupedPanels.has(floating.panelId) || !panelIds.has(floating.panelId) || ![floating.x, floating.y, floating.width, floating.height].every(Number.isFinite) || floating.width < 200 || floating.height < 120) add("invalid-floating-panel", `floatingPanels.${index}`, "A floating panel must exist once, remain undocked, and have a usable frame.");
    floatingPanels.add(floating.panelId);
  });
  panelIds.forEach((id) => {
    if (!groupedPanels.has(id) && !floatingPanels.has(id)) add("unassigned-panel", `panels.${id}`, `Panel ${id} is neither docked nor floating.`);
  });

  const splitIds = new Set<string>();
  const splitGroups = new Set<string>();
  layout.splits.forEach((split, index) => {
    if (splitIds.has(split.id)) add("duplicate-id", `splits.${index}.id`, `Split id ${split.id} is duplicated.`);
    splitIds.add(split.id);
    const total = split.sizes.reduce((sum, size) => sum + size, 0);
    if (split.groupIds.length < 2 || split.groupIds.length !== split.sizes.length || new Set(split.groupIds).size !== split.groupIds.length || split.sizes.some((size) => !Number.isFinite(size) || size <= 0) || Math.abs(total - 1) > 0.001) add("invalid-split", `splits.${index}`, "A split needs unique groups and positive sizes totaling 1.");
    split.groupIds.forEach((id) => {
      if (!groupIds.has(id)) add("missing-tab-group", `splits.${index}.groupIds`, `Split references missing tab group ${id}.`);
      if (splitGroups.has(id)) add("invalid-split", `splits.${index}.groupIds`, `Tab group ${id} belongs to more than one split.`);
      splitGroups.add(id);
    });
  });
  if (layout.tabGroups.length > 1) layout.tabGroups.forEach((group) => {
    if (!splitGroups.has(group.id)) add("invalid-split", `tabGroups.${group.id}`, `Tab group ${group.id} is not assigned to a split.`);
  });

  const syncIds = new Set<string>();
  layout.synchronizedPanels.forEach((sync, index) => {
    const uniquePanels = new Set(sync.panelIds);
    if (syncIds.has(sync.id) || uniquePanels.size < 2 || uniquePanels.size !== sync.panelIds.length || sync.panelIds.some((id) => !panelIds.has(id)) || !["active-scene", "selection", "scroll"].includes(sync.mode)) add("invalid-sync-group", `synchronizedPanels.${index}`, "A sync group needs a unique id and at least two existing panels.");
    syncIds.add(sync.id);
  });
  return { valid: errors.length === 0, errors };
}

function checked(layout: SavedLayout | WorkspaceLayout): WorkspaceLayout {
  const normalized = normalizeWorkspaceLayout(layout);
  const validation = validateWorkspaceLayout(normalized);
  if (!validation.valid) throw new Error(validation.errors.map((error) => error.message).join(" "));
  return normalized;
}

export function getWorkspaceLayout(workspace: ProjectWorkspace, id: string): WorkspaceLayout | undefined {
  const layout = workspace.layouts.find((item) => item.id === id);
  return layout ? normalizeWorkspaceLayout(layout as WorkspaceLayout) : undefined;
}

export function saveCustomLayout(workspace: ProjectWorkspace, layout: WorkspaceLayout): ProjectWorkspace {
  if (builtinIds.has(layout.id)) throw new Error(`Layout id ${layout.id} is reserved for a built-in preset.`);
  const saved = checked(layout);
  const exists = workspace.layouts.some((item) => item.id === saved.id);
  return { ...workspace, layouts: exists ? workspace.layouts.map((item) => item.id === saved.id ? saved : item) : [...workspace.layouts, saved], activeLayoutId: saved.id };
}

export function deleteCustomLayout(workspace: ProjectWorkspace, id: string): ProjectWorkspace {
  if (builtinIds.has(id)) throw new Error("Built-in layouts cannot be deleted.");
  if (!workspace.layouts.some((layout) => layout.id === id)) return workspace;
  return { ...workspace, layouts: workspace.layouts.filter((layout) => layout.id !== id), activeLayoutId: workspace.activeLayoutId === id ? "writer" : workspace.activeLayoutId };
}

export function duplicateWorkspaceLayout(workspace: ProjectWorkspace, sourceId: string): ProjectWorkspace {
  const source = getWorkspaceLayout(workspace, sourceId);
  if (!source) throw new Error(`Layout ${sourceId} does not exist.`);
  const base = `${source.id}-copy`;
  let id = base;
  for (let copy = 2; workspace.layouts.some((layout) => layout.id === id); copy++) id = `${base}-${copy}`;
  return saveCustomLayout(workspace, { ...source, id, name: `${source.name} Copy` });
}

const modifierOrder = ["mod", "ctrl", "alt", "shift", "meta"] as const;
const modifierAliases: Record<string, (typeof modifierOrder)[number]> = { command: "meta", cmd: "meta", control: "ctrl", option: "alt" };
const namedKeys = new Set(["enter", "escape", "space", "tab", "backspace", "delete", "home", "end", "pageup", "pagedown", "arrowup", "arrowdown", "arrowleft", "arrowright"]);

export function normalizeKeyboardShortcut(shortcut: string): string {
  const parts = shortcut.toLowerCase().split("+").map((part) => modifierAliases[part.trim()] ?? part.trim()).filter(Boolean);
  const modifiers = new Set(parts.filter((part): part is (typeof modifierOrder)[number] => modifierOrder.includes(part as (typeof modifierOrder)[number])));
  const keys = parts.filter((part) => !modifiers.has(part as (typeof modifierOrder)[number]));
  if (keys.length !== 1 || !(keys[0].length === 1 || namedKeys.has(keys[0]) || /^f(?:[1-9]|1\d|2[0-4])$/.test(keys[0]))) throw new Error("A shortcut needs exactly one letter, number, function key, or named key.");
  return [...modifierOrder.filter((modifier) => modifiers.has(modifier)), keys[0]].join("+");
}

export function validateKeyboardShortcuts(shortcuts: Record<string, string>): ShortcutValidationResult {
  const invalid: ShortcutValidationResult["invalid"] = [];
  const actionsByShortcut = new Map<string, string[]>();
  for (const [action, shortcut] of Object.entries(shortcuts)) {
    if (!shortcut.trim()) continue;
    try {
      const normalized = normalizeKeyboardShortcut(shortcut);
      actionsByShortcut.set(normalized, [...(actionsByShortcut.get(normalized) ?? []), action]);
    } catch (error) {
      invalid.push({ action, shortcut, message: error instanceof Error ? error.message : "Shortcut is invalid." });
    }
  }
  const collisions = [...actionsByShortcut].filter(([, actions]) => actions.length > 1).map(([shortcut, actions]) => ({ shortcut, actions: actions.sort() }));
  return { valid: invalid.length === 0 && collisions.length === 0, invalid, collisions };
}

export function setKeyboardShortcut(workspace: ProjectWorkspace, action: string, shortcut: string): ProjectWorkspace {
  if (!action.trim()) throw new Error("Shortcut action is required.");
  const shortcuts = { ...workspace.shortcuts };
  if (!shortcut.trim()) delete shortcuts[action];
  else shortcuts[action] = normalizeKeyboardShortcut(shortcut);
  const validation = validateKeyboardShortcuts(shortcuts);
  if (!validation.valid) throw new Error(validation.collisions[0] ? `${validation.collisions[0].shortcut} is already assigned to ${validation.collisions[0].actions.join(" and ")}.` : validation.invalid[0].message);
  return { ...workspace, shortcuts };
}

export interface KeyboardShortcutEvent {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
}

/** Match a normalized cross-platform shortcut without depending on the browser. */
export function keyboardShortcutMatches(shortcut: string, event: KeyboardShortcutEvent): boolean {
  let normalized: string;
  try {
    normalized = normalizeKeyboardShortcut(shortcut);
  } catch {
    return false;
  }
  const parts = new Set(normalized.split("+"));
  const needsMod = parts.has("mod");
  const ctrlMatches = parts.has("ctrl") ? event.ctrlKey : needsMod || !event.ctrlKey;
  const metaMatches = parts.has("meta") ? event.metaKey : needsMod || !event.metaKey;
  const modMatches = !needsMod || event.ctrlKey !== event.metaKey;
  const key = [...parts].find((part) => !modifierOrder.includes(part as (typeof modifierOrder)[number]));
  return Boolean(key)
    && event.key.toLowerCase() === key
    && ctrlMatches
    && metaMatches
    && modMatches
    && event.altKey === parts.has("alt")
    && event.shiftKey === parts.has("shift");
}
