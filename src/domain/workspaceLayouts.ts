import type { ProjectWorkspace, SavedLayout, WorkspaceReferenceKind } from "./projectWorkspace.ts";
import {
  isWorkspaceDockLayout,
  migrateWorkspaceLayoutToDockTree,
  validateDockLayout,
  workspaceDockLayoutToWorkspaceLayout,
  type WorkspaceDockLayout,
} from "./dockTree.ts";

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
  | "production"
  | "companion";

export interface WorkspacePanelDefinition {
  id: string;
  title: string;
  kind: WorkspacePanelKind;
  closable: boolean;
  referenceKind?: WorkspaceReferenceKind;
  targetId?: string;
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
  /** Version-2 dock layouts use this only in their flat compatibility projection. */
  hiddenPanelIds?: string[];
}

export type AnyWorkspaceLayout = WorkspaceLayout | WorkspaceDockLayout;

export type LayoutValidationCode =
  | "invalid-id"
  | "invalid-name"
  | "invalid-placement"
  | "invalid-width"
  | "invalid-panel"
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
export const WORKSPACE_REFERENCE_KINDS: readonly WorkspaceReferenceKind[] = [
  "none",
  "previous-episode",
  "next-episode",
  "previous-draft",
  "character",
  "object",
  "location",
  "show-bible",
  "season-arc",
  "plot-history",
  "timeline",
];
const referenceKinds = new Set<WorkspaceReferenceKind>(WORKSPACE_REFERENCE_KINDS);
const panelKinds = new Set<WorkspacePanelKind>(["navigator", "screenplay", "inspector", "reference", "story", "treatment", "breakdown", "versions", "series", "production", "companion"]);
const panel = (id: string, title: string, kind: WorkspacePanelKind, closable = true, referenceKind?: WorkspaceReferenceKind): WorkspacePanelDefinition => ({ id, title, kind, closable, ...(referenceKind ? { referenceKind } : {}) });
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const numberArray = (value: unknown): value is number[] => Array.isArray(value) && value.every((item) => typeof item === "number");

function layoutFields(value: unknown): SavedLayout {
  const input = isRecord(value) ? value : {};
  return {
    id: typeof input.id === "string" ? input.id : "",
    name: typeof input.name === "string" ? input.name : "",
    navigator: typeof input.navigator === "string" ? input.navigator as SavedLayout["navigator"] : "invalid" as SavedLayout["navigator"],
    inspector: typeof input.inspector === "string" ? input.inspector as SavedLayout["inspector"] : "invalid" as SavedLayout["inspector"],
    reference: typeof input.reference === "string" ? input.reference as WorkspaceReferenceKind : "invalid" as WorkspaceReferenceKind,
    navigatorWidth: typeof input.navigatorWidth === "number" ? input.navigatorWidth : Number.NaN,
    inspectorWidth: typeof input.inspectorWidth === "number" ? input.inspectorWidth : Number.NaN,
  };
}

function hasTopologyShape(value: unknown): value is WorkspaceLayout {
  if (!isRecord(value)) return false;
  return Array.isArray(value.panels) && value.panels.every((item) => isRecord(item)
      && typeof item.id === "string" && typeof item.title === "string" && typeof item.kind === "string" && typeof item.closable === "boolean"
      && (item.referenceKind === undefined || typeof item.referenceKind === "string") && (item.targetId === undefined || typeof item.targetId === "string"))
    && Array.isArray(value.tabGroups) && value.tabGroups.every((item) => isRecord(item) && typeof item.id === "string" && stringArray(item.panelIds) && typeof item.activePanelId === "string")
    && Array.isArray(value.splits) && value.splits.every((item) => isRecord(item) && typeof item.id === "string" && typeof item.direction === "string" && stringArray(item.groupIds) && numberArray(item.sizes))
    && Array.isArray(value.floatingPanels) && value.floatingPanels.every((item) => isRecord(item) && typeof item.panelId === "string" && [item.x, item.y, item.width, item.height].every((number) => typeof number === "number"))
    && Array.isArray(value.synchronizedPanels) && value.synchronizedPanels.every((item) => isRecord(item) && typeof item.id === "string" && stringArray(item.panelIds) && typeof item.mode === "string");
}

function referenceTitle(kind: WorkspaceReferenceKind): string {
  return kind.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function legacyLayoutState(layout: SavedLayout): Pick<WorkspaceLayout, "panels" | "tabGroups" | "splits" | "floatingPanels" | "synchronizedPanels"> {
  const primaryPanel = layout.id === "companion"
    ? panel("companion", "Companion dashboard", "companion", false)
    : panel("screenplay", "Screenplay", "screenplay", false);
  const panels = [primaryPanel];
  const tabGroups: WorkspaceTabGroup[] = [{ id: "main-tabs", panelIds: [primaryPanel.id], activePanelId: primaryPanel.id }];
  const floatingPanels: FloatingPanelState[] = [];
  if (layout.reference !== "none") {
    panels.push(panel("reference", referenceTitle(layout.reference), "reference", true, layout.reference));
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
  const addTabs = (id: string, definitions: WorkspacePanelDefinition[]) => {
    panels.push(...definitions);
    tabGroups.push({ id, panelIds: definitions.map((item) => item.id), activePanelId: definitions[0].id });
  };
  if (layout.id === "development") addTabs("development-tabs", [panel("story", "Story", "story"), panel("treatment", "Treatment", "treatment"), panel("breakdown", "Breakdown", "breakdown")]);
  if (layout.id === "revision") addTabs("versions-tabs", [panel("versions", "Versions", "versions")]);
  if (layout.id === "television") addTabs("series-tabs", [panel("series", "Series", "series")]);
  if (layout.id === "production") addTabs("production-tabs", [panel("breakdown", "Breakdown", "breakdown"), panel("production", "Production", "production")]);
  const weights = tabGroups.map((group) => {
    const kind = panels.find((item) => item.id === group.panelIds[0])?.kind;
    if (kind === "navigator") return layout.navigatorWidth;
    if (kind === "inspector") return layout.inspectorWidth;
    if (kind === "screenplay" || kind === "companion") return 720;
    return 360;
  });
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  const splits = tabGroups.length > 1 ? [{ id: "main-split", direction: "horizontal" as const, groupIds: tabGroups.map((group) => group.id), sizes: weights.map((weight) => weight / weightTotal) }] : [];
  const synchronizedPanels = layout.reference === "none" ? [] : [{ id: "script-reference", panelIds: [primaryPanel.id, "reference"], mode: "active-scene" as const }];
  return { panels, tabGroups, splits, floatingPanels, synchronizedPanels };
}

/** Upgrade a legacy preset without changing its existing SavedLayout fields. */
export function normalizeWorkspaceLayout(layout: SavedLayout | AnyWorkspaceLayout): WorkspaceLayout {
  if (isWorkspaceDockLayout(layout)) return workspaceDockLayoutToWorkspaceLayout(layout);
  const fields = layoutFields(layout);
  const fallback = legacyLayoutState(fields);
  if (!hasTopologyShape(layout)) return { ...fields, ...fallback };
  return {
    ...fields,
    panels: layout.panels.map((item) => ({
      ...item,
      ...(item.kind === "reference" ? {
        referenceKind: item.referenceKind
          ?? (fields.reference !== "none" && referenceKinds.has(fields.reference) ? fields.reference : "previous-draft"),
        ...(typeof item.targetId === "string" && item.targetId.trim() ? { targetId: item.targetId.trim() } : {}),
      } : {}),
    })),
    tabGroups: layout.tabGroups.map((item) => ({ ...item, panelIds: [...item.panelIds] })),
    splits: layout.splits.map((item) => ({ ...item, groupIds: [...item.groupIds], sizes: [...item.sizes] })),
    floatingPanels: layout.floatingPanels.map((item) => ({ ...item })),
    synchronizedPanels: layout.synchronizedPanels.map((item) => ({ ...item, panelIds: [...item.panelIds] })),
    ...(stringArray(layout.hiddenPanelIds) ? { hiddenPanelIds: [...layout.hiddenPanelIds] } : {}),
  };
}

export function resizeWorkspaceSplit(split: WorkspaceSplitState, dividerIndex: number, delta: number, minimum = 0): WorkspaceSplitState {
  if (dividerIndex < 0 || dividerIndex >= split.sizes.length - 1 || !Number.isFinite(delta)) return split;
  const pairTotal = split.sizes[dividerIndex] + split.sizes[dividerIndex + 1];
  const safeMinimum = Math.min(Math.max(0, minimum), Math.max(0, pairTotal / 2 - 0.001));
  const first = Math.min(pairTotal - safeMinimum, Math.max(safeMinimum, split.sizes[dividerIndex] + delta));
  const sizes = [...split.sizes];
  sizes[dividerIndex] = first;
  sizes[dividerIndex + 1] = pairTotal - first;
  return { ...split, sizes };
}

export function validateWorkspaceLayout(input: SavedLayout | AnyWorkspaceLayout): LayoutValidationResult {
  const layout = normalizeWorkspaceLayout(input);
  const errors: LayoutValidationError[] = [];
  const add = (code: LayoutValidationCode, path: string, message: string) => errors.push({ code, path, message });
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(layout.id)) add("invalid-id", "id", "Layout id must contain only letters, numbers, underscores, or hyphens.");
  if (!layout.name.trim()) add("invalid-name", "name", "Layout name is required.");
  if (!["left", "right", "hidden"].includes(layout.navigator) || !["left", "right", "floating", "hidden"].includes(layout.inspector) || !referenceKinds.has(layout.reference)) add("invalid-placement", "placement", "A panel placement is invalid.");
  if (![layout.navigatorWidth, layout.inspectorWidth].every((width) => Number.isFinite(width) && width >= 160 && width <= 1200)) add("invalid-width", "width", "Panel widths must be between 160 and 1200 pixels.");

  const panelIds = new Set<string>();
  layout.panels.forEach((item, index) => {
    if (panelIds.has(item.id)) add("duplicate-id", `panels.${index}.id`, `Panel id ${item.id} is duplicated.`);
    panelIds.add(item.id);
    if (!item.id || !item.title.trim()) add("invalid-name", `panels.${index}`, "Panels need an id and title.");
    if (!panelKinds.has(item.kind) || (item.kind === "reference" && (!item.referenceKind || !referenceKinds.has(item.referenceKind)))) add("invalid-panel", `panels.${index}`, "A panel kind or reference source is invalid.");
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
  const hiddenPanelIds = new Set(layout.hiddenPanelIds ?? []);
  if (hiddenPanelIds.size !== (layout.hiddenPanelIds?.length ?? 0)) add("duplicate-id", "hiddenPanelIds", "Hidden panel ids must be unique.");
  hiddenPanelIds.forEach((id) => {
    const definition = layout.panels.find((panel) => panel.id === id);
    if (!definition || groupedPanels.has(id) || floatingPanels.has(id) || !definition.closable) add("unassigned-panel", `hiddenPanelIds.${id}`, `Hidden panel ${id} is missing, visible, or required.`);
  });
  panelIds.forEach((id) => {
    if (!groupedPanels.has(id) && !floatingPanels.has(id) && !hiddenPanelIds.has(id)) add("unassigned-panel", `panels.${id}`, `Panel ${id} is neither docked, floating, nor hidden.`);
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
  const layout = Array.isArray(workspace.layouts) ? workspace.layouts.find((item) => isRecord(item) && item.id === id) : undefined;
  if (!layout) return undefined;
  const normalized = normalizeWorkspaceLayout(layout as unknown as AnyWorkspaceLayout);
  return validateWorkspaceLayout(normalized).valid ? normalized : undefined;
}

/** Upsert a portable custom topology without hijacking any window's active layout. */
export function saveCustomLayout(workspace: ProjectWorkspace, layout: AnyWorkspaceLayout): ProjectWorkspace {
  if (builtinIds.has(layout.id)) throw new Error(`Layout id ${layout.id} is reserved for a built-in preset.`);
  let saved: WorkspaceDockLayout;
  if (isWorkspaceDockLayout(layout)) {
    const validation = validateDockLayout(layout);
    if (!validation.valid) throw new Error(validation.errors.map((error) => error.message).join(" "));
    saved = structuredClone(layout);
  } else {
    saved = migrateWorkspaceLayoutToDockTree(checked(layout));
  }
  const exists = workspace.layouts.some((item) => item.id === saved.id);
  return { ...workspace, layouts: exists ? workspace.layouts.map((item) => item.id === saved.id ? saved : item) : [...workspace.layouts, saved] };
}

export function deleteCustomLayout(workspace: ProjectWorkspace, id: string): ProjectWorkspace {
  if (builtinIds.has(id)) throw new Error("Built-in layouts cannot be deleted.");
  if (!workspace.layouts.some((layout) => layout.id === id)) return workspace;
  const shortcuts = { ...workspace.shortcuts };
  delete shortcuts[workspaceLayoutShortcutAction(id)];
  return { ...workspace, layouts: workspace.layouts.filter((layout) => layout.id !== id), shortcuts, activeLayoutId: workspace.activeLayoutId === id ? "writer" : workspace.activeLayoutId };
}

export function duplicateWorkspaceLayout(workspace: ProjectWorkspace, sourceId: string): ProjectWorkspace {
  const source = workspace.layouts.find((layout) => layout.id === sourceId);
  if (!source) throw new Error(`Layout ${sourceId} does not exist.`);
  const id = uniqueWorkspaceLayoutId(workspace, `${source.id}-copy`);
  const copy = isWorkspaceDockLayout(source)
    ? structuredClone(source)
    : normalizeWorkspaceLayout(source);
  return saveCustomLayout(workspace, { ...copy, id, name: `${source.name} Copy` });
}

export function uniqueWorkspaceLayoutId(workspace: ProjectWorkspace, requested: string): string {
  const normalized = requested.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "layout";
  let id = normalized;
  for (let copy = 2; builtinIds.has(id) || workspace.layouts.some((layout) => layout.id === id); copy += 1) id = `${normalized}-${copy}`;
  return id;
}

export function renameCustomLayout(workspace: ProjectWorkspace, id: string, name: string): ProjectWorkspace {
  if (builtinIds.has(id)) throw new Error("Built-in layouts cannot be renamed.");
  const normalizedName = name.trim();
  if (!normalizedName) throw new Error("Layout name is required.");
  if (!workspace.layouts.some((layout) => layout.id === id)) throw new Error(`Layout ${id} does not exist.`);
  return { ...workspace, layouts: workspace.layouts.map((layout) => layout.id === id ? { ...layout, name: normalizedName } : layout) };
}

/** Set only the legacy/default portable selection; native windows keep their own active layout in UI preferences. */
export function activateWorkspaceLayout(workspace: ProjectWorkspace, id: string): ProjectWorkspace {
  if (!workspace.layouts.some((layout) => layout.id === id)) throw new Error(`Layout ${id} does not exist.`);
  return workspace.activeLayoutId === id ? workspace : { ...workspace, activeLayoutId: id };
}

/** Select a canonical built-in preset without mutating or deleting a custom layout. */
export function resetWorkspaceLayout(workspace: ProjectWorkspace, builtinId: (typeof BUILTIN_LAYOUT_IDS)[number] = "writer"): ProjectWorkspace {
  if (!builtinIds.has(builtinId) || !workspace.layouts.some((layout) => layout.id === builtinId)) throw new Error(`Built-in layout ${builtinId} does not exist.`);
  return activateWorkspaceLayout(workspace, builtinId);
}

/** Replace one custom topology from a protected built-in while retaining its identity and shortcut. */
export function resetCustomLayoutToBuiltIn(
  workspace: ProjectWorkspace,
  customId: string,
  builtinId: (typeof BUILTIN_LAYOUT_IDS)[number] = "writer",
): ProjectWorkspace {
  if (builtinIds.has(customId)) throw new Error("Built-in layouts are already canonical and cannot be overwritten.");
  const custom = workspace.layouts.find((layout) => layout.id === customId);
  const builtin = workspace.layouts.find((layout) => layout.id === builtinId);
  if (!custom) throw new Error(`Layout ${customId} does not exist.`);
  if (!builtin || !builtinIds.has(builtinId)) throw new Error(`Built-in layout ${builtinId} does not exist.`);
  const replacement = normalizeWorkspaceLayout(builtin);
  return saveCustomLayout(workspace, { ...replacement, id: custom.id, name: custom.name });
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

export function workspaceLayoutShortcutAction(layoutId: string): string {
  if (!layoutId.trim()) throw new Error("Layout id is required.");
  return `layout:${layoutId}`;
}

export function setWorkspaceLayoutShortcut(workspace: ProjectWorkspace, layoutId: string, shortcut: string): ProjectWorkspace {
  if (!workspace.layouts.some((layout) => layout.id === layoutId)) throw new Error(`Layout ${layoutId} does not exist.`);
  return setKeyboardShortcut(workspace, workspaceLayoutShortcutAction(layoutId), shortcut);
}

export function getWorkspaceLayoutShortcut(workspace: ProjectWorkspace, layoutId: string): string {
  return workspace.shortcuts[workspaceLayoutShortcutAction(layoutId)] ?? "";
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
