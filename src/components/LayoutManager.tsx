import { useEffect, useMemo, useState } from "react";
import {
  BUILTIN_LAYOUT_IDS,
  deleteCustomLayout,
  duplicateWorkspaceLayout,
  getWorkspaceLayout,
  normalizeKeyboardShortcut,
  normalizeWorkspaceLayout,
  saveCustomLayout,
  validateKeyboardShortcuts,
  WORKSPACE_REFERENCE_KINDS,
  type ProjectWorkspace,
  type SavedLayout,
  type WorkspaceLayout,
  type WorkspacePanelDefinition,
  type WorkspacePanelKind,
  type WorkspaceReferenceKind,
  type WorkspaceTabGroup,
} from "../domain/index.ts";

interface LayoutManagerProps {
  workspace: ProjectWorkspace;
  layout: WorkspaceLayout;
  referenceTargets?: Partial<Record<WorkspaceReferenceKind, { id: string; label: string }[]>>;
  onWorkspace: (workspace: ProjectWorkspace) => void;
  onClose: () => void;
}

const shortcutActions = [
  ["commandPalette", "Command palette"],
  ["save", "Save project"],
  ["saveVersion", "Save draft version"],
  ["toggleInspector", "Toggle inspector"],
  ["layoutManager", "Workspace layouts"],
  ["previousEpisode", "Previous episode"],
  ["nextEpisode", "Next episode"],
] as const;

const panelCatalog: readonly [WorkspacePanelKind, string][] = [
  ["navigator", "Navigator"],
  ["screenplay", "Screenplay"],
  ["inspector", "Inspector"],
  ["reference", "Reference"],
  ["story", "Story"],
  ["treatment", "Treatment"],
  ["breakdown", "Breakdown"],
  ["versions", "Versions"],
  ["series", "Series"],
  ["production", "Production"],
  ["companion", "Companion dashboard"],
];

const referenceLabels: Record<WorkspaceReferenceKind, string> = {
  none: "None",
  "previous-episode": "Previous episode",
  "next-episode": "Next episode",
  "previous-draft": "Previous draft",
  character: "Character",
  object: "Object",
  location: "Location",
  "show-bible": "Show bible",
  "season-arc": "Season arc",
  "plot-history": "Plot history",
  timeline: "Timeline",
};

export default function LayoutManager({ workspace, layout, referenceTargets = {}, onWorkspace, onClose }: LayoutManagerProps) {
  const [draft, setDraft] = useState(layout);
  const [panelKind, setPanelKind] = useState<WorkspacePanelKind>("reference");
  const [shortcutDraft, setShortcutDraft] = useState<Record<string, string>>(workspace.shortcuts);
  const [message, setMessage] = useState("");
  const builtin = BUILTIN_LAYOUT_IDS.includes(draft.id as (typeof BUILTIN_LAYOUT_IDS)[number]);
  const topology = useMemo(() => normalizeWorkspaceLayout(draft), [draft]);

  useEffect(() => {
    setDraft(layout);
    setMessage("");
  }, [layout]);

  useEffect(() => setShortcutDraft(workspace.shortcuts), [workspace.shortcuts]);

  const update = <K extends keyof SavedLayout>(key: K, value: SavedLayout[K]) => {
    setDraft((current) => {
      if (key !== "reference") return normalizeWorkspaceLayout({ ...current, [key]: value });
      let updated = false;
      const panels = current.panels.map((panel) => {
        if (updated || panel.kind !== "reference") return panel;
        updated = true;
        return { ...panel, referenceKind: value as WorkspaceReferenceKind };
      });
      return normalizeWorkspaceLayout({ ...current, [key]: value, panels });
    });
  };

  const updateTopology = (change: (current: WorkspaceLayout) => WorkspaceLayout) => {
    setDraft((current) => syncLegacyFields(change(current)));
    setMessage("");
  };

  const addPanel = () => updateTopology((current) => {
    const label = panelCatalog.find(([kind]) => kind === panelKind)![1];
    const id = uniqueId(panelKind, current.panels.map((item) => item.id));
    const nextPanel: WorkspacePanelDefinition = {
      id,
      title: label,
      kind: panelKind,
      closable: true,
      ...(panelKind === "reference" ? { referenceKind: "previous-draft" as const } : {}),
    };
    const tabGroups = current.tabGroups.length
      ? current.tabGroups.map((group, index) => index === 0 ? { ...group, panelIds: [...group.panelIds, id] } : group)
      : [{ id: "main-tabs", panelIds: [id], activePanelId: id }];
    return rebuildGroups({ ...current, panels: [...current.panels, nextPanel] }, tabGroups);
  });

  const removePanel = (panelId: string) => updateTopology((current) => {
    if (current.panels.length === 1) return current;
    const tabGroups = current.tabGroups.map((group) => {
      const panelIds = group.panelIds.filter((id) => id !== panelId);
      return { ...group, panelIds, activePanelId: panelIds.includes(group.activePanelId) ? group.activePanelId : panelIds[0] ?? "" };
    }).filter((group) => group.panelIds.length);
    return rebuildGroups({
      ...current,
      panels: current.panels.filter((panel) => panel.id !== panelId),
      floatingPanels: current.floatingPanels.filter((panel) => panel.panelId !== panelId),
      synchronizedPanels: current.synchronizedPanels
        .map((sync) => ({ ...sync, panelIds: sync.panelIds.filter((id) => id !== panelId) }))
        .filter((sync) => sync.panelIds.length > 1),
    }, tabGroups);
  });

  const updatePanel = (panelId: string, change: Partial<WorkspacePanelDefinition>) => updateTopology((current) => ({
    ...current,
    panels: current.panels.map((panel) => panel.id === panelId ? { ...panel, ...change } : panel),
  }));

  const updateFloatingPanel = (panelId: string, change: Partial<Omit<WorkspaceLayout["floatingPanels"][number], "panelId">>) => updateTopology((current) => ({
    ...current,
    floatingPanels: current.floatingPanels.map((panel) => panel.panelId === panelId ? { ...panel, ...change } : panel),
  }));

  const movePanel = (panelId: string, groupId: string) => updateTopology((current) => {
    let tabGroups = current.tabGroups.map((group) => {
      const panelIds = group.panelIds.filter((id) => id !== panelId);
      return { ...group, panelIds, activePanelId: panelIds.includes(group.activePanelId) ? group.activePanelId : panelIds[0] ?? "" };
    }).filter((group) => group.panelIds.length || group.id === groupId);
    if (groupId !== "floating") tabGroups = tabGroups.map((group) => group.id === groupId
      ? { ...group, panelIds: [...group.panelIds, panelId], activePanelId: panelId }
      : group);
    return rebuildGroups({
      ...current,
      floatingPanels: groupId === "floating"
        ? [...current.floatingPanels.filter((panel) => panel.panelId !== panelId), {
          panelId,
          x: 40 + current.floatingPanels.length * 48,
          y: 40 + current.floatingPanels.length * 48,
          width: 420,
          height: 520,
        }]
        : current.floatingPanels.filter((panel) => panel.panelId !== panelId),
    }, tabGroups);
  });

  const addTabGroup = () => updateTopology((current) => {
    const id = uniqueId("tabs", current.tabGroups.map((group) => group.id));
    return rebuildGroups(current, [...current.tabGroups, { id, panelIds: [], activePanelId: "" }]);
  });

  const removeTabGroup = (groupId: string) => updateTopology((current) => {
    if (current.tabGroups.length === 1) return current;
    const removed = current.tabGroups.find((group) => group.id === groupId)!;
    const remaining = current.tabGroups.filter((group) => group.id !== groupId);
    remaining[0] = {
      ...remaining[0],
      panelIds: [...remaining[0].panelIds, ...removed.panelIds],
      activePanelId: remaining[0].activePanelId || removed.activePanelId,
    };
    return rebuildGroups(current, remaining);
  });

  const moveTabGroup = (index: number, offset: number) => updateTopology((current) => {
    const tabGroups = [...current.tabGroups];
    const nextIndex = index + offset;
    if (nextIndex < 0 || nextIndex >= tabGroups.length) return current;
    [tabGroups[index], tabGroups[nextIndex]] = [tabGroups[nextIndex], tabGroups[index]];
    return rebuildGroups(current, tabGroups);
  });

  const setActiveTab = (groupId: string, activePanelId: string) => updateTopology((current) => ({
    ...current,
    tabGroups: current.tabGroups.map((group) => group.id === groupId ? { ...group, activePanelId } : group),
  }));

  const setSplitDirection = (direction: "horizontal" | "vertical") => updateTopology((current) => rebuildGroups(current, current.tabGroups, direction));

  const duplicate = () => {
    try {
      const next = duplicateWorkspaceLayout(workspace, draft.id);
      onWorkspace(next);
      setDraft(getWorkspaceLayout(next, next.activeLayoutId)!);
      setMessage("Created an editable copy of this layout.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The layout could not be duplicated.");
    }
  };

  const saveLayout = () => {
    try {
      const next = saveCustomLayout(workspace, normalizeWorkspaceLayout(draft));
      onWorkspace(next);
      setMessage("Workspace layout saved in this project.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The layout could not be saved.");
    }
  };

  const remove = () => {
    try {
      onWorkspace(deleteCustomLayout(workspace, draft.id));
      setMessage("Custom layout deleted; Writer is active.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The layout could not be deleted.");
    }
  };

  const saveShortcuts = () => {
    try {
      const shortcuts = Object.fromEntries(Object.entries(shortcutDraft)
        .filter(([, shortcut]) => shortcut.trim())
        .map(([action, shortcut]) => [action, normalizeKeyboardShortcut(shortcut)]));
      const validation = validateKeyboardShortcuts(shortcuts);
      if (!validation.valid) {
        const collision = validation.collisions[0];
        throw new Error(collision
          ? `${collision.shortcut} is assigned to ${collision.actions.join(" and ")}.`
          : validation.invalid[0]?.message ?? "A shortcut is invalid.");
      }
      onWorkspace({ ...workspace, shortcuts });
      setMessage("Keyboard shortcuts saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The shortcuts could not be saved.");
    }
  };

  return <div className="command-backdrop" onMouseDown={onClose}>
    <section className="layout-manager" role="dialog" aria-modal="true" aria-labelledby="layout-manager-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="layout-manager-header">
        <div><span className="insp-kicker">Creative IDE</span><h2 id="layout-manager-title">Workspace layouts</h2></div>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close layout manager">Close</button>
      </header>
      <div className="layout-manager-grid">
        <div className="layout-manager-section">
          <h3>Active layout</h3>
          <label>Name<input value={draft.name} disabled={builtin} onChange={(event) => update("name", event.target.value)} /></label>
          <label>Primary reference<select value={draft.reference} disabled={builtin} onChange={(event) => update("reference", event.target.value as SavedLayout["reference"])}>{WORKSPACE_REFERENCE_KINDS.map((kind) => <option key={kind} value={kind}>{referenceLabels[kind]}</option>)}</select></label>
          <label>Navigator width <output>{draft.navigatorWidth}px</output><input type="range" min="180" max="520" step="10" value={draft.navigatorWidth} disabled={builtin} onChange={(event) => update("navigatorWidth", Number(event.target.value))} /></label>
          <label>Inspector width <output>{draft.inspectorWidth}px</output><input type="range" min="220" max="720" step="10" value={draft.inspectorWidth} disabled={builtin} onChange={(event) => update("inspectorWidth", Number(event.target.value))} /></label>
          <div className="btn-row"><button className="btn" onClick={duplicate}>Duplicate as custom</button><button className="btn btn-primary" disabled={builtin} onClick={saveLayout}>Save layout</button><button className="btn btn-ghost" disabled={builtin} onClick={remove}>Delete</button></div>
          {builtin && <p className="insp-hint">Built-in presets stay dependable. Duplicate one, then use the panel composer to change docks, tabs, splits, floating panels, or widths.</p>}
        </div>
        <div className="layout-manager-section">
          <h3>Panel composer</h3>
          <div className="btn-row">
            <select aria-label="Panel kind" value={panelKind} disabled={builtin} onChange={(event) => setPanelKind(event.target.value as WorkspacePanelKind)}>{panelCatalog.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</select>
            <button className="btn" disabled={builtin} onClick={addPanel}>Add panel</button>
          </div>
          {topology.panels.map((panel) => {
            const floating = topology.floatingPanels.find((item) => item.panelId === panel.id);
            const groupId = floating
              ? "floating"
              : topology.tabGroups.find((group) => group.panelIds.includes(panel.id))?.id ?? "";
            return <div className="layout-topology" key={panel.id}>
              <label>Title<input value={panel.title} disabled={builtin} onChange={(event) => updatePanel(panel.id, { title: event.target.value })} /></label>
              <label>Panel<span>{panelCatalog.find(([kind]) => kind === panel.kind)?.[1] ?? panel.kind}</span></label>
              <label>Tab group<select value={groupId} disabled={builtin} onChange={(event) => movePanel(panel.id, event.target.value)}>{topology.tabGroups.map((group) => <option key={group.id} value={group.id}>{group.id}</option>)}<option value="floating">Floating</option></select></label>
              {panel.kind === "reference" && <>
                <label>Reference<select value={panel.referenceKind ?? "previous-draft"} disabled={builtin} onChange={(event) => updatePanel(panel.id, { referenceKind: event.target.value as WorkspaceReferenceKind })}>{WORKSPACE_REFERENCE_KINDS.map((kind) => <option key={kind} value={kind}>{referenceLabels[kind]}</option>)}</select></label>
                <label>Target{referenceTargets[panel.referenceKind ?? "none"]?.length ? <select value={panel.targetId ?? ""} disabled={builtin} onChange={(event) => updatePanel(panel.id, { targetId: event.target.value || undefined })}><option value="">Automatic first match</option>{referenceTargets[panel.referenceKind ?? "none"]!.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select> : <input value={panel.targetId ?? ""} disabled={builtin} placeholder="Optional character, object, or location id" onChange={(event) => updatePanel(panel.id, { targetId: event.target.value || undefined })} />}</label>
              </>}
              {floating && <div className="floating-frame-controls">
                <label>Left<input aria-label={`${panel.title} floating left`} type="number" min="0" step="10" value={floating.x} disabled={builtin} onChange={(event) => updateFloatingPanel(panel.id, { x: Math.max(0, Number(event.target.value)) })} /></label>
                <label>Top<input aria-label={`${panel.title} floating top`} type="number" min="0" step="10" value={floating.y} disabled={builtin} onChange={(event) => updateFloatingPanel(panel.id, { y: Math.max(0, Number(event.target.value)) })} /></label>
                <label>Width<input aria-label={`${panel.title} floating width`} type="number" min="200" step="10" value={floating.width} disabled={builtin} onChange={(event) => updateFloatingPanel(panel.id, { width: Math.max(200, Number(event.target.value)) })} /></label>
                <label>Height<input aria-label={`${panel.title} floating height`} type="number" min="120" step="10" value={floating.height} disabled={builtin} onChange={(event) => updateFloatingPanel(panel.id, { height: Math.max(120, Number(event.target.value)) })} /></label>
              </div>}
              <button className="btn btn-ghost" disabled={builtin || topology.panels.length === 1} onClick={() => removePanel(panel.id)}>Remove panel</button>
            </div>;
          })}
          <div className="btn-row">
            <label>Split<select value={topology.splits[0]?.direction ?? "horizontal"} disabled={builtin || topology.tabGroups.length < 2} onChange={(event) => setSplitDirection(event.target.value as "horizontal" | "vertical")}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
            <button className="btn" disabled={builtin} onClick={addTabGroup}>Add tab group</button>
          </div>
          {topology.tabGroups.map((group, index) => <div className="layout-topology" key={group.id}>
            <strong>{group.id}</strong>
            <label>Active tab<select value={group.activePanelId} disabled={builtin || !group.panelIds.length} onChange={(event) => setActiveTab(group.id, event.target.value)}>{group.panelIds.map((id) => <option key={id} value={id}>{topology.panels.find((panel) => panel.id === id)?.title ?? id}</option>)}</select></label>
            {!group.panelIds.length && <span className="insp-hint">Move a panel here before saving.</span>}
            <div className="btn-row"><button className="btn btn-ghost" disabled={builtin || index === 0} onClick={() => moveTabGroup(index, -1)}>Up</button><button className="btn btn-ghost" disabled={builtin || index === topology.tabGroups.length - 1} onClick={() => moveTabGroup(index, 1)}>Down</button><button className="btn btn-ghost" disabled={builtin || topology.tabGroups.length === 1} onClick={() => removeTabGroup(group.id)}>Remove group</button></div>
          </div>)}
          <p className="insp-hint">Each panel belongs to one tab group or floats. Empty groups must receive a panel before the layout can be saved.</p>
        </div>
        <div className="layout-manager-section layout-shortcuts">
          <h3>Keyboard shortcuts</h3>
          {shortcutActions.map(([action, label]) => <label key={action}>{label}<input value={shortcutDraft[action] ?? ""} placeholder="Unassigned" onChange={(event) => setShortcutDraft((current) => ({ ...current, [action]: event.target.value }))} /></label>)}
          <button className="btn btn-primary" onClick={saveShortcuts}>Save shortcuts</button>
          <p className="insp-hint">Use Mod for Ctrl on Windows/Linux or Command on macOS, for example Mod+Shift+S.</p>
        </div>
      </div>
      {message && <div className="layout-manager-message" role="status">{message}</div>}
    </section>
  </div>;
}

function uniqueId(prefix: string, ids: string[]): string {
  if (!ids.includes(prefix)) return prefix;
  for (let suffix = 2; ; suffix++) if (!ids.includes(`${prefix}-${suffix}`)) return `${prefix}-${suffix}`;
}

function rebuildGroups(layout: WorkspaceLayout, tabGroups: WorkspaceTabGroup[], direction = layout.splits[0]?.direction ?? "horizontal"): WorkspaceLayout {
  return {
    ...layout,
    tabGroups,
    splits: tabGroups.length > 1 ? [{
      id: layout.splits[0]?.id ?? "main-split",
      direction,
      groupIds: tabGroups.map((group) => group.id),
      sizes: tabGroups.map(() => 1 / tabGroups.length),
    }] : [],
  };
}

function syncLegacyFields(layout: WorkspaceLayout): WorkspaceLayout {
  const reference = layout.panels.find((panel) => panel.kind === "reference")?.referenceKind ?? "none";
  const navigator = layout.panels.some((panel) => panel.kind === "navigator")
    ? layout.navigator === "hidden" ? "left" : layout.navigator
    : "hidden";
  const inspectorPanel = layout.panels.find((panel) => panel.kind === "inspector");
  const inspector = !inspectorPanel
    ? "hidden"
    : layout.floatingPanels.some((panel) => panel.panelId === inspectorPanel.id)
      ? "floating"
      : layout.inspector === "hidden" || layout.inspector === "floating" ? "right" : layout.inspector;
  return normalizeWorkspaceLayout({ ...layout, reference, navigator, inspector });
}
