import { useMemo, useState } from "react";
import TeamPanel, { type CollaborationSyncControls } from "./TeamPanel.tsx";
import {
  createManualObjectOverride,
  moveStoryScene,
  nextRevisionColor,
  parseHeading,
  REVISION_COLORS,
  type Breakdown,
  type AnalysisCsvSection,
  type AnalysisEntityKind,
  type CharacterRef,
  type ContinuityRecord,
  type CustomStoryStructure,
  type DetectedObject,
  type EntityOverride,
  type EpisodeMeta,
  type LocationRef,
  type Scene,
  type ScreenplayBlock,
  type ScreenplayDocument,
  type MergeConflict,
  type MergeResolutionPlan,
  type ProjectSnapshot,
  type ProjectSession,
  type ProjectWorkspace,
  type ProductionExportKind,
  type ProductionPage,
  type ProductionReports,
  type RevisionColor,
  type RevisionSet,
  type ProductionRevisionSummary,
  type SeriesWorkspaceReport,
  type ScriptAnalysis,
  type SnapshotComparison,
  type SnapshotDiffMode,
  type SnapshotScope,
  type StoryBoardView,
  type StoryLine,
  type TreatmentDocument,
  treatmentSections,
  type VersionHistory,
  type WorkspaceData,
} from "../domain/index.ts";

interface InspectorProps {
  scenes: Scene[];
  characters: CharacterRef[];
  locations: LocationRef[];
  objects: DetectedObject[];
  customStructure: CustomStoryStructure;
  breakdown: Breakdown;
  analysis: ScriptAnalysis;
  activeScene: Scene | null;
  workspace: WorkspaceData;
  onWorkspace: (patch: Partial<WorkspaceData>) => void;
  onJumpToScene: (sceneId: string) => void;
  versionHistory: VersionHistory;
  versionComparison: SnapshotComparison | null;
  mergeConflicts: MergeConflict[];
  mergePreviewReady: boolean;
  mergePreviewSourceId: string;
  onSaveVersion: (name: string, description: string, milestone: boolean, scope: SnapshotScope) => void;
  onRestoreVersion: (version: ProjectSnapshot) => void;
  onCompareVersions: (fromId: string, toId: string, mode: SnapshotDiffMode) => void;
  onCreateAlternateDraft: (name: string, fromSnapshotId: string) => void;
  onSwitchAlternateDraft: (branchId: string) => void;
  onSelectCombineDraftSource: (sourceBranchId: string) => void;
  onPreviewCombineDrafts: (sourceBranchId: string) => void;
  onCombineDrafts: (sourceBranchId: string, resolution: MergeResolutionPlan) => void;
  onCancelCombineDrafts: () => void;
  onExportBreakdown: (format: "md" | "csv" | "json" | "pdf", section?: AnalysisCsvSection) => void;
  onExportTreatment: (format: "md" | "pdf") => void;
  projectWorkspace: ProjectWorkspace;
  seriesReport: SeriesWorkspaceReport;
  activeDocumentId: string;
  onProjectWorkspace: (patch: Partial<ProjectWorkspace>) => void;
  onSelectEpisode: (documentId: string) => void;
  productionPages: ProductionPage[];
  productionReports: ProductionReports;
  revisionSets: RevisionSet[];
  revisionSummaries: ProductionRevisionSummary[];
  onStartRevision: (label: string, color: RevisionColor) => void;
  onUpdateRevisionMarks: (revisionId: string) => void;
  onLockPages: () => void;
  onUnlockPages: () => void;
  onPrintRevisionPages: () => void;
  onToggleOmittedScene: (sceneId: string) => void;
  onSetSceneNumber: (sceneId: string, number: string) => void;
  onExportProduction: (kind: ProductionExportKind, targetId?: string) => void;
  editable: boolean;
  collaborationSession: ProjectSession;
  onCollaborationSession: (session: ProjectSession) => void;
  onCollaborationTarget: (documentId: string, targetId?: string) => void;
  onCollaborationMessage: (message: string) => void;
  collaborationSync: CollaborationSyncControls;
}

/** Workspace panels the mode shell can host full-width. */
export type PanelTab = "Story" | "Treatment" | "Cast" | "Props" | "Places" | "Drafts" | "Breakdown" | "Series" | "Production" | "Team" | "Assist";
const Hint = ({ children }: { children: React.ReactNode }) => <p className="insp-hint">{children}</p>;

function formatDiffValue(value: unknown): string {
  if (value === undefined) return "Not present";
  if (value === null) return "null";
  if (typeof value === "string") return value || "(empty string)";
  if (typeof value !== "object") return String(value);
  const block = value as Partial<ScreenplayBlock>;
  if (typeof block.type === "string" && typeof block.text === "string") return `${block.type.replace(/_/g, " ")}\n${block.text || "(empty block)"}`;
  return JSON.stringify(value, null, 2);
}

function formatDocumentDiff(document?: ScreenplayDocument): string {
  if (!document) return "Not present";
  const scenes = document.blocks.filter((block) => block.type === "scene_heading").length;
  return `${document.titlePage.title || "Untitled"}\n${document.blocks.length} blocks · ${scenes} scenes`;
}

const snapshotScopeLabel = (scope?: SnapshotScope) => !scope || scope.kind === "project"
  ? "whole project"
  : scope.kind === "episode"
    ? `episode · ${scope.documentId}`
    : scope.kind === "season"
      ? `season · ${scope.seasonId}`
      : "show bible";

/**
 * Hosts one workspace panel full-width inside a mode. All of these panels used
 * to be tabs of a cramped fixed sidebar; the mode shell now gives each one a
 * real workspace surface.
 */
export default function PanelHost({ tab, ...props }: InspectorProps & { tab: PanelTab }) {
  return <div className="panel-host">
    {tab !== "Team" && tab !== "Assist" && <fieldset className="permission-scope" disabled={!props.editable}>
      {tab === "Story" && <StoryWorkspaceTab {...props} />}
      {tab === "Treatment" && <TreatmentWorkspaceTab {...props} />}
      {tab === "Cast" && <CastTab {...props} />}
      {tab === "Props" && <PropsTab {...props} />}
      {tab === "Places" && <PlacesTab {...props} />}
      {tab === "Drafts" && <DraftsTab {...props} />}
      {tab === "Breakdown" && <BreakdownTab {...props} />}
      {tab === "Series" && <SeriesTab {...props} />}
      {tab === "Production" && <ProductionTab {...props} />}
    </fieldset>}
    {tab === "Team" && <TeamPanel session={props.collaborationSession} activeScene={props.activeScene} onSession={props.onCollaborationSession} onOpenTarget={props.onCollaborationTarget} onMessage={props.onCollaborationMessage} sync={props.collaborationSync} />}
    {tab === "Assist" && <AssistTab {...props} />}
  </div>;
}

function StoryWorkspaceTab({ customStructure, scenes, workspace, onWorkspace, onJumpToScene }: InspectorProps) {
  const [draggedStoryScene, setDraggedStoryScene] = useState<string | null>(null);
  const view = workspace.storyBoardView ?? "scene";
  const save = (next: CustomStoryStructure) => onWorkspace({ storyStructure: next });
  const updateAct = (id: string, title: string) => save({
    ...customStructure,
    acts: customStructure.acts.map((act) => act.id === id ? { ...act, title } : act),
  });
  const addAct = () => save({
    ...customStructure,
    acts: [...customStructure.acts, { id: `act-${crypto.randomUUID()}`, title: `Act ${customStructure.acts.length + 1}` }],
  });
  const removeAct = (id: string) => {
    if (customStructure.acts.length === 1) return;
    const replacement = customStructure.acts.find((act) => act.id !== id)!;
    save({
      ...customStructure,
      acts: customStructure.acts.filter((act) => act.id !== id),
      sequences: customStructure.sequences.map((sequence) => sequence.actId === id ? { ...sequence, actId: replacement.id } : sequence),
    });
  };
  const addSequence = () => save({
    ...customStructure,
    sequences: [...customStructure.sequences, {
      id: `sequence-${crypto.randomUUID()}`,
      actId: customStructure.acts[0].id,
      title: `Sequence ${customStructure.sequences.length + 1}`,
      sceneIds: [],
    }],
  });
  const updateSequence = (id: string, patch: Partial<CustomStoryStructure["sequences"][number]>) => save({
    ...customStructure,
    sequences: customStructure.sequences.map((sequence) => sequence.id === id ? { ...sequence, ...patch } : sequence),
  });
  const assignScene = (sequenceId: string, sceneId: string) => save({
    ...customStructure,
    sequences: customStructure.sequences.map((sequence) => ({
      ...sequence,
      sceneIds: sequence.id === sequenceId
        ? [...sequence.sceneIds.filter((id) => id !== sceneId), sceneId]
        : sequence.sceneIds.filter((id) => id !== sceneId),
    })),
  });
  const addBeat = () => save({
    ...customStructure,
    beats: [...customStructure.beats, { id: `beat-${crypto.randomUUID()}`, text: "New beat", sceneId: scenes[0]?.id, status: "idea", moments: [] }],
  });
  const updateBeat = (id: string, patch: Partial<CustomStoryStructure["beats"][number]>) => save({
    ...customStructure,
    beats: customStructure.beats.map((beat) => beat.id === id ? { ...beat, ...patch } : beat),
  });
  const orderedScenes = customStructure.sceneOrder
    .map((id) => scenes.find((scene) => scene.id === id))
    .filter((scene): scene is Scene => Boolean(scene));

  return <div className="insp-stack">
    <Hint>Custom Act → Sequence → Scene → Beat → Moment structure stays beside the screenplay, so outlining never rewrites script text.</Hint>
    <div className="board-view-switch">
      {(["act", "sequence", "scene", "beat", "timeline"] as StoryBoardView[]).map((name) =>
        <button key={name} className={`btn btn-ghost ${view === name ? "active" : ""}`} onClick={() => onWorkspace({ storyBoardView: name })}>{name[0].toUpperCase() + name.slice(1)}</button>,
      )}
    </div>
    {view === "act" && <>
      <button className="btn" onClick={addAct}>Add Act</button>
      {customStructure.acts.map((act) => <div className="insp-card" key={act.id}>
        <input aria-label="Act title" className="insp-notes-input" value={act.title} onChange={(event) => updateAct(act.id, event.target.value)} />
        <div className="insp-card-meta">{customStructure.sequences.filter((sequence) => sequence.actId === act.id).length} sequences · {customStructure.sequences.filter((sequence) => sequence.actId === act.id).flatMap((sequence) => sequence.sceneIds).length} scenes</div>
        <button className="link-btn" disabled={customStructure.acts.length === 1} onClick={() => removeAct(act.id)}>Remove</button>
      </div>)}
    </>}
    {view === "sequence" && <>
      <button className="btn" onClick={addSequence}>Add Sequence</button>
      {customStructure.sequences.map((sequence) => <div className="insp-card" key={sequence.id}>
        <input aria-label="Sequence title" className="insp-notes-input" value={sequence.title} onChange={(event) => updateSequence(sequence.id, { title: event.target.value })} />
        <select className="element-select" aria-label="Parent act" value={sequence.actId} onChange={(event) => updateSequence(sequence.id, { actId: event.target.value })}>
          {customStructure.acts.map((act) => <option key={act.id} value={act.id}>{act.title}</option>)}
        </select>
        {scenes.map((scene) => <label className="check-row" key={scene.id}><input type="radio" name={`scene-${scene.id}`} checked={sequence.sceneIds.includes(scene.id)} onChange={() => assignScene(sequence.id, scene.id)} /> {scene.heading}</label>)}
        <button className="link-btn" disabled={customStructure.sequences.length === 1} onClick={() => save({ ...customStructure, sequences: customStructure.sequences.filter((item) => item.id !== sequence.id) })}>Remove</button>
      </div>)}
    </>}
    {view === "scene" && <div className="story-card-grid">
      {orderedScenes.map((scene, index) => <div className="insp-card" key={scene.id} draggable onDragStart={() => setDraggedStoryScene(scene.id)} onDragEnd={() => setDraggedStoryScene(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedStoryScene && draggedStoryScene !== scene.id) save(moveStoryScene(customStructure, draggedStoryScene, index)); setDraggedStoryScene(null); }}>
        <button className="link-btn insp-card-title" onClick={() => onJumpToScene(scene.id)}>Scene {scene.number} · {scene.heading}</button>
        <div className="insp-card-meta">{workspace.sceneMeta?.[scene.id]?.summary || "No summary"}</div>
        <div className="insp-card-meta">Drag to rearrange metadata order.</div><div className="btn-row"><button className="btn btn-ghost" disabled={index === 0} onClick={() => save(moveStoryScene(customStructure, scene.id, index - 1))}>↑</button><button className="btn btn-ghost" disabled={index === orderedScenes.length - 1} onClick={() => save(moveStoryScene(customStructure, scene.id, index + 1))}>↓</button></div>
      </div>)}
    </div>}
    {view === "beat" && <>
      <button className="btn" onClick={addBeat}>Add Beat</button>
      {customStructure.beats.map((beat) => <div className="insp-card" key={beat.id}>
        <textarea className="insp-notes-input" value={beat.text} onChange={(event) => updateBeat(beat.id, { text: event.target.value })} />
        <select className="element-select" aria-label="Beat placement" value={beat.sceneId ? `scene:${beat.sceneId}` : beat.sequenceId ? `sequence:${beat.sequenceId}` : ""} onChange={(event) => { const [kind, id] = event.target.value.split(":"); updateBeat(beat.id, { sceneId: kind === "scene" ? id : undefined, sequenceId: kind === "sequence" ? id : undefined }); }}>
          <option value="">Unplaced</option>
          <optgroup label="Scenes">{scenes.map((scene) => <option value={`scene:${scene.id}`} key={scene.id}>{scene.heading}</option>)}</optgroup>
          <optgroup label="Sequences">{customStructure.sequences.map((sequence) => <option value={`sequence:${sequence.id}`} key={sequence.id}>{sequence.title}</option>)}</optgroup>
        </select>
        <select className="element-select" value={beat.status} onChange={(event) => updateBeat(beat.id, { status: event.target.value as typeof beat.status })}><option value="idea">Idea</option><option value="drafted">Drafted</option><option value="complete">Complete</option></select>
        <h4>Moments</h4>
        {beat.moments.map((moment) => <input key={moment.id} className="insp-notes-input" value={moment.text} onChange={(event) => updateBeat(beat.id, { moments: beat.moments.map((item) => item.id === moment.id ? { ...item, text: event.target.value } : item) })} />)}
        <div className="btn-row"><button className="btn btn-ghost" onClick={() => updateBeat(beat.id, { moments: [...beat.moments, { id: `moment-${crypto.randomUUID()}`, text: "New moment" }] })}>Add Moment</button><button className="link-btn" onClick={() => save({ ...customStructure, beats: customStructure.beats.filter((item) => item.id !== beat.id) })}>Remove Beat</button></div>
      </div>)}
    </>}
    {view === "timeline" && <ol className="timeline-list">
      {orderedScenes.map((scene) => { const heading = parseHeading(scene.heading); return <li key={scene.id}><button className="link-btn" onClick={() => onJumpToScene(scene.id)}>{scene.heading}</button><span>{heading.timeOfDay || "Unspecified time"}</span>{customStructure.beats.filter((beat) => beat.sceneId === scene.id).map((beat) => <small key={beat.id}>{beat.text}</small>)}</li>; })}
    </ol>}
  </div>;
}

function TreatmentWorkspaceTab({ workspace, onWorkspace, onExportTreatment, scenes, characters, objects, locations, customStructure }: InspectorProps) {
  type LinkType = TreatmentDocument["links"][number]["targetType"];
  const documents: TreatmentDocument[] = workspace.treatments?.length
    ? workspace.treatments
    : [{ id: "treatment-main", title: "Treatment", markdown: workspace.treatment, links: [] }];
  const active = documents.find((document) => document.id === workspace.activeTreatmentId) ?? documents[0];
  const [linkType, setLinkType] = useState<LinkType>("scene");
  const [linkTarget, setLinkTarget] = useState("");
  const [linkSection, setLinkSection] = useState("");
  const sections = treatmentSections(active.markdown);
  const targets: Record<LinkType, { id: string; label: string }[]> = {
    act: customStructure.acts.map((act) => ({ id: act.id, label: act.title })),
    sequence: customStructure.sequences.map((sequence) => ({ id: sequence.id, label: sequence.title })),
    scene: scenes.map((scene) => ({ id: scene.id, label: scene.heading })),
    beat: customStructure.beats.map((beat) => ({ id: beat.id, label: beat.text })),
    character: characters.map((character) => ({ id: character.name, label: character.name })),
    object: objects.map((object) => ({ id: object.id, label: object.name })),
    location: locations.map((location) => ({ id: location.name, label: location.name })),
  };
  const saveDocuments = (next: TreatmentDocument[], activeId = active.id) => onWorkspace({
    treatments: next,
    activeTreatmentId: activeId,
    treatment: next[0]?.markdown ?? "",
  });
  const update = (patch: Partial<TreatmentDocument>) => saveDocuments(
    documents.map((document) => document.id === active.id ? { ...document, ...patch } : document),
  );
  const addLink = () => {
    const target = targets[linkType].find((item) => item.id === linkTarget) ?? targets[linkType][0];
    if (!target) return;
    const section = sections.find((item) => item.id === linkSection);
    update({ links: [...active.links, { id: `link-${crypto.randomUUID()}`, targetType: linkType, targetId: target.id, label: target.label, ...(section ? { sectionId: section.id, sectionLabel: section.label } : {}) }] });
  };

  return <div className="insp-stack">
    <Hint>Markdown treatment documents can carry explicit links to story structure and recognized entities.</Hint>
    <div className="btn-row">
      <select className="element-select" value={active.id} onChange={(event) => onWorkspace({ activeTreatmentId: event.target.value })}>
        {documents.map((document) => <option key={document.id} value={document.id}>{document.title}</option>)}
      </select>
      <button className="btn" onClick={() => { const id = `treatment-${crypto.randomUUID()}`; saveDocuments([...documents, { id, title: `Treatment ${documents.length + 1}`, markdown: "", links: [] }], id); }}>New</button>
    </div>
    <input className="insp-notes-input" aria-label="Treatment title" value={active.title} onChange={(event) => update({ title: event.target.value })} />
    <textarea className="insp-notes-input treatment-input" value={active.markdown} placeholder="# Treatment\n\n## Act I\n…" onChange={(event) => update({ markdown: event.target.value })} />
    <h4>Linked references</h4>
    <select className="element-select" aria-label="Treatment section" value={sections.some((section) => section.id === linkSection) ? linkSection : ""} onChange={(event) => setLinkSection(event.target.value)}><option value="">Whole treatment</option>{sections.map((section) => <option key={section.id} value={section.id}>{"—".repeat(section.level - 1)} {section.label}</option>)}</select>
    <div className="btn-row">
      <select className="element-select" value={linkType} onChange={(event) => { setLinkType(event.target.value as LinkType); setLinkTarget(""); }}>{Object.keys(targets).map((type) => <option key={type} value={type}>{type}</option>)}</select>
      <select className="element-select" value={linkTarget} onChange={(event) => setLinkTarget(event.target.value)}><option value="">Choose…</option>{targets[linkType].map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select>
      <button className="btn btn-ghost" onClick={addLink}>Link</button>
    </div>
    {active.links.map((link) => <div className="chip" key={link.id}>{link.sectionLabel ? `${link.sectionLabel} → ` : ""}{link.targetType}: {link.label}<button className="link-btn" aria-label={`Remove ${link.label} link`} onClick={() => update({ links: active.links.filter((item) => item.id !== link.id) })}>×</button></div>)}
    <div className="btn-row">
      <button className="btn" onClick={() => onExportTreatment("md")}>Export Markdown</button>
      <button className="btn btn-ghost" onClick={() => onExportTreatment("pdf")}>Print PDF</button>
      <button className="link-btn" disabled={documents.length === 1} onClick={() => { const next = documents.filter((document) => document.id !== active.id); saveDocuments(next, next[0].id); }}>Delete</button>
    </div>
  </div>;
}

type ManagedEntity = { id: string; name: string; status: string; sceneNumbers: number[] };

function EntityControls({ kind, entity, peers, workspace, onWorkspace }: {
  kind: AnalysisEntityKind;
  entity: ManagedEntity;
  peers: ManagedEntity[];
  workspace: WorkspaceData;
  onWorkspace: (patch: Partial<WorkspaceData>) => void;
}) {
  const [rename, setRename] = useState(entity.name);
  const [mergeTarget, setMergeTarget] = useState("");
  const [splitName, setSplitName] = useState("");
  const [splitScenes, setSplitScenes] = useState("");
  const apply = (override: EntityOverride) => onWorkspace({ entityOverrides: [...(workspace.entityOverrides ?? []), override] });
  const parsedScenes = [...new Set(splitScenes.split(",").map(Number).filter((number) => Number.isInteger(number) && entity.sceneNumbers.includes(number)))];
  return <details>
    <summary className="link-btn">Manage entity</summary>
    <div className="insp-stack">
      <div className="btn-row"><button className="btn" onClick={() => apply({ action: "confirm", kind, entityId: entity.id })}>{entity.status === "confirmed" ? "Confirmed" : "Confirm"}</button><button className="btn btn-ghost" onClick={() => apply({ action: "reject", kind, entityId: entity.id })}>Reject</button></div>
      <label className="insp-card-meta">Canonical name<input className="insp-notes-input" value={rename} onChange={(event) => setRename(event.target.value)} /></label>
      <button className="btn btn-ghost" disabled={!rename.trim() || rename.trim().toUpperCase() === entity.name} onClick={() => apply({ action: "rename", kind, entityId: entity.id, name: rename })}>Rename</button>
      <label className="insp-card-meta">Merge into<select className="element-select" value={mergeTarget} onChange={(event) => setMergeTarget(event.target.value)}><option value="">Choose entity…</option>{peers.filter((peer) => peer.id !== entity.id && peer.status !== "merged").map((peer) => <option key={peer.id} value={peer.id}>{peer.name}</option>)}</select></label>
      <button className="btn btn-ghost" disabled={!mergeTarget} onClick={() => apply({ action: "merge", kind, entityId: entity.id, targetId: mergeTarget })}>Merge</button>
      <label className="insp-card-meta">Split name<input className="insp-notes-input" value={splitName} onChange={(event) => setSplitName(event.target.value)} placeholder="New entity name" /></label>
      <label className="insp-card-meta">Move scenes<input className="insp-notes-input" value={splitScenes} onChange={(event) => setSplitScenes(event.target.value)} placeholder={`Comma-separated: ${entity.sceneNumbers.join(", ")}`} /></label>
      <button className="btn btn-ghost" disabled={!splitName.trim() || !parsedScenes.length || parsedScenes.length === entity.sceneNumbers.length} onClick={() => apply({ action: "split", kind, entityId: entity.id, newId: `${kind}-${crypto.randomUUID()}`, name: splitName, sceneNumbers: parsedScenes })}>Split</button>
    </div>
  </details>;
}

function EntityNote({ entityId, workspace, onWorkspace }: Pick<InspectorProps, "workspace" | "onWorkspace"> & { entityId: string }) {
  const notes = workspace.entityNotes ?? {};
  return <textarea className="insp-notes-input" value={notes[entityId] ?? ""} placeholder="Profile and continuity notes…" onChange={(event) => onWorkspace({ entityNotes: { ...notes, [entityId]: event.target.value } })} />;
}

function CastTab({ analysis, workspace, onWorkspace }: InspectorProps) {
  const characters = analysis.entities.characters;
  if (!characters.length) return <Hint>No character cues detected.</Hint>;
  return <div className="insp-stack"><Hint>Character sheets are derived from cues and dialogue; corrections remain editable project metadata.</Hint>{characters.map((character) => <details className="insp-card" key={character.id} open={characters.length <= 3 && character.status !== "rejected"}>
    <summary className="insp-card-title">{character.name} <small>· {character.status}</small></summary>
    <div className="insp-card-meta">{character.sceneCount} scenes · {character.cueCount} cues · {character.dialogueWords} dialogue words · first/last {character.firstScene}/{character.lastScene}</div>
    {character.firstDescription && <p className="insp-card-desc">{character.firstDescription}</p>}
    {!!character.aliases.length && <p className="insp-card-desc">Aliases: {character.aliases.join(", ")}</p>}
    {!!character.coAppearances.length && <p className="insp-card-desc">Co-appears: {character.coAppearances.map((item) => `${item.character} (${item.count})`).join(", ")}</p>}
    {!!character.absenceGaps.length && <p className="insp-card-desc">Continuity gaps: {character.absenceGaps.map((gap) => `${gap.scenesAbsent} scenes after ${gap.afterScene}`).join(", ")}</p>}
    <EntityNote entityId={character.id} workspace={workspace} onWorkspace={onWorkspace} />
    <EntityControls kind="character" entity={character} peers={characters} workspace={workspace} onWorkspace={onWorkspace} />
    <details><summary className="link-btn">Dialogue ({character.dialogueLines.length})</summary>{character.dialogueLines.map((line) => <p key={line.blockId} className="insp-card-desc"><strong>Scene {line.sceneNumber}:</strong> {line.text}</p>)}</details>
  </details>)}</div>;
}

function PropsTab({ analysis, workspace, onWorkspace }: InspectorProps) {
  const objects = analysis.entities.objects;
  const [manualName, setManualName] = useState("");
  const [manualCategory, setManualCategory] = useState("prop");
  const addManualObject = () => {
    const override = createManualObjectOverride(manualName, manualCategory);
    const entityOverrides = (workspace.entityOverrides ?? []).filter((item) => !(item.action === "add" && item.kind === "object" && item.entityId === override.entityId));
    onWorkspace({ entityOverrides: [...entityOverrides, override] });
    setManualName("");
  };
  return <div className="insp-stack"><Hint>Object sheets include associations, likely ownership, and every continuity appearance. Add an item manually when prose recognition has no signal.</Hint>
    <div className="insp-card"><div className="insp-card-title">Add object or prop</div><input aria-label="Manual object name" className="insp-notes-input" value={manualName} placeholder="Hero watch" onChange={(event) => setManualName(event.target.value)} /><div className="btn-row"><select aria-label="Manual object category" className="element-select" value={manualCategory} onChange={(event) => setManualCategory(event.target.value)}><option value="prop">Prop</option><option value="wardrobe">Wardrobe</option><option value="weapon">Weapon</option><option value="vehicle">Vehicle</option><option value="animal">Animal</option></select><button className="btn" disabled={!manualName.trim()} onClick={addManualObject}>Add Object</button></div></div>
    {!objects.length && <Hint>No production objects detected or added yet.</Hint>}{objects.map((object) => <details className="insp-card" key={object.id} open={objects.length <= 3 && object.status !== "rejected"}>
    <summary className="insp-card-title">{object.name} <small>· {object.status}</small></summary>
    <div className="insp-card-meta">{object.productionCategory} · {object.mentions} mentions · scenes {object.sceneNumbers.join(", ") || "—"} · {Math.round(object.confidence * 100)}%</div>
    {object.likelyOwner && <p className="insp-card-desc">Likely owner: {object.likelyOwner}</p>}
    {!!object.associations.length && <p className="insp-card-desc">Associations: {object.associations.map((item) => `${item.character} (${item.reason})`).join(", ")}</p>}
    <EntityNote entityId={object.id} workspace={workspace} onWorkspace={onWorkspace} />
    <EntityControls kind="object" entity={object} peers={objects} workspace={workspace} onWorkspace={onWorkspace} />
    <details><summary className="link-btn">Continuity ({object.continuity.length})</summary>{object.continuity.map((entry) => <p key={entry.blockId} className="insp-card-desc"><strong>Scene {entry.sceneNumber}:</strong> {entry.excerpt}{entry.ownershipCharacters.length ? ` · owner signal: ${entry.ownershipCharacters.join(", ")}` : ""}</p>)}</details>
  </details>)}</div>;
}

function PlacesTab({ analysis, workspace, onWorkspace }: InspectorProps) {
  const locations = analysis.entities.locations;
  if (!locations.length) return <Hint>No locations detected.</Hint>;
  return <div className="insp-stack"><Hint>Location sheets normalize repeated headings while preserving aliases and usage details.</Hint>{locations.map((location) => <details className="insp-card" key={location.id} open={locations.length <= 3 && location.status !== "rejected"}>
    <summary className="insp-card-title">{location.name} <small>· {location.status}</small></summary>
    <div className="insp-card-meta">{location.interiorExterior.join(" / ") || "—"} · {location.timesOfDay.join(" / ") || "time unspecified"} · scenes {location.sceneNumbers.join(", ")}</div>
    {!!location.aliases.length && <p className="insp-card-desc">Aliases: {location.aliases.join(", ")}</p>}
    <EntityNote entityId={location.id} workspace={workspace} onWorkspace={onWorkspace} />
    <EntityControls kind="location" entity={location} peers={locations} workspace={workspace} onWorkspace={onWorkspace} />
    <details><summary className="link-btn">Appearances ({location.appearances.length})</summary>{location.appearances.map((entry) => <p key={entry.sceneId} className="insp-card-desc">Scene {entry.sceneNumber}: {entry.heading}</p>)}</details>
  </details>)}</div>;
}

function DraftsTab({ versionHistory, versionComparison, mergeConflicts, mergePreviewReady, mergePreviewSourceId, onSaveVersion, onRestoreVersion, onCompareVersions, onCreateAlternateDraft, onSwitchAlternateDraft, onSelectCombineDraftSource, onPreviewCombineDrafts, onCombineDrafts, onCancelCombineDrafts, collaborationSession, projectWorkspace, activeDocumentId }: InspectorProps) {
  const snapshots = [...versionHistory.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const projectSnapshots = snapshots.filter((snapshot) => !snapshot.scope || snapshot.scope.kind === "project");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [milestone, setMilestone] = useState(false);
  const [snapshotScope, setSnapshotScope] = useState<SnapshotScope["kind"]>("project");
  const [alternateName, setAlternateName] = useState("");
  const [alternateBase, setAlternateBase] = useState("");
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("");
  const [compareMode, setCompareMode] = useState<SnapshotDiffMode>("scene");
  const [mergeResolutions, setMergeResolutions] = useState<Record<string, "ours" | "theirs">>({});
  const activeBranch = versionHistory.branches.find((branch) => branch.id === versionHistory.activeBranchId);
  const defaultAlternateBase = projectSnapshots.some((snapshot) => snapshot.id === activeBranch?.headSnapshotId)
    ? activeBranch!.headSnapshotId
    : projectSnapshots[0]?.id ?? "";
  const milestones = new Map(versionHistory.milestones.map((item) => [item.snapshotId, item]));
  const save = () => {
    const label = name.trim() || `Draft ${versionHistory.snapshots.length + 1}`;
    const episode = projectWorkspace.series.episodes[activeDocumentId];
    const scope: SnapshotScope = snapshotScope === "episode"
      ? { kind: "episode", documentId: activeDocumentId }
      : snapshotScope === "season"
        ? { kind: "season", seasonId: episode?.seasonId ?? projectWorkspace.series.seasons[0]?.id ?? "" }
        : snapshotScope === "show-bible"
          ? { kind: "show-bible" }
          : { kind: "project" };
    onSaveVersion(label, description, milestone, scope);
    setName(""); setDescription(""); setMilestone(false);
  };
  const modes: { value: SnapshotDiffMode; label: string }[] = [
    { value: "page", label: "Script pages" }, { value: "scene", label: "Scenes" }, { value: "dialogue", label: "Dialogue only" },
    { value: "structure", label: "Structure" }, { value: "character", label: "Characters" }, { value: "object", label: "Objects / props" },
    { value: "treatment", label: "Treatments" }, { value: "episode", label: "Episodes" }, { value: "season", label: "Season" }, { value: "show-bible", label: "Show bible" },
    { value: "document", label: "Documents" }, { value: "block", label: "All script blocks" }, { value: "metadata", label: "All metadata" },
  ];
  return <div className="insp-stack">
    <Hint>Project History snapshots every episode and shared project field. Alternate Drafts branch safely and can be combined with explicit conflict preference.</Hint>
    <h4>Save Draft Version</h4>
    <input className="insp-notes-input" value={name} placeholder={`Draft ${versionHistory.snapshots.length + 1} name`} onChange={(event) => setName(event.target.value)} />
    <textarea className="insp-notes-input" value={description} placeholder="What changed?" onChange={(event) => setDescription(event.target.value)} />
    {collaborationSession.projectType === "television" && <label className="insp-card-meta">Version scope<select aria-label="Version scope" className="element-select" value={snapshotScope} onChange={(event) => setSnapshotScope(event.target.value as SnapshotScope["kind"])}><option value="project">Whole project</option><option value="episode">Active episode</option><option value="season">Active season</option><option value="show-bible">Show bible</option></select></label>}
    <label className="check-row"><input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} /> Mark as milestone</label>
    <button className="btn btn-primary" onClick={save}>Save Draft Version</button>
    {!!versionHistory.branches.length && <><h4>Alternate Drafts</h4><label className="insp-card-meta">Working draft<select className="element-select" value={versionHistory.activeBranchId} onChange={(event) => onSwitchAlternateDraft(event.target.value)}>{versionHistory.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></>}
    {!!projectSnapshots.length && <div className="insp-card">
      <input className="insp-notes-input" value={alternateName} placeholder="Alternate draft name" onChange={(event) => setAlternateName(event.target.value)} />
      <select className="element-select" value={alternateBase} onChange={(event) => setAlternateBase(event.target.value)}><option value="">Branch from active draft head…</option>{projectSnapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>)}</select>
      <button className="btn btn-ghost" disabled={!alternateName.trim() || !defaultAlternateBase} onClick={() => { onCreateAlternateDraft(alternateName, alternateBase || defaultAlternateBase); setAlternateName(""); }}>Create Alternate Draft</button>
    </div>}
    {versionHistory.branches.length > 1 && <div className="insp-card diff-comparison"><h4>Combine Drafts</h4><select className="element-select" value={mergePreviewSourceId} onChange={(event) => { setMergeResolutions({}); onSelectCombineDraftSource(event.target.value); }}><option value="">Choose alternate…</option>{versionHistory.branches.filter((branch) => branch.id !== versionHistory.activeBranchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><button className="btn" disabled={!mergePreviewSourceId} onClick={() => { setMergeResolutions({}); onPreviewCombineDrafts(mergePreviewSourceId); }}>Preview Combine</button>
      {mergePreviewReady && <><div className="insp-card-meta">{mergeConflicts.length ? `${mergeConflicts.length} overlapping changes need an explicit choice.` : "No overlapping changes; this combine is clean."}</div>{mergeConflicts.map((conflict) => <div className="diff-row" key={conflict.path}><strong>{conflict.kind} · {conflict.path}</strong><div className="diff-values"><div><span>Base</span><pre>{formatDiffValue(conflict.base)}</pre></div><div><span>Current draft</span><pre>{formatDiffValue(conflict.ours)}</pre></div><div><span>Alternate draft</span><pre>{formatDiffValue(conflict.theirs)}</pre></div></div><label className="insp-card-meta">Use<select aria-label={`Resolve ${conflict.path}`} className="element-select" value={mergeResolutions[conflict.path] ?? "ours"} onChange={(event) => setMergeResolutions((current) => ({ ...current, [conflict.path]: event.target.value as "ours" | "theirs" }))}><option value="ours">Current draft</option><option value="theirs">Alternate draft</option></select></label></div>)}<div className="btn-row"><button className="btn btn-primary" onClick={() => { onCombineDrafts(mergePreviewSourceId, { default: "ours", paths: mergeResolutions }); setMergeResolutions({}); }}>Apply Combine</button><button className="btn btn-ghost" onClick={() => { setMergeResolutions({}); onCancelCombineDrafts(); }}>Cancel</button></div></>}
    </div>}
    {snapshots.length > 1 && <><h4>Compare Drafts</h4><select className="element-select" value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)}><option value="">Earlier draft…</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>)}</select><select className="element-select" value={compareTo} onChange={(event) => setCompareTo(event.target.value)}><option value="">Later draft…</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>)}</select><select className="element-select" value={compareMode} onChange={(event) => setCompareMode(event.target.value as SnapshotDiffMode)}>{modes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select><button className="btn btn-ghost" disabled={!compareFrom || !compareTo || compareFrom === compareTo} onClick={() => onCompareVersions(compareFrom, compareTo, compareMode)}>Compare</button></>}
    {versionComparison && <div className="insp-card diff-comparison"><div className="insp-card-title">{versionComparison.mode} comparison</div><div className="insp-card-meta">Scope: {snapshotScopeLabel(versionComparison.scope)}</div>
      {!versionComparison.documentChanges.length && !versionComparison.blockChanges.length && !versionComparison.metadataChanges.length && <Hint>No differences in this view.</Hint>}
      {versionComparison.documentChanges.slice(0, 200).map((change) => <div className="diff-row" key={`document-${change.documentId}`}><strong>{change.kind} document · {change.title}</strong><code>{change.documentId}</code><div className="diff-values"><div><span>Before</span><pre>{formatDocumentDiff(change.before)}</pre></div><div><span>After</span><pre>{formatDocumentDiff(change.after)}</pre></div></div></div>)}
      {versionComparison.blockChanges.slice(0, 200).map((change, index) => <div className="diff-row" key={`block-${change.documentId}-${change.blockId}-${change.kind}-${index}`}><strong>{change.kind} block · {change.documentId}</strong><code>{change.blockId} · {change.beforeIndex ?? "—"} → {change.afterIndex ?? "—"}</code><div className="diff-values"><div><span>Before</span><pre>{formatDiffValue(change.before)}</pre></div><div><span>After</span><pre>{formatDiffValue(change.after)}</pre></div></div></div>)}
      {versionComparison.metadataChanges.slice(0, 200).map((change) => <div className="diff-row" key={`metadata-${change.path}`}><strong>{change.path}</strong><div className="diff-values"><div><span>Before</span><pre>{formatDiffValue(change.before)}</pre></div><div><span>After</span><pre>{formatDiffValue(change.after)}</pre></div></div></div>)}
      {versionComparison.documentChanges.length + versionComparison.blockChanges.length + versionComparison.metadataChanges.length > 200 && <Hint>Showing the first 200 changes. Export or narrow the comparison mode for a focused review.</Hint>}
    </div>}
    <h4>Project History{activeBranch ? ` · ${activeBranch.name}` : ""}</h4>
    <div className="version-list">{snapshots.map((snapshot) => <div className="version-row" key={snapshot.id}><div className="version-top"><span className="version-label">{snapshot.name}</span>{milestones.has(snapshot.id) && <span className="milestone-tag">milestone</span>}<span className="milestone-tag">{snapshotScopeLabel(snapshot.scope)}</span><span className="version-when">{new Date(snapshot.createdAt).toLocaleString()}</span></div><div className="version-note">{snapshot.description || "No description"} · {versionHistory.branches.find((branch) => branch.id === snapshot.branchId)?.name ?? snapshot.branchId ?? "Main Draft"}</div><button className="link-btn" onClick={() => onRestoreVersion(snapshot)}>Restore</button></div>)}</div>
  </div>;
}

function BreakdownTab({ analysis, workspace, onWorkspace, onExportBreakdown }: InspectorProps) {
  const [csvSection, setCsvSection] = useState<AnalysisCsvSection>("all");
  const threads = workspace.plotThreads ?? [];
  const updateThread = (id: string, patch: Partial<(typeof threads)[number]>) => onWorkspace({ plotThreads: threads.map((thread) => thread.id === id ? { ...thread, ...patch } : thread) });
  const toggleThreadTarget = (id: string, field: "sceneIds" | "beatIds", targetId: string) => {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    const values = [...(thread[field] ?? [])];
    updateThread(id, { [field]: values.includes(targetId) ? values.filter((value) => value !== targetId) : [...values, targetId] });
  };
  const resolvedBeatIds = workspace.resolvedBeatIds ?? [];
  const productionEntries = Object.entries(analysis.production) as [string, (typeof analysis.production)[keyof typeof analysis.production]][];
  const facts: [string, string | number][] = [
    ["Scenes", analysis.scenes.length], ["Pages", `~${analysis.pageEstimate}`], ["Runtime", `~${analysis.episode.runtimeMinutes} min`], ["Words", analysis.wordCount],
    ["Dialogue", `${analysis.dialogueWords} words (${Math.round(analysis.dialogueDensity * 100)}%)`], ["Characters", analysis.entities.characters.filter((item) => item.status !== "rejected" && item.status !== "merged").length],
    ["Locations", analysis.entities.locations.filter((item) => item.status !== "rejected" && item.status !== "merged").length], ["Acts / sequences / beats", `${analysis.structure.acts.length} / ${analysis.structure.sequences.length} / ${analysis.structure.beats.length}`],
  ];
  return <div className="insp-stack">
    <dl className="insp-facts">{facts.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p className="insp-card-desc">{analysis.episode.summary}</p>
    <h4>Plot threads</h4>
    <button className="btn" onClick={() => onWorkspace({ plotThreads: [...threads, { id: `thread-${crypto.randomUUID()}`, label: "New thread", keywords: [], sceneIds: [], beatIds: [], resolved: false }] })}>Add Plot Thread</button>
    {threads.map((thread) => <div className="insp-card" key={thread.id}>
      <input aria-label="Plot thread name" className="insp-notes-input" value={thread.label} onChange={(event) => updateThread(thread.id, { label: event.target.value })} />
      <input aria-label="Plot thread keywords" className="insp-notes-input" value={(thread.keywords ?? []).join(", ")} placeholder="Keywords, comma separated" onChange={(event) => updateThread(thread.id, { keywords: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} />
      <label className="check-row"><input type="checkbox" checked={thread.resolved ?? false} onChange={(event) => updateThread(thread.id, { resolved: event.target.checked })} /> Resolved</label>
      <details><summary className="link-btn">Link scenes and beats</summary>{analysis.scenes.map((scene) => <label className="check-row" key={scene.id}><input type="checkbox" checked={thread.sceneIds?.includes(scene.id) ?? false} onChange={() => toggleThreadTarget(thread.id, "sceneIds", scene.id)} /> Scene {scene.number}: {scene.heading}</label>)}{analysis.structure.beats.map((beat) => <label className="check-row" key={beat.id}><input type="checkbox" checked={thread.beatIds?.includes(beat.id) ?? false} onChange={() => toggleThreadTarget(thread.id, "beatIds", beat.id)} /> Beat: {beat.text}</label>)}</details>
      <button className="link-btn" onClick={() => onWorkspace({ plotThreads: threads.filter((item) => item.id !== thread.id) })}>Remove</button>
    </div>)}
    {!!analysis.plotThreads.length && <ul className="insp-list">{analysis.plotThreads.map((thread) => <li key={thread.id}>{thread.label}: {thread.status}{thread.resolved ? " · resolved" : ""}</li>)}</ul>}
    <h4>Structure and coverage</h4>
    {analysis.structure.acts.map((act) => <div className="insp-card" key={act.id}><div className="insp-card-title">{act.title}</div><div className="insp-card-meta">{act.sceneCount} scenes · ~{act.estimatedPages} pages</div><p className="insp-card-desc">{act.summary}</p></div>)}
    {!!analysis.treatmentCoverage.length && <><h4>Treatment coverage</h4><ul className="insp-list">{analysis.treatmentCoverage.map((item) => <li key={item.id}>{item.label}: {item.status}</li>)}</ul></>}
    {!!analysis.unresolvedBeats.length && <><h4>Unresolved beats</h4>{analysis.unresolvedBeats.map((beat) => <div className="insp-card" key={beat.id}><div className="insp-card-desc">{beat.text}</div><button className="btn btn-ghost" onClick={() => onWorkspace({ resolvedBeatIds: [...resolvedBeatIds, beat.id] })}>Mark resolved</button></div>)}</>}
    {!!analysis.characterArcs.length && <details><summary className="insp-card-title">Character arcs</summary>{analysis.characterArcs.map((arc) => <p className="insp-card-desc" key={arc.character}><strong>{arc.character}:</strong> {arc.summary}</p>)}</details>}
    {!!analysis.pacingWarnings.length && <><h4>Pacing checks</h4><ul className="insp-list">{analysis.pacingWarnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul></>}
    <h4>Production reports</h4>
    {productionEntries.map(([category, rows]) => <details className="insp-card" key={category}><summary className="insp-card-title">{category} ({rows.length})</summary>{rows.map((row, index) => <p className="insp-card-desc" key={`${row.sceneId}-${row.item}-${index}`}><strong>Scene {row.sceneNumber} · {row.item}:</strong> {row.evidence}</p>)}</details>)}
    <h4>Detailed scenes</h4>
    {analysis.scenes.map((scene) => <details className="insp-card" key={scene.id}><summary className="insp-card-title">Scene {scene.sceneNumber ?? scene.number} · {scene.heading}</summary><div className="insp-card-meta">~{scene.estimatedPages} pages · {scene.dialogueWords} dialogue words · complexity {scene.complexityScore}/5</div><p className="insp-card-desc">Cast: {scene.characters.join(", ") || "—"}<br />Objects: {scene.objects.join(", ") || "—"}</p></details>)}
    <h4>Export</h4>
    <div className="btn-row"><button className="btn btn-ghost" onClick={() => onExportBreakdown("md")}>Markdown</button><select aria-label="CSV report" className="element-select" value={csvSection} onChange={(event) => setCsvSection(event.target.value as AnalysisCsvSection)}>{(["all", "summary", "scenes", "characters", "locations", "objects", "structure", "arcs", "coverage", "warnings", "revision", "production"] as const).map((section) => <option key={section} value={section}>{section}</option>)}</select><button className="btn btn-ghost" onClick={() => onExportBreakdown("csv", csvSection)}>CSV</button><button className="btn btn-ghost" onClick={() => onExportBreakdown("json")}>JSON</button><button className="btn btn-ghost" onClick={() => onExportBreakdown("pdf")}>Print PDF</button></div>
  </div>;
}

function SeriesTab({ projectWorkspace, seriesReport, activeDocumentId, scenes, onProjectWorkspace, onSelectEpisode }: InspectorProps) {
  const series = projectWorkspace.series;
  const activeMeta = series.episodes[activeDocumentId];
  const activeEpisode = seriesReport.episodes.find((episode) => episode.documentId === activeDocumentId);
  const [recordKind, setRecordKind] = useState<ContinuityRecord["kind"]>("timeline");
  const [recordTitle, setRecordTitle] = useState("");
  const [recordDetail, setRecordDetail] = useState("");
  const [timelineOrder, setTimelineOrder] = useState(1);
  const [timelineDate, setTimelineDate] = useState("");
  const saveSeries = (patch: Partial<typeof series>) => onProjectWorkspace({ series: { ...series, ...patch } });
  const updateEpisode = (patch: Partial<EpisodeMeta>) => {
    if (!activeMeta) return;
    const episodes = { ...series.episodes, [activeDocumentId]: { ...activeMeta, ...patch } };
    const seasons = series.seasons.map((season) => ({
      ...season,
      episodeIds: Object.values(episodes).filter((episode) => episode.seasonId === season.id).sort((a, b) => a.number - b.number).map((episode) => episode.documentId),
    }));
    saveSeries({ episodes, seasons });
  };
  const updateStory = (id: string, patch: Partial<StoryLine>) => updateEpisode({ storyLines: activeMeta.storyLines.map((line) => line.id === id ? { ...line, ...patch } : line) });
  const toggleStoryScene = (line: StoryLine, sceneId: string) => updateStory(line.id, { sceneIds: line.sceneIds.includes(sceneId) ? line.sceneIds.filter((id) => id !== sceneId) : [...line.sceneIds, sceneId] });
  const addContinuity = () => {
    if (!recordTitle.trim()) return;
    saveSeries({ continuity: [...series.continuity, { id: `continuity-${crypto.randomUUID()}`, kind: recordKind, title: recordTitle.trim(), detail: recordDetail.trim(), episodeIds: [activeDocumentId], ...(recordKind === "timeline" ? { timelineOrder, timelineDate } : {}), resolved: false }] });
    setRecordTitle(""); setRecordDetail("");
    if (recordKind === "timeline") setTimelineOrder((order) => order + 1);
  };
  const updateContinuity = (id: string, patch: Partial<ContinuityRecord>) => saveSeries({ continuity: series.continuity.map((record) => record.id === id ? { ...record, ...patch } : record) });
  const activeIndex = seriesReport.episodes.findIndex((episode) => episode.documentId === activeDocumentId);
  const previous = seriesReport.episodes[activeIndex - 1];
  const next = seriesReport.episodes[activeIndex + 1];
  if (!activeMeta || !activeEpisode) return <Hint>Television metadata becomes available after creating a show or adding an episode.</Hint>;
  return <div className="insp-stack">
    <Hint>{seriesReport.episodes.length} episode{seriesReport.episodes.length === 1 ? "" : "s"} share this show bible, season board, arcs, entities, plot threads, and continuity database.</Hint>
    <h4>Episode references</h4>
    <div className="btn-row">{previous && <button className="btn btn-ghost" onClick={() => onSelectEpisode(previous.documentId)}>← {previous.title}</button>}{next && <button className="btn btn-ghost" onClick={() => onSelectEpisode(next.documentId)}>{next.title} →</button>}</div>
    <h4>Show bible</h4>
    <textarea className="insp-notes-input treatment-input" value={series.showBible} onChange={(event) => saveSeries({ showBible: event.target.value })} placeholder="# Show Bible\n\nWorld, format, tone, canon…" />
    <h4>Seasons</h4>
    <button className="btn" onClick={() => { const number = Math.max(0, ...series.seasons.map((season) => season.number)) + 1; saveSeries({ seasons: [...series.seasons, { id: `season-${crypto.randomUUID()}`, number, title: `Season ${number}`, episodeIds: [], arc: "" }] }); }}>Add Season</button>
    {series.seasons.map((season) => <div className="insp-card" key={season.id}>
      <div className="btn-row"><input aria-label={`Season ${season.number} title`} className="insp-notes-input" value={season.title} onChange={(event) => saveSeries({ seasons: series.seasons.map((item) => item.id === season.id ? { ...item, title: event.target.value } : item) })} /><input aria-label={`${season.title} number`} className="insp-notes-input" type="number" min="1" value={season.number} onChange={(event) => saveSeries({ seasons: series.seasons.map((item) => item.id === season.id ? { ...item, number: Number(event.target.value) || 1 } : item) })} /></div>
      <textarea className="insp-notes-input" value={season.arc} placeholder="Season arc…" onChange={(event) => saveSeries({ seasons: series.seasons.map((item) => item.id === season.id ? { ...item, arc: event.target.value } : item) })} />
      <div className="insp-card-meta">{seriesReport.seasons.find((item) => item.id === season.id)?.summary ?? "No episodes"}</div>
    </div>)}
    <h4>Current episode</h4>
    <div className="insp-card">
      <input aria-label="Episode title" className="insp-notes-input" value={activeMeta.title} onChange={(event) => updateEpisode({ title: event.target.value })} />
      <div className="btn-row"><label className="insp-card-meta">Episode #<input className="insp-notes-input" type="number" min="1" value={activeMeta.number} onChange={(event) => updateEpisode({ number: Number(event.target.value) || 1 })} /></label><label className="insp-card-meta">Production code<input className="insp-notes-input" value={activeMeta.productionCode} onChange={(event) => updateEpisode({ productionCode: event.target.value })} /></label></div>
      <label className="insp-card-meta">Season<select className="element-select" value={activeMeta.seasonId} onChange={(event) => updateEpisode({ seasonId: event.target.value })}>{series.seasons.map((season) => <option key={season.id} value={season.id}>{season.title}</option>)}</select></label>
      <div className="btn-row"><label className="check-row"><input type="checkbox" checked={activeMeta.coldOpen} onChange={(event) => updateEpisode({ coldOpen: event.target.checked })} /> Cold open</label><label className="check-row"><input type="checkbox" checked={activeMeta.tag} onChange={(event) => updateEpisode({ tag: event.target.checked })} /> Tag</label></div>
      <p className="insp-card-desc">{activeEpisode.summary}</p>
    </div>
    <h4>Act breaks</h4>
    {scenes.map((scene) => <label className="check-row" key={scene.id}><input type="checkbox" checked={activeMeta.actBreakSceneIds.includes(scene.id)} onChange={() => updateEpisode({ actBreakSceneIds: activeMeta.actBreakSceneIds.includes(scene.id) ? activeMeta.actBreakSceneIds.filter((id) => id !== scene.id) : [...activeMeta.actBreakSceneIds, scene.id] })} /> After scene {scene.number}: {scene.heading}</label>)}
    <h4>A / B / C stories</h4>
    <button className="btn" onClick={() => updateEpisode({ storyLines: [...activeMeta.storyLines, { id: `story-${crypto.randomUUID()}`, label: "New story", kind: "A", sceneIds: [] }] })}>Add Story Line</button>
    {activeMeta.storyLines.map((line) => <div className="insp-card" key={line.id}><div className="btn-row"><select className="element-select" value={line.kind} onChange={(event) => updateStory(line.id, { kind: event.target.value as StoryLine["kind"] })}>{["A", "B", "C", "other"].map((kind) => <option key={kind}>{kind}</option>)}</select><input aria-label="Story line name" className="insp-notes-input" value={line.label} onChange={(event) => updateStory(line.id, { label: event.target.value })} /></div><details><summary className="link-btn">Episode board scenes</summary>{scenes.map((scene) => <label className="check-row" key={scene.id}><input type="checkbox" checked={line.sceneIds.includes(scene.id)} onChange={() => toggleStoryScene(line, scene.id)} /> {scene.heading}</label>)}</details><button className="link-btn" onClick={() => updateEpisode({ storyLines: activeMeta.storyLines.filter((item) => item.id !== line.id) })}>Remove</button></div>)}
    <h4>Season board</h4>
    {seriesReport.seasonBoard.map((row) => <div className="insp-card" key={row.episodeId}><button className="link-btn insp-card-title" onClick={() => onSelectEpisode(row.episodeId)}>S{row.seasonNumber}E{row.episodeNumber} · {row.title}</button><div className="insp-card-meta">{row.productionCode || "No code"} · {row.sceneCount} scenes · ~{row.pageEstimate} pages · {row.coldOpen ? "cold open · " : ""}{row.tag ? "tag · " : ""}{row.continuityIssueCount} continuity flags</div><p className="insp-card-desc">A: {row.stories.A.join(", ") || "—"}<br />B: {row.stories.B.join(", ") || "—"}<br />C: {row.stories.C.join(", ") || "—"}</p></div>)}
    <h4>Show-level character arcs</h4>
    {seriesReport.continuity.characters.map((character) => <label className="insp-card-meta" key={character.name}>{character.name}<textarea className="insp-notes-input" value={series.characterArcs[character.name] ?? ""} placeholder="Season-long character arc…" onChange={(event) => saveSeries({ characterArcs: { ...series.characterArcs, [character.name]: event.target.value } })} /></label>)}
    <h4>Recurring references</h4>
    {([["characters", seriesReport.continuity.characters], ["locations", seriesReport.continuity.locations], ["objects", seriesReport.continuity.objects]] as const).map(([label, entries]) => <details className="insp-card" key={label}><summary className="insp-card-title">{label} ({entries.filter((entry) => entry.episodeIds.length > 1).length} recurring)</summary>{entries.map((entry) => <div key={entry.name}><strong>{entry.name}</strong><div className="chip-row">{entry.episodeIds.map((id) => <button className="chip" key={id} onClick={() => onSelectEpisode(id)}>{seriesReport.episodes.find((episode) => episode.documentId === id)?.title ?? id}</button>)}</div>{!!entry.absentEpisodeIdsBetween.length && <p className="insp-card-desc">Absent between appearances: {entry.absentEpisodeIdsBetween.length} episode(s)</p>}</div>)}</details>)}
    <h4>Plot thread history</h4>
    {seriesReport.plotThreads.length ? seriesReport.plotThreads.map((thread) => <div className="insp-card" key={thread.id}><div className="insp-card-title">{thread.kind} · {thread.label}</div><div className="insp-card-meta">{thread.status} · {thread.episodes.length} episode(s)</div><div className="chip-row">{thread.episodes.map((episode) => <button className="chip" key={episode.episodeId} onClick={() => onSelectEpisode(episode.episodeId)}>{seriesReport.episodes.find((item) => item.documentId === episode.episodeId)?.title}: {episode.status}</button>)}</div></div>) : <Hint>Add episode story lines or plot threads in Breakdown.</Hint>}
    <h4>Season timeline</h4>
    {series.continuity.filter((record) => record.kind === "timeline").sort((left, right) => (left.timelineOrder ?? Number.MAX_SAFE_INTEGER) - (right.timelineOrder ?? Number.MAX_SAFE_INTEGER) || (left.timelineDate ?? "").localeCompare(right.timelineDate ?? "")).map((record) => <div className="insp-card" key={`timeline-${record.id}`}><div className="insp-card-title">{record.timelineOrder ?? "—"} · {record.title}</div><div className="insp-card-meta">{record.timelineDate || "Relative story order"} · {record.episodeIds.map((id) => series.episodes[id]?.title ?? id).join(", ")}</div><p className="insp-card-desc">{record.detail}</p><div className="btn-row"><input aria-label={`${record.title} timeline order`} className="insp-notes-input" type="number" value={record.timelineOrder ?? ""} onChange={(event) => updateContinuity(record.id, { timelineOrder: Number(event.target.value) || undefined })} /><input aria-label={`${record.title} story date`} className="insp-notes-input" type="datetime-local" value={record.timelineDate ?? ""} onChange={(event) => updateContinuity(record.id, { timelineDate: event.target.value })} /></div></div>)}
    <h4>Continuity database / unanswered questions</h4>
    <div className="insp-card"><select className="element-select" value={recordKind} onChange={(event) => setRecordKind(event.target.value as ContinuityRecord["kind"])}>{["timeline", "character", "object", "location", "plot", "question"].map((kind) => <option key={kind}>{kind}</option>)}</select>{recordKind === "timeline" && <div className="btn-row"><input aria-label="Timeline order" className="insp-notes-input" type="number" min="1" value={timelineOrder} onChange={(event) => setTimelineOrder(Math.max(1, Number(event.target.value) || 1))} /><input aria-label="Story date" className="insp-notes-input" type="datetime-local" value={timelineDate} onChange={(event) => setTimelineDate(event.target.value)} /></div>}<input className="insp-notes-input" value={recordTitle} placeholder="Continuity item or question" onChange={(event) => setRecordTitle(event.target.value)} /><textarea className="insp-notes-input" value={recordDetail} placeholder="Canon, timeline, knowledge, or answer…" onChange={(event) => setRecordDetail(event.target.value)} /><button className="btn" onClick={addContinuity}>Add Record</button></div>
    {series.continuity.map((record) => <div className="insp-card" key={record.id}><div className="insp-card-title">{record.kind} · {record.title}</div><textarea className="insp-notes-input" value={record.detail} onChange={(event) => updateContinuity(record.id, { detail: event.target.value })} /><label className="check-row"><input type="checkbox" checked={record.episodeIds.includes(activeDocumentId)} onChange={() => updateContinuity(record.id, { episodeIds: record.episodeIds.includes(activeDocumentId) ? record.episodeIds.filter((id) => id !== activeDocumentId) : [...record.episodeIds, activeDocumentId] })} /> Applies to this episode</label><div className="btn-row"><button className="btn btn-ghost" onClick={() => updateContinuity(record.id, { resolved: !record.resolved })}>{record.resolved ? "Reopen" : "Resolve"}</button><button className="link-btn" onClick={() => saveSeries({ continuity: series.continuity.filter((item) => item.id !== record.id) })}>Delete</button></div></div>)}
    {!!seriesReport.continuityIssues.length && <><h4>Continuity checks</h4><ul className="insp-list">{seriesReport.continuityIssues.map((issue) => <li key={issue.id}>{issue.severity}: {issue.message}</li>)}</ul></>}
  </div>;
}

function ProductionTab({ workspace, onWorkspace, activeScene, productionPages, productionReports, revisionSets, revisionSummaries, characters, scenes, onStartRevision, onUpdateRevisionMarks, onLockPages, onUnlockPages, onPrintRevisionPages, onToggleOmittedScene, onSetSceneNumber, onExportProduction }: InspectorProps) {
  const omitted = workspace.omittedSceneIds ?? [];
  const activeRevision = revisionSets.find((revision) => revision.id === workspace.activeRevisionId) ?? revisionSets[revisionSets.length - 1];
  const suggestedColor = nextRevisionColor((activeRevision?.color ?? "White") as RevisionColor);
  const [revisionLabel, setRevisionLabel] = useState(`${suggestedColor} Revision`);
  const [revisionColor, setRevisionColor] = useState<RevisionColor>(suggestedColor);
  const [characterSide, setCharacterSide] = useState("");
  const [sceneSide, setSceneSide] = useState("");
  return <div className="insp-stack">
    <Hint>Production mode keeps numbered scenes, locked/A-pages, colored revision runs, omitted scenes, scheduling strips, sides, and department exports attached to the screenplay.</Hint>
    <label className="insp-card-meta">Production draft label<input className="insp-notes-input" value={workspace.productionDraftLabel ?? ""} onChange={(event) => onWorkspace({ productionDraftLabel: event.target.value })} /></label>
    {activeScene && <div className="insp-card"><div className="insp-card-title">Active scene · {activeScene.heading}</div><label className="insp-card-meta">Scene number<input className="insp-notes-input" value={activeScene.sceneNumber ?? String(activeScene.number)} onChange={(event) => onSetSceneNumber(activeScene.id, event.target.value)} /></label><button className="btn" onClick={() => onToggleOmittedScene(activeScene.id)}>{omitted.includes(activeScene.id) ? "Restore Omitted Scene" : "Mark Scene Omitted"}</button></div>}
    <h4>Page locking</h4>
    <div className="btn-row"><button className="btn" onClick={onLockPages}>{workspace.pageLock ? "Re-lock Current Pages" : "Lock Pages"}</button>{workspace.pageLock && <button className="btn btn-ghost" onClick={onUnlockPages}>Release Lock</button>}<button className="btn btn-ghost" disabled={!activeRevision || !revisionSummaries.some((summary) => summary.revisionId === activeRevision.id && summary.revisedPages.length)} onClick={onPrintRevisionPages}>Print Revision Pages</button></div>
    <div className="chip-row">{productionPages.map((page) => <span className="chip" key={page.label}>{page.label}{page.locked ? " 🔒" : ""}{page.color ? ` · ${page.color}` : ""}</span>)}</div>
    <h4>Colored revisions</h4>
    <div className="insp-card"><input aria-label="Revision label" className="insp-notes-input" value={revisionLabel} onChange={(event) => setRevisionLabel(event.target.value)} /><select aria-label="Revision color" className="element-select" value={revisionColor} onChange={(event) => setRevisionColor(event.target.value as RevisionColor)}>{REVISION_COLORS.map((color) => <option key={color}>{color}</option>)}</select><button className="btn" disabled={!revisionLabel.trim()} onClick={() => { onStartRevision(revisionLabel.trim(), revisionColor); const next = nextRevisionColor(revisionColor); setRevisionColor(next); setRevisionLabel(`${next} Revision`); }}>Start Revision Set</button></div>
    {!!revisionSets.length && <label className="insp-card-meta">Active revision<select className="element-select" value={activeRevision?.id ?? ""} onChange={(event) => onWorkspace({ activeRevisionId: event.target.value })}>{revisionSets.map((revision) => <option key={revision.id} value={revision.id}>{revision.label} · {revision.color}</option>)}</select></label>}
    {activeRevision && <button className="btn btn-primary" onClick={() => onUpdateRevisionMarks(activeRevision.id)}>Update Revision Marks</button>}
    {revisionSummaries.map((summary) => <div className="insp-card" key={summary.revisionId}><div className="insp-card-title">{summary.label} · {summary.color}</div><div className="insp-card-meta">{summary.totalChanges} changes · pages {summary.revisedPages.join(", ") || "none"} · {summary.changedSceneIds.length} scenes</div><p className="insp-card-desc">{summary.addedBlockIds.length} added · {summary.editedBlockIds.length} edited · {summary.removedBlockIds.length} removed</p></div>)}
    <h4>Shooting schedule</h4>
    <label className="insp-card-meta">Eighths per day<input className="insp-notes-input" type="number" min="1" value={workspace.shootingEighthsPerDay ?? 40} onChange={(event) => onWorkspace({ shootingEighthsPerDay: Math.max(1, Number(event.target.value) || 40) })} /></label>
    {productionReports.oneLineSchedule.map((row) => <div className="insp-card" key={row.sceneId}><div className="insp-card-title">Day {row.day} · Scene {row.sceneNumber}</div><div className="insp-card-meta">{row.line}</div></div>)}
    {!!productionReports.sceneStrips.filter((strip) => strip.omitted).length && <p className="insp-card-desc">Omitted: {productionReports.sceneStrips.filter((strip) => strip.omitted).map((strip) => strip.sceneNumber).join(", ")}</p>}
    <h4>Day out of days</h4>
    {productionReports.castDays.map((cast) => <div className="insp-card" key={cast.character}><div className="insp-card-title">{cast.character} · {cast.totalDays} day(s)</div><div className="insp-card-meta">{cast.days.map((day) => `Day ${day.day} ${day.status} (${day.sceneNumbers.join(", ")})`).join(" · ")}</div></div>)}
    <h4>Production exports</h4>
    <div className="btn-row"><button className="btn btn-ghost" onClick={() => onExportProduction("revision")}>Revision report</button><button className="btn btn-ghost" onClick={() => onExportProduction("scene-strips")}>Scene strips CSV</button><button className="btn btn-ghost" onClick={() => onExportProduction("schedule")}>One-line schedule</button><button className="btn btn-ghost" onClick={() => onExportProduction("cast-days")}>Cast DOOD</button><button className="btn btn-ghost" onClick={() => onExportProduction("dialogue")}>Dialogue only</button><button className="btn btn-ghost" onClick={() => onExportProduction("departments")}>Departments</button><button className="btn btn-ghost" onClick={() => onExportProduction("metadata")}>Revision JSON</button></div>
    <div className="btn-row"><select aria-label="Character side" className="element-select" value={characterSide} onChange={(event) => setCharacterSide(event.target.value)}><option value="">All character sides</option>{characters.map((character) => <option key={character.name}>{character.name}</option>)}</select><button className="btn btn-ghost" onClick={() => onExportProduction("character-sides", characterSide || undefined)}>Export Sides</button></div>
    <div className="btn-row"><select aria-label="Scene side" className="element-select" value={sceneSide} onChange={(event) => setSceneSide(event.target.value)}><option value="">All scene sides</option>{scenes.map((scene) => <option key={scene.id} value={scene.id}>Scene {scene.sceneNumber ?? scene.number} · {scene.heading}</option>)}</select><button className="btn btn-ghost" onClick={() => onExportProduction("scene-sides", sceneSide || undefined)}>Export Scene Sides</button></div>
    <h4>Department and revision notes</h4><textarea className="insp-notes-input" value={workspace.productionNotes} onChange={(event) => onWorkspace({ productionNotes: event.target.value })} placeholder="Wardrobe, makeup, props, department notes…" />
  </div>;
}

function AssistTab({ scenes, characters, breakdown, workspace }: InspectorProps) {
  const prompt = useMemo(() => `Review this screenplay development summary. Keep all suggestions optional.\nScenes: ${scenes.length}\nCharacters: ${characters.map((character) => character.name).join(", ")}\nNight scenes: ${breakdown.nightScenes}\nTreatment:\n${workspace.treatment}`, [scenes, characters, breakdown, workspace.treatment]);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(prompt); setCopied(true); };
  return <div className="insp-stack"><Hint>Opt-in companion prompt: SCS sends nothing. Copy this structured context into the local or API-based assistant you choose.</Hint><textarea className="insp-notes-input treatment-input" readOnly value={prompt} /><button className="btn" onClick={copy}>{copied ? "Copied" : "Copy Assistant Prompt"}</button></div>;
}
