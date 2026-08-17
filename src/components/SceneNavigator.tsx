/** Accessible Act → Sequence → Scene → Beat navigator for the Write workspace. */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { Scene, StoryStructure, WorkspaceData } from "../domain/index.ts";
import Icon from "./Icons.tsx";
import "./SceneNavigator.css";

type SceneMeta = NonNullable<WorkspaceData["sceneMeta"]>[string];

export interface SceneNavigatorProps {
  title: string;
  scenes: Scene[];
  structure: StoryStructure;
  sceneMeta: Record<string, SceneMeta | undefined>;
  omittedSceneIds: string[];
  pageEstimates: Map<string, number>;
  activeSceneId: string | null;
  totalPages: number;
  canEdit: boolean;
  onSelect: (sceneId: string) => void;
  onMoveScene: (from: number, to: number) => void;
  /** Keys use `act:`, `sequence:`, `scene:`, or the reserved `unassigned` key. */
  collapsedNodeIds?: ReadonlySet<string>;
  defaultCollapsedNodeIds?: Iterable<string>;
  onCollapsedNodeIdsChange?: (collapsedNodeIds: ReadonlySet<string>) => void;
  selectedSceneId?: string | null;
  selectedBeatId?: string | null;
  onSceneActivate?: (sceneId: string) => void;
  onBeatActivate?: (beatId: string, sceneId: string) => void;
}

const STATUS_LABELS: Record<string, string> = {
  outline: "Outline",
  draft: "Draft",
  revised: "Revised",
  locked: "Locked",
};

const keyFor = (kind: "act" | "sequence" | "scene" | "beat", id: string) => `${kind}:${id}`;

export default function SceneNavigator({
  title,
  scenes,
  structure,
  sceneMeta,
  omittedSceneIds,
  pageEstimates,
  activeSceneId,
  totalPages,
  canEdit,
  onSelect,
  onMoveScene,
  collapsedNodeIds,
  defaultCollapsedNodeIds,
  onCollapsedNodeIdsChange,
  selectedSceneId = null,
  selectedBeatId = null,
  onSceneActivate,
  onBeatActivate,
}: SceneNavigatorProps) {
  const [internalCollapsed, setInternalCollapsed] = useState<Set<string>>(() => new Set(defaultCollapsedNodeIds));
  const collapsed = collapsedNodeIds ?? internalCollapsed;
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const treeRef = useRef<HTMLUListElement>(null);
  const sceneById = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene])), [scenes]);
  const sceneIndexById = useMemo(() => new Map(scenes.map((scene, index) => [scene.id, index])), [scenes]);
  const omitted = useMemo(() => new Set(omittedSceneIds), [omittedSceneIds]);
  const displayActs = useMemo<StoryStructure["acts"]>(() => structure.acts.length
    ? structure.acts
    : [{ id: "__empty-act", title: "Act (empty)", sequences: [] }], [structure.acts]);
  const assignedSceneIds = useMemo(() => new Set(structure.acts.flatMap((act) => act.sequences.flatMap((sequence) => sequence.sceneIds))), [structure.acts]);
  const unassignedScenes = useMemo(() => scenes.filter((scene) => !assignedSceneIds.has(scene.id)), [assignedSceneIds, scenes]);
  const beatsByScene = useMemo(() => {
    const result = new Map<string, StoryStructure["beats"]>();
    for (const beat of structure.beats) result.set(beat.sceneId, [...(result.get(beat.sceneId) ?? []), beat]);
    return result;
  }, [structure.beats]);

  const toggleNode = useCallback((nodeKey: string) => {
    const next = new Set(collapsedNodeIds ?? internalCollapsed);
    if (next.has(nodeKey)) next.delete(nodeKey);
    else next.add(nodeKey);
    if (collapsedNodeIds === undefined) setInternalCollapsed(next);
    onCollapsedNodeIdsChange?.(next);
  }, [collapsedNodeIds, internalCollapsed, onCollapsedNodeIdsChange]);

  const visibleKeys = useMemo(() => {
    const keys: string[] = [];
    const appendScene = (scene: Scene) => {
      const sceneKey = keyFor("scene", scene.id);
      keys.push(sceneKey);
      if (!collapsed.has(sceneKey)) keys.push(...(beatsByScene.get(scene.id) ?? []).map((beat) => keyFor("beat", beat.id)));
    };
    for (const act of displayActs) {
      const actKey = keyFor("act", act.id);
      keys.push(actKey);
      if (collapsed.has(actKey)) continue;
      for (const sequence of act.sequences) {
        const sequenceKey = keyFor("sequence", sequence.id);
        keys.push(sequenceKey);
        if (!collapsed.has(sequenceKey)) {
          for (const sceneId of sequence.sceneIds) {
            const scene = sceneById.get(sceneId);
            if (scene) appendScene(scene);
          }
        }
      }
    }
    keys.push("unassigned");
    if (!collapsed.has("unassigned")) unassignedScenes.forEach(appendScene);
    return keys;
  }, [beatsByScene, collapsed, displayActs, sceneById, unassignedScenes]);

  const [focusedKey, setFocusedKey] = useState(() => {
    const activeKey = activeSceneId ? keyFor("scene", activeSceneId) : "";
    return visibleKeys.includes(activeKey) ? activeKey : visibleKeys[0] ?? "unassigned";
  });

  useEffect(() => {
    if (!visibleKeys.includes(focusedKey)) setFocusedKey(visibleKeys[0] ?? "unassigned");
  }, [focusedKey, visibleKeys]);

  const focusItem = (item: HTMLElement | undefined) => {
    if (!item?.dataset.treeKey) return;
    setFocusedKey(item.dataset.treeKey);
    item.focus();
  };

  const handleTreeKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const current = event.currentTarget;
    const items = [...(treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"][data-tree-key]:not([aria-disabled="true"])') ?? [])];
    const index = items.indexOf(current);
    const nodeKey = current.dataset.treeKey ?? "";
    const branch = current.dataset.treeBranch === "true";
    const expanded = current.getAttribute("aria-expanded") === "true";
    const childGroup = [...current.children].find((child) => child.getAttribute("role") === "group");
    const firstChild = childGroup?.querySelector<HTMLElement>('[role="treeitem"][data-tree-key]:not([aria-disabled="true"])') ?? undefined;
    const parentGroup = current.parentElement?.getAttribute("role") === "group" ? current.parentElement : undefined;
    const parentItem = parentGroup?.parentElement?.getAttribute("role") === "treeitem" ? parentGroup.parentElement : undefined;

    switch (event.key) {
      case "ArrowDown": focusItem(items[Math.min(items.length - 1, index + 1)]); break;
      case "ArrowUp": focusItem(items[Math.max(0, index - 1)]); break;
      case "Home": focusItem(items[0]); break;
      case "End": focusItem(items[items.length - 1]); break;
      case "ArrowRight":
        if (branch && !expanded) toggleNode(nodeKey);
        else if (branch && expanded) focusItem(firstChild);
        break;
      case "ArrowLeft":
        if (branch && expanded) toggleNode(nodeKey);
        else focusItem(parentItem);
        break;
      case "Enter":
      case " ":
        if (current.dataset.treeKind === "act" || current.dataset.treeKind === "sequence" || current.dataset.treeKind === "unassigned") toggleNode(nodeKey);
        else current.querySelector<HTMLButtonElement>(":scope > button")?.click();
        break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const itemProps = (nodeKey: string, kind: string, level: number, branch = false, label?: string) => ({
    role: "treeitem" as const,
    tabIndex: focusedKey === nodeKey ? 0 : -1,
    "aria-level": level,
    "aria-label": label,
    "data-tree-key": nodeKey,
    "data-tree-kind": kind,
    "data-tree-branch": branch ? "true" : "false",
    onFocus: () => setFocusedKey(nodeKey),
    onKeyDown: handleTreeKeyDown,
  });

  const activateScene = (sceneId: string) => (onSceneActivate ?? onSelect)(sceneId);

  const renderBeat = (beat: StoryStructure["beats"][number], sceneId: string, level: number) => {
    const nodeKey = keyFor("beat", beat.id);
    const selected = selectedBeatId === beat.id;
    const label = beat.text.trim() || "Untitled beat";
    return (
      <li
        {...itemProps(nodeKey, "beat", level, false, label)}
        key={beat.id}
        aria-selected={selected}
      >
        <button
          type="button"
          tabIndex={-1}
          className={`nav-beat ${selected ? "selected is-selected" : ""}`}
          onClick={() => {
            setFocusedKey(nodeKey);
            if (onBeatActivate) onBeatActivate(beat.id, sceneId);
            else activateScene(sceneId);
          }}
          title="Open beat"
        >
          <span className="nav-beat-dot" aria-hidden="true" />
          <span className="nav-beat-label">{label}</span>
        </button>
      </li>
    );
  };

  const renderScene = (scene: Scene, level: number) => {
    const meta = sceneMeta[scene.id];
    const beats = beatsByScene.get(scene.id) ?? [];
    const active = activeSceneId === scene.id;
    const selected = selectedSceneId === scene.id;
    const showSummary = Boolean(meta?.summary && (active || selected));
    const hasChildren = showSummary || beats.length > 0;
    const nodeKey = keyFor("scene", scene.id);
    const nodeCollapsed = collapsed.has(nodeKey);
    const isOmitted = omitted.has(scene.id);
    const sceneIndex = sceneIndexById.get(scene.id) ?? scene.number - 1;
    const label = `${scene.sceneNumber ?? scene.number} ${scene.heading || "Untitled scene"}`;
    return (
      <li
        {...itemProps(nodeKey, "scene", level, hasChildren, label)}
        key={scene.id}
        className={isOmitted ? "nav-omitted" : ""}
        aria-current={active ? "location" : undefined}
        aria-selected={selected}
        aria-expanded={hasChildren ? !nodeCollapsed : undefined}
      >
        <button
          type="button"
          tabIndex={-1}
          className={`nav-scene ${active ? "active is-active" : ""} ${selected ? "selected is-selected" : ""}`}
          draggable={canEdit}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            setDragFrom(sceneIndex);
          }}
          onDragOver={(event) => { if (canEdit) event.preventDefault(); }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragFrom !== null && dragFrom !== sceneIndex && canEdit) onMoveScene(dragFrom, sceneIndex);
            setDragFrom(null);
          }}
          onDragEnd={() => setDragFrom(null)}
          onClick={() => {
            setFocusedKey(nodeKey);
            activateScene(scene.id);
          }}
          title={canEdit ? "Open scene · drag to reorder" : "Open scene"}
        >
          {hasChildren ? (
            <span
              className="nav-tree-disclosure"
              aria-hidden="true"
              onClick={(event: MouseEvent<HTMLSpanElement>) => {
                event.stopPropagation();
                setFocusedKey(nodeKey);
                event.currentTarget.parentElement?.parentElement?.focus();
                toggleNode(nodeKey);
              }}
            >
              <Icon name={nodeCollapsed ? "chevron-right" : "chevron-down"} size={11} />
            </span>
          ) : <span className="nav-tree-disclosure-placeholder" aria-hidden="true" />}
          <span className="nav-scene-num">{scene.sceneNumber ?? scene.number}</span>
          <span className="nav-scene-heading">{scene.heading || "Untitled scene"}</span>
          {meta?.status && meta.status !== "draft" && (
            <span className={`nav-status nav-status-${meta.status}`} title={STATUS_LABELS[meta.status] ?? meta.status} />
          )}
          <span className="nav-scene-pages">{formatPages(pageEstimates.get(scene.id))}</span>
        </button>
        {hasChildren && !nodeCollapsed && (
          <>
            {showSummary && <div className="nav-scene-detail" role="note"><p className="nav-scene-summary">{meta?.summary}</p></div>}
            {beats.length > 0 && <ul className="nav-beats" role="group">{beats.map((beat) => renderBeat(beat, scene.id, level + 1))}</ul>}
          </>
        )}
      </li>
    );
  };

  const renderSequence = (sequence: StoryStructure["acts"][number]["sequences"][number]) => {
    const nodeKey = keyFor("sequence", sequence.id);
    const nodeCollapsed = collapsed.has(nodeKey);
    const label = sequence.title.trim() || "Untitled sequence";
    const sequenceScenes = sequence.sceneIds.flatMap((sceneId) => {
      const scene = sceneById.get(sceneId);
      return scene ? [scene] : [];
    });
    return (
      <li
        {...itemProps(nodeKey, "sequence", 2, true, label)}
        className="nav-sequence"
        key={sequence.id}
        aria-expanded={!nodeCollapsed}
      >
        <button
          type="button"
          tabIndex={-1}
          className="nav-sequence-label nav-tree-branch"
          onClick={(event) => {
            setFocusedKey(nodeKey);
            event.currentTarget.parentElement?.focus();
            toggleNode(nodeKey);
          }}
        >
          <Icon name={nodeCollapsed ? "chevron-right" : "chevron-down"} size={11} />
          <span>{label}</span>
        </button>
        {!nodeCollapsed && (
          <ul className="nav-scenes" role="group">
            {sequenceScenes.length ? sequenceScenes.map((scene) => renderScene(scene, 3)) : <EmptyTreeItem level={3}>Empty sequence</EmptyTreeItem>}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="scene-nav" aria-label="Scene navigator">
      <header className="nav-header">
        <span className="kicker">Scenes</span>
        <span className="nav-counts">{scenes.length} scene{scenes.length === 1 ? "" : "s"} · ~{totalPages} pg</span>
      </header>
      <div className="nav-doc-title" title={title}>{title}</div>

      <div className="nav-scroll">
        <ul className="scene-nav-tree" role="tree" aria-label={`${title} story structure`} aria-multiselectable="true" ref={treeRef}>
          {displayActs.map((act) => {
            const nodeKey = keyFor("act", act.id);
            const nodeCollapsed = collapsed.has(nodeKey);
            const actSceneCount = act.sequences.reduce((count, sequence) => count + sequence.sceneIds.filter((id) => sceneById.has(id)).length, 0);
            return (
              <li
                {...itemProps(nodeKey, "act", 1, true, act.title.trim() || "Untitled act")}
                className="nav-act"
                key={act.id}
                aria-expanded={!nodeCollapsed}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  className="nav-act-header nav-tree-branch"
                  onClick={(event) => {
                    setFocusedKey(nodeKey);
                    event.currentTarget.parentElement?.focus();
                    toggleNode(nodeKey);
                  }}
                >
                  <Icon name={nodeCollapsed ? "chevron-right" : "chevron-down"} size={12} />
                  <span className="nav-act-title">{act.title.trim() || "Untitled act"}</span>
                  <span className="nav-act-count">{actSceneCount}</span>
                </button>
                {!nodeCollapsed && (
                  <ul role="group">
                    {act.sequences.length ? act.sequences.map(renderSequence) : <EmptyTreeItem level={2}>No sequences in this act</EmptyTreeItem>}
                  </ul>
                )}
              </li>
            );
          })}

          <li
            {...itemProps("unassigned", "unassigned", 1, true, "Unassigned scenes")}
            className="nav-act nav-unassigned"
            aria-expanded={!collapsed.has("unassigned")}
          >
            <button
              type="button"
              tabIndex={-1}
              className="nav-act-header nav-tree-branch"
              onClick={(event) => {
                setFocusedKey("unassigned");
                event.currentTarget.parentElement?.focus();
                toggleNode("unassigned");
              }}
            >
              <Icon name={collapsed.has("unassigned") ? "chevron-right" : "chevron-down"} size={12} />
              <span className="nav-act-title">Unassigned scenes</span>
              <span className="nav-act-count">{unassignedScenes.length}</span>
            </button>
            {!collapsed.has("unassigned") && (
              <ul className="nav-scenes" role="group">
                {unassignedScenes.length ? unassignedScenes.map((scene) => renderScene(scene, 2)) : <EmptyTreeItem level={2}>No unassigned scenes</EmptyTreeItem>}
              </ul>
            )}
          </li>
        </ul>

        {!scenes.length && (
          <div className="nav-empty" role="status">
            No scenes yet.
            <span>Type <code>INT.</code> or <code>EXT.</code> to open your first scene.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyTreeItem({ level, children }: { level: number; children: string }) {
  return <li className="nav-tree-empty" role="treeitem" aria-level={level} aria-disabled="true">{children}</li>;
}

function formatPages(pages: number | undefined): string {
  if (!pages) return "";
  return pages < 1 ? "<1" : `${Math.round(pages)}`;
}
