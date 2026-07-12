import { useMemo, useState } from "react";
import {
  aggregateEpisodes,
  characterDialogue,
  parseHeading,
  type Breakdown,
  type CharacterRef,
  type DetectedObject,
  type DraftChange,
  type DraftSnapshot,
  type LocationRef,
  type Scene,
  type ScreenplayBlock,
  type ScreenplayDocument,
  type StoryStructure,
  type WorkspaceData,
} from "../domain/index.ts";

interface InspectorProps {
  blocks: ScreenplayBlock[];
  scenes: Scene[];
  characters: CharacterRef[];
  locations: LocationRef[];
  objects: DetectedObject[];
  structure: StoryStructure;
  breakdown: Breakdown;
  activeScene: Scene | null;
  sceneNotes: Record<string, string>;
  onSceneNote: (sceneId: string, text: string) => void;
  workspace: WorkspaceData;
  onWorkspace: (patch: Partial<WorkspaceData>) => void;
  versions: DraftSnapshot[];
  draftChanges: DraftChange[];
  onSaveVersion: () => void;
  onRestoreVersion: (version: DraftSnapshot) => void;
  onExportBreakdown: (format: "md" | "csv" | "json" | "pdf") => void;
  onExportTreatment: (format: "md" | "pdf") => void;
  episodeDocuments: ScreenplayDocument[];
}

const TABS = ["Scene", "Story", "Treatment", "Cast", "Props", "Places", "Drafts", "Breakdown", "Series", "Production", "Team", "Assist"] as const;
type Tab = (typeof TABS)[number];
const Hint = ({ children }: { children: React.ReactNode }) => <p className="insp-hint">{children}</p>;

export default function Inspector(props: InspectorProps) {
  const [tab, setTab] = useState<Tab>("Scene");
  return <aside className="inspector">
    <nav className="insp-tabs">{TABS.map((name) => <button key={name} className={`insp-tab ${name === tab ? "active" : ""}`} onClick={() => setTab(name)}>{name}</button>)}</nav>
    <div className="insp-body">
      {tab === "Scene" && <SceneTab {...props} />}
      {tab === "Story" && <StoryTab {...props} />}
      {tab === "Treatment" && <TreatmentTab {...props} />}
      {tab === "Cast" && <CastTab {...props} />}
      {tab === "Props" && <PropsTab {...props} />}
      {tab === "Places" && <PlacesTab {...props} />}
      {tab === "Drafts" && <DraftsTab {...props} />}
      {tab === "Breakdown" && <BreakdownTab {...props} />}
      {tab === "Series" && <SeriesTab {...props} />}
      {tab === "Production" && <ProductionTab {...props} />}
      {tab === "Team" && <TeamTab {...props} />}
      {tab === "Assist" && <AssistTab {...props} />}
    </div>
  </aside>;
}

function SceneTab({ blocks, scenes, activeScene, sceneNotes, onSceneNote, workspace, onWorkspace }: InspectorProps) {
  if (!activeScene) return <Hint>Click into the script to inspect a scene.</Hint>;
  const heading = parseHeading(activeScene.heading);
  const end = scenes[activeScene.number]?.blockIndex ?? blocks.length;
  const beats = blocks.slice(activeScene.blockIndex, end).filter((block) => block.type === "note" && block.text.trim());
  const meta = workspace.sceneMeta?.[activeScene.id] ?? { summary: "", tags: "", status: "draft" as const };
  const setMeta = (patch: Partial<typeof meta>) => onWorkspace({ sceneMeta: { ...workspace.sceneMeta, [activeScene.id]: { ...meta, ...patch } } });
  return <div className="insp-stack">
    <div className="insp-kicker">Scene {activeScene.number}</div><div className="insp-title">{activeScene.heading}</div>
    <dl className="insp-facts"><dt>Set</dt><dd>{heading.intExt || "—"}</dd><dt>Location</dt><dd>{heading.location || "—"}</dd><dt>Time</dt><dd>{heading.timeOfDay || "—"}</dd><dt>Cast</dt><dd>{activeScene.characters.join(", ") || "—"}</dd></dl>
    <h4>Beats</h4>{beats.length ? <ul className="insp-list">{beats.map((beat) => <li key={beat.id}>{beat.text}</li>)}</ul> : <Hint>Add a Note element to create a beat in this scene.</Hint>}
    <h4>Development</h4><textarea className="insp-notes-input" value={meta.summary} placeholder="Scene summary…" onChange={(event) => setMeta({ summary: event.target.value })} /><input className="insp-notes-input" value={meta.tags} placeholder="Tags, comma separated" onChange={(event) => setMeta({ tags: event.target.value })} /><select className="element-select" value={meta.status} onChange={(event) => setMeta({ status: event.target.value as typeof meta.status })}><option value="outline">Outline</option><option value="draft">Draft</option><option value="revised">Revised</option><option value="locked">Locked</option></select>
    <h4>Scene notes</h4><textarea className="insp-notes-input" value={sceneNotes[activeScene.id] ?? ""} placeholder="Notes and continuity…" onChange={(event) => onSceneNote(activeScene.id, event.target.value)} />
  </div>;
}

function StoryTab({ structure, scenes }: InspectorProps) {
  return <div className="insp-stack"><Hint>Act → sequence → scene → beat hierarchy derived from the script. New Act blocks start custom acts; sequences hold up to eight scenes.</Hint>
    {structure.acts.map((act) => <div className="insp-card" key={act.id}><div className="insp-card-title">{act.title}</div>{act.sequences.map((sequence) => <div key={sequence.id}><div className="insp-card-meta">{sequence.title}</div><ol className="insp-list">{sequence.sceneIds.map((id) => <li key={id}>{scenes.find((scene) => scene.id === id)?.heading ?? id}</li>)}</ol></div>)}</div>)}
    <h4>Beat map</h4>{structure.beats.length ? <ul className="insp-list">{structure.beats.map((beat) => <li key={beat.id}>{beat.text}</li>)}</ul> : <Hint>No beats yet.</Hint>}
  </div>;
}

function TreatmentTab({ workspace, onWorkspace, onExportTreatment }: InspectorProps) {
  return <div className="insp-stack"><Hint>Markdown treatment stored with the project. Reference scenes, characters, locations, or beats by name.</Hint><textarea className="insp-notes-input treatment-input" value={workspace.treatment} placeholder="# Treatment\n\n## Act I\n…" onChange={(event) => onWorkspace({ treatment: event.target.value })} /><div className="btn-row"><button className="btn" onClick={() => onExportTreatment("md")}>Export Markdown</button><button className="btn btn-ghost" onClick={() => onExportTreatment("pdf")}>Print PDF</button></div></div>;
}

function CastTab({ characters, blocks }: InspectorProps) {
  if (!characters.length) return <Hint>No character cues detected.</Hint>;
  return <div className="insp-stack"><Hint>Deterministic cue recognition with dialogue and scene statistics.</Hint>{characters.map((character) => {
    const dialogue = characterDialogue(blocks, character.name);
    return <details className="insp-card" key={character.name}><summary className="insp-card-title">{character.name}</summary><div className="insp-card-meta">{character.cueCount} cues · first scene {character.firstScene} · {dialogue.join(" ").match(/\S+/g)?.length ?? 0} dialogue words</div>{dialogue.map((line, index) => <p key={index} className="insp-card-desc">{line}</p>)}</details>;
  })}</div>;
}

function PropsTab({ objects, workspace, onWorkspace }: InspectorProps) {
  const setStatus = (object: DetectedObject, status: "confirmed" | "rejected") => onWorkspace({ entityStatuses: { ...workspace.entityStatuses, [object.id]: status } });
  const visible = objects.filter((object) => workspace.entityStatuses[object.id] !== "rejected");
  if (!visible.length) return <Hint>No known production objects detected in action lines.</Hint>;
  return <div className="insp-stack"><Hint>Objects are matched deterministically; confirm or ignore each candidate.</Hint>{visible.map((object) => <div className="insp-card" key={object.id}><div className="insp-card-title">{object.name}</div><div className="insp-card-meta">{object.category} · {object.mentions} mentions · scenes {object.sceneNumbers.join(", ") || "—"} · {Math.round(object.confidence * 100)}%</div><div className="btn-row"><button className="btn" onClick={() => setStatus(object, "confirmed")}>{workspace.entityStatuses[object.id] === "confirmed" ? "Confirmed" : "Confirm"}</button><button className="btn btn-ghost" onClick={() => setStatus(object, "rejected")}>Ignore</button></div></div>)}</div>;
}

function PlacesTab({ locations }: InspectorProps) {
  return <div className="insp-stack">{locations.length ? locations.map((location) => <div className="insp-card" key={location.name}><div className="insp-card-title">{location.name}</div><div className="insp-card-meta">{location.intExt.join(" / ") || "—"} · scenes {location.sceneNumbers.join(", ")}</div></div>) : <Hint>No locations detected.</Hint>}</div>;
}

function DraftsTab({ versions, draftChanges, onSaveVersion, onRestoreVersion }: InspectorProps) {
  return <div className="insp-stack"><button className="btn btn-primary" onClick={onSaveVersion}>Save Draft Version</button><Hint>Snapshots include script and development metadata. The newest two versions are compared scene by scene.</Hint>
    {draftChanges.length > 0 && <><h4>Changed scenes</h4><ul className="insp-list">{draftChanges.map((change, index) => <li key={`${change.scene}-${index}`}>{change.summary}</li>)}</ul></>}
    <div className="version-list">{versions.map((version) => <div className="version-row" key={version.id}><div className="version-top"><span className="version-label">{version.label}</span>{version.milestone && <span className="milestone-tag">milestone</span>}<span className="version-when">{new Date(version.createdAt).toLocaleString()}</span></div><div className="version-note">{version.note}</div><button className="link-btn" onClick={() => onRestoreVersion(version)}>Restore</button></div>)}</div>
  </div>;
}

function BreakdownTab({ breakdown, onExportBreakdown }: InspectorProps) {
  const facts: [string, string | number][] = [["Scenes", breakdown.scenes], ["Pages", `~${breakdown.pages}`], ["Words", breakdown.words], ["Dialogue words", breakdown.dialogueWords], ["Characters", breakdown.characters], ["Locations", breakdown.locations], ["Night scenes", breakdown.nightScenes], ["INT / EXT", `${breakdown.interiorScenes} / ${breakdown.exteriorScenes}`]];
  return <div className="insp-stack"><dl className="insp-facts">{facts.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><h4>Production categories</h4><dl className="insp-facts">{Object.entries(breakdown.categories).map(([name, count]) => <div className="fact-row" key={name}><dt>{name}</dt><dd>{count}</dd></div>)}</dl><div className="btn-row">{(["md", "csv", "json", "pdf"] as const).map((format) => <button className="btn btn-ghost" key={format} onClick={() => onExportBreakdown(format)}>{format.toUpperCase()}</button>)}</div></div>;
}

function SeriesTab({ episodeDocuments, workspace, onWorkspace }: InspectorProps) {
  const aggregate = aggregateEpisodes(episodeDocuments);
  return <div className="insp-stack"><Hint>{episodeDocuments.length} episode workspace · shared references aggregate across tabs.</Hint><h4>Show bible</h4><textarea className="insp-notes-input" value={workspace.showBible} onChange={(event) => onWorkspace({ showBible: event.target.value })} placeholder="World, tone, format, canon…" /><h4>Season arc / A-B-C stories</h4><textarea className="insp-notes-input" value={workspace.seasonArc} onChange={(event) => onWorkspace({ seasonArc: event.target.value })} placeholder="A story, B story, cold open, act breaks, tag…" /><h4>Continuity</h4><textarea className="insp-notes-input" value={workspace.continuity} onChange={(event) => onWorkspace({ continuity: event.target.value })} placeholder="Timeline, knowledge, unresolved questions…" /><h4>Recurring cast</h4><div className="chip-row">{aggregate.characters.map((name) => <span className="chip" key={name}>{name}</span>)}</div><h4>Recurring locations</h4><div className="chip-row">{aggregate.locations.map((name) => <span className="chip" key={name}>{name}</span>)}</div></div>;
}

function ProductionTab({ breakdown, workspace, onWorkspace, activeScene }: InspectorProps) {
  const omitted = workspace.omittedSceneIds ?? [];
  const toggleOmitted = () => activeScene && onWorkspace({ omittedSceneIds: omitted.includes(activeScene.id) ? omitted.filter((id) => id !== activeScene.id) : [...omitted, activeScene.id] });
  return <div className="insp-stack"><Hint>Scene numbers, locked-page records, colored revisions, omitted scenes, and deterministic shooting complexity.</Hint><label className="insp-card-meta">Draft label<input className="insp-notes-input" value={workspace.productionDraftLabel ?? ""} onChange={(event) => onWorkspace({ productionDraftLabel: event.target.value })} /></label><label className="insp-card-meta">Revision color<select className="element-select" value={workspace.revisionColor ?? "White"} onChange={(event) => onWorkspace({ revisionColor: event.target.value })}>{["White", "Blue", "Pink", "Yellow", "Green", "Goldenrod", "Buff", "Salmon", "Cherry"].map((color) => <option key={color}>{color}</option>)}</select></label><label className="insp-card-meta">Locked pages<input className="insp-notes-input" value={workspace.lockedPages ?? ""} placeholder="1-12, 14" onChange={(event) => onWorkspace({ lockedPages: event.target.value })} /></label>{activeScene && <button className="btn" onClick={toggleOmitted}>{omitted.includes(activeScene.id) ? "Restore Scene" : "Mark Scene Omitted"}</button>}{breakdown.complexity.map((scene) => <div className="insp-card" key={scene.scene}><div className="insp-card-title">Scene {scene.scene} · complexity {scene.score}/5</div><div className="insp-card-meta">{scene.reasons.join(", ") || "standard dialogue/action"}</div></div>)}<h4>Department and revision notes</h4><textarea className="insp-notes-input" value={workspace.productionNotes} onChange={(event) => onWorkspace({ productionNotes: event.target.value })} placeholder="Wardrobe, makeup, props, revision history…" /></div>;
}

function TeamTab({ workspace, onWorkspace }: InspectorProps) {
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; onWorkspace({ comments: [...workspace.comments, { id: `comment-${Date.now()}`, author: "Local writer", text: text.trim(), resolved: false, createdAt: new Date().toISOString() }] }); setText(""); };
  return <div className="insp-stack"><Hint>Local-first review comments and approvals. Project-folder sync can be handled by Git or any shared drive.</Hint><textarea className="insp-notes-input" value={text} onChange={(event) => setText(event.target.value)} placeholder="Leave a comment or suggested change…" /><button className="btn" onClick={add}>Add Comment</button>{workspace.comments.map((comment) => <div className="insp-card" key={comment.id}><div className="insp-card-title">{comment.author}</div><div className="insp-card-desc">{comment.text}</div><button className="link-btn" onClick={() => onWorkspace({ comments: workspace.comments.map((item) => item.id === comment.id ? { ...item, resolved: !item.resolved } : item) })}>{comment.resolved ? "Reopen" : "Resolve"}</button></div>)}</div>;
}

function AssistTab({ scenes, characters, breakdown, workspace }: InspectorProps) {
  const prompt = useMemo(() => `Review this screenplay development summary. Keep all suggestions optional.\nScenes: ${scenes.length}\nCharacters: ${characters.map((character) => character.name).join(", ")}\nNight scenes: ${breakdown.nightScenes}\nTreatment:\n${workspace.treatment}`, [scenes, characters, breakdown, workspace.treatment]);
  const [copied, setCopied] = useState(false);
  const copy = async () => { await navigator.clipboard.writeText(prompt); setCopied(true); };
  return <div className="insp-stack"><Hint>Opt-in companion prompt: SCS sends nothing. Copy this structured context into the local or API-based assistant you choose.</Hint><textarea className="insp-notes-input treatment-input" readOnly value={prompt} /><button className="btn" onClick={copy}>{copied ? "Copied" : "Copy Assistant Prompt"}</button></div>;
}
