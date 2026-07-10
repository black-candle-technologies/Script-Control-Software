import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "./Editor.tsx";
import Inspector, { type DraftVersion } from "./Inspector.tsx";
import {
  ELEMENT_TYPES,
  countWords,
  deriveCharacters,
  deriveLocations,
  deriveScenes,
  elementLabels,
  estimatePages,
  parseFountain,
  toFountain,
  type ScreenplayDocument,
  type ScreenplayElementType,
} from "../domain/index.ts";
import { sampleVersions } from "../domain/sample.ts";
import { saveDocument } from "../storage.ts";
import { chooseAndParseFdx, messageFrom, saveProjectManifest } from "../services/fdxService.ts";

interface WorkspaceProps {
  initialDoc: ScreenplayDocument;
  onOpenFdx: () => void;
}

export default function Workspace({ initialDoc, onOpenFdx }: WorkspaceProps) {
  const [episodeDocs, setEpisodeDocs] = useState([initialDoc]);
  const [activeEpisode, setActiveEpisode] = useState(0);
  const doc = episodeDocs[activeEpisode];
  const setDoc = (next: ScreenplayDocument) => setEpisodeDocs((all) => all.map((item, index) => index === activeEpisode ? next : item));
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [mode, setMode] = useState<"formatted" | "source">("formatted");
  const [sourceText, setSourceText] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [versions, setVersions] = useState<DraftVersion[]>(sampleVersions);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const focusNonce = useRef(0);

  useEffect(() => {
    if (doc.readOnly) return;
    const timer = setTimeout(() => {
      saveDocument(doc);
      setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    }, 800);
    return () => clearTimeout(timer);
  }, [doc]);

  const scenes = useMemo(() => doc.scenes?.map((scene, index) => ({
    id: scene.id,
    number: index + 1,
    sceneNumber: scene.sceneNumber,
    heading: scene.heading,
    blockIndex: scene.blockStart,
    characters: scene.characterIds
      .map((id) => doc.characters?.find((character) => character.id === id)?.canonicalName)
      .filter((name): name is string => Boolean(name)),
  })) ?? deriveScenes(doc.blocks), [doc]);
  const characters = useMemo(() => doc.characters?.map((character) => ({
    name: character.canonicalName,
    cueCount: character.dialogueBlockIds.length,
    firstScene: Math.max(1, (doc.scenes?.findIndex((scene) => scene.id === character.sceneIds[0]) ?? 0) + 1),
  })) ?? deriveCharacters(doc.blocks), [doc]);
  const locations = useMemo(() => doc.locations?.map((location) => ({
    name: location.displayName,
    intExt: location.interiorExteriorUsages,
    sceneNumbers: location.sceneIds.map((id) => (doc.scenes?.findIndex((scene) => scene.id === id) ?? 0) + 1),
  })) ?? deriveLocations(doc.blocks), [doc]);
  const words = useMemo(() => countWords(doc.blocks), [doc.blocks]);
  const pages = useMemo(() => estimatePages(doc.blocks), [doc.blocks]);
  const activeIndex = doc.blocks.findIndex((block) => block.id === activeBlockId);
  const activeBlock = activeIndex >= 0 ? doc.blocks[activeIndex] : null;
  const activeScene = activeIndex >= 0 ? [...scenes].reverse().find((scene) => scene.blockIndex <= activeIndex) ?? null : scenes[0] ?? null;

  const setActiveType = (type: ScreenplayElementType) => {
    if (!activeBlock || doc.readOnly) return;
    const blocks = doc.blocks.slice();
    blocks[activeIndex] = { ...activeBlock, type };
    setDoc({ ...doc, blocks });
    setFocusRequest({ id: activeBlock.id, nonce: ++focusNonce.current });
  };

  const jumpToScene = (sceneId: string) => {
    const imported = doc.scenes?.find((scene) => scene.id === sceneId);
    setFocusRequest({ id: imported ? doc.blocks[imported.blockStart].id : sceneId, nonce: ++focusNonce.current });
  };

  const toggleMode = () => {
    if (doc.readOnly) return;
    if (mode === "formatted") {
      setSourceText(toFountain(doc));
      setMode("source");
      return;
    }
    const parsed = parseFountain(sourceText);
    const oldScenes = scenes;
    const newScenes = deriveScenes(parsed.blocks);
    const sceneNotes: Record<string, string> = {};
    for (const [id, note] of Object.entries(doc.sceneNotes)) {
      const oldScene = oldScenes.find((scene) => scene.id === id);
      const match = oldScene && newScenes[oldScene.number - 1];
      if (match && note) sceneNotes[match.id] = note;
    }
    setDoc({ ...parsed, sceneNotes });
    setMode("formatted");
  };

  const saveNow = () => {
    saveDocument(doc);
    setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
  };

  const exportFountain = () => {
    const blob = new Blob([toFountain(doc)], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${(doc.titlePage.title || "screenplay").toLowerCase().replace(/\s+/g, "-")}.fountain`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const addEpisode = async () => {
    setBusy(true);
    setOperationMessage(null);
    try {
      const imported = await chooseAndParseFdx();
      if (!imported) return;
      setEpisodeDocs((all) => [...all, imported]);
      setActiveEpisode(episodeDocs.length);
      setActiveBlockId(null);
      setMode("formatted");
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const createProject = async () => {
    setBusy(true);
    setOperationMessage(null);
    try {
      const path = await saveProjectManifest(episodeDocs[0].titlePage.title || "Untitled Project", episodeDocs);
      if (path) setOperationMessage(`Project wrapper saved to ${path}.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const saveDraftVersion = () => setVersions((all) => [{
    id: `s${Date.now()}`,
    label: `Session draft ${all.filter((version) => version.id.startsWith("s")).length + 1}`,
    note: "Saved from the Drafts panel (session only).",
    when: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    milestone: false,
  }, ...all]);

  return <div className="workspace">
    {episodeDocs.length > 1 && <div className="workspace-episodes" aria-label="Television episodes">
      {episodeDocs.map((episode, index) => <button key={episode.id ?? episode.source?.path ?? index} className={`episode-tab ${index === activeEpisode ? "active" : ""}`} onClick={() => { setActiveEpisode(index); setActiveBlockId(null); setMode("formatted"); }}>
        {episode.titlePage.title || `Episode ${index + 1}`}
      </button>)}
    </div>}
    <div className="toolbar">
      <select className="element-select" value={activeBlock?.type ?? "action"} disabled={!activeBlock || mode === "source" || doc.readOnly} onChange={(event) => setActiveType(event.target.value as ScreenplayElementType)}>
        {ELEMENT_TYPES.map((type, index) => <option key={type} value={type}>{elementLabels[type]} — Ctrl+{index + 1}</option>)}
      </select>
      <div className="mode-toggle">
        <button className={mode === "formatted" ? "active" : ""} onClick={() => mode === "source" && toggleMode()}>Formatted</button>
        <button disabled={doc.readOnly} className={mode === "source" ? "active" : ""} onClick={() => mode === "formatted" && toggleMode()}>Fountain Source</button>
      </div>
      <div className="toolbar-spacer" />
      <button className="btn" onClick={doc.readOnly ? createProject : saveNow} disabled={busy}>{doc.readOnly ? "Create SCS Project" : "Save Project"}</button>
      <button className="btn" onClick={exportFountain}>Export Fountain</button>
      <button className="btn btn-ghost" onClick={onOpenFdx} disabled={busy}>Open FDX</button>
      {doc.readOnly && <button className="btn btn-ghost" onClick={addEpisode} disabled={busy}>Add Episode FDX</button>}
      <button className="btn btn-ghost" disabled>Export FDX <span className="planned-tag">planned</span></button>
      <button className="btn" onClick={() => setInspectorOpen((open) => !open)}>{inspectorOpen ? "Panel ▸" : "◂ Panel"}</button>
    </div>
    {doc.readOnly && <div className="readonly-banner">FDX Read-Only — Editing arrives in Phase 3. <span>{doc.source?.fileName}</span></div>}
    {operationMessage && <div className="operation-message" role="status">{operationMessage}</div>}
    {!!doc.warnings?.length && <details className="import-summary"><summary>{doc.warnings.length} import warning{doc.warnings.length === 1 ? "" : "s"} — source data was preserved where possible</summary><ul>{doc.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><strong>{warning.code}</strong>: {warning.message}</li>)}</ul></details>}
    <div className="workspace-main">
      <aside className="scene-nav">
        <div className="nav-doc-title">{doc.titlePage.title || "Untitled Screenplay"}</div>
        <div className="nav-group"><span className="nav-act">ACT I</span><span className="nav-structure-hint">structure grouping planned</span></div>
        <div className="nav-sequence">Sequence 1</div>
        <ol className="nav-scenes">
          {scenes.map((scene) => <li key={scene.id}><button className={`nav-scene ${activeScene?.id === scene.id ? "active" : ""}`} onClick={() => jumpToScene(scene.id)}><span className="nav-scene-num">{scene.sceneNumber ?? scene.number}</span><span className="nav-scene-heading">{scene.heading}</span></button>{activeScene?.id === scene.id && <div className="nav-beats">Beats — beat board planned</div>}</li>)}
          {!scenes.length && <li className="nav-empty">No scenes yet — start with INT. or EXT.</li>}
        </ol>
        <div className="nav-foot">{scenes.length} scene{scenes.length === 1 ? "" : "s"} · ~{pages} page{pages === 1 ? "" : "s"}</div>
      </aside>
      {mode === "formatted" ? <Editor blocks={doc.blocks} onBlocksChange={(blocks) => setDoc({ ...doc, blocks })} titlePage={doc.titlePage} onTitlePageChange={(titlePage) => setDoc({ ...doc, titlePage })} onActiveBlock={setActiveBlockId} focusRequest={focusRequest} readOnly={doc.readOnly} /> : <div className="source-wrap"><textarea className="source-editor" value={sourceText} spellCheck={false} onChange={(event) => setSourceText(event.target.value)} /><p className="source-hint">Fountain-inspired source. Switching back to Formatted re-parses this text.</p></div>}
      {inspectorOpen && <Inspector blocks={doc.blocks} scenes={scenes} characters={characters} locations={locations} activeScene={activeScene} sceneNotes={doc.sceneNotes} onSceneNote={(sceneId, text) => { if (!doc.readOnly) setDoc({ ...doc, sceneNotes: { ...doc.sceneNotes, [sceneId]: text } }); }} versions={versions} onSaveVersion={saveDraftVersion} words={words} pages={pages} episodeDocuments={episodeDocs} readOnly={doc.readOnly} />}
    </div>
    <div className="statusbar"><span className="status-element">{activeBlock ? elementLabels[activeBlock.type] : "—"}</span><span>{scenes.length} scene{scenes.length === 1 ? "" : "s"}</span><span>~{pages} pages</span><span>{words} words</span><div className="toolbar-spacer" /><span>{doc.readOnly ? `Linked source · ${doc.source?.fileName ?? "FDX"}` : savedAt ? `Saved locally · ${savedAt}` : "Not saved yet"}</span><span className="status-draft">Draft: current · drafts panel →</span></div>
  </div>;
}
