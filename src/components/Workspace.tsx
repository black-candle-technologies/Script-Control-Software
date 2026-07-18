import { cloneElement, isValidElement, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Editor from "./Editor.tsx";
import Inspector, { type InspectorTab } from "./Inspector.tsx";
import LayoutManager from "./LayoutManager.tsx";
import CompanionDashboard from "./CompanionDashboard.tsx";
import {
  ELEMENT_TYPES,
  analysisToCsv,
  analysisToJson,
  analysisToMarkdown,
  addMilestone,
  buildCharacterSides,
  buildSceneSides,
  buildStructure,
  compareSnapshots,
  compareDrafts,
  compileBreakdown,
  compileAnalysis,
  compileSeriesWorkspace,
  createAlternateDraft,
  createProjectSnapshot,
  createVersionHistory,
  dialogueOnly,
  countWords,
  detectObjects,
  deriveCharacters,
  deriveLocations,
  deriveScenes,
  documentsForPortableStorage,
  elementLabels,
  emptyDocument,
  emptyWorkspace,
  estimatePages,
  getWorkspaceLayout,
  hasPermission,
  keyboardShortcutMatches,
  moveScene,
  lockPages,
  markChangedBlocks,
  mergeSnapshots,
  mergeCollaboratorSessions,
  normalizeWorkspaceLayout,
  parseFountain,
  reconcileImportedDocument,
  resolveStoryStructure,
  restoreProjectSnapshot,
  restoreLocalDocumentState,
  restoreLocalWorkspaceState,
  productionPages,
  productionReports as compileProductionReports,
  productionReportsCsv,
  revisionExportMetadata,
  revisionReportMarkdown,
  saveSnapshot,
  screenplayTextFingerprint,
  setSceneOmitted,
  summarizeRevision,
  toFdxWithWarnings,
  toFountain,
  type ScreenplayDocument,
  type ScreenplayElementType,
  type AnalysisCsvSection,
  type CoverageHook,
  type CharacterProfile,
  type LocationProfile,
  type MergeConflict,
  type MergeResolutionPlan,
  type ProjectSession,
  type ProjectSnapshot,
  type ProductionExportKind,
  type ObjectProfile,
  type RevisionColor,
  type RevisionSet,
  type ProductionRevisionSummary,
  type SnapshotComparison,
  type SnapshotDiffMode,
  type SnapshotScope,
  type WorkspaceLayout,
  type WorkspacePanelDefinition,
  type WorkspaceReferenceKind,
  syncSeriesDocuments,
  versionHistoryForPortableStorage,
  workspaceForPortableStorage,
} from "../domain/index.ts";
import { saveSession } from "../storage.ts";
import {
  chooseAndParseFdx,
  chooseWatchFolder,
  linkedFileModifiedAt,
  listFdxFiles,
  isProjectConflict,
  messageFrom,
  openFdxInExternalEditor,
  openProjectSession,
  parseLinkedFdx,
  revealInFileManager,
  saveProjectSession,
  type FdxFileInfo,
} from "../services/fdxService.ts";
import { gitSyncCommit, gitSyncInit, gitSyncPull, gitSyncPush, gitSyncStatus, type GitSyncStatus } from "../services/syncService.ts";

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
  const [mergePreviewReady, setMergePreviewReady] = useState(false);
  const [mergePreviewSourceId, setMergePreviewSourceId] = useState("");
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [layoutManagerOpen, setLayoutManagerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const activeLayout: WorkspaceLayout = getWorkspaceLayout(session.workspace, session.workspace.activeLayoutId)
    ?? normalizeWorkspaceLayout(session.workspace.layouts[0]);
  const layout = activeLayout.id;
  const [externalChanged, setExternalChanged] = useState(false);
  const [externalConflict, setExternalConflict] = useState(false);
  const [externalModifiedAt, setExternalModifiedAt] = useState<number | null>(null);
  const [watchFiles, setWatchFiles] = useState<FdxFileInfo[]>([]);
  const [gitStatus, setGitStatus] = useState<GitSyncStatus>();
  const [sharedConflict, setSharedConflict] = useState<{ base?: ProjectSession; theirs: ProjectSession; conflicts: MergeConflict[] } | null>(null);
  const [draggedScene, setDraggedScene] = useState<number | null>(null);
  const focusNonce = useRef(0);
  const sessionRef = useRef(session);
  const sourceRecoveryRef = useRef({ mode, sourceText, document: doc });
  sourceRecoveryRef.current = { mode, sourceText, document: doc };
  const linkedBaselines = useRef(linkedBaselineMap(initialSession.documents));
  const sharedBaseline = useRef<ProjectSession | null>(null);
  // A local recovery session may be newer than its portable file. Establish
  // this baseline from disk before permitting pull/push operations.
  const portableBaseline = useRef("");
  const canEdit = hasPermission(session.workspace, session.workspace.currentUserId, "edit");

  const materializeSourceSession = (current: ProjectSession): ProjectSession => materializeSourceDraft(current, { mode, sourceText, document: doc });
  const installProjectSession = (next: ProjectSession) => {
    linkedBaselines.current = linkedBaselineMap(next.documents);
    setSession(next);
    setActiveEpisode(Math.max(0, next.documents.findIndex((document) => document.id === next.activeDocumentId)));
    setActiveBlockId(null);
    setMode("formatted");
    setSourceText("");
  };

  useEffect(() => {
    const index = session.documents.findIndex((document) => document.id === session.activeDocumentId);
    if (index >= 0 && index !== activeEpisode) setActiveEpisode(index);
  }, [activeEpisode, session.activeDocumentId, session.documents]);

  useEffect(() => {
    if (!initialSession.projectPath) return;
    let stopped = false;
    void openProjectSession(initialSession.projectPath).then((disk) => {
      if (!stopped && !sharedBaseline.current && !portableBaseline.current && disk.updatedAt === initialSession.updatedAt) {
        sharedBaseline.current = disk;
        portableBaseline.current = portableFingerprint(disk);
      }
    }).catch(() => { /* the portable file may have moved since local recovery */ });
    return () => { stopped = true; };
  }, [initialSession.projectPath, initialSession.updatedAt]);

  useEffect(() => {
    sessionRef.current = session;
    const timer = setTimeout(() => {
      if (saveSession(materializeSourceSession(session))) setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      else setOperationMessage("Local recovery storage is full. Save the portable project now.");
    }, 800);
    return () => clearTimeout(timer);
  }, [session]);

  useEffect(() => () => { saveSession(materializeSourceDraft(sessionRef.current, sourceRecoveryRef.current)); }, []);

  useEffect(() => {
    const path = doc.source?.type === "fdx" ? doc.source.path : null;
    if (!path) return;
    const documentId = doc.id!;
    let baseline = doc.source?.lastImportedModifiedAt ?? 0;
    let stopped = false;
    const check = async () => {
      try {
        const stamp = await linkedFileModifiedAt(path);
        if (!baseline && !stopped) {
          baseline = stamp;
          setSession((current) => ({ ...current, documents: current.documents.map((document) => document.id === documentId && document.source ? { ...document, source: { ...document.source, lastImportedModifiedAt: stamp } } : document) }));
          return;
        }
        if (stamp !== baseline && !stopped) {
          const current = materializeSourceDraft(sessionRef.current, sourceRecoveryRef.current).documents.find((document) => document.id === documentId);
          const importedFingerprint = linkedBaselines.current.get(documentId);
          setExternalConflict(Boolean(current && (!importedFingerprint || screenplayTextFingerprint(current) !== importedFingerprint)));
          setExternalModifiedAt(stamp);
          setExternalChanged(true);
        }
        baseline = stamp;
      } catch { /* linked file may be temporarily unavailable */ }
    };
    void check();
    const timer = window.setInterval(check, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [doc.id, doc.source?.lastImportedModifiedAt, doc.source?.path]);

  useEffect(() => {
    const folder = session.workspace.sync.watchFolderPath;
    if (!folder) {
      setWatchFiles([]);
      return;
    }
    let stopped = false;
    const refresh = async () => {
      try {
        const files = await listFdxFiles(folder, session.workspace.sync.watchRecursive);
        if (!stopped) setWatchFiles(files);
      } catch (error) {
        if (!stopped) setOperationMessage(messageFrom(error));
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [session.workspace.sync.watchFolderPath, session.workspace.sync.watchRecursive]);

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
  const seriesReport = useMemo(() => compileSeriesWorkspace(session), [session]);
  const entityReferenceKey = activeLayout.panels
    .filter((panel) => panel.kind === "reference" && ["character", "object", "location"].includes(panel.referenceKind ?? ""))
    .map((panel) => `${panel.referenceKind}:${panel.targetId ?? ""}`)
    .sort()
    .join("|");
  const referenceAnalyses = useMemo(() => entityReferenceKey ? session.documents.map((document) => ({
    document,
    analysis: compileAnalysis(document, {
      entityOverrides: document.workspace?.entityOverrides,
      plotThreads: document.workspace?.plotThreads,
      resolvedBeatIds: document.workspace?.resolvedBeatIds,
      storyStructure: document.workspace?.storyStructure,
    }),
  })) : [], [entityReferenceKey, session.documents]);
  const companionStats = useMemo(() => ({
    scenes: session.documents.reduce((count, document) => count + deriveScenes(document.blocks).length, 0),
    characters: new Set(session.documents.flatMap((document) => deriveCharacters(document.blocks).map((character) => character.name))).size,
    objects: new Set(session.documents.flatMap((document) => detectObjects(document.blocks).map((object) => object.name))).size,
    treatments: session.documents.reduce((count, document) => count + (document.workspace?.treatments?.length ?? 0), 0),
    versions: versionHistory.snapshots.length,
    continuity: session.workspace.series.continuity.length,
  }), [session.documents, session.workspace.series.continuity.length, versionHistory.snapshots.length]);
  const revisionSets = workspace.revisionSets ?? [];
  const productionPageRows = useMemo(() => productionPages(doc, workspace.pageLock, revisionSets), [doc, revisionSets, workspace.pageLock]);
  const productionReport = useMemo(() => compileProductionReports(doc, workspace.shootingEighthsPerDay ?? 40), [doc, workspace.shootingEighthsPerDay]);
  const productionRevisionSummaries = useMemo(() => revisionSets.flatMap((revision): ProductionRevisionSummary[] => {
    const baseline = versionHistory.snapshots.find((snapshot) => snapshot.id === revision.baselineSnapshotId)?.session.documents.find((document) => document.id === doc.id);
    return baseline ? [summarizeRevision(baseline, doc, revision, workspace.pageLock)] : [];
  }), [doc, revisionSets, versionHistory.snapshots, workspace.pageLock]);
  const words = useMemo(() => countWords(doc.blocks), [doc.blocks]);
  const pages = useMemo(() => estimatePages(doc.blocks), [doc.blocks]);
  const activeIndex = doc.blocks.findIndex((block) => block.id === activeBlockId);
  const activeBlock = activeIndex >= 0 ? doc.blocks[activeIndex] : null;
  const activeScene = activeIndex >= 0 ? [...scenes].reverse().find((scene) => scene.blockIndex <= activeIndex) ?? null : scenes[0] ?? null;
  const previousDraftDocument = useMemo(() => versionHistory.snapshots.slice().reverse()
      .map((snapshot) => snapshot.session.documents.find((document) => document.id === doc.id))
      .find((document) => document && screenplayTextFingerprint(document) !== screenplayTextFingerprint(doc)), [doc, versionHistory.snapshots]);

  const setActiveType = (type: ScreenplayElementType) => {
    if (!activeBlock || doc.readOnly || !canEdit) return;
    const blocks = doc.blocks.slice();
    blocks[activeIndex] = { ...activeBlock, type };
    setDoc({ ...doc, blocks });
    setFocusRequest({ id: activeBlock.id, nonce: ++focusNonce.current });
  };

  const jumpToScene = (sceneId: string) => {
    const imported = doc.scenes?.find((scene) => scene.id === sceneId);
    setFocusRequest({ id: imported ? doc.blocks[imported.blockStart].id : sceneId, nonce: ++focusNonce.current });
  };

  const setSceneNumber = (sceneId: string, number: string) => {
    const scene = scenes.find((item) => item.id === sceneId);
    if (!scene) return;
    const blocks = doc.blocks.slice();
    const heading = blocks[scene.blockIndex];
    const metadata = { ...heading.metadata };
    if (number.trim()) metadata.Number = number.trim();
    else delete metadata.Number;
    blocks[scene.blockIndex] = { ...heading, metadata };
    setDoc({ ...doc, blocks, scenes: undefined });
  };

  const hasUnsavedSource = mode === "source" && sourceText !== toFountain(doc);

  useEffect(() => {
    if (mode !== "source") return;
    const timer = window.setTimeout(() => {
      if (!saveSession(materializeSourceSession(sessionRef.current))) setOperationMessage("Local recovery storage is full. Save the portable project now.");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [mode, sourceText]);

  const selectEpisode = (documentId: string) => {
    const index = episodeDocs.findIndex((document) => document.id === documentId);
    if (index < 0) return;
    installProjectSession({ ...materializeSourceSession(session), activeDocumentId: documentId });
  };

  const toggleMode = () => {
    if (doc.readOnly || !canEdit) return;
    if (mode === "formatted") {
      setSourceText(toFountain(doc));
      setMode("source");
      return;
    }
    const parsed = parseFountain(sourceText);
    setSession((current) => reconcileImportedDocument(current, doc.id!, parsed));
    setMode("formatted");
  };

  const saveNow = async () => {
    if (!canEdit || busy) return;
    const current = materializeSourceSession(session);
    if (current !== session) setSession(current);
    const recoverySaved = saveSession(current);
    if (recoverySaved) setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    else setOperationMessage("Local recovery storage is full. Save the portable project now.");
    setBusy(true);
    try {
      const saved = await saveProjectSession({ ...current, name: current.name || episodeDocs[0].titlePage.title || "Untitled Project" });
      if (!saved) {
        if (recoverySaved) setOperationMessage("Local recovery was updated; the portable save was canceled.");
        return;
      }
      setSession(saved);
      sharedBaseline.current = structuredClone(saved);
      portableBaseline.current = portableFingerprint(saved);
      setOperationMessage(`Project saved to ${saved.projectPath}.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const download = (content: string, extension: string, type: string) => {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${(doc.titlePage.title || "screenplay").toLowerCase().replace(/\s+/g, "-")}.${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const outputDocument = () => materializeSourceSession(session).documents.find((document) => document.id === doc.id) ?? doc;
  const exportFountain = () => download(toFountain(outputDocument()), "fountain", "text/plain");
  const exportFdx = () => {
    const { xml, warnings } = toFdxWithWarnings(outputDocument());
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
      const current = materializeSourceSession(session);
      const documents = [...current.documents, imported];
      const projectWorkspace = structuredClone(current.workspace);
      syncSeriesDocuments(projectWorkspace.series, documents);
      linkedBaselines.current.set(imported.id!, imported.source?.lastImportedFingerprint ?? screenplayTextFingerprint(imported));
      installProjectSession({ ...current, projectType: "television", documents, workspace: projectWorkspace, activeDocumentId: imported.id! });
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const addBlankEpisode = () => {
    const current = materializeSourceSession(session);
    const imported = emptyDocument(`Episode ${current.documents.length + 1}`);
    const documents = [...current.documents, imported];
    const projectWorkspace = structuredClone(current.workspace);
    syncSeriesDocuments(projectWorkspace.series, documents);
    installProjectSession({ ...current, projectType: "television", documents, workspace: projectWorkspace, activeDocumentId: imported.id! });
  };

  const saveProjectAs = async () => {
    if (!canEdit) return;
    setBusy(true);
    setOperationMessage(null);
    try {
      const current = materializeSourceSession(session);
      const saved = await saveProjectSession({ ...current, name: current.name || episodeDocs[0].titlePage.title || "Untitled Project" }, true);
      if (saved) {
        setSession(saved);
        sharedBaseline.current = structuredClone(saved);
        portableBaseline.current = portableFingerprint(saved);
        setOperationMessage(`Portable project saved to ${saved.projectPath}.`);
      }
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const projectSnapshot = (current: ProjectSession, name: string, description: string, parentIds: string[] = [], scope: SnapshotScope = { kind: "project" }) => createProjectSnapshot(current, {
    id: `draft-${Date.now()}-${crypto.randomUUID()}`,
    name,
    description,
    createdAt: new Date().toISOString(),
    parentIds,
    branchId: current.versionHistory.activeBranchId || "main",
    scope,
  });

  const saveDraftVersion = (name = `Draft ${versionHistory.snapshots.length + 1}`, description = "Saved draft version", milestone = false, scope: SnapshotScope = { kind: "project" }) => {
    if (!hasPermission(session.workspace, session.workspace.currentUserId, "edit")) {
      setOperationMessage("The current collaboration role cannot save draft versions.");
      return;
    }
    const current = materializeSourceSession(session);
    try {
      const snapshot = projectSnapshot(current, name, description, [], scope);
      let history = current.versionHistory;
      if (!history.snapshots.length && scope.kind !== "project") {
        history = createVersionHistory(projectSnapshot(current, "Initial project baseline", "Automatic whole-project baseline for scoped history."), { id: "main", name: "Main Draft" });
      }
      history = history.snapshots.length
        ? saveSnapshot(history, snapshot)
        : createVersionHistory(snapshot, { id: "main", name: "Main Draft" });
      if (milestone) history = addMilestone(history, { id: `milestone-${crypto.randomUUID()}`, name, snapshotId: snapshot.id, description });
      setSession({ ...current, versionHistory: history });
      setOperationMessage(`Saved ${scope.kind} version “${name}”.`);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "The version could not be saved.");
    }
  };

  const sessionWithHistory = (restored: ProjectSession, current: ProjectSession, history = current.versionHistory): ProjectSession => ({
    ...restored,
    schemaVersion: 4,
    projectId: current.projectId,
    projectPath: current.projectPath,
    updatedAt: current.updatedAt,
    documents: restoreLocalDocumentState(restored.documents, current.documents),
    versionHistory: history,
    versions: current.versions,
    workspace: {
      ...restored.workspace,
      collaborators: current.workspace.collaborators,
      currentUserId: current.workspace.currentUserId,
      reviews: current.workspace.reviews,
      approvals: current.workspace.approvals,
      writerRoom: current.workspace.writerRoom,
      layouts: current.workspace.layouts,
      activeLayoutId: current.workspace.activeLayoutId,
      shortcuts: current.workspace.shortcuts,
      sync: current.workspace.sync,
    },
  });

  const restoreVersion = (snapshot: ProjectSnapshot) => {
    if (!canEdit) {
      setOperationMessage("The current collaboration role cannot restore draft versions.");
      return;
    }
    if (hasUnsavedSource) {
      setOperationMessage("Save or return to Formatted mode before restoring a draft version.");
      return;
    }
    if (!window.confirm(`Restore ${snapshot.name}? SCS will save the current working state as a recovery version first.`)) return;
    let history = versionHistory;
    if (versionableFingerprint(session) !== versionableFingerprint(snapshot.session)) {
      history = saveSnapshot(history, projectSnapshot(session, `Before restoring ${snapshot.name}`, "Automatic recovery point before restoring a prior draft."));
    }
    const next = sessionWithHistory(restoreProjectSnapshot(snapshot, session), session, history);
    installProjectSession(next);
    setOperationMessage(`Restored ${snapshot.name}; Project History was preserved.`);
  };

  const compareProjectVersions = (fromId: string, toId: string, compareMode: SnapshotDiffMode) => {
    const from = versionHistory.snapshots.find((snapshot) => snapshot.id === fromId);
    const to = versionHistory.snapshots.find((snapshot) => snapshot.id === toId);
    if (!from || !to) return;
    try {
      setVersionComparison(compareSnapshots(from, to, compareMode));
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "These versions cannot be compared.");
    }
  };

  const cancelDraftCombine = () => {
    setMergeConflicts([]);
    setMergePreviewReady(false);
    setMergePreviewSourceId("");
  };

  const selectDraftCombineSource = (sourceBranchId: string) => {
    setMergeConflicts([]);
    setMergePreviewReady(false);
    setMergePreviewSourceId(sourceBranchId);
  };

  const createAlternate = (name: string, fromSnapshotId: string) => {
    if (!canEdit || hasUnsavedSource) {
      if (hasUnsavedSource) setOperationMessage("Save or return to Formatted mode before changing alternate drafts.");
      return;
    }
    const source = versionHistory.snapshots.find((snapshot) => snapshot.id === fromSnapshotId);
    if (!source) return;
    if (source.scope && source.scope.kind !== "project") {
      setOperationMessage("Alternate Drafts must branch from a whole-project version.");
      return;
    }
    let currentHistory = versionHistory;
    const active = currentHistory.branches.find((branch) => branch.id === currentHistory.activeBranchId);
    const activeHead = currentHistory.snapshots.find((snapshot) => snapshot.id === active?.headSnapshotId);
    if (active && (!activeHead || versionableFingerprint(session) !== versionableFingerprint(activeHead.session))) {
      currentHistory = saveSnapshot(currentHistory, projectSnapshot(session, "Auto-save before alternate draft", "Working changes preserved before creating an alternate."), active.id);
    }
    const id = `alternate-${crypto.randomUUID()}`;
    const history = createAlternateDraft(currentHistory, { id, name, fromSnapshotId });
    const next = sessionWithHistory(restoreProjectSnapshot(source, session), session, history);
    cancelDraftCombine();
    installProjectSession(next);
    setOperationMessage(`Created Alternate Draft “${name}”.`);
  };

  const switchAlternate = (branchId: string) => {
    if (!canEdit || hasUnsavedSource) {
      if (hasUnsavedSource) setOperationMessage("Save or return to Formatted mode before changing alternate drafts.");
      return;
    }
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
    const next = sessionWithHistory(restoreProjectSnapshot(snapshot, session), session, history);
    cancelDraftCombine();
    installProjectSession(next);
    setOperationMessage(`Switched to ${target.name}.`);
  };

  const prepareDraftCombine = (sourceBranchId: string, resolution: MergeResolutionPlan) => {
    let history = versionHistory;
    const active = history.branches.find((branch) => branch.id === history.activeBranchId);
    const source = history.branches.find((branch) => branch.id === sourceBranchId);
    if (!active || !source) return null;
    let ours = history.snapshots.find((snapshot) => snapshot.id === active.headSnapshotId);
    if (!ours || versionableFingerprint(session) !== versionableFingerprint(ours.session)) {
      const working = projectSnapshot(session, "Working draft before combine", "Automatic safety snapshot.");
      history = history.snapshots.length ? saveSnapshot(history, working, active.id) : createVersionHistory(working);
      ours = working;
    }
    const theirs = history.snapshots.find((snapshot) => snapshot.id === source.headSnapshotId);
    const base = findCommonSnapshot(history.snapshots, ours.id, theirs?.id ?? "");
    if (!theirs || !base) return null;
    return { history, active, source, ours, theirs, result: mergeSnapshots(base, ours, theirs, resolution) };
  };

  const previewDraftCombine = (sourceBranchId: string) => {
    if (!canEdit || hasUnsavedSource) {
      if (hasUnsavedSource) setOperationMessage("Save or return to Formatted mode before combining alternate drafts.");
      return;
    }
    const prepared = prepareDraftCombine(sourceBranchId, { default: "ours", paths: {} });
    if (!prepared) {
      cancelDraftCombine();
      return;
    }
    setMergeConflicts(prepared.result.conflicts);
    setMergePreviewReady(true);
    setMergePreviewSourceId(sourceBranchId);
    setOperationMessage(prepared.result.clean ? "Combine preview is clean; review and apply it in Drafts." : `Review ${prepared.result.conflicts.length} combine conflict${prepared.result.conflicts.length === 1 ? "" : "s"} in Drafts.`);
  };

  const combineDrafts = (sourceBranchId: string, resolution: MergeResolutionPlan) => {
    if (!canEdit || hasUnsavedSource) return;
    const prepared = prepareDraftCombine(sourceBranchId, resolution);
    if (!prepared) return;
    let { history } = prepared;
    const { active, source, ours, theirs, result } = prepared;
    const mergedSession = sessionWithHistory(result.merged, session, history);
    const alternateChoices = Object.values(resolution.paths).filter((choice) => choice === "theirs").length;
    const combined = projectSnapshot(mergedSession, `Combined ${source.name} into ${active.name}`, `${result.conflicts.length} conflict${result.conflicts.length === 1 ? "" : "s"}; ${alternateChoices} chose the alternate.`, [ours.id, theirs.id]);
    history = saveSnapshot(history, combined, active.id);
    const next = { ...mergedSession, versionHistory: history };
    installProjectSession(next);
    cancelDraftCombine();
    setOperationMessage(result.clean ? `Combined ${source.name} without conflicts.` : `Combined ${source.name} with ${result.conflicts.length} explicit conflict choice${result.conflicts.length === 1 ? "" : "s"}.`);
  };

  const startRevision = (label: string, color: RevisionColor) => {
    setSession((current) => {
      const baseline = projectSnapshot(current, `${label} baseline`, `Automatic baseline for ${label}.`);
      const history = current.versionHistory.snapshots.length ? saveSnapshot(current.versionHistory, baseline) : createVersionHistory(baseline);
      const index = current.documents.findIndex((document) => document.id === doc.id);
      if (index < 0) return current;
      const currentDocument = current.documents[index];
      const revision: RevisionSet = { id: `revision-${crypto.randomUUID()}`, label, color, createdAt: new Date().toISOString(), blockIds: [], baselineSnapshotId: baseline.id };
      const currentWorkspace = currentDocument.workspace ?? emptyWorkspace();
      const documents = current.documents.slice();
      documents[index] = { ...currentDocument, workspace: { ...currentWorkspace, revisionSets: [...(currentWorkspace.revisionSets ?? []), revision], activeRevisionId: revision.id, revisionColor: color } };
      return { ...current, documents, versionHistory: history };
    });
    setOperationMessage(`Started ${label} with a protected project baseline.`);
  };

  const updateRevisionMarks = (revisionId: string) => {
    setSession((current) => {
      const index = current.documents.findIndex((document) => document.id === doc.id);
      if (index < 0) return current;
      const currentDocument = current.documents[index];
      const currentWorkspace = currentDocument.workspace ?? emptyWorkspace();
      const revision = currentWorkspace.revisionSets?.find((item) => item.id === revisionId);
      const baseline = current.versionHistory.snapshots.find((snapshot) => snapshot.id === revision?.baselineSnapshotId)?.session.documents.find((document) => document.id === currentDocument.id);
      if (!revision || !baseline) return current;
      const marked = markChangedBlocks(baseline, currentDocument, revision);
      const nextWorkspace = marked.document.workspace ?? emptyWorkspace();
      const documents = current.documents.slice();
      documents[index] = { ...marked.document, workspace: { ...nextWorkspace, revisionSets: currentWorkspace.revisionSets!.map((item) => item.id === revisionId ? marked.revision : item), activeRevisionId: revisionId, revisionColor: revision.color } };
      return { ...current, documents };
    });
    setOperationMessage("Updated colored revision marks from the protected baseline.");
  };

  const lockProductionPages = () => {
    const pageLock = lockPages(doc);
    setDoc({ ...doc, workspace: { ...workspace, pageLock, lockedPages: pageLock.pages.map((page) => page.number).join(", ") } });
    setOperationMessage(`Locked ${pageLock.pages.length} production page${pageLock.pages.length === 1 ? "" : "s"}.`);
  };

  const unlockProductionPages = () => {
    setDoc({ ...doc, workspace: { ...workspace, pageLock: undefined, lockedPages: "" } });
    setOperationMessage("Released the page lock.");
  };

  const printRevisionPages = () => {
    const activeRevisionId = workspace.activeRevisionId ?? revisionSets[revisionSets.length - 1]?.id;
    const summary = productionRevisionSummaries.find((item) => item.revisionId === activeRevisionId);
    if (!summary?.revisedPages.length) {
      setOperationMessage("The active revision set has no revised pages to print.");
      return;
    }
    const revisedPages = new Set(summary.revisedPages);
    const pageElements = [...globalThis.document.querySelectorAll<HTMLElement>(".editor-scroll .page[data-page]")];
    const screenplayBody = pageElements[0]?.closest<HTMLElement>(".workspace-panel-body");
    const screenplayGroup = screenplayBody?.closest<HTMLElement>(".workspace-tab-group");
    pageElements.forEach((page) => { page.dataset.printRevised = revisedPages.has(page.dataset.page ?? "") ? "true" : "false"; });
    if (screenplayBody) screenplayBody.dataset.printScreenplay = "true";
    if (screenplayGroup) screenplayGroup.dataset.printScreenplay = "true";
    globalThis.document.body.classList.add("print-revision-pages");
    try {
      globalThis.print();
    } finally {
      globalThis.document.body.classList.remove("print-revision-pages");
      if (screenplayBody) delete screenplayBody.dataset.printScreenplay;
      if (screenplayGroup) delete screenplayGroup.dataset.printScreenplay;
      pageElements.forEach((page) => { delete page.dataset.printRevised; });
    }
  };

  const toggleOmittedScene = (sceneId: string) => setDoc(setSceneOmitted(doc, sceneId, !(workspace.omittedSceneIds ?? []).includes(sceneId)));

  const exportProduction = (kind: ProductionExportKind, targetId?: string) => {
    if (kind === "revision") return download(revisionReportMarkdown(productionRevisionSummaries), "revision-report.md", "text/markdown");
    if (kind === "scene-strips" || kind === "schedule" || kind === "cast-days") return download(productionReportsCsv(productionReport, kind === "scene-strips" ? "strips" : kind), `${kind}.csv`, "text/csv");
    if (kind === "dialogue") return download(dialogueOnly(doc), "dialogue.txt", "text/plain");
    if (kind === "character-sides") {
      const sides = buildCharacterSides(doc);
      const content = targetId ? sides[targetId] ?? "" : Object.entries(sides).map(([name, text]) => `# ${name}\n\n${text}`).join("\n");
      return download(content, "character-sides.txt", "text/plain");
    }
    if (kind === "scene-sides") {
      const sides = buildSceneSides(doc);
      const content = targetId ? sides[targetId] ?? "" : Object.values(sides).join("\n");
      return download(content, "scene-sides.txt", "text/plain");
    }
    if (kind === "metadata") return download(JSON.stringify({ revisions: revisionExportMetadata(doc, revisionSets, workspace.pageLock), reports: productionReport }, null, 2), "production-metadata.json", "application/json");
    const lines = ["# Department Breakdown", "", workspace.productionNotes, ""];
    for (const [category, rows] of Object.entries(analysis.production)) {
      lines.push(`## ${category}`, "", ...rows.map((row) => `- Scene ${row.sceneNumber} · ${row.item}: ${row.evidence}`), "");
    }
    return download(`${lines.join("\n").trim()}\n`, "department-breakdown.md", "text/markdown");
  };

  const reloadLinkedFdx = async () => {
    if (!doc.source?.path) return;
    const documentId = doc.id!;
    const path = doc.source.path;
    setBusy(true);
    try {
      if (externalConflict) saveDraftVersion();
      const imported = await parseLinkedFdx(path);
      setSession((latest) => {
        const next = reconcileImportedDocument(materializeSourceDraft(latest, sourceRecoveryRef.current), documentId, imported);
        const reconciled = next.documents.find((document) => document.id === documentId)!;
        linkedBaselines.current.set(documentId, screenplayTextFingerprint(reconciled));
        return next;
      });
      setMode("formatted");
      setSourceText("");
      setExternalChanged(false);
      setExternalConflict(false);
      setExternalModifiedAt(null);
      setOperationMessage("Re-imported external FDX; SCS development metadata was preserved.");
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const keepLocalAfterConflict = () => {
    saveDraftVersion();
    const current = materializeSourceSession(session);
    const currentDocument = current.documents.find((document) => document.id === doc.id) ?? doc;
    const fingerprint = screenplayTextFingerprint(currentDocument);
    linkedBaselines.current.set(currentDocument.id!, fingerprint);
    setSession((latest) => {
      const materialized = materializeSourceDraft(latest, sourceRecoveryRef.current);
      return {
        ...materialized,
        documents: materialized.documents.map((document) => document.id === currentDocument.id && document.source && externalModifiedAt
          ? { ...document, source: { ...document.source, lastImportedModifiedAt: externalModifiedAt, lastImportedFingerprint: fingerprint } }
          : document),
      };
    });
    setMode("formatted");
    setSourceText("");
    setExternalChanged(false);
    setExternalConflict(false);
    setExternalModifiedAt(null);
    setOperationMessage("Kept the SCS draft and saved a recovery version. Export FDX when you are ready to hand it back.");
  };

  const refreshWatchFiles = async (folder = session.workspace.sync.watchFolderPath, recursive = session.workspace.sync.watchRecursive) => {
    if (!folder) return;
    setBusy(true);
    try {
      setWatchFiles(await listFdxFiles(folder, recursive));
      setOperationMessage("Final Draft watch folder refreshed.");
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const chooseFdxWatchFolder = async () => {
    try {
      const folderPath = await chooseWatchFolder(session.workspace.sync.watchFolderPath);
      if (!folderPath) return;
      setSession((current) => ({ ...current, workspace: { ...current.workspace, sync: { ...current.workspace.sync, watchFolderPath: folderPath } } }));
      await refreshWatchFiles(folderPath, session.workspace.sync.watchRecursive);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };

  const setWatchRecursive = (watchRecursive: boolean) => {
    setSession((current) => ({ ...current, workspace: { ...current.workspace, sync: { ...current.workspace.sync, watchRecursive } } }));
  };

  const reviewWatchFile = async (file: FdxFileInfo) => {
    const currentSession = materializeSourceSession(sessionRef.current);
    const linkedIndex = currentSession.documents.findIndex((document) => document.source?.type === "fdx" && document.source.path === file.path);
    const linked = currentSession.documents[linkedIndex];
    if (linked) {
      const baseline = linkedBaselines.current.get(linked.id!);
      if (!baseline || screenplayTextFingerprint(linked) !== baseline) {
        installProjectSession({ ...currentSession, activeDocumentId: linked.id! });
        setExternalConflict(true);
        setExternalChanged(true);
        setExternalModifiedAt(file.modifiedAt);
        setOperationMessage("Both copies changed. Review the conflict banner before replacing script text.");
        return;
      }
    }
    setBusy(true);
    try {
      const imported = await parseLinkedFdx(file.path);
      if (linked) {
        setSession((latest) => {
          const next = reconcileImportedDocument(materializeSourceDraft(latest, sourceRecoveryRef.current), linked.id!, imported);
          const reconciled = next.documents.find((document) => document.id === linked.id)!;
          linkedBaselines.current.set(linked.id!, screenplayTextFingerprint(reconciled));
          return next;
        });
        setOperationMessage(`Re-imported ${file.fileName}; SCS development metadata was preserved.`);
      } else {
        setSession((latest) => {
          const current = materializeSourceDraft(latest, sourceRecoveryRef.current);
          const nowLinked = current.documents.find((document) => document.source?.type === "fdx" && document.source.path === file.path);
          if (nowLinked) {
            const next = reconcileImportedDocument(current, nowLinked.id!, imported);
            linkedBaselines.current.set(nowLinked.id!, screenplayTextFingerprint(next.documents.find((document) => document.id === nowLinked.id)!));
            return next;
          }
          const detached = current.documents.filter((document) => document.source?.type === "fdx" && !document.source.path && document.source.fileName === file.fileName);
          if (detached.length === 1) {
            const next = reconcileImportedDocument(current, detached[0].id!, imported);
            const reconciled = next.documents.find((document) => document.id === detached[0].id)!;
            linkedBaselines.current.set(detached[0].id!, screenplayTextFingerprint(reconciled));
            return { ...next, activeDocumentId: detached[0].id! };
          }
          const documents = [...current.documents, imported];
          const projectWorkspace = structuredClone(current.workspace);
          syncSeriesDocuments(projectWorkspace.series, documents);
          linkedBaselines.current.set(imported.id!, imported.source?.lastImportedFingerprint ?? screenplayTextFingerprint(imported));
          return { ...current, projectType: documents.length > 1 ? "television" : current.projectType, documents, workspace: projectWorkspace, activeDocumentId: imported.id! };
        });
        setOperationMessage(`Linked ${file.fileName} to this project.`);
      }
      setMode("formatted");
      setSourceText("");
      setExternalChanged(false);
      setExternalConflict(false);
      setExternalModifiedAt(null);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const openExternalFile = async (path: string) => {
    try {
      await openFdxInExternalEditor(path);
      setOperationMessage("Opened the linked FDX in its default editor.");
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };

  const revealExternalPath = async (path: string) => {
    try {
      await revealInFileManager(path);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };

  const createSharedProjectCopy = async () => {
    if (!hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    setBusy(true);
    try {
      const first = await saveProjectSession(materializeSourceSession(session), true);
      if (!first) return;
      const configured = { ...first, workspace: { ...first.workspace, sync: { ...first.workspace.sync, mode: "folder" as const, folderPath: "" } } };
      const saved = await saveProjectSession(configured);
      if (!saved) return;
      installProjectSession(saved);
      sharedBaseline.current = structuredClone(saved);
      portableBaseline.current = portableFingerprint(saved);
      setSharedConflict(null);
      setOperationMessage(`Shared project copy created at ${saved.projectPath}.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const withCollaborationMergeHistory = (merged: ProjectSession): ProjectSession => {
    let history = structuredClone(merged.versionHistory);
    if (!history.branches.length && history.snapshots.length) {
      const latest = history.snapshots[history.snapshots.length - 1];
      history.branches = [{ id: "main", name: "Main Draft", baseSnapshotId: history.snapshots[0].id, headSnapshotId: latest.id }];
      history.activeBranchId = "main";
    }
    const recovery = projectSnapshot(materializeSourceSession(session), "Before shared collaboration merge", "Automatic recovery point before combining collaborator changes.");
    history = history.snapshots.length
      ? saveSnapshot(history, recovery, history.branches.some((branch) => branch.id === history.activeBranchId) ? history.activeBranchId : history.branches[0].id)
      : createVersionHistory(recovery, { id: "main", name: "Main Draft" });
    const combined = { ...merged, versionHistory: history };
    const mergeSnapshot = projectSnapshot(combined, "Shared collaboration merge", "Combined local and shared project changes.");
    return { ...combined, versionHistory: saveSnapshot(history, mergeSnapshot, history.activeBranchId) };
  };

  const persistCollaboratorMerge = async (merged: ProjectSession, theirs: ProjectSession) => {
    const candidate = { ...withCollaborationMergeHistory(merged), projectPath: theirs.projectPath, updatedAt: theirs.updatedAt };
    const saved = await saveProjectSession(candidate);
    if (!saved) return;
    installProjectSession(saved);
    sharedBaseline.current = structuredClone(saved);
    portableBaseline.current = portableFingerprint(saved);
    setSharedConflict(null);
    setOperationMessage("Combined local and shared project changes into a new portable version.");
  };

  const syncSharedProject = async () => {
    if (!hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    const path = session.projectPath;
    if (!path || session.workspace.sync.mode !== "folder") return;
    setBusy(true);
    try {
      const ours = { ...materializeSourceSession(session), projectPath: path };
      const saved = await saveProjectSession(ours);
      if (!saved) return;
      installProjectSession(saved);
      sharedBaseline.current = structuredClone(saved);
      portableBaseline.current = portableFingerprint(saved);
      setSharedConflict(null);
      setOperationMessage("Shared project is synchronized.");
    } catch (error) {
      if (!isProjectConflict(error)) {
        setOperationMessage(messageFrom(error));
      } else {
        try {
          const theirs = await openProjectSession(path);
          const base = sharedBaseline.current;
          if (!base) {
            setSharedConflict({ theirs, conflicts: [{ path: "/", kind: "value", base: "Portable baseline unavailable after recovery restart.", ours: "Current SCS recovery state", theirs: "Current shared project", resolution: "ours" }] });
            setOperationMessage("The shared file changed since this recovery session began. Choose which complete project to keep; automatic combination is disabled without a trustworthy baseline.");
            return;
          }
          const preview = mergeCollaboratorSessions(base, materializeSourceSession(session), theirs, session.workspace.currentUserId, "ours");
          if (preview.clean) await persistCollaboratorMerge(preview.session, theirs);
          else {
            setSharedConflict({ base, theirs, conflicts: preview.conflicts });
            setOperationMessage(`${preview.conflicts.length} overlapping collaborator change${preview.conflicts.length === 1 ? "" : "s"} need a choice in the Team panel.`);
          }
        } catch (mergeError) {
          setOperationMessage(messageFrom(mergeError));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const resolveSharedProject = async (resolutions: Record<string, "ours" | "theirs">) => {
    if (!sharedConflict || !hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    setBusy(true);
    try {
      if (!sharedConflict.base) {
        const chosen = (resolutions["/"] ?? "ours") === "ours"
          ? materializeSourceSession(session)
          : { ...sharedConflict.theirs, projectPath: session.projectPath, activeDocumentId: session.activeDocumentId, documents: restoreLocalDocumentState(sharedConflict.theirs.documents, session.documents), workspace: restoreLocalWorkspaceState(sharedConflict.theirs.workspace, session.workspace) };
        await persistCollaboratorMerge(chosen, sharedConflict.theirs);
      } else {
        const result = mergeCollaboratorSessions(sharedConflict.base, materializeSourceSession(session), sharedConflict.theirs, session.workspace.currentUserId, { default: "ours", paths: resolutions });
        await persistCollaboratorMerge(result.session, sharedConflict.theirs);
      }
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const refreshGitSync = async () => {
    if (!session.projectPath) return;
    setBusy(true);
    try {
      setGitStatus(await gitSyncStatus(session.projectPath));
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const initializeGitSync = async () => {
    if (!session.projectPath || !hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    setBusy(true);
    try {
      const saved = await saveProjectSession(materializeSourceSession(session));
      if (!saved) return;
      portableBaseline.current = portableFingerprint(saved);
      const result = await gitSyncInit(saved.projectPath, saved.workspace.sync.branch, saved.workspace.sync.remoteUrl);
      const next = { ...saved, workspace: { ...saved.workspace, sync: { ...saved.workspace.sync, mode: "git" as const } } };
      installProjectSession(next);
      setGitStatus(result.status);
      setOperationMessage(result.message);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const commitGitSync = async (message: string) => {
    if (!session.projectPath || !hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    setBusy(true);
    try {
      const saved = await saveProjectSession(materializeSourceSession(session));
      if (!saved) return;
      portableBaseline.current = portableFingerprint(saved);
      installProjectSession(saved);
      const settings = saved.workspace.sync;
      const actor = saved.workspace.collaborators.find((collaborator) => collaborator.id === saved.workspace.currentUserId)!;
      const result = await gitSyncCommit(saved.projectPath, settings.branch, message, settings.gitAuthorName || actor.name, settings.gitAuthorEmail || `${actor.id}@scs.local`);
      setGitStatus(result.status);
      setOperationMessage(result.message);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const pullGitSync = async () => {
    if (!session.projectPath || !hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    setBusy(true);
    try {
      if (hasUnsavedSource || portableBaseline.current !== portableFingerprint(session)) throw new Error("Save a Git sync point before pulling so local work cannot be lost.");
      const before = await gitSyncStatus(session.projectPath);
      if (before.dirty) throw new Error("Save a Git sync point before pulling the remote project.");
      const result = await gitSyncPull(session.projectPath, session.workspace.sync.branch);
      const portable = await openProjectSession(session.projectPath);
      const opened = { ...portable, documents: restoreLocalDocumentState(portable.documents, session.documents), workspace: restoreLocalWorkspaceState(portable.workspace, session.workspace) };
      installProjectSession(opened);
      sharedBaseline.current = structuredClone(opened);
      portableBaseline.current = portableFingerprint(opened);
      setGitStatus(result.status);
      setOperationMessage(result.message);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const pushGitSync = async () => {
    if (!session.projectPath || !hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    setBusy(true);
    try {
      if (hasUnsavedSource || portableBaseline.current !== portableFingerprint(session)) throw new Error("Save a Git sync point before pushing so the remote includes current work.");
      const before = await gitSyncStatus(session.projectPath);
      if (before.dirty) throw new Error("Save a Git sync point before pushing the remote project.");
      const result = await gitSyncPush(session.projectPath, session.workspace.sync.branch);
      setGitStatus(result.status);
      setOperationMessage(result.message);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const selectLayout = (next: string) => {
    setSession((current) => ({ ...current, workspace: { ...current.workspace, activeLayoutId: next } }));
    setInspectorOpen(getWorkspaceLayout(session.workspace, next)?.inspector !== "hidden");
  };

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery ? [
    ...episodeDocs.flatMap((document, documentIndex) => {
      const title = session.workspace.series.episodes[document.id!]?.title || document.titlePage.title || `Document ${documentIndex + 1}`;
      const documentScenes = deriveScenes(document.blocks);
      const documentCharacters = deriveCharacters(document.blocks);
      const documentObjects = detectObjects(document.blocks);
      const selectDocument = () => {
        selectEpisode(document.id!);
        setInspectorOpen(true);
      };
      return [
        ...documentScenes.filter((scene) => scene.heading.toLowerCase().includes(normalizedQuery)).map((scene) => ({
          key: `${document.id}-scene-${scene.id}`,
          label: `${title} · Scene ${scene.number}: ${scene.heading}`,
          action: () => {
            selectEpisode(document.id!);
            setFocusRequest({ id: scene.id, nonce: ++focusNonce.current });
          },
        })),
        ...document.blocks.filter((block) => block.type !== "scene_heading" && block.text.toLowerCase().includes(normalizedQuery)).map((block) => ({
          key: `${document.id}-block-${block.id}`,
          label: `${title} · ${elementLabels[block.type]}: ${block.text.slice(0, 90)}`,
          action: () => {
            selectEpisode(document.id!);
            setFocusRequest({ id: block.id, nonce: ++focusNonce.current });
          },
        })),
        ...documentCharacters.filter((character) => character.name.toLowerCase().includes(normalizedQuery)).map((character) => ({ key: `${document.id}-character-${character.name}`, label: `${title} · Character: ${character.name}`, action: selectDocument })),
        ...documentObjects.filter((object) => object.name.toLowerCase().includes(normalizedQuery)).map((object) => ({ key: `${document.id}-object-${object.name}`, label: `${title} · Object: ${object.name}`, action: selectDocument })),
        ...(document.workspace?.treatments ?? []).filter((treatment) => `${treatment.title} ${treatment.markdown}`.toLowerCase().includes(normalizedQuery)).map((treatment) => ({ key: `${document.id}-treatment-${treatment.id}`, label: `${title} · Treatment: ${treatment.title}`, action: selectDocument })),
      ];
    }),
    ...(`${session.workspace.series.showBible} ${session.workspace.series.seasons.map((season) => season.arc).join(" ")}`.toLowerCase().includes(normalizedQuery) ? [{ key: "series-reference", label: "Series bible or season arc", action: () => setInspectorOpen(true) }] : []),
    ...versionHistory.snapshots.filter((snapshot) => `${snapshot.name} ${snapshot.description}`.toLowerCase().includes(normalizedQuery)).map((snapshot) => ({ key: `version-${snapshot.id}`, label: `Draft version: ${snapshot.name}`, action: () => canEdit ? restoreVersion(snapshot) : setOperationMessage("This role can find draft versions but cannot restore them.") })),
    ...session.workspace.layouts.filter((item) => item.name.toLowerCase().includes(normalizedQuery)).map((item) => ({ key: `layout-${item.id}`, label: `Workspace: ${item.name}`, action: () => selectLayout(item.id) })),
  ].slice(0, 30) : [];

  const dropScene = (to: number) => {
    if (draggedScene === null || !canEdit) return;
    setDoc({ ...doc, blocks: moveScene(doc.blocks, draggedScene, to), scenes: undefined, characters: undefined, locations: undefined });
    setDraggedScene(null);
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPaletteOpen(false);
        setLayoutManagerOpen(false);
        return;
      }
      const action = Object.entries(session.workspace.shortcuts).find(([, shortcut]) => keyboardShortcutMatches(shortcut, event))?.[0];
      if (!action) return;
      event.preventDefault();
      if (action === "commandPalette") setPaletteOpen((open) => !open);
      else if (action === "save") void saveNow();
      else if (action === "saveVersion") saveDraftVersion();
      else if (action === "toggleInspector") setInspectorOpen((open) => !open);
      else if (action === "layoutManager" && canEdit) setLayoutManagerOpen(true);
      else if (action === "previousEpisode" && activeEpisode > 0) selectEpisode(episodeDocs[activeEpisode - 1].id!);
      else if (action === "nextEpisode" && activeEpisode < episodeDocs.length - 1) selectEpisode(episodeDocs[activeEpisode + 1].id!);
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  const collaborationSync = {
    busy,
    gitStatus,
    sharedConflicts: sharedConflict?.conflicts ?? [],
    onCreateSharedCopy: () => void createSharedProjectCopy(),
    onSyncSharedCopy: () => void syncSharedProject(),
    onResolveSharedConflict: (resolutions: Record<string, "ours" | "theirs">) => void resolveSharedProject(resolutions),
    onRefreshGit: () => void refreshGitSync(),
    onInitializeGit: () => void initializeGitSync(),
    onCommitGit: (message: string) => void commitGitSync(message),
    onPullGit: () => void pullGitSync(),
    onPushGit: () => void pushGitSync(),
  };

  const openCollaborationTarget = (documentId: string, targetId?: string) => {
    selectEpisode(documentId);
    if (targetId) setFocusRequest({ id: targetId, nonce: ++focusNonce.current });
  };

  const navigatorPanel = <aside className="scene-nav" aria-label="Scene navigator">
    <div className="nav-doc-title">{doc.titlePage.title || "Untitled Screenplay"}</div>
    <div className="nav-group"><span className="nav-act">{structure.acts[0]?.title ?? "Act I"}</span><span className="nav-structure-hint">{structure.acts.length} act{structure.acts.length === 1 ? "" : "s"}</span></div>
    <div className="nav-sequence">{structure.acts.reduce((count, act) => count + act.sequences.length, 0)} sequences · {structure.beats.length} beats</div>
    <ol className="nav-scenes">
      {scenes.map((scene) => <li key={scene.id} draggable onDragStart={() => setDraggedScene(scene.number - 1)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropScene(scene.number - 1)}><button className={`nav-scene ${activeScene?.id === scene.id ? "active" : ""}`} onClick={() => jumpToScene(scene.id)} title="Drag to reorder"><span className="nav-scene-num">{scene.sceneNumber ?? scene.number}</span><span className="nav-scene-heading">{scene.heading}</span></button>{activeScene?.id === scene.id && <div className="nav-beats">{structure.beats.filter((beat) => beat.sceneId === scene.id).map((beat) => beat.text).join(" · ") || "No beats"}</div>}</li>)}
      {!scenes.length && <li className="nav-empty">No scenes yet — start with INT. or EXT.</li>}
    </ol>
    <div className="nav-foot">{scenes.length} scene{scenes.length === 1 ? "" : "s"} · ~{pages} page{pages === 1 ? "" : "s"}</div>
  </aside>;

  const inspectorPanel = <Inspector blocks={doc.blocks} scenes={scenes} characters={characters} locations={locations} objects={objects} customStructure={customStructure} breakdown={breakdown} analysis={analysis} activeScene={activeScene} sceneNotes={doc.sceneNotes} onSceneNote={(sceneId, text) => setDoc({ ...doc, sceneNotes: { ...doc.sceneNotes, [sceneId]: text } })} workspace={workspace} onWorkspace={(patch) => setDoc({ ...doc, workspace: { ...workspace, ...patch } })} onJumpToScene={jumpToScene} versionHistory={versionHistory} versionComparison={versionComparison} mergeConflicts={mergeConflicts} mergePreviewReady={mergePreviewReady} mergePreviewSourceId={mergePreviewSourceId} onSaveVersion={saveDraftVersion} onRestoreVersion={restoreVersion} onCompareVersions={compareProjectVersions} onCreateAlternateDraft={createAlternate} onSwitchAlternateDraft={switchAlternate} onSelectCombineDraftSource={selectDraftCombineSource} onPreviewCombineDrafts={previewDraftCombine} onCombineDrafts={combineDrafts} onCancelCombineDrafts={cancelDraftCombine} onExportBreakdown={exportBreakdown} onExportTreatment={exportTreatment} projectWorkspace={session.workspace} seriesReport={seriesReport} activeDocumentId={doc.id!} onProjectWorkspace={(patch) => setSession((current) => ({ ...current, workspace: { ...current.workspace, ...patch } }))} onSelectEpisode={selectEpisode} productionPages={productionPageRows} productionReports={productionReport} revisionSets={revisionSets} revisionSummaries={productionRevisionSummaries} onStartRevision={startRevision} onUpdateRevisionMarks={updateRevisionMarks} onLockPages={lockProductionPages} onUnlockPages={unlockProductionPages} onPrintRevisionPages={printRevisionPages} onToggleOmittedScene={toggleOmittedScene} onSetSceneNumber={setSceneNumber} onExportProduction={exportProduction} editable={canEdit} collaborationSession={materializeSourceSession(session)} onCollaborationSession={installProjectSession} onCollaborationTarget={openCollaborationTarget} onCollaborationMessage={setOperationMessage} collaborationSync={collaborationSync} />;

  const renderInspector = (fixedTab?: InspectorTab) => isValidElement<{ fixedTab?: InspectorTab }>(inspectorPanel)
    ? cloneElement(inspectorPanel, { fixedTab })
    : null;

  const companionPanel = <CompanionDashboard documents={session.documents} files={watchFiles} folderPath={session.workspace.sync.watchFolderPath} recursive={session.workspace.sync.watchRecursive} busy={busy} stats={companionStats} onChooseFolder={() => void chooseFdxWatchFolder()} onRefresh={() => void refreshWatchFiles()} onRecursive={setWatchRecursive} onReviewFile={(file) => void reviewWatchFile(file)} onOpenFile={(path) => void openExternalFile(path)} onReveal={(path) => void revealExternalPath(path)} />;
  const scriptPanel = <div className="script-split single"><fieldset className="script-panel-current" disabled={!canEdit}>
      {mode === "formatted" ? <Editor documentId={doc.id!} blocks={doc.blocks} onBlocksChange={(blocks) => setDoc({ ...doc, blocks })} titlePage={doc.titlePage} onTitlePageChange={(titlePage) => setDoc({ ...doc, titlePage })} onActiveBlock={setActiveBlockId} focusRequest={focusRequest} readOnly={doc.readOnly || !canEdit || busy} productionPages={productionPageRows} /> : <div className="source-wrap"><textarea className="source-editor" value={sourceText} spellCheck={false} readOnly={!canEdit || busy} onChange={(event) => setSourceText(event.target.value)} /><p className="source-hint">Fountain-inspired source. Switching back to Formatted re-parses this text.</p></div>}
    </fieldset></div>;

  const referenceTargetOptions: Partial<Record<WorkspaceReferenceKind, { id: string; label: string }[]>> = {
    character: seriesReport.continuity.characters.map((item) => ({ id: item.name, label: item.name })),
    object: seriesReport.continuity.objects.map((item) => ({ id: item.name, label: item.name })),
    location: seriesReport.continuity.locations.map((item) => ({ id: item.name, label: item.name })),
  };
  const renderReference = (panel: WorkspacePanelDefinition) => {
    const kind = panel.referenceKind ?? (activeLayout.reference === "none" ? "previous-draft" : activeLayout.reference);
    if (kind === "previous-episode" || kind === "previous-draft") {
      const document = kind === "previous-episode" ? episodeDocs[activeEpisode - 1] : previousDraftDocument;
      return <ReferencePanel key={panel.id} document={document} label={panel.title} activeSceneNumber={activeScene?.number ?? 1} onSynchronizedScene={(number) => scenes[number - 1] && jumpToScene(scenes[number - 1].id)} />;
    }
    if (kind === "next-episode") {
      const next = episodeDocs[activeEpisode + 1];
      const nextScenes = next ? deriveScenes(next.blocks) : [];
      const items: ReferenceItem[] = next ? nextScenes.map((scene) => ({
        id: scene.id,
        title: `Scene ${scene.sceneNumber ?? scene.number} · ${scene.heading}`,
        detail: next.workspace?.sceneMeta?.[scene.id]?.summary || "No outline summary yet.",
        documentId: next.id,
        targetId: scene.id,
      })) : [];
      const body = next?.workspace?.treatments?.map((treatment) => treatment.markdown).filter(Boolean).join("\n\n")
        || next?.workspace?.treatment
        || "No next-episode treatment is available yet.";
      return <InformationReferencePanel key={panel.id} label={panel.title} subtitle={next?.titlePage.title || "No next episode"} body={body} items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId, item.targetId)} />;
    }
    if (kind === "show-bible") return <InformationReferencePanel key={panel.id} label={panel.title} subtitle={seriesReport.showBible.title || session.name} body={seriesReport.showBible.markdown || "The show bible is empty. Add canon and format notes in the Series panel."} items={[]} onOpen={() => {}} />;
    if (kind === "season-arc") {
      const seasonId = session.workspace.series.episodes[doc.id!]?.seasonId;
      const season = seriesReport.seasons.find((item) => item.id === seasonId) ?? seriesReport.seasons[0];
      const items: ReferenceItem[] = season?.episodes.map((episode) => ({ id: episode.documentId, title: `Episode ${episode.number} · ${episode.title}`, meta: `${episode.sceneCount} scenes · ~${episode.pageEstimate} pages`, detail: episode.summary, documentId: episode.documentId })) ?? [];
      return <InformationReferencePanel key={panel.id} label={panel.title} subtitle={season?.title || "No season"} body={season?.arc || "No season arc has been written yet."} items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId)} />;
    }
    if (kind === "plot-history") {
      const items: ReferenceItem[] = seriesReport.plotThreads.map((thread) => ({ id: thread.id, title: `${thread.kind} · ${thread.label}`, meta: `${thread.status} · ${thread.episodes.length} episode(s)`, detail: thread.episodes.map((episode) => `${seriesReport.episodes.find((item) => item.documentId === episode.episodeId)?.title ?? episode.episodeId}: ${episode.status}`).join(" · "), documentId: thread.episodes[thread.episodes.length - 1]?.episodeId }));
      return <InformationReferencePanel key={panel.id} label={panel.title} subtitle="Series plot threads" body="Persistent A/B/C story coverage across every episode." items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId)} />;
    }
    if (kind === "timeline") {
      const items: ReferenceItem[] = session.workspace.series.continuity.filter((record) => record.kind === "timeline").slice().sort((left, right) => (left.timelineOrder ?? Number.MAX_SAFE_INTEGER) - (right.timelineOrder ?? Number.MAX_SAFE_INTEGER) || (left.timelineDate ?? "").localeCompare(right.timelineDate ?? "")).map((record) => ({ id: record.id, title: `${record.timelineOrder ?? "—"} · ${record.title}`, meta: record.timelineDate || "Relative story order", detail: record.detail, documentId: record.episodeIds[0] }));
      return <InformationReferencePanel key={panel.id} label={panel.title} subtitle="Timeline continuity" body="Story chronology and dated continuity records." items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId)} />;
    }
    if (kind === "character" || kind === "object" || kind === "location") {
      const requested = panel.targetId?.trim().toUpperCase();
      const entityProfiles = (entry: (typeof referenceAnalyses)[number]): ReferenceEntityProfile[] => kind === "character"
        ? entry.analysis.entities.characters
        : kind === "object"
          ? entry.analysis.entities.objects
          : entry.analysis.entities.locations;
      const allProfiles = referenceAnalyses.flatMap(entityProfiles);
      const selected = allProfiles.find((profile) => profile.id.toUpperCase() === requested || profile.name.toUpperCase() === requested) ?? allProfiles[0];
      const items: ReferenceItem[] = [];
      if (selected) for (const [documentIndex, entry] of referenceAnalyses.entries()) {
        if (kind === "object" && documentIndex > activeEpisode) continue;
        const profile = entityProfiles(entry).find((item) => item.name === selected.name);
        if (!profile || !entry.document.id) continue;
        const sceneRows = entry.analysis.scenes;
        if (profile.kind === "character") profile.appearances.forEach((appearance) => items.push({ id: `${entry.document.id}-${appearance.sceneId}`, title: `${entry.document.titlePage.title || `Episode ${documentIndex + 1}`} · Scene ${appearance.sceneNumber}`, meta: sceneRows.find((scene) => scene.id === appearance.sceneId)?.heading, detail: `${appearance.cueCount} cues · ${appearance.dialogueWords} dialogue words`, documentId: entry.document.id, targetId: appearance.sceneId }));
        else if (profile.kind === "object") profile.continuity.forEach((mention) => items.push({ id: `${entry.document.id}-${mention.blockId}`, title: `${entry.document.titlePage.title || `Episode ${documentIndex + 1}`} · Scene ${mention.sceneNumber}`, meta: sceneRows.find((scene) => scene.id === mention.sceneId)?.heading, detail: mention.excerpt, documentId: entry.document.id, targetId: mention.blockId }));
        else profile.appearances.forEach((appearance) => items.push({ id: `${entry.document.id}-${appearance.sceneId}`, title: `${entry.document.titlePage.title || `Episode ${documentIndex + 1}`} · Scene ${appearance.sceneNumber}`, meta: appearance.heading, detail: [appearance.interiorExterior, appearance.timeOfDay].filter(Boolean).join(" · "), documentId: entry.document.id, targetId: appearance.sceneId }));
      }
      const detail = selected?.kind === "character"
        ? selected.firstDescription || `${selected.dialogueWords} dialogue words in this episode set.`
        : selected?.kind === "object"
          ? `${selected.productionCategory} · ${selected.likelyOwner ? `likely owner ${selected.likelyOwner}` : "owner unknown"}`
          : selected?.kind === "location"
            ? `${selected.interiorExterior.join(" / ")} · ${selected.timesOfDay.join(" / ")}`
            : `No ${kind} is available yet.`;
      return <InformationReferencePanel key={panel.id} label={panel.title} subtitle={selected?.name || `No ${kind} selected`} body={detail} items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId, item.targetId)} />;
    }
    return <InformationReferencePanel key={panel.id} label={panel.title} subtitle="No reference" body="Choose a persistent reference source in the layout composer." items={[]} onOpen={() => {}} />;
  };

  const fixedPanelTabs: Partial<Record<WorkspacePanelDefinition["kind"], InspectorTab>> = {
    story: "Story",
    treatment: "Treatment",
    breakdown: "Breakdown",
    versions: "Drafts",
    series: "Series",
    production: "Production",
  };
  const activateLayoutPanel = (groupId: string, panelId: string) => setSession((current) => ({
    ...current,
    workspace: {
      ...current.workspace,
      layouts: current.workspace.layouts.map((item) => {
        if (item.id !== activeLayout.id) return item;
        const normalized = normalizeWorkspaceLayout(item);
        return { ...normalized, tabGroups: normalized.tabGroups.map((group) => group.id === groupId ? { ...group, activePanelId: panelId } : group) };
      }),
    },
  }));
  const renderWorkspacePanel = (panel: WorkspacePanelDefinition) => {
    if (panel.kind === "navigator") return cloneElement(navigatorPanel, { key: panel.id });
    if (panel.kind === "screenplay") return cloneElement(scriptPanel, { key: panel.id });
    if (panel.kind === "companion") return cloneElement(companionPanel, { key: panel.id });
    if (panel.kind === "inspector") return inspectorOpen ? renderInspector() : <div className="workspace-panel-empty">Inspector is hidden. Use Panel in the toolbar to reopen it.</div>;
    if (panel.kind === "reference") return renderReference(panel);
    const fixedTab = fixedPanelTabs[panel.kind];
    return fixedTab ? renderInspector(fixedTab) : <div className="workspace-panel-empty">{panel.title} is unavailable.</div>;
  };
  const split = activeLayout.splits[0];
  const splitIds = split?.groupIds ?? activeLayout.tabGroups.map((group) => group.id);
  const orderedGroupIds = [...splitIds, ...activeLayout.tabGroups.map((group) => group.id).filter((id) => !splitIds.includes(id))];
  const orderedGroups = orderedGroupIds.flatMap((id) => {
    const group = activeLayout.tabGroups.find((item) => item.id === id);
    return group ? [group] : [];
  });
  const splitDirection = split?.direction ?? "horizontal";
  const renderTabGroup = (group: WorkspaceLayout["tabGroups"][number]) => {
    const panels = group.panelIds.flatMap((id) => {
      const panel = activeLayout.panels.find((item) => item.id === id);
      return panel ? [panel] : [];
    });
    const activePanel = panels.find((panel) => panel.id === group.activePanelId) ?? panels[0];
    const soleKind = panels.length === 1 ? panels[0].kind : undefined;
    const ratio = split?.sizes[split.groupIds.indexOf(group.id)] ?? 1 / Math.max(1, orderedGroups.length);
    const style: CSSProperties = splitDirection === "horizontal" && soleKind === "navigator"
      ? { flex: `0 0 ${activeLayout.navigatorWidth}px` }
      : splitDirection === "horizontal" && soleKind === "inspector"
        ? { flex: `0 0 ${activeLayout.inspectorWidth}px` }
        : { flex: `${ratio} 1 0` };
    return <section className="workspace-tab-group" style={style} key={group.id} aria-label={`${group.id} panel group`}>
      <nav className="workspace-panel-tabs" aria-label={`${group.id} tabs`}>{panels.map((panel) => <button key={panel.id} className={panel.id === activePanel?.id ? "active" : ""} onClick={() => activateLayoutPanel(group.id, panel.id)}>{panel.title}</button>)}</nav>
      {panels.length ? panels.map((panel) => <div className="workspace-panel-body" key={`${group.id}-${panel.id}`} hidden={panel.id !== activePanel?.id}>{renderWorkspacePanel(panel)}</div>) : <div className="workspace-panel-body"><div className="workspace-panel-empty">This tab group has no panel.</div></div>}
    </section>;
  };

  return <div className={`workspace layout-${layout}`} style={{ "--navigator-width": `${activeLayout.navigatorWidth}px`, "--inspector-width": `${activeLayout.inspectorWidth}px` } as CSSProperties}>
    {layoutManagerOpen && canEdit && <LayoutManager workspace={session.workspace} layout={activeLayout} referenceTargets={referenceTargetOptions} onWorkspace={(next) => setSession((current) => ({ ...current, workspace: next }))} onClose={() => setLayoutManagerOpen(false)} />}
    {paletteOpen && <div className="command-backdrop" onMouseDown={() => setPaletteOpen(false)}><div className="command-palette" onMouseDown={(event) => event.stopPropagation()}><input autoFocus value={query} placeholder="Search every script, draft, and workspace…" onChange={(event) => setQuery(event.target.value)} />{query ? searchResults.map((result) => <button key={result.key} onClick={() => { result.action(); setPaletteOpen(false); }}>{result.label}</button>) : <><button disabled={!canEdit || busy} onClick={() => { void saveNow(); setPaletteOpen(false); }}>Save Project</button><button disabled={!canEdit} onClick={() => { saveDraftVersion(); setPaletteOpen(false); }}>Save Draft Version</button><button onClick={() => { exportFdx(); setPaletteOpen(false); }}>Export FDX</button><button onClick={() => { setInspectorOpen((open) => !open); setPaletteOpen(false); }}>Toggle Inspector</button><button disabled={!canEdit} onClick={() => { setLayoutManagerOpen(true); setPaletteOpen(false); }}>Manage Workspace Layouts</button></>}</div></div>}
    {episodeDocs.length > 1 && <div className="workspace-episodes" aria-label="Television episodes">
      {episodeDocs.map((episode, index) => <button key={episode.id ?? episode.source?.path ?? index} className={`episode-tab ${index === activeEpisode ? "active" : ""}`} onClick={() => selectEpisode(episode.id!)}>
        {session.workspace.series.episodes[episode.id!]?.title || episode.titlePage.title || `Episode ${index + 1}`}
      </button>)}
    </div>}
    <div className="toolbar">
      <input className="project-name-input" aria-label="Project name" value={session.name} disabled={!canEdit} onChange={(event) => setSession({ ...session, name: event.target.value })} />
      <select className="element-select" value={activeBlock?.type ?? "action"} disabled={!activeBlock || mode === "source" || doc.readOnly || !canEdit} onChange={(event) => setActiveType(event.target.value as ScreenplayElementType)}>
        {ELEMENT_TYPES.map((type, index) => <option key={type} value={type}>{elementLabels[type]} — Ctrl+{index + 1}</option>)}
      </select>
      <div className="mode-toggle">
        <button className={mode === "formatted" ? "active" : ""} onClick={() => mode === "source" && toggleMode()}>Formatted</button>
        <button disabled={doc.readOnly || !canEdit} className={mode === "source" ? "active" : ""} onClick={() => mode === "formatted" && toggleMode()}>Fountain Source</button>
      </div>
      <div className="toolbar-spacer" />
      <button className="btn btn-ghost" onClick={() => setPaletteOpen(true)}>Search · {session.workspace.shortcuts.commandPalette || "unassigned"}</button>
      <select className="element-select" aria-label="Workspace layout" value={layout} onChange={(event) => selectLayout(event.target.value)}>{session.workspace.layouts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button className="btn btn-ghost" disabled={!canEdit} onClick={() => setLayoutManagerOpen(true)}>Layouts</button>
      <button className="btn" onClick={() => void saveNow()} disabled={busy || !canEdit}>Save Project</button>
      <button className="btn btn-ghost" onClick={saveProjectAs} disabled={busy || !canEdit}>Save Project As…</button>
      <button className="btn" onClick={exportFountain}>Export Fountain</button>
      <button className="btn btn-ghost" onClick={onOpenFdx} disabled={busy || !canEdit}>Open FDX</button>
      {doc.source?.type === "fdx" && doc.source.path && <button className="btn btn-ghost" onClick={() => void openExternalFile(doc.source!.path)}>Open Externally</button>}
      {doc.source?.type === "fdx" && doc.source.path && <button className="btn btn-ghost" onClick={() => void revealExternalPath(doc.source!.path)}>Reveal FDX</button>}
      <button className="btn btn-ghost" onClick={addEpisode} disabled={busy || !canEdit}>Add Episode FDX</button>
      <button className="btn btn-ghost" onClick={addBlankEpisode} disabled={busy || !canEdit}>New Episode</button>
      <button className="btn btn-ghost" onClick={exportFdx}>Export FDX</button>
      <button className="btn" onClick={() => setInspectorOpen((open) => !open)}>{inspectorOpen ? "Panel ▸" : "◂ Panel"}</button>
    </div>
    {doc.source?.type === "fdx" && <div className="readonly-banner">{doc.source.path ? "Linked FDX · edits stay in SCS until exported." : "Imported FDX · choose its watch folder on this computer to relink companion updates."} <span>{doc.source.fileName}</span></div>}
    {externalChanged && <div className="operation-message" role="alert">{externalConflict ? "Both SCS and the linked FDX changed. Choose which script text to keep; SCS snapshots the current draft first." : "The linked FDX changed outside SCS."} <button className="btn" disabled={!canEdit} onClick={reloadLinkedFdx}>{externalConflict ? "Use external FDX" : "Re-import and preserve metadata"}</button>{externalConflict && <button className="btn btn-ghost" disabled={!canEdit} onClick={keepLocalAfterConflict}>Keep SCS draft</button>}</div>}
    {operationMessage && <div className="operation-message" role="status">{operationMessage}</div>}
    {!!doc.warnings?.length && <details className="import-summary"><summary>{doc.warnings.length} import warning{doc.warnings.length === 1 ? "" : "s"} — source data was preserved where possible</summary><ul>{doc.warnings.map((warning, index) => <li key={`${warning.code}-${index}`}><strong>{warning.code}</strong>: {warning.message}</li>)}</ul></details>}
    <div className={`workspace-main workspace-layout-runtime split-${splitDirection}`}>
      {orderedGroups.length ? orderedGroups.map(renderTabGroup) : scriptPanel}
      {activeLayout.floatingPanels.map((floating) => {
        const panel = activeLayout.panels.find((item) => item.id === floating.panelId);
        return panel && <section className="workspace-floating-panel" key={floating.panelId} style={{ left: floating.x, top: floating.y, width: floating.width, height: floating.height }}><header>{panel.title}</header><div className="workspace-panel-body">{renderWorkspacePanel(panel)}</div></section>;
      })}
    </div>
    <div className="statusbar"><span className="status-element">{activeBlock ? elementLabels[activeBlock.type] : "—"}</span><span>{scenes.length} scene{scenes.length === 1 ? "" : "s"}</span><span>~{pages} pages</span><span>{words} words</span><div className="toolbar-spacer" /><span>{doc.readOnly ? `Linked source · ${doc.source?.fileName ?? "FDX"}` : savedAt ? `Saved locally · ${savedAt}` : "Not saved yet"}</span><span className="status-draft">Draft: current · drafts panel →</span></div>
  </div>;
}

type ReferenceEntityProfile = CharacterProfile | ObjectProfile | LocationProfile;

interface ReferenceItem {
  id: string;
  title: string;
  meta?: string;
  detail?: string;
  documentId?: string;
  targetId?: string;
}

function InformationReferencePanel({ label, subtitle, body, items, onOpen }: {
  label: string;
  subtitle: string;
  body: string;
  items: ReferenceItem[];
  onOpen: (item: ReferenceItem) => void;
}) {
  return <aside className="reference-panel information-reference" aria-label={`${label} reference`}>
    <header><div><span className="insp-kicker">Persistent reference</span><strong>{label}</strong></div><span>{subtitle}</span></header>
    <div className="reference-scroll">
      <p className="reference-prose">{body}</p>
      {items.map((item) => <button className="reference-info-card" key={item.id} onClick={() => onOpen(item)} disabled={!item.documentId}><strong>{item.title}</strong>{item.meta && <span>{item.meta}</span>}{item.detail && <p>{item.detail}</p>}</button>)}
      {!items.length && <div className="reference-empty">No matching records yet. This panel will update as the project develops.</div>}
    </div>
  </aside>;
}

function ReferencePanel({ document, label, activeSceneNumber, onSynchronizedScene }: {
  document?: ScreenplayDocument;
  label: string;
  activeSceneNumber: number;
  onSynchronizedScene: (sceneNumber: number) => void;
}) {
  const referenceScenes = useMemo(() => document ? deriveScenes(document.blocks) : [], [document]);
  return <aside className="reference-panel" aria-label={`${label} reference`}>
    <header><div><span className="insp-kicker">Synchronized reference</span><strong>{label}</strong></div><span>{document?.titlePage.title || "Not available"}</span></header>
    {!document ? <div className="reference-empty">No matching script is available yet. Add an earlier episode or save a different draft version.</div> : <div className="reference-scroll">
      {referenceScenes.map((scene, index) => {
        const end = referenceScenes[index + 1]?.blockIndex ?? document.blocks.length;
        return <section key={scene.id} className={`reference-scene ${scene.number === activeSceneNumber ? "active" : ""}`} onClick={() => onSynchronizedScene(scene.number)}>
          <div className="reference-scene-heading"><span>{scene.sceneNumber ?? scene.number}</span>{scene.heading}</div>
          {document.blocks.slice(scene.blockIndex + 1, end).map((block) => <p key={block.id} className={`reference-block reference-${block.type}`}>{block.text}</p>)}
        </section>;
      })}
      {!referenceScenes.length && <div className="reference-empty">This reference contains no scene headings.</div>}
    </div>}
  </aside>;
}

function linkedBaselineMap(documents: ScreenplayDocument[]): Map<string, string> {
  return new Map(documents.flatMap((document) => document.id && document.source?.lastImportedFingerprint
    ? [[document.id, document.source.lastImportedFingerprint] as const]
    : []));
}

function materializeSourceDraft(
  session: ProjectSession,
  source: { mode: "formatted" | "source"; sourceText: string; document: ScreenplayDocument },
): ProjectSession {
  if (source.mode !== "source" || !source.document.id) return session;
  return reconcileImportedDocument(session, source.document.id, parseFountain(source.sourceText));
}

function versionableFingerprint(session: ProjectSession): string {
  const { versionHistory: _history, versions: _legacy, projectPath: _path, updatedAt: _updated, ...content } = session;
  return JSON.stringify({ ...content, documents: documentsForPortableStorage(content.documents), workspace: workspaceForPortableStorage(content.workspace) });
}

function portableFingerprint(session: ProjectSession): string {
  const { projectPath: _path, updatedAt: _updated, activeDocumentId: _activeDocumentId, ...portable } = session;
  return JSON.stringify({ ...portable, documents: documentsForPortableStorage(portable.documents), workspace: workspaceForPortableStorage(portable.workspace), versionHistory: versionHistoryForPortableStorage(portable.versionHistory) });
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
