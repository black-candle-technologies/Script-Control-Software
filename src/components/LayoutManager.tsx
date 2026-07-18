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
  type ProjectWorkspace,
  type SavedLayout,
  type WorkspaceLayout,
} from "../domain/index.ts";

interface LayoutManagerProps {
  workspace: ProjectWorkspace;
  layout: WorkspaceLayout;
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

export default function LayoutManager({ workspace, layout, onWorkspace, onClose }: LayoutManagerProps) {
  const [draft, setDraft] = useState(layout);
  const [shortcutDraft, setShortcutDraft] = useState<Record<string, string>>(workspace.shortcuts);
  const [message, setMessage] = useState("");
  const builtin = BUILTIN_LAYOUT_IDS.includes(draft.id as (typeof BUILTIN_LAYOUT_IDS)[number]);
  const topology = useMemo(() => normalizeWorkspaceLayout(layoutFields(draft)), [draft]);

  useEffect(() => {
    setDraft(layout);
    setMessage("");
  }, [layout]);

  useEffect(() => setShortcutDraft(workspace.shortcuts), [workspace.shortcuts]);

  const update = <K extends keyof SavedLayout>(key: K, value: SavedLayout[K]) => {
    setDraft((current) => normalizeWorkspaceLayout(layoutFields({ ...current, [key]: value })));
  };

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
      const next = saveCustomLayout(workspace, normalizeWorkspaceLayout(layoutFields(draft)));
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
          <label>Navigator<select value={draft.navigator} disabled={builtin} onChange={(event) => update("navigator", event.target.value as SavedLayout["navigator"])}><option value="left">Dock left</option><option value="right">Dock right</option><option value="hidden">Hidden</option></select></label>
          <label>Inspector<select value={draft.inspector} disabled={builtin} onChange={(event) => update("inspector", event.target.value as SavedLayout["inspector"])}><option value="left">Dock left</option><option value="right">Dock right</option><option value="floating">Float over script</option><option value="hidden">Hidden</option></select></label>
          <label>Reference split<select value={draft.reference} disabled={builtin} onChange={(event) => update("reference", event.target.value as SavedLayout["reference"])}><option value="none">None</option><option value="previous-draft">Previous draft</option><option value="previous-episode">Previous episode</option></select></label>
          <label>Navigator width <output>{draft.navigatorWidth}px</output><input type="range" min="180" max="520" step="10" value={draft.navigatorWidth} disabled={builtin} onChange={(event) => update("navigatorWidth", Number(event.target.value))} /></label>
          <label>Inspector width <output>{draft.inspectorWidth}px</output><input type="range" min="220" max="720" step="10" value={draft.inspectorWidth} disabled={builtin} onChange={(event) => update("inspectorWidth", Number(event.target.value))} /></label>
          <div className="btn-row"><button className="btn" onClick={duplicate}>Duplicate as custom</button><button className="btn btn-primary" disabled={builtin} onClick={saveLayout}>Save layout</button><button className="btn btn-ghost" disabled={builtin} onClick={remove}>Delete</button></div>
          {builtin && <p className="insp-hint">Built-in presets stay dependable. Duplicate one to change its docks, split, floating inspector, or widths.</p>}
        </div>
        <div className="layout-manager-section">
          <h3>Panel topology</h3>
          <dl className="layout-topology">
            <div><dt>Panels</dt><dd>{topology.panels.map((panel) => panel.title).join(", ")}</dd></div>
            <div><dt>Tab groups</dt><dd>{topology.tabGroups.map((group) => group.panelIds.join(" + ")).join(" / ")}</dd></div>
            <div><dt>Split</dt><dd>{topology.splits[0]?.direction ?? "Single panel"}</dd></div>
            <div><dt>Floating</dt><dd>{topology.floatingPanels.map((panel) => panel.panelId).join(", ") || "None"}</dd></div>
            <div><dt>Synchronized</dt><dd>{topology.synchronizedPanels.map((group) => `${group.panelIds.join(" + ")} (${group.mode})`).join(", ") || "None"}</dd></div>
          </dl>
          <p className="insp-hint">The script and reference split follow the same active scene. Inspector tabs share the current selection and project data.</p>
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

function layoutFields(layout: SavedLayout): SavedLayout {
  return {
    id: layout.id,
    name: layout.name,
    navigator: layout.navigator,
    inspector: layout.inspector,
    reference: layout.reference,
    navigatorWidth: layout.navigatorWidth,
    inspectorWidth: layout.inspectorWidth,
  };
}
