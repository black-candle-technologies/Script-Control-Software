/**
 * Scene navigator: the structural spine of the Write workspace.
 * Shows the real hierarchy (Act → Sequence → Scene → Beat) instead of a flat
 * list, keeps the default row restrained, and reveals beats for the active
 * scene only.
 */
import { useMemo, useState } from "react";
import type { Scene, StoryStructure, WorkspaceData } from "../domain/index.ts";
import Icon from "./Icons.tsx";

type SceneMeta = NonNullable<WorkspaceData["sceneMeta"]>[string];

interface SceneNavigatorProps {
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
}

const STATUS_LABELS: Record<string, string> = {
  outline: "Outline",
  draft: "Draft",
  revised: "Revised",
  locked: "Locked",
};

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
}: SceneNavigatorProps) {
  const [collapsedActs, setCollapsedActs] = useState<Set<string>>(new Set());
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const sceneById = useMemo(() => new Map(scenes.map((scene) => [scene.id, scene])), [scenes]);
  const omitted = useMemo(() => new Set(omittedSceneIds), [omittedSceneIds]);
  const assignedSceneIds = useMemo(() => new Set(structure.acts.flatMap((act) => act.sequences.flatMap((sequence) => sequence.sceneIds))), [structure.acts]);
  const unassignedScenes = scenes.filter((scene) => !assignedSceneIds.has(scene.id));

  const toggleAct = (actId: string) =>
    setCollapsedActs((current) => {
      const next = new Set(current);
      if (next.has(actId)) next.delete(actId);
      else next.add(actId);
      return next;
    });

  const renderScene = (scene: Scene) => {
    const meta = sceneMeta[scene.id];
    const beats = activeSceneId === scene.id ? structure.beats.filter((beat) => beat.sceneId === scene.id) : [];
    const isOmitted = omitted.has(scene.id);
    return (
      <li key={scene.id} className={isOmitted ? "nav-omitted" : ""}>
        <button
          type="button"
          className={`nav-scene ${activeSceneId === scene.id ? "active" : ""}`}
          draggable={canEdit}
          onDragStart={() => setDragFrom(scene.number - 1)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => {
            if (dragFrom !== null && canEdit) onMoveScene(dragFrom, scene.number - 1);
            setDragFrom(null);
          }}
          onClick={() => onSelect(scene.id)}
          title={canEdit ? "Open scene · drag to reorder" : "Open scene"}
        >
          <span className="nav-scene-num">{scene.sceneNumber ?? scene.number}</span>
          <span className="nav-scene-heading">{scene.heading || "Untitled scene"}</span>
          {meta?.status && meta.status !== "draft" && (
            <span className={`nav-status nav-status-${meta.status}`} title={STATUS_LABELS[meta.status] ?? meta.status} />
          )}
          <span className="nav-scene-pages">{formatPages(pageEstimates.get(scene.id))}</span>
        </button>
        {activeSceneId === scene.id && (meta?.summary || beats.length > 0) && (
          <div className="nav-scene-detail">
            {meta?.summary && <p className="nav-scene-summary">{meta.summary}</p>}
            {beats.length > 0 && (
              <ul className="nav-beats">
                {beats.map((beat) => (
                  <li key={beat.id}>{beat.text}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="scene-nav" aria-label="Scene navigator">
      <header className="nav-header">
        <span className="kicker">Scenes</span>
        <span className="nav-counts">
          {scenes.length} scene{scenes.length === 1 ? "" : "s"} · ~{totalPages} pg
        </span>
      </header>
      <div className="nav-doc-title" title={title}>{title}</div>

      <div className="nav-scroll">
        {structure.acts.map((act) => {
          const collapsed = collapsedActs.has(act.id);
          const actScenes = act.sequences.flatMap((sequence) => sequence.sceneIds);
          return (
            <section className="nav-act" key={act.id}>
              <button type="button" className="nav-act-header" onClick={() => toggleAct(act.id)} aria-expanded={!collapsed}>
                <Icon name={collapsed ? "chevron-right" : "chevron-down"} size={12} />
                <span className="nav-act-title">{act.title}</span>
                <span className="nav-act-count">{actScenes.length}</span>
              </button>
              {!collapsed &&
                act.sequences.map((sequence) => (
                  <div className="nav-sequence" key={sequence.id}>
                    {act.sequences.length > 1 && <div className="nav-sequence-label">{sequence.title}</div>}
                    <ol className="nav-scenes">
                      {sequence.sceneIds.flatMap((id) => {
                        const scene = sceneById.get(id);
                        return scene ? [renderScene(scene)] : [];
                      })}
                    </ol>
                  </div>
                ))}
            </section>
          );
        })}
        {!!unassignedScenes.length && (
          <section className="nav-act nav-unassigned">
            <div className="nav-act-header">
              <span className="nav-act-title">Unassigned scenes</span>
              <span className="nav-act-count">{unassignedScenes.length}</span>
            </div>
            <ol className="nav-scenes">
              {unassignedScenes.map(renderScene)}
            </ol>
          </section>
        )}
        {!scenes.length && (
          <div className="nav-empty">
            No scenes yet.
            <span>Type <code>INT.</code> or <code>EXT.</code> to open your first scene.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function formatPages(pages: number | undefined): string {
  if (!pages) return "";
  return pages < 1 ? "<1" : `${Math.round(pages)}`;
}
