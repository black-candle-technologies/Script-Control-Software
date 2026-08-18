import {
  normalizeWorkspaceLayout,
  validateWorkspaceLayout,
  type SynchronizedPanelState,
  type WorkspaceLayout,
  type WorkspacePanelDefinition,
  type WorkspaceTabGroup,
} from "./workspaceLayouts.ts";
import type { ProjectWorkspace, SavedLayout, WorkspaceReferenceKind } from "./projectWorkspace.ts";

export interface DockTabsNode {
  kind: "tabs";
  id: string;
  panelIds: string[];
  activePanelId: string;
}

export interface DockSplitNode {
  kind: "split";
  id: string;
  direction: "horizontal" | "vertical";
  sizes: number[];
  children: DockNode[];
}

export type DockNode = DockTabsNode | DockSplitNode;

/** Fractions are relative to the logical workspace, never native screen coordinates. */
export interface LogicalFloatingPanel {
  panelId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WorkspaceDockLayout extends SavedLayout {
  layoutVersion: 2;
  panels: WorkspacePanelDefinition[];
  root: DockNode;
  floatingPanels: LogicalFloatingPanel[];
  hiddenPanelIds: string[];
  synchronizedPanels: SynchronizedPanelState[];
}

export interface DockLayoutValidationResult {
  valid: boolean;
  errors: { path: string; message: string }[];
}

export type DockEdge = "left" | "right" | "top" | "bottom" | "center";

const DEFAULT_FLOATING_RECT: Omit<LogicalFloatingPanel, "panelId"> = { x: 0.2, y: 0.18, width: 0.4, height: 0.46 };
const LEGACY_WORKSPACE_WIDTH = 1440;
const LEGACY_WORKSPACE_HEIGHT = 900;
const PANEL_KINDS = new Set(["navigator", "screenplay", "inspector", "reference", "story", "treatment", "breakdown", "versions", "series", "production", "companion"]);
const REFERENCE_KINDS = new Set<WorkspaceReferenceKind>(["none", "previous-episode", "next-episode", "previous-draft", "character", "object", "location", "show-bible", "season-arc", "plot-history", "timeline"]);

export function migrateWorkspaceLayoutToDockTree(input: WorkspaceLayout | WorkspaceDockLayout): WorkspaceDockLayout {
  if (isWorkspaceDockLayout(input)) {
    let cloned: WorkspaceDockLayout;
    try {
      cloned = cloneDockLayout(input);
    } catch {
      return writerDockFallback(savedLayoutFields(input));
    }
    cloned = { ...cloned, ...savedLayoutFields(input) };
    if (validateDockLayout(cloned).valid) return cloned;
    const repaired = repairDockGeometry(cloned);
    return validateDockLayout(repaired).valid ? repaired : writerDockFallback(savedLayoutFields(input));
  }
  const legacy = normalizeWorkspaceLayout(input);
  if (!validateWorkspaceLayout(legacy).valid) return writerDockFallback(savedLayoutFields(legacy));
  const tabsById = new Map(legacy.tabGroups.map((group) => [group.id, tabNode(group)]));
  let root: DockNode;
  if (legacy.splits.length === 1) {
    const split = legacy.splits[0];
    root = {
      kind: "split",
      id: split.id,
      direction: split.direction,
      sizes: normalizeSizes(split.sizes, split.groupIds.length),
      children: split.groupIds.map((id) => tabsById.get(id)!).filter(Boolean),
    };
  } else if (legacy.splits.length > 1) {
    const assigned = new Set<string>();
    const splitNodes = legacy.splits.map((split): DockSplitNode => {
      split.groupIds.forEach((id) => assigned.add(id));
      return {
        kind: "split", id: split.id, direction: split.direction,
        sizes: normalizeSizes(split.sizes, split.groupIds.length),
        children: split.groupIds.map((id) => tabsById.get(id)!).filter(Boolean),
      };
    });
    const loose = legacy.tabGroups.filter((group) => !assigned.has(group.id)).map(tabNode);
    const children: DockNode[] = [...splitNodes, ...loose];
    root = children.length === 1 ? children[0] : { kind: "split", id: "migrated-root", direction: "horizontal", sizes: equalSizes(children.length), children };
  } else {
    root = tabNode(legacy.tabGroups[0]);
  }
  const migrated: WorkspaceDockLayout = {
    layoutVersion: 2,
    ...savedLayoutFields(legacy),
    panels: structuredClone(legacy.panels),
    root,
    floatingPanels: legacy.floatingPanels.map((floating) => normalizeLogicalRect({
      panelId: floating.panelId,
      x: floating.x / LEGACY_WORKSPACE_WIDTH,
      y: floating.y / LEGACY_WORKSPACE_HEIGHT,
      width: floating.width / LEGACY_WORKSPACE_WIDTH,
      height: floating.height / LEGACY_WORKSPACE_HEIGHT,
    })),
    hiddenPanelIds: [...(legacy.hiddenPanelIds ?? [])],
    synchronizedPanels: structuredClone(legacy.synchronizedPanels),
  };
  return validateDockLayout(migrated).valid ? migrated : writerDockFallback(savedLayoutFields(legacy));
}

export function validateDockLayout(layout: WorkspaceDockLayout): DockLayoutValidationResult {
  const errors: DockLayoutValidationResult["errors"] = [];
  const add = (path: string, message: string) => errors.push({ path, message });
  if (!isRecord(layout)) return { valid: false, errors: [{ path: "layout", message: "Dock layout must be an object." }] };
  if (layout.layoutVersion !== 2) add("layoutVersion", "Dock layout version must be 2.");
  if (typeof layout.id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/i.test(layout.id)
    || typeof layout.name !== "string" || !layout.name.trim()) add("identity", "Layout id and name are required and must be portable.");
  if (!validSavedLayoutFields(layout)) add("placement", "Legacy placement metadata is invalid.");
  const panels = new Map<string, WorkspacePanelDefinition>();
  if (!Array.isArray(layout.panels)) add("panels", "Panels must be an array.");
  for (const [index, panel] of (Array.isArray(layout.panels) ? layout.panels : []).entries()) {
    if (!isWorkspacePanel(panel)) {
      add(`panels.${index}`, "Panel definition is malformed.");
      continue;
    }
    if (!panel.id.trim() || panels.has(panel.id)) add(`panels.${index}`, "Panel ids must be non-empty and unique.");
    panels.set(panel.id, panel);
  }
  if (!panels.size) add("panels", "At least one registered panel is required.");
  const nodeIds = new Set<string>();
  const assigned = new Set<string>();
  const ancestors = new WeakSet<object>();
  const visit = (node: unknown, path: string) => {
    if (!isRecord(node)) { add(path, "Dock node is missing."); return; }
    if (ancestors.has(node)) { add(path, "Dock tree contains a cycle."); return; }
    ancestors.add(node);
    const nodeId = typeof node.id === "string" ? node.id : "";
    if (!nodeId.trim() || nodeIds.has(nodeId)) add(`${path}.id`, "Dock node ids must be non-empty and unique.");
    nodeIds.add(nodeId);
    if (node.kind === "tabs") {
      const panelIds = stringArray(node.panelIds) ? node.panelIds : [];
      const activePanelId = typeof node.activePanelId === "string" ? node.activePanelId : "";
      if (!panelIds.length || new Set(panelIds).size !== panelIds.length || !panelIds.includes(activePanelId)) {
        add(path, "A tab node needs unique panels and an active panel it contains.");
      }
      for (const panelId of panelIds) {
        if (!panels.has(panelId)) add(`${path}.panelIds`, `Panel ${panelId} does not exist.`);
        if (assigned.has(panelId)) add(`${path}.panelIds`, `Panel ${panelId} has more than one owner.`);
        assigned.add(panelId);
      }
    } else if (node.kind === "split") {
      const children = Array.isArray(node.children) ? node.children : [];
      const sizes = numberArray(node.sizes) ? node.sizes : [];
      const total = sizes.reduce((sum, size) => sum + size, 0);
      if ((node.direction !== "horizontal" && node.direction !== "vertical")
        || children.length < 2 || children.length !== sizes.length
        || sizes.some((size) => !Number.isFinite(size) || size <= 0) || Math.abs(total - 1) > 0.001) {
        add(path, "A split needs at least two children and positive sizes totaling 1.");
      }
      children.forEach((child, index) => visit(child, `${path}.children.${index}`));
    } else {
      add(path, "Dock node kind is invalid.");
    }
    ancestors.delete(node);
  };
  visit(layout.root, "root");
  const floating = new Set<string>();
  if (!Array.isArray(layout.floatingPanels)) add("floatingPanels", "Floating panels must be an array.");
  for (const [index, panel] of (Array.isArray(layout.floatingPanels) ? layout.floatingPanels : []).entries()) {
    if (!isLogicalFloatingPanel(panel) || !panels.has(panel.panelId) || assigned.has(panel.panelId) || floating.has(panel.panelId) || !validLogicalRect(panel)) {
      add(`floatingPanels.${index}`, "Floating panels must be unique, undocked, existing, and use normalized bounds.");
    }
    if (isRecord(panel) && typeof panel.panelId === "string") floating.add(panel.panelId);
  }
  const hiddenIds = stringArray(layout.hiddenPanelIds) ? layout.hiddenPanelIds : [];
  if (!stringArray(layout.hiddenPanelIds)) add("hiddenPanelIds", "Hidden panel ids must be an array of ids.");
  const hidden = new Set(hiddenIds);
  if (hidden.size !== hiddenIds.length) add("hiddenPanelIds", "Hidden panel ids must be unique.");
  for (const panelId of hidden) {
    if (!panels.has(panelId) || assigned.has(panelId) || floating.has(panelId)) add("hiddenPanelIds", `Hidden panel ${panelId} is invalid or still visible.`);
  }
  for (const panel of panels.values()) {
    if (!assigned.has(panel.id) && !floating.has(panel.id) && !hidden.has(panel.id)) add(`panels.${panel.id}`, "Panel has no dock, floating frame, or hidden state.");
    if (!panel.closable && hidden.has(panel.id)) add(`hiddenPanelIds.${panel.id}`, "Required panels cannot be hidden.");
  }
  const synchronizedIds = new Set<string>();
  if (!Array.isArray(layout.synchronizedPanels)) add("synchronizedPanels", "Synchronized panels must be an array.");
  for (const [index, sync] of (Array.isArray(layout.synchronizedPanels) ? layout.synchronizedPanels : []).entries()) {
    if (!isRecord(sync) || typeof sync.id !== "string" || synchronizedIds.has(sync.id)
      || !stringArray(sync.panelIds) || new Set(sync.panelIds).size !== sync.panelIds.length || sync.panelIds.length < 2
      || sync.panelIds.some((panelId) => !panels.has(panelId))
      || (sync.mode !== "active-scene" && sync.mode !== "selection" && sync.mode !== "scroll")) {
      add(`synchronizedPanels.${index}`, "A synchronized group needs a unique id, valid mode, and at least two existing panels.");
    }
    if (isRecord(sync) && typeof sync.id === "string") synchronizedIds.add(sync.id);
  }
  return { valid: errors.length === 0, errors };
}

export function activateDockPanel(layout: WorkspaceDockLayout, panelId: string): WorkspaceDockLayout {
  return updateTree(layout, (node) => node.kind === "tabs" && node.panelIds.includes(panelId) ? { ...node, activePanelId: panelId } : node);
}

export function reorderDockTab(layout: WorkspaceDockLayout, panelId: string, toIndex: number): WorkspaceDockLayout {
  return updateTree(layout, (node) => {
    if (node.kind !== "tabs" || !node.panelIds.includes(panelId)) return node;
    const panelIds = node.panelIds.filter((id) => id !== panelId);
    panelIds.splice(clampIndex(toIndex, panelIds.length), 0, panelId);
    return { ...node, panelIds };
  });
}

export function moveDockPanelToTabs(
  layout: WorkspaceDockLayout,
  panelId: string,
  targetTabsId: string,
  toIndex: number,
): WorkspaceDockLayout {
  if (!layout.panels.some((panel) => panel.id === panelId)) return layout;
  const detached = detachPanel(layout, panelId);
  if (!findNode(detached.root, targetTabsId) && !findNode(layout.root, targetTabsId)) return layout;
  const root = mapNode(detached.root, (node) => {
    if (node.id !== targetTabsId || node.kind !== "tabs") return node;
    const panelIds = [...node.panelIds];
    panelIds.splice(clampIndex(toIndex, panelIds.length), 0, panelId);
    return { ...node, panelIds, activePanelId: panelId };
  });
  const next = { ...detached, root, hiddenPanelIds: detached.hiddenPanelIds.filter((id) => id !== panelId), floatingPanels: detached.floatingPanels.filter((panel) => panel.panelId !== panelId) };
  return validateDockLayout(next).valid ? next : layout;
}

export function dockPanel(
  layout: WorkspaceDockLayout,
  panelId: string,
  targetNodeId: string,
  edge: DockEdge,
): WorkspaceDockLayout {
  const target = findNode(layout.root, targetNodeId);
  if (!target || !layout.panels.some((panel) => panel.id === panelId)) return layout;
  if (edge === "center" && target.kind === "tabs") return moveDockPanelToTabs(layout, panelId, targetNodeId, target.panelIds.length);
  if (edge === "center") return layout;
  const detached = detachPanel(layout, panelId);
  const direction = edge === "left" || edge === "right" ? "horizontal" : "vertical";
  const before = edge === "left" || edge === "top";
  const newTabs: DockTabsNode = { kind: "tabs", id: uniqueNodeId(detached, `tabs-${panelId}`), panelIds: [panelId], activePanelId: panelId };
  const root = mapNode(detached.root, (node) => {
    if (node.id !== targetNodeId) return node;
    const children = before ? [newTabs, node] : [node, newTabs];
    return { kind: "split", id: uniqueNodeId(detached, `split-${panelId}`), direction, sizes: [0.5, 0.5], children };
  });
  const next = {
    ...detached,
    root,
    floatingPanels: detached.floatingPanels.filter((panel) => panel.panelId !== panelId),
    hiddenPanelIds: detached.hiddenPanelIds.filter((id) => id !== panelId),
  };
  return validateDockLayout(next).valid ? next : layout;
}

export function floatDockPanel(
  layout: WorkspaceDockLayout,
  panelId: string,
  rect: Omit<LogicalFloatingPanel, "panelId"> = DEFAULT_FLOATING_RECT,
): WorkspaceDockLayout {
  if (!layout.panels.some((panel) => panel.id === panelId)) return layout;
  const detached = detachPanel(layout, panelId);
  const next = {
    ...detached,
    hiddenPanelIds: detached.hiddenPanelIds.filter((id) => id !== panelId),
    floatingPanels: [...detached.floatingPanels.filter((panel) => panel.panelId !== panelId), normalizeLogicalRect({ panelId, ...rect })],
  };
  return validateDockLayout(next).valid ? next : layout;
}

/** Move or resize one logical floating frame without introducing monitor coordinates. */
export function updateFloatingPanelRect(
  layout: WorkspaceDockLayout,
  panelId: string,
  patch: Partial<Omit<LogicalFloatingPanel, "panelId">>,
): WorkspaceDockLayout {
  const current = layout.floatingPanels.find((panel) => panel.panelId === panelId);
  if (!current) return layout;
  const updated = normalizeLogicalRect({ ...current, ...patch, panelId });
  const next = {
    ...layout,
    floatingPanels: layout.floatingPanels.map((panel) => panel.panelId === panelId ? updated : panel),
  };
  return validateDockLayout(next).valid ? next : layout;
}

export function hideDockPanel(layout: WorkspaceDockLayout, panelId: string): WorkspaceDockLayout {
  const panel = layout.panels.find((candidate) => candidate.id === panelId);
  if (!panel?.closable) return layout;
  const detached = detachPanel(layout, panelId);
  const next = {
    ...detached,
    floatingPanels: detached.floatingPanels.filter((floating) => floating.panelId !== panelId),
    hiddenPanelIds: [...new Set([...detached.hiddenPanelIds, panelId])],
  };
  return validateDockLayout(next).valid ? next : layout;
}

export function restoreHiddenPanel(layout: WorkspaceDockLayout, panelId: string, targetTabsId?: string): WorkspaceDockLayout {
  if (!layout.hiddenPanelIds.includes(panelId)) return layout;
  const target = targetTabsId ? findNode(layout.root, targetTabsId) : firstTabs(layout.root);
  if (!target || target.kind !== "tabs") return layout;
  const next = {
    ...layout,
    hiddenPanelIds: layout.hiddenPanelIds.filter((id) => id !== panelId),
    root: mapNode(layout.root, (node) => node.id === target.id && node.kind === "tabs"
      ? { ...node, panelIds: [...node.panelIds, panelId], activePanelId: panelId }
      : node),
  };
  return validateDockLayout(next).valid ? next : layout;
}

export function resizeDockSplit(
  layout: WorkspaceDockLayout,
  splitId: string,
  dividerIndex: number,
  delta: number,
  minimum = 0.12,
): WorkspaceDockLayout {
  return updateTree(layout, (node) => {
    if (node.kind !== "split" || node.id !== splitId || dividerIndex < 0 || dividerIndex >= node.sizes.length - 1 || !Number.isFinite(delta)) return node;
    const sizes = [...node.sizes];
    const total = sizes[dividerIndex] + sizes[dividerIndex + 1];
    const safeMinimum = Math.min(Math.max(0, minimum), total / 2 - 0.001);
    sizes[dividerIndex] = Math.min(total - safeMinimum, Math.max(safeMinimum, sizes[dividerIndex] + delta));
    sizes[dividerIndex + 1] = total - sizes[dividerIndex];
    return { ...node, sizes };
  });
}

export function dockTreeNodes(root: DockNode): DockNode[] {
  return root.kind === "tabs" ? [root] : [root, ...root.children.flatMap(dockTreeNodes)];
}

/** Read either a legacy flat preset or a saved version-2 custom layout. */
export function getWorkspaceDockLayout(workspace: ProjectWorkspace, id: string): WorkspaceDockLayout | undefined {
  const saved = workspace.layouts.find((layout) => layout.id === id);
  if (!saved) return undefined;
  return migrateWorkspaceLayoutToDockTree(saved as WorkspaceLayout | WorkspaceDockLayout);
}

/**
 * Lossy compatibility projection for legacy callers. The version-2 tree remains
 * authoritative; nested split ratios and normalized floating bounds are not
 * rewritten by this projection.
 */
export function workspaceDockLayoutToWorkspaceLayout(input: WorkspaceDockLayout): WorkspaceLayout {
  const layout = validateDockLayout(input).valid ? cloneDockLayout(input) : writerDockFallback(savedLayoutFields(input));
  const weightedTabs = collectWeightedTabs(layout.root);
  const tabGroups = weightedTabs.map(({ node }) => ({
    id: node.id,
    panelIds: [...node.panelIds],
    activePanelId: node.activePanelId,
  }));
  const totalWeight = weightedTabs.reduce((total, item) => total + item.weight, 0);
  const splits = tabGroups.length > 1 ? [{
    id: "compatibility-root",
    direction: layout.root.kind === "split" ? layout.root.direction : "horizontal" as const,
    groupIds: tabGroups.map((group) => group.id),
    sizes: weightedTabs.map((item) => item.weight / totalWeight),
  }] : [];
  return {
    ...savedLayoutFields(layout),
    panels: structuredClone(layout.panels),
    tabGroups,
    splits,
    floatingPanels: layout.floatingPanels.map((floating) => ({
      panelId: floating.panelId,
      x: floating.x * LEGACY_WORKSPACE_WIDTH,
      y: floating.y * LEGACY_WORKSPACE_HEIGHT,
      width: Math.max(200, floating.width * LEGACY_WORKSPACE_WIDTH),
      height: Math.max(120, floating.height * LEGACY_WORKSPACE_HEIGHT),
    })),
    synchronizedPanels: structuredClone(layout.synchronizedPanels),
    hiddenPanelIds: [...layout.hiddenPanelIds],
  };
}

/** Restore every closable hidden panel into one existing tab group. */
export function restoreAllHiddenPanels(layout: WorkspaceDockLayout, targetTabsId?: string): WorkspaceDockLayout {
  return layout.hiddenPanelIds.reduce((current, panelId) => restoreHiddenPanel(current, panelId, targetTabsId), layout);
}

/** Clamp logical floating frames into the portable workspace after viewport/layout changes. */
export function restoreOffscreenFloatingPanels(layout: WorkspaceDockLayout): WorkspaceDockLayout {
  const next = {
    ...layout,
    floatingPanels: layout.floatingPanels.map((panel) => normalizeLogicalRect(panel)),
  };
  return validateDockLayout(next).valid ? next : layout;
}

function detachPanel(layout: WorkspaceDockLayout, panelId: string): WorkspaceDockLayout {
  const root = pruneNode(layout.root, panelId) ?? layout.root;
  return {
    ...layout,
    root,
    floatingPanels: layout.floatingPanels.filter((panel) => panel.panelId !== panelId),
    hiddenPanelIds: layout.hiddenPanelIds.filter((id) => id !== panelId),
  };
}

function pruneNode(node: DockNode, panelId: string): DockNode | undefined {
  if (node.kind === "tabs") {
    const panelIds = node.panelIds.filter((id) => id !== panelId);
    if (!panelIds.length) return undefined;
    return { ...node, panelIds, activePanelId: panelIds.includes(node.activePanelId) ? node.activePanelId : panelIds[0] };
  }
  const children = node.children.flatMap((child) => {
    const pruned = pruneNode(child, panelId);
    return pruned ? [pruned] : [];
  });
  if (!children.length) return undefined;
  if (children.length === 1) return children[0];
  const survivingIndices = node.children.flatMap((child, index) => pruneNode(child, panelId) ? [index] : []);
  return { ...node, children, sizes: normalizeSizes(survivingIndices.map((index) => node.sizes[index]), children.length) };
}

function updateTree(layout: WorkspaceDockLayout, update: (node: DockNode) => DockNode): WorkspaceDockLayout {
  const next = { ...layout, root: mapNode(layout.root, update) };
  return validateDockLayout(next).valid ? next : layout;
}

function mapNode(node: DockNode, update: (node: DockNode) => DockNode): DockNode {
  const mapped: DockNode = node.kind === "tabs" ? { ...node, panelIds: [...node.panelIds] } : { ...node, sizes: [...node.sizes], children: node.children.map((child) => mapNode(child, update)) };
  return update(mapped);
}

function findNode(root: DockNode, id: string): DockNode | undefined {
  if (root.id === id) return root;
  if (root.kind === "split") for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return undefined;
}

function firstTabs(root: DockNode): DockTabsNode | undefined {
  if (root.kind === "tabs") return root;
  for (const child of root.children) {
    const tabs = firstTabs(child);
    if (tabs) return tabs;
  }
  return undefined;
}

function uniqueNodeId(layout: WorkspaceDockLayout, base: string): string {
  const used = new Set(dockTreeNodes(layout.root).map((node) => node.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function tabNode(group: WorkspaceTabGroup | undefined): DockTabsNode {
  if (!group) return { kind: "tabs", id: "main-tabs", panelIds: ["screenplay"], activePanelId: "screenplay" };
  return { kind: "tabs", id: group.id, panelIds: [...group.panelIds], activePanelId: group.activePanelId };
}

export function isWorkspaceDockLayout(value: unknown): value is WorkspaceDockLayout {
  return isRecord(value) && value.layoutVersion === 2 && isRecord(value.root);
}

function cloneDockLayout(layout: WorkspaceDockLayout): WorkspaceDockLayout {
  return structuredClone(layout);
}

function writerDockFallback(fields: SavedLayout = savedLayoutFields(undefined)): WorkspaceDockLayout {
  return {
    layoutVersion: 2,
    ...fields,
    panels: [
      { id: "navigator", title: "Navigator", kind: "navigator", closable: false },
      { id: "screenplay", title: "Screenplay", kind: "screenplay", closable: false },
      { id: "inspector", title: "Inspector", kind: "inspector", closable: false },
    ],
    root: {
      kind: "split", id: "main-split", direction: "horizontal", sizes: [0.2, 0.55, 0.25],
      children: [
        { kind: "tabs", id: "navigator-tabs", panelIds: ["navigator"], activePanelId: "navigator" },
        { kind: "tabs", id: "main-tabs", panelIds: ["screenplay"], activePanelId: "screenplay" },
        { kind: "tabs", id: "inspector-tabs", panelIds: ["inspector"], activePanelId: "inspector" },
      ],
    },
    floatingPanels: [],
    hiddenPanelIds: [],
    synchronizedPanels: [],
  };
}

function savedLayoutFields(value: unknown): SavedLayout {
  const input = isRecord(value) ? value : {};
  const navigator = input.navigator === "left" || input.navigator === "right" || input.navigator === "hidden" ? input.navigator : "left";
  const inspector = input.inspector === "left" || input.inspector === "right" || input.inspector === "floating" || input.inspector === "hidden" ? input.inspector : "right";
  const reference = typeof input.reference === "string" && REFERENCE_KINDS.has(input.reference as WorkspaceReferenceKind)
    ? input.reference as WorkspaceReferenceKind
    : "none";
  return {
    id: typeof input.id === "string" && /^[a-z0-9][a-z0-9_-]*$/i.test(input.id) ? input.id : "writer",
    name: typeof input.name === "string" && input.name.trim() ? input.name.trim() : "Writer",
    navigator,
    inspector,
    reference,
    navigatorWidth: validLegacyWidth(input.navigatorWidth) ? input.navigatorWidth : 240,
    inspectorWidth: validLegacyWidth(input.inspectorWidth) ? input.inspectorWidth : 360,
  };
}

function validSavedLayoutFields(value: Record<string, unknown>): boolean {
  return (value.navigator === "left" || value.navigator === "right" || value.navigator === "hidden")
    && (value.inspector === "left" || value.inspector === "right" || value.inspector === "floating" || value.inspector === "hidden")
    && typeof value.reference === "string" && REFERENCE_KINDS.has(value.reference as WorkspaceReferenceKind)
    && validLegacyWidth(value.navigatorWidth) && validLegacyWidth(value.inspectorWidth);
}

function validLegacyWidth(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 160 && value <= 1200;
}

function isWorkspacePanel(value: unknown): value is WorkspacePanelDefinition {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || !value.title.trim()
    || typeof value.kind !== "string" || !PANEL_KINDS.has(value.kind) || typeof value.closable !== "boolean") return false;
  if (value.kind === "reference") return typeof value.referenceKind === "string" && REFERENCE_KINDS.has(value.referenceKind as WorkspaceReferenceKind)
    && (value.targetId === undefined || typeof value.targetId === "string");
  return value.referenceKind === undefined && value.targetId === undefined;
}

function isLogicalFloatingPanel(value: unknown): value is LogicalFloatingPanel {
  return isRecord(value) && typeof value.panelId === "string"
    && [value.x, value.y, value.width, value.height].every((number) => typeof number === "number");
}

function repairDockGeometry(layout: WorkspaceDockLayout): WorkspaceDockLayout {
  return {
    ...layout,
    root: repairDockNodeRatios(layout.root, new WeakSet<object>()),
    floatingPanels: Array.isArray(layout.floatingPanels)
      ? layout.floatingPanels.map((panel) => isLogicalFloatingPanel(panel) ? normalizeLogicalRect(panel) : panel)
      : layout.floatingPanels,
  };
}

function repairDockNodeRatios(node: DockNode, seen: WeakSet<object>): DockNode {
  if (!isRecord(node) || seen.has(node)) return node;
  seen.add(node);
  if (node.kind !== "split" || !Array.isArray(node.children)) return node;
  return {
    ...node,
    sizes: normalizeSizes(Array.isArray(node.sizes) ? node.sizes : [], node.children.length),
    children: node.children.map((child) => repairDockNodeRatios(child, seen)),
  };
}

function collectWeightedTabs(node: DockNode, weight = 1): { node: DockTabsNode; weight: number }[] {
  if (node.kind === "tabs") return [{ node, weight }];
  return node.children.flatMap((child, index) => collectWeightedTabs(child, weight * node.sizes[index]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function numberArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function normalizeLogicalRect(rect: LogicalFloatingPanel): LogicalFloatingPanel {
  const width = clamp(Number.isFinite(rect.width) ? rect.width : DEFAULT_FLOATING_RECT.width, 0.12, 1);
  const height = clamp(Number.isFinite(rect.height) ? rect.height : DEFAULT_FLOATING_RECT.height, 0.12, 1);
  return {
    panelId: rect.panelId,
    x: clamp(Number.isFinite(rect.x) ? rect.x : DEFAULT_FLOATING_RECT.x, 0, 1 - width),
    y: clamp(Number.isFinite(rect.y) ? rect.y : DEFAULT_FLOATING_RECT.y, 0, 1 - height),
    width,
    height,
  };
}

function validLogicalRect(rect: LogicalFloatingPanel): boolean {
  return [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.x >= 0 && rect.y >= 0 && rect.width >= 0.12 && rect.height >= 0.12
    && rect.x + rect.width <= 1.001 && rect.y + rect.height <= 1.001;
}

function normalizeSizes(sizes: readonly number[], length: number): number[] {
  if (sizes.length !== length || sizes.some((size) => !Number.isFinite(size) || size <= 0)) return equalSizes(length);
  const total = sizes.reduce((sum, size) => sum + size, 0);
  return total > 0 ? sizes.map((size) => size / total) : equalSizes(length);
}

function equalSizes(length: number): number[] {
  return length > 0 ? Array.from({ length }, () => 1 / length) : [];
}

function clampIndex(index: number, maximum: number): number {
  return Math.max(0, Math.min(Number.isFinite(index) ? Math.trunc(index) : maximum, maximum));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
