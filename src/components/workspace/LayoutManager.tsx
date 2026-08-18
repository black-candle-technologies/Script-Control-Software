import { useState, type ReactNode } from "react";

export interface LayoutManagerEntry {
  id: string;
  name: string;
  builtin: boolean;
  active: boolean;
  shortcut?: string;
}

export interface LayoutManagerProps {
  layouts: readonly LayoutManagerEntry[];
  hiddenPanelCount: number;
  onApply: (id: string) => void;
  onSaveCurrent: (name: string) => void;
  onUpdateCurrent?: () => void;
  onDuplicate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onResetBuiltin: (id: string) => void;
  onRestoreHidden: () => void;
  onResetFloatingPlacement: () => void;
  onShortcut: (id: string, shortcut: string) => void;
  readOnly?: boolean;
  placementControls?: ReactNode;
}

export function LayoutManager(props: LayoutManagerProps) {
  const [name, setName] = useState("");
  return (
    <section className="layout-manager" aria-labelledby="layout-manager-title">
      <header><h3 id="layout-manager-title">Workspace layouts</h3><p>Logical layouts travel with the project; window placement stays on this computer.</p></header>
      <div className="layout-manager-save">
        <label className="layout-manager-field">Name <input className="input" value={name} disabled={props.readOnly} onChange={(event) => setName(event.target.value)} /></label>
        <button type="button" className="btn btn-primary" disabled={props.readOnly || !name.trim()} onClick={() => { props.onSaveCurrent(name.trim()); setName(""); }}>Save current layout</button>
        {props.onUpdateCurrent ? <button type="button" className="btn" disabled={props.readOnly} onClick={props.onUpdateCurrent}>Update current layout</button> : null}
      </div>
      <ul>
        {props.layouts.map((layout) => (
          <li key={layout.id}>
            <button type="button" className="btn layout-manager-name" aria-current={layout.active ? "true" : undefined} onClick={() => props.onApply(layout.id)}>{layout.name}{layout.builtin ? " (built-in)" : ""}</button>
            <button type="button" className="btn" disabled={props.readOnly} onClick={() => props.onDuplicate(layout.id)}>Duplicate</button>
            {layout.builtin ? <button type="button" className="btn" onClick={() => props.onResetBuiltin(layout.id)}>Reset</button> : (
              <>
                <button type="button" className="btn" disabled={props.readOnly} onClick={() => { const next = window.prompt("Layout name", layout.name)?.trim(); if (next) props.onRename(layout.id, next); }}>Rename</button>
                <button type="button" className="btn" disabled={props.readOnly} onClick={() => props.onDelete(layout.id)}>Delete</button>
              </>
            )}
            <label className="layout-manager-field">Shortcut <input className="input" aria-label={`Shortcut for ${layout.name}`} disabled={props.readOnly} value={layout.shortcut ?? ""} onChange={(event) => props.onShortcut(layout.id, event.target.value)} /></label>
          </li>
        ))}
      </ul>
      {props.placementControls}
      <footer>
        <button type="button" className="btn" disabled={!props.hiddenPanelCount} onClick={props.onRestoreHidden}>Restore hidden panels ({props.hiddenPanelCount})</button>
        <button type="button" className="btn" onClick={props.onResetFloatingPlacement}>Restore off-screen panels</button>
      </footer>
    </section>
  );
}
