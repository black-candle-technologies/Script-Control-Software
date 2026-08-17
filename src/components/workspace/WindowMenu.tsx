import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { WindowMenuEntry } from "../../domain/windowRegistry.ts";

export interface WindowMenuProps {
  windows: readonly WindowMenuEntry[];
  currentDocumentTitle?: string;
  activePanelTitle?: string;
  canMoveActivePanel?: boolean;
  canCopyActivePanel?: boolean;
  documentTransferKeepsSource?: boolean;
  canMoveDocumentToNewWindow?: boolean;
  hiddenPanels?: readonly { id: string; title: string }[];
  layouts?: readonly { id: string; name: string; active: boolean }[];
  onNewWindow: () => void;
  onOpenDocumentInNewWindow?: () => void;
  onOpenLayoutInNewWindow?: () => void;
  onMoveDocumentToNewWindow?: () => void;
  onMoveDocumentToWindow?: (windowId: string) => void;
  onMovePanelToWindow?: (windowId: string, copy: boolean) => void;
  onBringAllToFront: () => void;
  onFocusWindow: (windowId: string) => void;
  onCloseWindow: () => void;
  onResetPlacement: () => void;
  onRestorePanel?: (panelId: string) => void;
  onApplyLayout?: (layoutId: string) => void;
  onCustomizeLayout?: () => void;
  onManageLayouts?: () => void;
}

export function WindowMenu(props: WindowMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", outside);
    requestAnimationFrame(() => root.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus());
    return () => window.removeEventListener("pointerdown", outside);
  }, [open]);
  const choose = (action: () => void) => { action(); setOpen(false); button.current?.focus(); };
  return (
    <div ref={root} className="window-menu-root">
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>Window</button>
      {open ? (
        <div role="menu" aria-label="Window" className="window-menu" onKeyDown={(event) => onMenuKeyDown(event, () => { setOpen(false); button.current?.focus(); })}>
          <MenuItem label="New Window" onChoose={() => choose(props.onNewWindow)} />
          <MenuItem label={`Open ${props.currentDocumentTitle || "current screenplay"} in New Window`} disabled={!props.onOpenDocumentInNewWindow} onChoose={() => choose(() => props.onOpenDocumentInNewWindow?.())} />
          <MenuItem label="Open Current Layout in New Window" disabled={!props.onOpenLayoutInNewWindow} onChoose={() => choose(() => props.onOpenLayoutInNewWindow?.())} />
          <MenuItem label={`Move ${props.currentDocumentTitle || "current screenplay"} to New Window`} disabled={!props.onMoveDocumentToNewWindow || props.canMoveDocumentToNewWindow === false} onChoose={() => choose(() => props.onMoveDocumentToNewWindow?.())} />
          <MenuItem label="Bring All to Front" onChoose={() => choose(props.onBringAllToFront)} />
          <MenuItem label="Reset Window Placement" onChoose={() => choose(props.onResetPlacement)} />
          <div role="separator" />
          {props.windows.map((window) => <MenuItem key={window.windowId} label={`${window.active ? "✓ " : ""}${window.title}${window.leader ? " — Leader" : ""}`} onChoose={() => choose(() => props.onFocusWindow(window.windowId))} />)}
          {props.windows.filter((window) => !window.active).map((window) => (
            <span key={`move-${window.windowId}`} className="window-menu-pair">
              <MenuItem label={`${props.documentTransferKeepsSource ? "Open screenplay in" : "Move screenplay to"} ${window.title}`} disabled={!props.onMoveDocumentToWindow} onChoose={() => choose(() => props.onMoveDocumentToWindow?.(window.windowId))} />
              <MenuItem label={`Move ${props.activePanelTitle || "panel"} to ${window.title}`} disabled={!props.onMovePanelToWindow || !props.canMoveActivePanel} onChoose={() => choose(() => props.onMovePanelToWindow?.(window.windowId, false))} />
              <MenuItem label={`Copy ${props.activePanelTitle || "panel"} to ${window.title}`} disabled={!props.onMovePanelToWindow || !props.canCopyActivePanel} onChoose={() => choose(() => props.onMovePanelToWindow?.(window.windowId, true))} />
            </span>
          ))}
          {props.hiddenPanels?.length ? <div role="separator" /> : null}
          {props.hiddenPanels?.map((panel) => <MenuItem key={panel.id} label={`Show ${panel.title}`} onChoose={() => choose(() => props.onRestorePanel?.(panel.id))} />)}
          {props.layouts?.length ? <div role="separator" /> : null}
          {props.layouts?.map((layout) => <MenuItem key={layout.id} label={`${layout.active ? "✓ " : ""}Layout: ${layout.name}`} onChoose={() => choose(() => props.onApplyLayout?.(layout.id))} />)}
          {props.onCustomizeLayout ? <MenuItem label="Customize Current Layout" onChoose={() => choose(props.onCustomizeLayout!)} /> : null}
          {props.onManageLayouts ? <MenuItem label="Manage Layouts…" onChoose={() => choose(props.onManageLayouts!)} /> : null}
          <div role="separator" />
          <MenuItem label="Close Window" onChoose={() => choose(props.onCloseWindow)} />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({ label, onChoose, disabled = false }: { label: string; onChoose: () => void; disabled?: boolean }) {
  return <button type="button" role="menuitem" disabled={disabled} onClick={onChoose}>{label}</button>;
}

function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>, close: () => void) {
  if (event.key === "Escape") { event.preventDefault(); close(); return; }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
  const index = items.indexOf(document.activeElement as HTMLElement);
  const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
    : event.key === "ArrowDown" ? (index + 1) % items.length : (index - 1 + items.length) % items.length;
  items[next]?.focus();
}
