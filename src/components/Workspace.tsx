import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "./Editor.tsx";
import Inspector from "./Inspector.tsx";
import {
  ELEMENT_TYPES,
  breakdownCsv,
  breakdownMarkdown,
  buildStructure,
  compareDrafts,
  compileBreakdown,
  countWords,
  detectObjects,
  deriveCharacters,
  deriveLocations,
  deriveScenes,
  elementLabels,
  emptyDocument,
  emptyWorkspace,
  estimatePages,
  moveScene,
  parseFountain,
  reconcileSceneMetadata,
  resolveStoryStructure,
  toFdxWithWarnings,
  toFountain,
  type ScreenplayDocument,
  type ScreenplayElementType,
  type DraftSnapshot,
  type ProjectSession,
  syncSeriesDocuments,
} from "../domain/index.ts";
import { saveSession } from "../storage.ts";
import { chooseAndParseFdx, linkedFileModifiedAt, messageFrom, parseLinkedFdx, saveProjectSession } from "../services/fdxService.ts";

interface WorkspaceProps {
  initialSession: ProjectSession;
  onOpenFdx: () => void;
}

export default function Workspace({ initialSession, onOpenFdx }: WorkspaceProps) {
  const [session, setSession] = useState(initialSession);
  const episodeDocs = session.documents;
  const [activeEpisode, setActiveEpisode] = useState(() => Math.max(0, initialSession.documents.findIndex((document) => document.id === initialSession.activeDocumentId)));
  const doc = episodeDocs[activeEpisode];
  const setDoc = (next: ScreenplayDocument) => setSession((current) => ({
    ...current,
    documents: current.documents.map((item, index) => index === activeEpisode ? next : item),
  }));
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(() => initialSession.workspace.layouts.find((layout) => layout.id === initialSession.workspace.activeLayoutId)?.inspector !== "hidden");
  const [mode, setMode] = useState<"formatted" | "source">("formatted");
  const [sourceText, setSourceText] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const versions = session.versions;
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const layout = session.workspace.activeLayoutId;
  const [externalChanged, setExternalChanged] = useState(false);
  const [externalConflict, setExternalConflict] = useState(false);
  const [draggedScene, setDraggedScene] = useState<number | null>(null);
  const focusNonce = useRef(0);
  const sessionRef = useRef(session);
  const linkedBaselines = useRef(new Map(initialSession.documents.map((document) => [document.id!, documentFingerprint(document)])));

  useEffect(() => {
    sessionRef.current = session;
    const timer = setTimeout(() => {
      if (saveSession(session)) setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      else setOperationMessage("Local recovery storage is full. Save the portable project now.");
    }, 800);
    return () => clearTimeout(timer);
  }, [session]);

  useEffect(() => () => { saveSession(sessionRef.current); }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if (event.key === "Escape") setPaletteOpen(false);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, []);

  useEffect(() => {
    const path = doc.source?.type === "fdx" ? doc.source.path : null;
    if (!path) return;
    const documentId = doc.id!;
    let baseline = 0;
    let stopped = false;
    const check = async () => {
      try {
        const stamp = await linkedFileModifiedAt(path);
        if (baseline && stamp !== baseline && !stopped) {
          const current = sessionRef.current.documents.find((document) => document.id === documentId);
          setExternalConflict(Boolean(current && documentFingerprint(current) !== linkedBaselines.current.get(documentId)));
          setExternalChanged(true);
        }
        baseline = stamp;
      } catch { /* linked file may be temporarily unavailable */ }
    };
    void check();
    const timer = window.setInterval(check, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [doc.id, doc.source?.path]);

  const scenes = useMemo(() => doc.readOnly && doc.scenes ? doc.scenes.map((scene, index) => ({
    id: scene.id,
    number: index + 1,
    sceneNumber: scene.sceneNumber,
    heading: scene.heading,
    blockIndex: scene.blockStart,
    characters: scene.characterIds
      .map((id) => doc.characters?.find((character) => character.id === id)?.canonicalName)
      .filter((name): name is string => Boolean(name)),
  })) : deriveScenes(doc.blocks), [doc]);
  const characters = useMemo(() => doc.readOnly && doc.characters ? doc.characters.map((character) => ({
    name: character.canonicalName,
    cueCount: character.dialogueBlockIds.length,
    firstScene: Math.max(1, (doc.scenes?.findIndex((scene) => scene.id === character.sceneIds[0]) ?? 0) + 1),
  })) : deriveCharacters(doc.blocks), [doc]);
  const locations = useMemo(() => doc.readOnly && doc.locations ? doc.locations.map((location) => ({
    name: location.displayName,
    intExt: location.interiorExteriorUsages,
    sceneNumbers: location.sceneIds.map((id) => (doc.scenes?.findIndex((scene) => scene.id === id) ?? 0) + 1),
  })) : deriveLocations(doc.blocks), [doc]);
  const objects = useMemo(() => detectObjects(doc.blocks), [doc.blocks]);
  const workspace = doc.workspace ?? emptyWorkspace();
  const structure = useMemo(() => buildStructure(doc.blocks), [doc.blocks]);
  const customStructure = useMemo(() => resolveStoryStructure(doc.blocks, workspace.storyStructure), [doc.blocks, workspace.storyStructure]);
  const breakdown = useMemo(() => compileBreakdown(doc.blocks), [doc.blocks]);
  const draftChanges = useMemo(() => versions.length > 1 ? compareDrafts(versions[1].document, versions[0].document) : [], [versions]);
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
    setDoc(reconcileSceneMetadata(doc, parsed));
    setMode("formatted");
  };

  const saveNow = () => {
    if (saveSession(session)) setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    else setOperationMessage("Local recovery storage is full. Save the portable project now.");
  };

  const download = (content: string, extension: string, type: string) => {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${(doc.titlePage.title || "screenplay").toLowerCase().replace(/\s+/g, "-")}.${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const exportFountain = () => download(toFountain(doc), "fountain", "text/plain");
  const exportFdx = () => {
    const { xml, warnings } = toFdxWithWarnings(doc);
    download(xml, "fdx", "application/xml");
    setOperationMessage(warnings.length ? `FDX exported with ${warnings.length} preservation warning${warnings.length === 1 ? "" : "s"}: ${warnings.join(" ")}` : "FDX exported without preservation warnings.");
  };
  const exportBreakdown = (format: "md" | "csv" | "json" | "pdf") => {
    const markdown = breakdownMarkdown(doc.titlePage.title || "Screenplay", breakdown);
    if (format === "pdf") return printContent("Breakdown", markdown);
    const content = format === "md" ? markdown : format === "csv" ? breakdownCsv(breakdown) : JSON.stringify(breakdown, null, 2);
    download(content, format, format === "json" ? "application/json" : "text/plain");
  };
  const exportTreatment = (format: "md" | "pdf") => {
    const treatment = workspace.treatments?.find((item) => item.id === workspace.activeTreatmentId) ?? workspace.treatments?.[0];
    const markdown = treatment?.markdown || workspace.treatment || "# Untitled Treatment\n";
    if (format === "pdf") return printContent(treatment?.title || "Treatment", markdown);
    download(markdown, "md", "text/markdown");
  };

  const addEpisode = async () => {
    setBusy(true);
    setOperationMessage(null);
    try {
      const imported = await chooseAndParseFdx();
      if (!imported) return;
      const documents = [...episodeDocs, imported];
      const projectWorkspace = structuredClone(session.workspace);
      syncSeriesDocuments(projectWorkspace.series, documents);
      setSession({ ...session, projectType: "television", documents, workspace: projectWorkspace, activeDocumentId: imported.id! });
      setActiveEpisode(documents.length - 1);
      setActiveBlockId(null);
      setMode("formatted");
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const addBlankEpisode = () => {
    const imported = emptyDocument(`Episode ${episodeDocs.length + 1}`);
    const documents = [...episodeDocs, imported];
    const projectWorkspace = structuredClone(session.workspace);
    syncSeriesDocuments(projectWorkspace.series, documents);
    setSession({ ...session, projectType: "television", documents, workspace: projectWorkspace, activeDocumentId: imported.id! });
    setActiveEpisode(documents.length - 1);
    setActiveBlockId(null);
    setMode("formatted");
  };

  const createProject = async () => {
    setBusy(true);
    setOperationMessage(null);
    try {
      const saved = await saveProjectSession({ ...session, name: session.name || episodeDocs[0].titlePage.title || "Untitled Project" });
      if (saved) {
        setSession(saved);
        setOperationMessage(`Portable project saved to ${saved.projectPath}.`);
      }
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const saveDraftVersion = () => setSession((current) => {
    // ponytail: keep 50 local snapshots; portable projects can retain longer history outside browser storage
    const next: DraftSnapshot[] = [{ id: `draft-${Date.now()}`, label: `Draft ${current.versions.length + 1}`, note: "Saved draft version", createdAt: new Date().toISOString(), milestone: false, document: structuredClone(current.documents[activeEpisode]) }, ...current.versions].slice(0, 50);
    return { ...current, versions: next };
  });

  const restoreVersion = (version: DraftSnapshot) => {
    setDoc(JSON.parse(JSON.stringify(version.document)) as ScreenplayDocument);
    setOperationMessage(`Restored ${version.label}.`);
  };

  const reloadLinkedFdx = async () => {
    if (!doc.source?.path) return;
    setBusy(true);
    try {
      if (externalConflict) saveDraftVersion();
      const imported = await parseLinkedFdx(doc.source.path);
      setDoc(reconcileSceneMetadata(doc, imported));
      linkedBaselines.current.set(doc.id!, documentFingerprint(imported));
      setExternalChanged(false);
      setExternalConflict(false);
      setOperationMessage("Re-imported external FDX; SCS development metadata was preserved.");
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const keepLocalAfterConflict = () => {
    saveDraftVersion();
    linkedBaselines.current.set(doc.id!, documentFingerprint(doc));
    setExternalChanged(false);
    setExternalConflict(false);
    setOperationMessage("Kept the SCS draft and saved a recovery version. Export FDX when you are ready to hand it back.");
  };

  const selectLayout = (next: string) => {
    setSession((current) => ({ ...current, workspace: { ...current.workspace, activeLayoutId: next } }));
    setInspectorOpen(session.workspace.layouts.find((item) => item.id === next)?.inspector !== "hidden");
  };

  const searchResults = query.trim() ? [
    ...scenes.filter((scene) => scene.heading.toLowerCase().includes(query.toLowerCase())).map((scene) => ({ label: `Scene ${scene.number}: ${scene.heading}`, action: () => jumpToScene(scene.id) })),
    ...characters.filter((character) => character.name.toLowerCase().includes(query.toLowerCase())).map((character) => ({ label: `Character: ${character.name}`, action: () => setInspectorOpen(true) })),
    ...objects.filter((object) => object.name.toLowerCase().includes(query.toLowerCase())).map((object) => ({ label: `Object: ${object.name}`, action: () => setInspectorOpen(true) })),
  ].slice(0, 12) : [];

  const dropScene = (to: number) => {
    if (draggedScene === null) return;
    setDoc({ ...doc, blocks: moveScene(doc.blocks, draggedScene, to), scenes: undefined, characters: undefined, locations: undefined });
    setDraggedScene(null);
  };

  return <div className={`workspace layout-${layout}`}>
    {paletteOpen && <div className="command-backdrop" onMouseDown={() => setPaletteOpen(false)}><div className="command-palette" onMouseDown={(event) => event.stopPropagation()}><input autoFocus value={query} placeholder="Search project or run a command…" onChange={(event) => setQuery(event.target.value)} />{query ? searchResults.map((result) => <button key={result.label} onClick={() => { result.action(); setPaletteOpen(false); }}>{result.label}</button>) : <><button onClick={() => { saveNow(); setPaletteOpen(false); }}>Save Project</button><button onClick={() => { saveDraftVersion(); setPaletteOpen(false); }}>Save Draft Version</button><button onClick={() => { exportFdx(); setPaletteOpen(false); }}>Export FDX</button><button onClick={() => { setInspectorOpen((open) => !open); setPaletteOpen(false); }}>Toggle Inspector</button></>}</div></div>}
    {episodeDocs.length > 1 && <div className="workspace-episodes" aria-label="Television episodes">
      {episodeDocs.map((episode, index) => <button key={episode.id ?? episode.source?.path ?? index} className={`episode-tab ${index === activeEpisode ? "active" : ""}`} onClick={() => { setActiveEpisode(index); setSession((current) => ({ ...current, activeDocumentId: episode.id! })); setActiveBlockId(null); setMode("formatted"); }}>
        {episode.titlePage.title || `Episode ${index + 1}`}
      </button>)}
    </div>}
    <div className="toolbar">
      <input className="project-name-input" aria-label="Project name" value={session.name} onChange={(event) => setSession({ ...session, name: event.target.value })} />
      <select className="element-select" value={activeBlock?.type ?? "action"} disabled={!activeBlock || mode === "source" || doc.readOnly} onChange={(event) => setActiveType(event.target.value as ScreenplayElementType)}>
        {ELEMENT_TYPES.map((type, index) => <option key={type} value={type}>{elementLabels[type]} — Ctrl+{index + 1}</option>)}
      </select>
      <div className="mode-toggle">
        <button className={mode === "formatted" ? "active" : ""} onClick={() => mode === "source" && toggleMode()}>Formatted</button>
        <button disabled={doc.readOnly} className={mode === "source" ? "active" : ""} onClick={() => mode === "formatted" && toggleMode()}>Fountain Source</button>
      </div>
      <div className="toolbar-spacer" />
      <button className="btn btn-ghost" onClick={() => setPaletteOpen(true)}>Search · Ctrl+K</button>
      <select className="element-select" aria-label="Workspace layout" value={layout} onChange={(event) => selectLayout(event.target.value)}><option value="writer">Writer</option><option value="development">Development</option><option value="revision">Revision</option><option value="television">Television</option><option value="production">Production</option></select>
      <button className="btn" onClick={saveNow} disabled={busy}>Save Project</button>
      <button className="btn btn-ghost" onClick={createProject} disabled={busy}>Save Portable Project</button>
      <button className="btn" onClick={exportFountain}>Export Fountain</button>
      <button className="btn btn-ghost" onClick={onOpenFdx} disabled={busy}>Open FDX</button>
      <button className="btn btn-ghost" onClick={addEpisode} disabled={busy}>Add Episode FDX</button>
      <button className="btn btn-ghost" onClick={addBlankEpisode} disabled={busy}>New Episode</button>
      <button className="btn btn-ghost" onClick={exportFdx}>Export FDX</button>
      <button className="btn" onClick={() => setInspectorOpen((open) => !open)}>{inspectorOpen ? "Panel ▸" : "◂ Panel"}</button>
    </div>
    {doc.source?.type === "fdx" && <div className="readonly-banner">Linked FDX · edits stay in SCS until exported. <span>{doc.source.fileName}</span></div>}
    {externalChanged && <div className="operation-message" role="alert">{externalConflict ? "Both SCS and the linked FDX changed. Choose which script text to keep; SCS snapshots the current draft first." : "The linked FDX changed outside SCS."} <button className="btn" onClick={reloadLinkedFdx}>{externalConflict ? "Use external FDX" : "Re-import and preserve metadata"}</button>{externalConflict && <button className="btn btn-ghost" onClick={keepLocalAfterConflict}>Keep SCS draft</button>}</div>}
    {operationMessage && <div className="operation-message" role="status">{operationMessage}</div>}
    {!!doc.warnings?.length && <details className="import-summary"><summary>{doc.warnings.length} import warning{doc.warnings.length === 1 ? "" : "s"} — source data was preserved where possible</summary><ul>{doc.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><strong>{warning.code}</strong>: {warning.message}</li>)}</ul></details>}
    <div className="workspace-main">
      <aside className="scene-nav">
        <div className="nav-doc-title">{doc.titlePage.title || "Untitled Screenplay"}</div>
        <div className="nav-group"><span className="nav-act">{structure.acts[0]?.title ?? "Act I"}</span><span className="nav-structure-hint">{structure.acts.length} act{structure.acts.length === 1 ? "" : "s"}</span></div>
        <div className="nav-sequence">{structure.acts.reduce((count, act) => count + act.sequences.length, 0)} sequences · {structure.beats.length} beats</div>
        <ol className="nav-scenes">
          {scenes.map((scene) => <li key={scene.id} draggable onDragStart={() => setDraggedScene(scene.number - 1)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropScene(scene.number - 1)}><button className={`nav-scene ${activeScene?.id === scene.id ? "active" : ""}`} onClick={() => jumpToScene(scene.id)} title="Drag to reorder"><span className="nav-scene-num">{scene.sceneNumber ?? scene.number}</span><span className="nav-scene-heading">{scene.heading}</span></button>{activeScene?.id === scene.id && <div className="nav-beats">{structure.beats.filter((beat) => beat.sceneId === scene.id).map((beat) => beat.text).join(" · ") || "No beats"}</div>}</li>)}
          {!scenes.length && <li className="nav-empty">No scenes yet — start with INT. or EXT.</li>}
        </ol>
        <div className="nav-foot">{scenes.length} scene{scenes.length === 1 ? "" : "s"} · ~{pages} page{pages === 1 ? "" : "s"}</div>
      </aside>
      {mode === "formatted" ? <Editor blocks={doc.blocks} onBlocksChange={(blocks) => setDoc({ ...doc, blocks })} titlePage={doc.titlePage} onTitlePageChange={(titlePage) => setDoc({ ...doc, titlePage })} onActiveBlock={setActiveBlockId} focusRequest={focusRequest} readOnly={doc.readOnly} /> : <div className="source-wrap"><textarea className="source-editor" value={sourceText} spellCheck={false} onChange={(event) => setSourceText(event.target.value)} /><p className="source-hint">Fountain-inspired source. Switching back to Formatted re-parses this text.</p></div>}
      {inspectorOpen && <Inspector blocks={doc.blocks} scenes={scenes} characters={characters} locations={locations} objects={objects} customStructure={customStructure} breakdown={breakdown} activeScene={activeScene} sceneNotes={doc.sceneNotes} onSceneNote={(sceneId, text) => setDoc({ ...doc, sceneNotes: { ...doc.sceneNotes, [sceneId]: text } })} workspace={workspace} onWorkspace={(patch) => setDoc({ ...doc, workspace: { ...workspace, ...patch } })} onJumpToScene={jumpToScene} versions={versions} draftChanges={draftChanges} onSaveVersion={saveDraftVersion} onRestoreVersion={restoreVersion} onExportBreakdown={exportBreakdown} onExportTreatment={exportTreatment} episodeDocuments={episodeDocs} />}
    </div>
    <div className="statusbar"><span className="status-element">{activeBlock ? elementLabels[activeBlock.type] : "—"}</span><span>{scenes.length} scene{scenes.length === 1 ? "" : "s"}</span><span>~{pages} pages</span><span>{words} words</span><div className="toolbar-spacer" /><span>{doc.readOnly ? `Linked source · ${doc.source?.fileName ?? "FDX"}` : savedAt ? `Saved locally · ${savedAt}` : "Not saved yet"}</span><span className="status-draft">Draft: current · drafts panel →</span></div>
  </div>;
}

function documentFingerprint(document: ScreenplayDocument): string {
  return JSON.stringify([document.titlePage, document.blocks]);
}

function printContent(title: string, content: string): void {
  const frame = document.createElement("iframe");
  frame.hidden = true;
  frame.srcdoc = `<!doctype html><title>${escapeHtml(title)}</title><style>body{font:12pt/1.5 Georgia,serif;max-width:7in;margin:.6in auto;white-space:pre-wrap}h1{font:20pt system-ui}</style><h1>${escapeHtml(title)}</h1><main>${escapeHtml(content)}</main>`;
  frame.onload = () => {
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 1000);
  };
  document.body.append(frame);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
