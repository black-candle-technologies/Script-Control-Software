import { useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent } from "react";
import {
  activateDockPanel,
  dockPanel,
  dockTreeNodes,
  floatDockPanel,
  hideDockPanel,
  reorderDockTab,
  resizeDockSplit,
  updateFloatingPanelRect,
  type DockEdge,
  type DockNode,
  type DockSplitNode,
  type DockTabsNode,
  type LogicalFloatingPanel,
  type WorkspaceDockLayout,
} from "../../domain/dockTree.ts";
import type { WorkspacePanelDefinition } from "../../domain/workspaceLayouts.ts";
import { renderRegisteredPanel, WORKSPACE_PANEL_REGISTRY, type WorkspacePanelContext } from "./panelRegistry.tsx";
import "./workspace.css";

const PANEL_MIME = "application/x-scs-workspace-panel";

export interface DockLayoutRendererProps {
  layout: WorkspaceDockLayout;
  context: WorkspacePanelContext;
  onLayoutChange: (layout: WorkspaceDockLayout) => void;
  readOnly?: boolean;
  onBeginExternalPanelDrag?: (panel: WorkspacePanelDefinition, event: DragEvent) => void;
  onEndExternalPanelDrag?: (panel: WorkspacePanelDefinition, event: DragEvent) => void;
  onInternalPanelDrop?: (panelId: string, nodeId: string, edge: DockEdge, event: DragEvent) => void;
}

interface DropPreview {
  nodeId: string;
  edge: DockEdge;
}

export function DockLayoutRenderer({ layout, context, onLayoutChange, readOnly = false, onBeginExternalPanelDrag, onEndExternalPanelDrag, onInternalPanelDrop }: DockLayoutRendererProps) {
  const [preview, setPreview] = useState<DropPreview>();
  const panels = new Map(layout.panels.map((panel) => [panel.id, panel]));
  const renderNode = (node: DockNode): React.ReactNode => node.kind === "tabs"
    ? <DockTabs key={node.id} node={node} layout={layout} panels={panels} context={context} readOnly={readOnly} preview={preview} onPreview={setPreview} onChange={onLayoutChange} onBeginExternalPanelDrag={onBeginExternalPanelDrag} onEndExternalPanelDrag={onEndExternalPanelDrag} onInternalPanelDrop={onInternalPanelDrop} />
    : <DockSplit key={node.id} node={node} renderNode={renderNode} layout={layout} readOnly={readOnly} onChange={onLayoutChange} />;
  return (
    <section className="dock-layout" aria-label={`${layout.name} workspace layout`} onDragLeave={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreview(undefined);
    }}>
      <div className="dock-layout-root">{renderNode(layout.root)}</div>
      {layout.floatingPanels.map((floating) => {
        const panel = panels.get(floating.panelId);
        return panel ? <FloatingPanel key={panel.id} panel={panel} floating={floating} context={context} layout={layout} readOnly={readOnly} onChange={onLayoutChange} /> : null;
      })}
      {preview ? <div className={`dock-drop-status dock-drop-${preview.edge}`} role="status">Dock {preview.edge}</div> : null}
    </section>
  );
}

function DockTabs({ node, layout, panels, context, readOnly, preview, onPreview, onChange, onBeginExternalPanelDrag, onEndExternalPanelDrag, onInternalPanelDrop }: {
  node: DockTabsNode;
  layout: WorkspaceDockLayout;
  panels: ReadonlyMap<string, WorkspacePanelDefinition>;
  context: WorkspacePanelContext;
  readOnly: boolean;
  preview?: DropPreview;
  onPreview: (preview?: DropPreview) => void;
  onChange: (layout: WorkspaceDockLayout) => void;
  onBeginExternalPanelDrag?: (panel: WorkspacePanelDefinition, event: DragEvent) => void;
  onEndExternalPanelDrag?: (panel: WorkspacePanelDefinition, event: DragEvent) => void;
  onInternalPanelDrop?: (panelId: string, nodeId: string, edge: DockEdge, event: DragEvent) => void;
}) {
  const active = panels.get(node.activePanelId) ?? panels.get(node.panelIds[0]);
  const drop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const panelId = event.dataTransfer.getData(PANEL_MIME);
    if (panelId && preview?.nodeId === node.id) {
      onInternalPanelDrop?.(panelId, node.id, preview.edge, event);
      onChange(dockPanel(layout, panelId, node.id, preview.edge));
    }
    onPreview(undefined);
  };
  const previewDrop = (event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes(PANEL_MIME)) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top) / Math.max(1, rect.height);
    const edge: DockEdge = x < 0.22 ? "left" : x > 0.78 ? "right" : y < 0.22 ? "top" : y > 0.78 ? "bottom" : "center";
    onPreview({ nodeId: node.id, edge });
  };
  return (
    <section className={`dock-tabs${preview?.nodeId === node.id ? ` dock-target-${preview.edge}` : ""}`} data-dock-node={node.id} onDragOver={previewDrop} onDrop={drop}>
      <div className="dock-tablist" role="tablist" aria-label="Workspace panels">
        {node.panelIds.map((panelId, index) => {
          const panel = panels.get(panelId);
          if (!panel) return null;
          return (
            <button
              key={panelId}
              type="button"
              role="tab"
              aria-selected={panelId === active?.id}
              aria-controls={`dock-panel-${panelId}`}
              tabIndex={panelId === active?.id ? 0 : -1}
              draggable={!readOnly}
              onClick={() => onChange(activateDockPanel(layout, panelId))}
              onKeyDown={(event) => navigateTabs(event, node, index, onChange, layout)}
              onDragStart={(event) => {
                event.dataTransfer.setData(PANEL_MIME, panelId);
                event.dataTransfer.effectAllowed = WORKSPACE_PANEL_REGISTRY[panel.kind].copyable ? "copyMove" : "move";
                onBeginExternalPanelDrag?.(panel, event);
              }}
              onDragEnd={(event) => onEndExternalPanelDrag?.(panel, event)}
            >
              {panel.title}
            </button>
          );
        })}
        {active && !readOnly ? (
          <span className="dock-tab-actions">
            <PanelPlacementSelect panel={active} layout={layout} onChange={onChange} />
            <button type="button" className="tool-btn" aria-label={`Float ${active.title}`} onClick={() => onChange(floatDockPanel(layout, active.id))}>Float</button>
            {active.closable ? <button type="button" className="tool-btn" aria-label={`Hide ${active.title}`} onClick={() => onChange(hideDockPanel(layout, active.id))}>Hide</button> : null}
          </span>
        ) : null}
      </div>
      {active ? (
        <div id={`dock-panel-${active.id}`} role="tabpanel" aria-label={active.title} className="dock-panel-content">
          {renderRegisteredPanel(active, context)}
        </div>
      ) : null}
    </section>
  );
}

export function PanelPlacementControls({ layout, onChange, readOnly = false }: {
  layout: WorkspaceDockLayout;
  onChange: (layout: WorkspaceDockLayout) => void;
  readOnly?: boolean;
}) {
  const floating = new Set(layout.floatingPanels.map((panel) => panel.panelId));
  const hidden = new Set(layout.hiddenPanelIds);
  return (
    <section className="layout-panel-placement" aria-label="Panel placement">
      <h4>Panel placement</h4>
      <p>Move a panel into a tab group, create a split, float it, or hide it without dragging.</p>
      <ul>
        {layout.panels.map((panel) => (
          <li key={panel.id}>
            <span>{panel.title} <small>{hidden.has(panel.id) ? "hidden" : floating.has(panel.id) ? "floating" : "docked"}</small></span>
            <PanelPlacementSelect panel={panel} layout={layout} onChange={onChange} disabled={readOnly} />
            {panel.closable ? <button type="button" className="btn" disabled={readOnly || hidden.has(panel.id)} onClick={() => onChange(hideDockPanel(layout, panel.id))}>Hide</button> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

interface PanelPlacementCommand {
  value: string;
  label: string;
  apply: (layout: WorkspaceDockLayout, panelId: string) => WorkspaceDockLayout;
}

function PanelPlacementSelect({ panel, layout, onChange, disabled = false }: {
  panel: WorkspacePanelDefinition;
  layout: WorkspaceDockLayout;
  onChange: (layout: WorkspaceDockLayout) => void;
  disabled?: boolean;
}) {
  const commands = panelPlacementCommands(layout);
  return (
    <select
      className="element-select"
      aria-label={`Place ${panel.title}`}
      value=""
      disabled={disabled}
      onChange={(event) => {
        const command = commands.find((candidate) => candidate.value === event.target.value);
        if (command) onChange(command.apply(layout, panel.id));
      }}
    >
      <option value="">Move or split…</option>
      {commands.map((command) => <option key={command.value} value={command.value}>{command.label}</option>)}
    </select>
  );
}

function panelPlacementCommands(layout: WorkspaceDockLayout): PanelPlacementCommand[] {
  const groups = dockTreeNodes(layout.root).filter((node): node is DockTabsNode => node.kind === "tabs");
  const commands: PanelPlacementCommand[] = [{
    value: "float",
    label: "Float in this window",
    apply: (current, panelId) => floatDockPanel(current, panelId),
  }];
  groups.forEach((group, index) => {
    const groupTitle = group.panelIds
      .map((panelId) => layout.panels.find((panel) => panel.id === panelId)?.title)
      .filter(Boolean)
      .slice(0, 2)
      .join(" / ") || `empty group ${index + 1}`;
    (["center", "left", "right", "top", "bottom"] as const).forEach((edge) => {
      commands.push({
        value: `${group.id}:${edge}`,
        label: edge === "center" ? `Join group ${index + 1} (${groupTitle})` : `Split ${edge} of group ${index + 1} (${groupTitle})`,
        apply: (current, panelId) => dockPanel(current, panelId, group.id, edge),
      });
    });
  });
  return commands;
}

function DockSplit({ node, renderNode, layout, readOnly, onChange }: {
  node: DockSplitNode;
  renderNode: (node: DockNode) => React.ReactNode;
  layout: WorkspaceDockLayout;
  readOnly: boolean;
  onChange: (layout: WorkspaceDockLayout) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const horizontal = node.direction === "horizontal";
  const children: React.ReactNode[] = [];
  node.children.forEach((child, index) => {
    children.push(<div key={child.id} className="dock-split-child" style={{ flexBasis: `${node.sizes[index] * 100}%` }}>{renderNode(child)}</div>);
    if (index < node.children.length - 1) children.push(
      <div
        key={`${node.id}-divider-${index}`}
        className={`dock-divider dock-divider-${node.direction}`}
        role="separator"
        aria-orientation={horizontal ? "vertical" : "horizontal"}
        aria-label={`Resize workspace split ${index + 1}`}
        tabIndex={readOnly ? -1 : 0}
        onKeyDown={(event) => {
          if (readOnly) return;
          const negative = horizontal ? event.key === "ArrowLeft" : event.key === "ArrowUp";
          const positive = horizontal ? event.key === "ArrowRight" : event.key === "ArrowDown";
          if (!negative && !positive) return;
          event.preventDefault();
          onChange(resizeDockSplit(layout, node.id, index, negative ? -0.025 : 0.025));
        }}
        onPointerDown={(event) => !readOnly && beginDividerResize(event, rootRef.current, node, index, layout, onChange)}
      />,
    );
  });
  return <div ref={rootRef} className={`dock-split dock-split-${node.direction}`}>{children}</div>;
}

function FloatingPanel({ panel, floating, context, layout, readOnly, onChange }: {
  panel: WorkspacePanelDefinition;
  floating: LogicalFloatingPanel;
  context: WorkspacePanelContext;
  layout: WorkspaceDockLayout;
  readOnly: boolean;
  onChange: (layout: WorkspaceDockLayout) => void;
}) {
  return (
    <section
      className="dock-floating-panel"
      aria-label={`${panel.title}, floating panel`}
      style={{ left: `${floating.x * 100}%`, top: `${floating.y * 100}%`, width: `${floating.width * 100}%`, height: `${floating.height * 100}%` }}
    >
      <header>
        <strong>{panel.title}</strong>
        {!readOnly ? <button type="button" className="dock-floating-move" aria-label={`Move ${panel.title}`} title="Drag or use arrow keys to move" onPointerDown={(event) => beginFloatingFrameChange(event, layout, floating, "move", onChange)} onKeyDown={(event) => {
          const delta = event.shiftKey ? 0.05 : 0.015;
          const patch = event.key === "ArrowLeft" ? { x: floating.x - delta }
            : event.key === "ArrowRight" ? { x: floating.x + delta }
              : event.key === "ArrowUp" ? { y: floating.y - delta }
                : event.key === "ArrowDown" ? { y: floating.y + delta } : undefined;
          if (patch) { event.preventDefault(); onChange(updateFloatingPanelRect(layout, panel.id, patch)); }
        }}>Move</button> : null}
        {!readOnly && panel.closable ? <button type="button" className="tool-btn" onClick={() => onChange(hideDockPanel(layout, panel.id))}>Hide</button> : null}
      </header>
      <div className="dock-panel-content">{renderRegisteredPanel(panel, context)}</div>
      {!readOnly ? <div className="dock-floating-resize" role="separator" aria-label={`Resize ${panel.title}`} tabIndex={0} onPointerDown={(event) => beginFloatingFrameChange(event, layout, floating, "resize", onChange)} onKeyDown={(event) => {
        const delta = event.shiftKey ? 0.05 : 0.015;
        const patch = event.key === "ArrowLeft" ? { width: floating.width - delta }
          : event.key === "ArrowRight" ? { width: floating.width + delta }
            : event.key === "ArrowUp" ? { height: floating.height - delta }
              : event.key === "ArrowDown" ? { height: floating.height + delta } : undefined;
        if (patch) { event.preventDefault(); onChange(updateFloatingPanelRect(layout, panel.id, patch)); }
      }} /> : null}
    </section>
  );
}

function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, node: DockTabsNode, index: number, onChange: (layout: WorkspaceDockLayout) => void, layout: WorkspaceDockLayout) {
  if (event.altKey && event.shiftKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    const target = Math.max(0, Math.min(index + (event.key === "ArrowLeft" ? -1 : 1), node.panelIds.length - 1));
    onChange(reorderDockTab(layout, node.panelIds[index], target));
    const tablist = event.currentTarget.parentElement;
    requestAnimationFrame(() => tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[target]?.focus());
    return;
  }
  let next = index;
  if (event.key === "ArrowRight") next = (index + 1) % node.panelIds.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + node.panelIds.length) % node.panelIds.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = node.panelIds.length - 1;
  else return;
  event.preventDefault();
  onChange(activateDockPanel(layout, node.panelIds[next]));
  const tablist = event.currentTarget.parentElement;
  requestAnimationFrame(() => (tablist?.querySelectorAll<HTMLElement>('[role="tab"]')[next])?.focus());
}

function beginDividerResize(
  event: PointerEvent<HTMLDivElement>,
  container: HTMLDivElement | null,
  split: DockSplitNode,
  dividerIndex: number,
  layout: WorkspaceDockLayout,
  onChange: (layout: WorkspaceDockLayout) => void,
) {
  if (!container) return;
  event.currentTarget.setPointerCapture(event.pointerId);
  const horizontal = split.direction === "horizontal";
  const start = horizontal ? event.clientX : event.clientY;
  const extent = horizontal ? container.clientWidth : container.clientHeight;
  const target = event.currentTarget;
  const move = (moveEvent: globalThis.PointerEvent) => {
    const position = horizontal ? moveEvent.clientX : moveEvent.clientY;
    onChange(resizeDockSplit(layout, split.id, dividerIndex, (position - start) / Math.max(1, extent)));
  };
  const stop = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", stop);
    target.removeEventListener("pointercancel", stop);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", stop);
  target.addEventListener("pointercancel", stop);
}

function beginFloatingFrameChange(
  event: PointerEvent<HTMLElement>,
  layout: WorkspaceDockLayout,
  floating: LogicalFloatingPanel,
  mode: "move" | "resize",
  onChange: (layout: WorkspaceDockLayout) => void,
) {
  const container = event.currentTarget.closest<HTMLElement>(".dock-layout");
  if (!container) return;
  event.preventDefault();
  const target = event.currentTarget;
  target.setPointerCapture(event.pointerId);
  const startX = event.clientX;
  const startY = event.clientY;
  const move = (moveEvent: globalThis.PointerEvent) => {
    const deltaX = (moveEvent.clientX - startX) / Math.max(1, container.clientWidth);
    const deltaY = (moveEvent.clientY - startY) / Math.max(1, container.clientHeight);
    onChange(updateFloatingPanelRect(layout, floating.panelId, mode === "move"
      ? { x: floating.x + deltaX, y: floating.y + deltaY }
      : { width: floating.width + deltaX, height: floating.height + deltaY }));
  };
  const stop = () => {
    target.removeEventListener("pointermove", move);
    target.removeEventListener("pointerup", stop);
    target.removeEventListener("pointercancel", stop);
  };
  target.addEventListener("pointermove", move);
  target.addEventListener("pointerup", stop);
  target.addEventListener("pointercancel", stop);
}
