/**
 * Contextual inspector: the right-hand panel of the Write workspace.
 * It follows the caret: current element, current scene, that scene's
 * development metadata, beats, and notes. Nothing global lives here; the
 * heavier workspaces have their own modes.
 */
import {
  ELEMENT_TYPES,
  elementLabels,
  parseHeading,
  type Scene,
  type ScreenplayBlock,
  type ScreenplayElementType,
  type StoryStructure,
  type WorkspaceData,
} from "../domain/index.ts";

interface ContextInspectorProps {
  activeBlock: ScreenplayBlock | null;
  activeScene: Scene | null;
  structure: StoryStructure;
  workspace: WorkspaceData;
  sceneNotes: Record<string, string>;
  canEdit: boolean;
  sourceMode: boolean;
  onSetType: (type: ScreenplayElementType) => void;
  onWorkspace: (patch: Partial<WorkspaceData>) => void;
  onSceneNote: (sceneId: string, text: string) => void;
}

export default function ContextInspector({
  activeBlock,
  activeScene,
  structure,
  workspace,
  sceneNotes,
  canEdit,
  sourceMode,
  onSetType,
  onWorkspace,
  onSceneNote,
}: ContextInspectorProps) {
  const meta = activeScene
    ? workspace.sceneMeta?.[activeScene.id] ?? { summary: "", tags: "", status: "draft" as const }
    : null;
  const setMeta = (patch: Partial<NonNullable<typeof meta>>) => {
    if (!activeScene || !meta) return;
    onWorkspace({ sceneMeta: { ...workspace.sceneMeta, [activeScene.id]: { ...meta, ...patch } } });
  };
  const heading = activeScene ? parseHeading(activeScene.heading) : null;
  const beats = activeScene ? structure.beats.filter((beat) => beat.sceneId === activeScene.id) : [];

  return (
    <div className="context-inspector">
      <section className="insp-section" aria-label="Current element">
        <span className="kicker">Element</span>
        <div className="element-grid" role="group" aria-label="Switch screenplay element">
          {ELEMENT_TYPES.map((type, index) => (
            <button
              key={type}
              type="button"
              className={`element-chip ${activeBlock?.type === type ? "active" : ""}`}
              disabled={!activeBlock || !canEdit || sourceMode}
              title={`${elementLabels[type]} | Ctrl+${index + 1}`}
              onClick={() => onSetType(type)}
            >
              {elementLabels[type]}
            </button>
          ))}
        </div>
        {!activeBlock && <p className="insp-hint">Click into the script to inspect the caret.</p>}
      </section>

      {activeScene && heading && meta ? (
        <fieldset className="insp-fieldset" disabled={!canEdit}>
          <section className="insp-section" aria-label="Scene">
            <span className="kicker">Scene {activeScene.sceneNumber ?? activeScene.number}</span>
            <h3 className="insp-scene-heading">{activeScene.heading || "Untitled scene"}</h3>
            <dl className="insp-facts">
              <div><dt>Set</dt><dd>{heading.intExt || "-"}</dd></div>
              <div><dt>Location</dt><dd>{heading.location || "-"}</dd></div>
              <div><dt>Time</dt><dd>{heading.timeOfDay || "-"}</dd></div>
              <div><dt>Cast</dt><dd>{activeScene.characters.join(", ") || "-"}</dd></div>
            </dl>

            <label className="insp-field">
              <span>Status</span>
              <select className="input" value={meta.status} onChange={(event) => setMeta({ status: event.target.value as typeof meta.status })}>
                <option value="outline">Outline</option>
                <option value="draft">Draft</option>
                <option value="revised">Revised</option>
                <option value="locked">Locked</option>
              </select>
            </label>
            <label className="insp-field">
              <span>Summary</span>
              <textarea className="input" value={meta.summary} placeholder="What happens, and why it matters…" onChange={(event) => setMeta({ summary: event.target.value })} />
            </label>
            <label className="insp-field">
              <span>Tags</span>
              <input className="input" value={meta.tags} placeholder="Comma separated" onChange={(event) => setMeta({ tags: event.target.value })} />
            </label>
          </section>

          <section className="insp-section" aria-label="Beats">
            <span className="kicker">Beats</span>
            {beats.length ? (
              <ul className="insp-beats">
                {beats.map((beat) => <li key={beat.id}>{beat.text}</li>)}
              </ul>
            ) : (
              <p className="insp-hint">Add a Note element inside the scene to record a beat.</p>
            )}
          </section>

          <section className="insp-section" aria-label="Scene notes">
            <span className="kicker">Notes</span>
            <textarea
              className="input insp-notes"
              value={sceneNotes[activeScene.id] ?? ""}
              placeholder="Continuity, research, reminders…"
              onChange={(event) => onSceneNote(activeScene.id, event.target.value)}
            />
          </section>
        </fieldset>
      ) : (
        <p className="insp-hint insp-empty">No scene yet. Start with a scene heading: INT. or EXT.</p>
      )}
    </div>
  );
}
