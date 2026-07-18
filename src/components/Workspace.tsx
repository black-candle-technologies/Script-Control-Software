import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "./Editor.tsx";
import Inspector from "./Inspector.tsx";
import {
  ELEMENT_TYPES,
  analysisToCsv,
  analysisToJson,
  analysisToMarkdown,
  addMilestone,
  buildStructure,
  compareSnapshots,
  compareDrafts,
  compileBreakdown,
  compileAnalysis,
  createAlternateDraft,
  createProjectSnapshot,
  createVersionHistory,
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
  mergeSnapshots,
  parseFountain,
  reconcileSceneMetadata,
  resolveStoryStructure,
  restoreProjectSnapshot,
  saveSnapshot,
  toFdxWithWarnings,
  toFountain,
  type ScreenplayDocument,
  type ScreenplayElementType,
  type AnalysisCsvSection,
  type CoverageHook,
  type MergeConflict,
  type ProjectSession,
  type ProjectSnapshot,
  type SnapshotComparison,
  type SnapshotDiffMode,
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
  const versionHistory = session.versionHistory;
  const [versionComparison, setVersionComparison] = useState<SnapshotComparison | null>(null);
  const [mergeConflicts, setMergeConflicts] = useState<MergeConflict[]>([]);
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
  const activeBranchSnapshots = useMemo(() => versionHistory.snapshots.filter((snapshot) => snapshot.branchId === versionHistory.activeBranchId), [versionHistory]);
  const recentSnapshots = activeBranchSnapshots.slice(-2);
  const draftChanges = useMemo(() => {
    if (recentSnapshots.length < 2) return [];
    const before = recentSnapshots[0].session.documents.find((document) => document.id === doc.id);
    const after = recentSnapshots[1].session.documents.find((document) => document.id === doc.id);
    return before && after ? compareDrafts(before, after) : [];
  }, [doc.id, recentSnapshots]);
  const analysis = useMemo(() => compileAnalysis(doc, {
    entityOverrides: workspace.entityOverrides,
    plotThreads: workspace.plotThreads,
    treatmentSections: treatmentCoverage(workspace),
    resolvedBeatIds: workspace.resolvedBeatIds,
    storyStructure: customStructure,
    revision: recentSnapshots.length > 1 ? { fromLabel: recentSnapshots[0].name, toLabel: recentSnapshots[1].name, changes: draftChanges } : undefined,
  }), [customStructure, doc, draftChanges, recentSnapshots, workspace.entityOverrides, workspace.plotThreads, workspace.resolvedBeatIds, workspace.treatments]);
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
  const exportBreakdown = (format: "md" | "csv" | "json" | "pdf", section: AnalysisCsvSection = "scenes") => {
    const markdown = analysisToMarkdown(analysis);
    if (format === "pdf") return printContent("Breakdown", markdown);
    const content = format === "md" ? markdown : format === "csv" ? analysisToCsv(analysis, section) : analysisToJson(analysis);
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

  const projectSnapshot = (current: ProjectSession, name: string, description: string, parentIds: string[] = []) => createProjectSnapshot(current, {
    id: `draft-${Date.now()}-${crypto.randomUUID()}`,
    name,
    description,
    createdAt: new Date().toISOString(),
    parentIds,
    branchId: current.versionHistory.activeBranchId || "main",
  });

  const saveDraftVersion = (name = `Draft ${versionHistory.snapshots.length + 1}`, description = "Saved draft version", milestone = false) => {
    setSession((current) => {
      const snapshot = projectSnapshot(current, name, description);
      let history = current.versionHistory.snapshots.length
        ? saveSnapshot(current.versionHistory, snapshot)
        : createVersionHistory(snapshot, { id: "main", name: "Main Draft" });
      if (milestone) history = addMilestone(history, { id: `milestone-${crypto.randomUUID()}`, name, snapshotId: snapshot.id, description });
      return { ...current, versionHistory: history };
    });
    setOperationMessage(`Saved project version “${name}”.`);
  };

  const sessionWithHistory = (restored: ProjectSession, current: ProjectSession, history = current.versionHistory): ProjectSession => ({
    ...restored,
    schemaVersion: 4,
    projectId: current.projectId,
    projectPath: current.projectPath,
    updatedAt: current.updatedAt,
    versionHistory: history,
    versions: current.versions,
  });

  const restoreVersion = (snapshot: ProjectSnapshot) => {
    const next = sessionWithHistory(restoreProjectSnapshot(snapshot), session);
    setSession(next);
    setActiveEpisode(Math.max(0, next.documents.findIndex((document) => document.id === next.activeDocumentId)));
    setActiveBlockId(null);
    setOperationMessage(`Restored ${snapshot.name}; Project History was preserved.`);
  };

  const compareProjectVersions = (fromId: string, toId: string, compareMode: SnapshotDiffMode) => {
    const from = versionHistory.snapshots.find((snapshot) => snapshot.id === fromId);
    const to = versionHistory.snapshots.find((snapshot) => snapshot.id === toId);
    if (from && to) setVersionComparison(compareSnapshots(from, to, compareMode));
  };

  const createAlternate = (name: string, fromSnapshotId: string) => {
    const source = versionHistory.snapshots.find((snapshot) => snapshot.id === fromSnapshotId);
    if (!source) return;
    const id = `alternate-${crypto.randomUUID()}`;
    const history = createAlternateDraft(versionHistory, { id, name, fromSnapshotId });
    const next = sessionWithHistory(restoreProjectSnapshot(source), session, history);
    setSession(next);
    setActiveEpisode(Math.max(0, next.documents.findIndex((document) => document.id === next.activeDocumentId)));
    setActiveBlockId(null);
    setOperationMessage(`Created Alternate Draft “${name}”.`);
  };

  const switchAlternate = (branchId: string) => {
    if (branchId === versionHistory.activeBranchId) return;
    let history = versionHistory;
    const active = history.branches.find((branch) => branch.id === history.activeBranchId);
    const activeHead = history.snapshots.find((snapshot) => snapshot.id === active?.headSnapshotId);
    if (active && activeHead && versionableFingerprint(session) !== versionableFingerprint(activeHead.session)) {
      history = saveSnapshot(history, projectSnapshot(session, "Auto-save before switching drafts", "Working changes preserved automatically."), active.id);
    }
    const target = history.branches.find((branch) => branch.id === branchId);
    const snapshot = history.snapshots.find((item) => item.id === target?.headSnapshotId);
    if (!target || !snapshot) return;
    history = { ...history, activeBranchId: branchId };
    const next = sessionWithHistory(restoreProjectSnapshot(snapshot), session, history);
    setSession(next);
    setActiveEpisode(Math.max(0, next.documents.findIndex((document) => document.id === next.activeDocumentId)));
    setActiveBlockId(null);
    setOperationMessage(`Switched to ${target.name}.`);
  };

  const combineDrafts = (sourceBranchId: string, resolution: "ours" | "theirs") => {
    let history = versionHistory;
    const active = history.branches.find((branch) => branch.id === history.activeBranchId);
    const source = history.branches.find((branch) => branch.id === sourceBranchId);
    if (!active || !source) return;
    let ours = history.snapshots.find((snapshot) => snapshot.id === active.headSnapshotId);
    if (!ours || versionableFingerprint(session) !== versionableFingerprint(ours.session)) {
      const working = projectSnapshot(session, "Working draft before combine", "Automatic safety snapshot.");
      history = history.snapshots.length ? saveSnapshot(history, working, active.id) : createVersionHistory(working);
      ours = working;
    }
    const theirs = history.snapshots.find((snapshot) => snapshot.id === source.headSnapshotId);
    const base = findCommonSnapshot(history.snapshots, ours.id, theirs?.id ?? "");
    if (!theirs || !base) return;
    const result = mergeSnapshots(base, ours, theirs, resolution);
    const mergedSession = sessionWithHistory(result.merged, session, history);
    const combined = projectSnapshot(mergedSession, `Combined ${source.name} into ${active.name}`, `${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"}; kept ${resolution}.`, [ours.id, theirs.id]);
    history = saveSnapshot(history, combined, active.id);
    const next = { ...result.merged, projectPath: session.projectPath, updatedAt: session.updatedAt, versions: session.versions, versionHistory: history };
    setSession(next);
    setMergeConflicts(result.conflicts);
    setActiveEpisode(Math.max(0, next.documents.findIndex((document) => document.id === next.activeDocumentId)));
    setActiveBlockId(null);
    setOperationMessage(result.clean ? `Combined ${source.name} without conflicts.` : `Combined ${source.name}; ${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"} kept ${resolution}.`);
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
      {inspectorOpen && <Inspector blocks={doc.blocks} scenes={scenes} characters={characters} locations={locations} objects={objects} customStructure={customStructure} breakdown={breakdown} analysis={analysis} activeScene={activeScene} sceneNotes={doc.sceneNotes} onSceneNote={(sceneId, text) => setDoc({ ...doc, sceneNotes: { ...doc.sceneNotes, [sceneId]: text } })} workspace={workspace} onWorkspace={(patch) => setDoc({ ...doc, workspace: { ...workspace, ...patch } })} onJumpToScene={jumpToScene} versionHistory={versionHistory} versionComparison={versionComparison} mergeConflicts={mergeConflicts} onSaveVersion={saveDraftVersion} onRestoreVersion={restoreVersion} onCompareVersions={compareProjectVersions} onCreateAlternateDraft={createAlternate} onSwitchAlternateDraft={switchAlternate} onCombineDrafts={combineDrafts} onExportBreakdown={exportBreakdown} onExportTreatment={exportTreatment} episodeDocuments={episodeDocs} />}
    </div>
    <div className="statusbar"><span className="status-element">{activeBlock ? elementLabels[activeBlock.type] : "—"}</span><span>{scenes.length} scene{scenes.length === 1 ? "" : "s"}</span><span>~{pages} pages</span><span>{words} words</span><div className="toolbar-spacer" /><span>{doc.readOnly ? `Linked source · ${doc.source?.fileName ?? "FDX"}` : savedAt ? `Saved locally · ${savedAt}` : "Not saved yet"}</span><span className="status-draft">Draft: current · drafts panel →</span></div>
  </div>;
}

function documentFingerprint(document: ScreenplayDocument): string {
  return JSON.stringify([document.titlePage, document.blocks]);
}

function versionableFingerprint(session: ProjectSession): string {
  const { versionHistory: _history, versions: _legacy, projectPath: _path, updatedAt: _updated, ...content } = session;
  return JSON.stringify(content);
}

function findCommonSnapshot(snapshots: ProjectSnapshot[], leftId: string, rightId: string): ProjectSnapshot | undefined {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const ancestors = new Set<string>();
  const left = [leftId];
  while (left.length) {
    const id = left.shift()!;
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    left.push(...(byId.get(id)?.parentIds ?? []));
  }
  const right = [rightId];
  const seen = new Set<string>();
  while (right.length) {
    const id = right.shift()!;
    if (ancestors.has(id)) return byId.get(id);
    if (seen.has(id)) continue;
    seen.add(id);
    right.push(...(byId.get(id)?.parentIds ?? []));
  }
  return undefined;
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

function treatmentCoverage(workspace: ReturnType<typeof emptyWorkspace>): CoverageHook[] {
  return (workspace.treatments ?? []).map((treatment) => ({
    id: treatment.id,
    label: treatment.title,
    sceneIds: treatment.links.filter((link) => link.targetType === "scene").map((link) => link.targetId),
    beatIds: treatment.links.filter((link) => link.targetType === "beat").map((link) => link.targetId),
  }));
}
