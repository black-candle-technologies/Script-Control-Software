import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Editor, { type EditorHistory } from "./Editor.tsx";
import PanelHost, { type PanelTab } from "./Inspector.tsx";
import ContextInspector from "./ContextInspector.tsx";
import SceneNavigator from "./SceneNavigator.tsx";
import CompanionDashboard from "./CompanionDashboard.tsx";
import Icon, { type IconName } from "./Icons.tsx";
import { Menu, Segmented, ThemeToggle, type MenuEntry } from "./ui.tsx";
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
  hasPermission,
  keyboardShortcutMatches,
  moveScene,
  lockPages,
  markChangedBlocks,
  materializeFountainSource,
  mergeSnapshots,
  mergeCollaboratorSessions,
  reconcileImportedDocument,
  relinkDetachedFdxDocument,
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
  saveFdxExport,
  saveProjectSession,
  type FdxFileInfo,
} from "../services/fdxService.ts";
import { gitSyncCommit, gitSyncInit, gitSyncPull, gitSyncPush, gitSyncStatus, type GitSyncStatus } from "../services/syncService.ts";

interface WorkspaceProps {
  initialSession: ProjectSession;
  onOpenFdx: () => void;
  onExit: () => void;
}

/** Working modes of the shell. Each swaps the workspace around the same project. */
type Mode = "write" | "outline" | "treatment" | "reference" | "series" | "breakdown" | "drafts" | "team" | "companion";

const MODE_META: Record<Mode, { label: string; icon: IconName; blurb: string }> = {
  write: { label: "Write", icon: "write", blurb: "The screenplay" },
  outline: { label: "Outline", icon: "outline", blurb: "Acts, sequences, scenes, and beats beside the script" },
  treatment: { label: "Treatment", icon: "treatment", blurb: "Long-form prose linked to the story structure" },
  reference: { label: "Reference", icon: "reference", blurb: "Cast, props, and places detected from the script" },
  series: { label: "Series", icon: "series", blurb: "Show bible, seasons, arcs, and continuity" },
  breakdown: { label: "Breakdown", icon: "breakdown", blurb: "Reports, production tools, and revisions" },
  drafts: { label: "Drafts", icon: "drafts", blurb: "Draft versions, alternates, and project history" },
  team: { label: "Team", icon: "team", blurb: "Roles, comments, and shared-project sync" },
  companion: { label: "Companion", icon: "companion", blurb: "Watch Final Draft files and keep metadata in SCS" },
};

const MODE_TO_LAYOUT: Record<Mode, string> = {
  write: "writer",
  outline: "development",
  treatment: "development",
  reference: "writer",
  series: "television",
  breakdown: "production",
  drafts: "revision",
  team: "writer",
  companion: "companion",
};

const LAYOUT_TO_MODE: Record<string, Mode> = {
  writer: "write",
  development: "outline",
  revision: "drafts",
  television: "series",
  production: "breakdown",
  companion: "companion",
};

const REFERENCE_LABELS: Record<WorkspaceReferenceKind, string> = {
  none: "None",
  "previous-episode": "Previous episode",
  "next-episode": "Next episode",
  "previous-draft": "Previous draft",
  character: "Character",
  object: "Object",
  location: "Location",
  "show-bible": "Show bible",
  "season-arc": "Season arc",
  "plot-history": "Plot history",
  timeline: "Timeline",
};

interface UiPrefs {
  navOpen: boolean;
  inspOpen: boolean;
  navWidth: number;
  inspWidth: number;
  zoom: number;
}

interface EditorScrollSnapshot {
  element: HTMLElement | null;
  top: number;
  left: number;
}

const PREFS_KEY = "scs.ui.v1";
const DEFAULT_PREFS: UiPrefs = { navOpen: true, inspOpen: true, navWidth: 264, inspWidth: 320, zoom: 1 };

function loadPrefs(): UiPrefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}

export default function Workspace({ initialSession, onOpenFdx, onExit }: WorkspaceProps) {
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
  const [prefs, setPrefs] = useState<UiPrefs>(loadPrefs);
  const [modeState, setModeState] = useState<Mode>(() => LAYOUT_TO_MODE[initialSession.workspace.activeLayoutId] ?? "write");
  const mode = modeState;
  const [focusMode, setFocusMode] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"context" | "reference">("context");
  const [referenceKind, setReferenceKind] = useState<WorkspaceReferenceKind>("previous-draft");
  const [referenceTarget, setReferenceTarget] = useState("");
  const [referenceModeTab, setReferenceModeTab] = useState<PanelTab>("Cast");
  const [breakdownModeTab, setBreakdownModeTab] = useState<PanelTab>("Breakdown");
  const [editorMode, setEditorMode] = useState<"formatted" | "source">("formatted");
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
  const [query, setQuery] = useState("");
  const [externalChanged, setExternalChanged] = useState(false);
  const [externalConflict, setExternalConflict] = useState(false);
  const [externalModifiedAt, setExternalModifiedAt] = useState<number | null>(null);
  const [watchFiles, setWatchFiles] = useState<FdxFileInfo[]>([]);
  const [gitStatus, setGitStatus] = useState<GitSyncStatus>();
  const [sharedConflict, setSharedConflict] = useState<{ base?: ProjectSession; theirs: ProjectSession; conflicts: MergeConflict[] } | null>(null);
  const focusNonce = useRef(0);
  const editorHistoryRef = useRef<{ undo: () => void; redo: () => void } | null>(null);
  const editorHistoryStore = useRef(new Map<string, EditorHistory>());
  const paneDragRef = useRef<{ pointerId: number; pane: "nav" | "insp"; startX: number; startWidth: number; scroll: EditorScrollSnapshot } | null>(null);
  const scrollRestoreFrame = useRef<number | null>(null);
  const sessionRef = useRef(session);
  const sourceRecoveryRef = useRef({ mode: editorMode, sourceText, document: doc });
  sourceRecoveryRef.current = { mode: editorMode, sourceText, document: doc };
  const linkedBaselines = useRef(linkedBaselineMap(initialSession.documents));
  const sharedBaseline = useRef<ProjectSession | null>(null);
  // A local recovery session may be newer than its portable file. Establish
  // this baseline from disk before permitting pull/push operations.
  const portableBaseline = useRef("");
  const canEdit = hasPermission(session.workspace, session.workspace.currentUserId, "edit");
  const isTelevision = session.projectType === "television" || episodeDocs.length > 1;

  const setPref = <K extends keyof UiPrefs>(key: K, value: UiPrefs[K]) => setPrefs((current) => ({ ...current, [key]: value }));
  const captureEditorScroll = (): EditorScrollSnapshot => {
    const element = globalThis.document.querySelector<HTMLElement>(".editor-scroll");
    return { element, top: element?.scrollTop ?? 0, left: element?.scrollLeft ?? 0 };
  };
  const restoreEditorScroll = (snapshot: EditorScrollSnapshot) => {
    if (!snapshot.element) return;
    if (scrollRestoreFrame.current !== null) window.cancelAnimationFrame(scrollRestoreFrame.current);
    scrollRestoreFrame.current = window.requestAnimationFrame(() => {
      scrollRestoreFrame.current = null;
      if (!snapshot.element?.isConnected) return;
      snapshot.element.scrollTop = snapshot.top;
      snapshot.element.scrollLeft = snapshot.left;
    });
  };
  useEffect(() => () => {
    if (scrollRestoreFrame.current !== null) window.cancelAnimationFrame(scrollRestoreFrame.current);
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch { /* UI preferences are disposable */ }
  }, [prefs]);

  const setMode = (next: Mode) => {
    setModeState(next);
    const layoutId = MODE_TO_LAYOUT[next];
    if (session.workspace.activeLayoutId !== layoutId && session.workspace.layouts.some((layout) => layout.id === layoutId)) {
      setSession((current) => ({ ...current, workspace: { ...current.workspace, activeLayoutId: layoutId } }));
    }
    if (next !== "write") setFocusMode(false);
  };

  const materializeSourceSession = (current: ProjectSession): ProjectSession => materializeSourceDraft(current, { mode: editorMode, sourceText, document: doc });
  const installProjectSession = (next: ProjectSession) => {
    linkedBaselines.current = linkedBaselineMap(next.documents);
    setSession(next);
    setActiveEpisode(Math.max(0, next.documents.findIndex((document) => document.id === next.activeDocumentId)));
    setActiveBlockId(null);
    setEditorMode("formatted");
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
  const entityReferenceKey = mode === "write" && prefs.inspOpen && inspectorTab === "reference" && ["character", "object", "location"].includes(referenceKind)
    ? `${referenceKind}:${referenceTarget}`
    : "";
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
  const pageEstimates = useMemo(() => new Map(analysis.scenes.map((scene) => [scene.id, scene.estimatedPages])), [analysis.scenes]);
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

  const jumpToImportWarning = (blockIndex: number) => {
    let targetDocument = doc;
    if (editorMode === "source") {
      const reconciled = materializeFountainSource(session, doc.id!, sourceText);
      targetDocument = reconciled.documents.find((document) => document.id === doc.id) ?? doc;
      setSession(reconciled);
      setEditorMode("formatted");
      setSourceText("");
    }
    const target = targetDocument.blocks[blockIndex];
    if (!target) return;
    setFocusRequest({ id: target.id, nonce: ++focusNonce.current });
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

  const hasUnsavedSource = editorMode === "source" && sourceText !== toFountain(doc);

  useEffect(() => {
    if (editorMode !== "source") return;
    const timer = window.setTimeout(() => {
      if (!saveSession(materializeSourceSession(sessionRef.current))) setOperationMessage("Local recovery storage is full. Save the portable project now.");
    }, 800);
    return () => window.clearTimeout(timer);
  }, [editorMode, sourceText]);

  const selectEpisode = (documentId: string) => {
    const index = episodeDocs.findIndex((document) => document.id === documentId);
    if (index < 0) return;
    installProjectSession({ ...materializeSourceSession(session), activeDocumentId: documentId });
  };

  const toggleEditorMode = () => {
    if (doc.readOnly || !canEdit) return;
    if (editorMode === "formatted") {
      setSourceText(toFountain(doc));
      setEditorMode("source");
      return;
    }
    setSession((current) => materializeFountainSource(current, doc.id!, sourceText));
    setEditorMode("formatted");
    setSourceText("");
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
  const exportFdx = async () => {
    setBusy(true);
    setOperationMessage(null);
    try {
      const output = outputDocument();
      const { xml, warnings } = toFdxWithWarnings(output);
      const path = await saveFdxExport(xml, output.titlePage.title || "screenplay");
      if (!path) return;
      setOperationMessage(warnings.length
        ? `FDX exported to ${path} with ${warnings.length} preservation warning${warnings.length === 1 ? "" : "s"}: ${warnings.join(" ")}`
        : `FDX exported to ${path} without preservation warnings.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
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
    // The paper only exists while the Write canvas is mounted in Formatted view.
    if (editorMode === "source") toggleEditorMode();
    setModeState("write");
    window.setTimeout(() => {
      const pageElements = [...globalThis.document.querySelectorAll<HTMLElement>(".editor-scroll .page[data-page]")];
      pageElements.forEach((page) => { page.dataset.printRevised = revisedPages.has(page.dataset.page ?? "") ? "true" : "false"; });
      globalThis.document.body.classList.add("print-revision-pages");
      try {
        globalThis.print();
      } finally {
        globalThis.document.body.classList.remove("print-revision-pages");
        pageElements.forEach((page) => { delete page.dataset.printRevised; });
      }
    }, 150);
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
      setEditorMode("formatted");
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
    setEditorMode("formatted");
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
        const current = materializeSourceDraft(sessionRef.current, sourceRecoveryRef.current);
        const nowLinked = current.documents.find((document) => document.source?.type === "fdx" && document.source.path === file.path);
        if (nowLinked) {
          const next = reconcileImportedDocument(current, nowLinked.id!, imported);
          const reconciled = next.documents.find((document) => document.id === nowLinked.id)!;
          linkedBaselines.current.set(nowLinked.id!, screenplayTextFingerprint(reconciled));
          setSession(next);
          setOperationMessage(`Re-imported ${file.fileName}; SCS development metadata was preserved.`);
        } else {
          const detached = current.documents.filter((document) => document.source?.type === "fdx" && !document.source.path && document.source.fileName === file.fileName);
          if (detached.length === 1) {
            const result = relinkDetachedFdxDocument(current, detached[0].id!, imported);
            const reconciled = result.session.documents.find((document) => document.id === detached[0].id)!;
            linkedBaselines.current.set(detached[0].id!, reconciled.source?.lastImportedFingerprint ?? screenplayTextFingerprint(reconciled));
            setSession(result.session);
            if (result.disposition === "conflict") {
              setEditorMode("formatted");
              setSourceText("");
              setExternalConflict(true);
              setExternalChanged(true);
              setExternalModifiedAt(file.modifiedAt);
              setOperationMessage("Both copies changed. Review the conflict banner before replacing script text.");
              return;
            }
            setOperationMessage(result.disposition === "updated"
              ? `Re-imported ${file.fileName}; SCS development metadata was preserved.`
              : `Relinked ${file.fileName} without replacing the SCS draft.`);
          } else {
            const documents = [...current.documents, imported];
            const projectWorkspace = structuredClone(current.workspace);
            syncSeriesDocuments(projectWorkspace.series, documents);
            linkedBaselines.current.set(imported.id!, imported.source?.lastImportedFingerprint ?? screenplayTextFingerprint(imported));
            setSession({ ...current, projectType: documents.length > 1 ? "television" : current.projectType, documents, workspace: projectWorkspace, activeDocumentId: imported.id! });
            setOperationMessage(`Linked ${file.fileName} to this project.`);
          }
        }
      }
      setEditorMode("formatted");
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

  const moveSceneTo = (from: number, to: number) => {
    if (!canEdit) return;
    setDoc({ ...doc, blocks: moveScene(doc.blocks, from, to), scenes: undefined, characters: undefined, locations: undefined });
  };

  const normalizedQuery = query.trim().toLowerCase();
  const searchResults = normalizedQuery ? [
    ...episodeDocs.flatMap((document, documentIndex) => {
      const title = session.workspace.series.episodes[document.id!]?.title || document.titlePage.title || `Document ${documentIndex + 1}`;
      const documentScenes = deriveScenes(document.blocks);
      const documentCharacters = deriveCharacters(document.blocks);
      const documentObjects = detectObjects(document.blocks);
      const selectDocument = (tab: PanelTab) => () => {
        selectEpisode(document.id!);
        setMode("reference");
        setReferenceModeTab(tab);
      };
      return [
        ...documentScenes.filter((scene) => scene.heading.toLowerCase().includes(normalizedQuery)).map((scene) => ({
          key: `${document.id}-scene-${scene.id}`,
          label: `${title} · Scene ${scene.number}: ${scene.heading}`,
          action: () => {
            selectEpisode(document.id!);
            setMode("write");
            setFocusRequest({ id: scene.id, nonce: ++focusNonce.current });
          },
        })),
        ...document.blocks.filter((block) => block.type !== "scene_heading" && block.text.toLowerCase().includes(normalizedQuery)).map((block) => ({
          key: `${document.id}-block-${block.id}`,
          label: `${title} · ${elementLabels[block.type]}: ${block.text.slice(0, 90)}`,
          action: () => {
            selectEpisode(document.id!);
            setMode("write");
            setFocusRequest({ id: block.id, nonce: ++focusNonce.current });
          },
        })),
        ...documentCharacters.filter((character) => character.name.toLowerCase().includes(normalizedQuery)).map((character) => ({ key: `${document.id}-character-${character.name}`, label: `${title} · Character: ${character.name}`, action: selectDocument("Cast") })),
        ...documentObjects.filter((object) => object.name.toLowerCase().includes(normalizedQuery)).map((object) => ({ key: `${document.id}-object-${object.name}`, label: `${title} · Object: ${object.name}`, action: selectDocument("Props") })),
        ...(document.workspace?.treatments ?? []).filter((treatment) => `${treatment.title} ${treatment.markdown}`.toLowerCase().includes(normalizedQuery)).map((treatment) => ({ key: `${document.id}-treatment-${treatment.id}`, label: `${title} · Treatment: ${treatment.title}`, action: () => { selectEpisode(document.id!); setMode("treatment"); } })),
      ];
    }),
    ...(`${session.workspace.series.showBible} ${session.workspace.series.seasons.map((season) => season.arc).join(" ")}`.toLowerCase().includes(normalizedQuery) ? [{ key: "series-reference", label: "Series bible or season arc", action: () => setMode("series") }] : []),
    ...versionHistory.snapshots.filter((snapshot) => `${snapshot.name} ${snapshot.description}`.toLowerCase().includes(normalizedQuery)).map((snapshot) => ({ key: `version-${snapshot.id}`, label: `Draft version: ${snapshot.name}`, action: () => canEdit ? restoreVersion(snapshot) : setOperationMessage("This role can find draft versions but cannot restore them.") })),
    ...availableModes(isTelevision).filter((entry) => MODE_META[entry].label.toLowerCase().includes(normalizedQuery)).map((entry) => ({ key: `mode-${entry}`, label: `Go to ${MODE_META[entry].label}`, action: () => setMode(entry) })),
  ].slice(0, 30) : [];

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else if (focusMode) setFocusMode(false);
        return;
      }
      const action = Object.entries(session.workspace.shortcuts).find(([, shortcut]) => keyboardShortcutMatches(shortcut, event))?.[0];
      if (!action) return;
      event.preventDefault();
      if (action === "commandPalette") setPaletteOpen((open) => !open);
      else if (action === "save") void saveNow();
      else if (action === "saveVersion") saveDraftVersion();
      else if (action === "toggleInspector") setPref("inspOpen", !prefs.inspOpen);
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
    setMode("write");
    if (targetId) setFocusRequest({ id: targetId, nonce: ++focusNonce.current });
  };

  const panelProps = {
    scenes,
    characters,
    locations,
    objects,
    customStructure,
    breakdown,
    analysis,
    activeScene,
    workspace,
    onWorkspace: (patch: Partial<typeof workspace>) => setDoc({ ...doc, workspace: { ...workspace, ...patch } }),
    onJumpToScene: (sceneId: string) => {
      setMode("write");
      jumpToScene(sceneId);
    },
    versionHistory,
    versionComparison,
    mergeConflicts,
    mergePreviewReady,
    mergePreviewSourceId,
    onSaveVersion: saveDraftVersion,
    onRestoreVersion: restoreVersion,
    onCompareVersions: compareProjectVersions,
    onCreateAlternateDraft: createAlternate,
    onSwitchAlternateDraft: switchAlternate,
    onSelectCombineDraftSource: selectDraftCombineSource,
    onPreviewCombineDrafts: previewDraftCombine,
    onCombineDrafts: combineDrafts,
    onCancelCombineDrafts: cancelDraftCombine,
    onExportBreakdown: exportBreakdown,
    onExportTreatment: exportTreatment,
    projectWorkspace: session.workspace,
    seriesReport,
    activeDocumentId: doc.id!,
    onProjectWorkspace: (patch: Partial<ProjectSession["workspace"]>) => setSession((current) => ({ ...current, workspace: { ...current.workspace, ...patch } })),
    onSelectEpisode: selectEpisode,
    productionPages: productionPageRows,
    productionReports: productionReport,
    revisionSets,
    revisionSummaries: productionRevisionSummaries,
    onStartRevision: startRevision,
    onUpdateRevisionMarks: updateRevisionMarks,
    onLockPages: lockProductionPages,
    onUnlockPages: unlockProductionPages,
    onPrintRevisionPages: printRevisionPages,
    onToggleOmittedScene: toggleOmittedScene,
    onSetSceneNumber: setSceneNumber,
    onExportProduction: exportProduction,
    editable: canEdit,
    collaborationSession: materializeSourceSession(session),
    onCollaborationSession: installProjectSession,
    onCollaborationTarget: openCollaborationTarget,
    onCollaborationMessage: setOperationMessage,
    collaborationSync,
  };

  const referenceTargetOptions: Partial<Record<WorkspaceReferenceKind, { id: string; label: string }[]>> = {
    character: seriesReport.continuity.characters.map((item) => ({ id: item.name, label: item.name })),
    object: seriesReport.continuity.objects.map((item) => ({ id: item.name, label: item.name })),
    location: seriesReport.continuity.locations.map((item) => ({ id: item.name, label: item.name })),
  };

  const renderReference = (kind: WorkspaceReferenceKind, targetId: string) => {
    const label = REFERENCE_LABELS[kind];
    if (kind === "previous-episode" || kind === "previous-draft") {
      const document = kind === "previous-episode" ? episodeDocs[activeEpisode - 1] : previousDraftDocument;
      return <ReferencePanel document={document} label={label} activeSceneNumber={activeScene?.number ?? 1} onSynchronizedScene={(number) => scenes[number - 1] && jumpToScene(scenes[number - 1].id)} />;
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
      return <InformationReferencePanel label={label} subtitle={next?.titlePage.title || "No next episode"} body={body} items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId, item.targetId)} />;
    }
    if (kind === "show-bible") return <InformationReferencePanel label={label} subtitle={seriesReport.showBible.title || session.name} body={seriesReport.showBible.markdown || "The show bible is empty. Add canon and format notes in the Series workspace."} items={[]} onOpen={() => {}} />;
    if (kind === "season-arc") {
      const seasonId = session.workspace.series.episodes[doc.id!]?.seasonId;
      const season = seriesReport.seasons.find((item) => item.id === seasonId) ?? seriesReport.seasons[0];
      const items: ReferenceItem[] = season?.episodes.map((episode) => ({ id: episode.documentId, title: `Episode ${episode.number} · ${episode.title}`, meta: `${episode.sceneCount} scenes · ~${episode.pageEstimate} pages`, detail: episode.summary, documentId: episode.documentId })) ?? [];
      return <InformationReferencePanel label={label} subtitle={season?.title || "No season"} body={season?.arc || "No season arc has been written yet."} items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId)} />;
    }
    if (kind === "plot-history") {
      const items: ReferenceItem[] = seriesReport.plotThreads.map((thread) => ({ id: thread.id, title: `${thread.kind} · ${thread.label}`, meta: `${thread.status} · ${thread.episodes.length} episode(s)`, detail: thread.episodes.map((episode) => `${seriesReport.episodes.find((item) => item.documentId === episode.episodeId)?.title ?? episode.episodeId}: ${episode.status}`).join(" · "), documentId: thread.episodes[thread.episodes.length - 1]?.episodeId }));
      return <InformationReferencePanel label={label} subtitle="Series plot threads" body="Persistent A/B/C story coverage across every episode." items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId)} />;
    }
    if (kind === "timeline") {
      const items: ReferenceItem[] = session.workspace.series.continuity.filter((record) => record.kind === "timeline").slice().sort((left, right) => (left.timelineOrder ?? Number.MAX_SAFE_INTEGER) - (right.timelineOrder ?? Number.MAX_SAFE_INTEGER) || (left.timelineDate ?? "").localeCompare(right.timelineDate ?? "")).map((record) => ({ id: record.id, title: `${record.timelineOrder ?? "-"} · ${record.title}`, meta: record.timelineDate || "Relative story order", detail: record.detail, documentId: record.episodeIds[0] }));
      return <InformationReferencePanel label={label} subtitle="Timeline continuity" body="Story chronology and dated continuity records." items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId)} />;
    }
    if (kind === "character" || kind === "object" || kind === "location") {
      const requested = targetId.trim().toUpperCase();
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
      return <InformationReferencePanel label={label} subtitle={selected?.name || `No ${kind} selected`} body={detail} items={items} onOpen={(item) => item.documentId && openCollaborationTarget(item.documentId, item.targetId)} />;
    }
    return <InformationReferencePanel label="Reference" subtitle="No reference" body="Choose a reference source above." items={[]} onOpen={() => {}} />;
  };

  const startPaneResize = (event: ReactPointerEvent<HTMLDivElement>, pane: "nav" | "insp") => {
    paneDragRef.current = { pointerId: event.pointerId, pane, startX: event.clientX, startWidth: pane === "nav" ? prefs.navWidth : prefs.inspWidth, scroll: captureEditorScroll() };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const movePaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = paneDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = event.clientX - drag.startX;
    if (drag.pane === "nav") setPref("navWidth", clamp(drag.startWidth + delta, 200, 460));
    else setPref("inspWidth", clamp(drag.startWidth - delta, 260, 560));
    restoreEditorScroll(drag.scroll);
  };
  const stopPaneResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (paneDragRef.current?.pointerId !== event.pointerId) return;
    restoreEditorScroll(paneDragRef.current.scroll);
    paneDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizePaneWithKeyboard = (event: React.KeyboardEvent<HTMLDivElement>, pane: "nav" | "insp") => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const scroll = captureEditorScroll();
    if (pane === "nav") {
      setPref("navWidth", clamp(prefs.navWidth + (event.key === "ArrowLeft" ? -16 : 16), 200, 460));
    } else {
      setPref("inspWidth", clamp(prefs.inspWidth + (event.key === "ArrowRight" ? -16 : 16), 260, 560));
    }
    restoreEditorScroll(scroll);
  };

  const projectMenu: MenuEntry[] = [
    { label: "Save Project", hint: session.workspace.shortcuts.save || "", disabled: busy || !canEdit, onSelect: () => void saveNow() },
    { label: "Save Project As…", disabled: busy || !canEdit, onSelect: () => void saveProjectAs() },
    { label: "Save Draft Version", hint: session.workspace.shortcuts.saveVersion || "", disabled: !canEdit, onSelect: () => saveDraftVersion() },
    "divider",
    { label: "Export Fountain", onSelect: exportFountain },
    { label: "Export FDX", disabled: busy, onSelect: () => void exportFdx() },
    "divider",
    { label: "Open FDX…", disabled: busy || !canEdit, onSelect: onOpenFdx },
    ...(doc.source?.type === "fdx" && doc.source.path ? [
      { label: "Open linked FDX externally", onSelect: () => void openExternalFile(doc.source!.path) },
      { label: "Reveal linked FDX", onSelect: () => void revealExternalPath(doc.source!.path) },
    ] satisfies MenuEntry[] : []),
    "divider",
    { label: "Close Project", onSelect: onExit },
  ];

  const episodeMenu: MenuEntry[] = [
    { label: "New Blank Episode", disabled: busy || !canEdit, onSelect: addBlankEpisode },
    { label: "Import Episode FDX…", disabled: busy || !canEdit, onSelect: () => void addEpisode() },
  ];

  const modes = availableModes(isTelevision);
  const activeBranch = versionHistory.branches.find((branch) => branch.id === versionHistory.activeBranchId);
  const previousScene = activeScene ? scenes[scenes.findIndex((scene) => scene.id === activeScene.id) - 1] : undefined;
  const nextScene = activeScene ? scenes[scenes.findIndex((scene) => scene.id === activeScene.id) + 1] : undefined;

  const banners = <>
    {doc.source?.type === "fdx" && <div className="notice notice-linked">{doc.source.path ? "Linked FDX · edits stay in SCS until exported." : "Imported FDX · choose its watch folder on this computer to relink companion updates."} <span>{doc.source.fileName}</span></div>}
    {externalChanged && <div className="notice notice-warning" role="alert">{externalConflict ? "Both SCS and the linked FDX changed. Choose which script text to keep; SCS snapshots the current draft first." : "The linked FDX changed outside SCS."} <button className="btn" disabled={!canEdit} onClick={reloadLinkedFdx}>{externalConflict ? "Use external FDX" : "Re-import and preserve metadata"}</button>{externalConflict && <button className="btn btn-ghost" disabled={!canEdit} onClick={keepLocalAfterConflict}>Keep SCS draft</button>}</div>}
    {operationMessage && <div className="notice notice-status" role="status"><span>{operationMessage}</span><button className="notice-dismiss" aria-label="Dismiss message" onClick={() => setOperationMessage(null)}><Icon name="close" size={12} /></button></div>}
    {!!doc.warnings?.length && <details className="notice notice-details"><summary>{doc.warnings.length} import warning{doc.warnings.length === 1 ? "" : "s"}: source data was preserved where possible</summary><ul>{doc.warnings.map((warning, index) => {
      const canJump = warning.blockIndex !== undefined && Boolean(doc.blocks[warning.blockIndex]);
      const content = <><strong>{warning.code}</strong>: {warning.message}</>;
      return <li key={`${warning.code}-${index}`}>{canJump ? <button type="button" className="warning-link" onClick={() => jumpToImportWarning(warning.blockIndex!)}>{content}</button> : content}</li>;
    })}</ul></details>}
  </>;

  const writeView = (
    <div className="write-view">
      <div className="write-toolbar" role="toolbar" aria-label="Writing tools">
        <button className="tool-btn icon-only" aria-label={prefs.navOpen ? "Hide scene navigator" : "Show scene navigator"} aria-pressed={prefs.navOpen} title="Scene navigator" onClick={() => setPref("navOpen", !prefs.navOpen)}><Icon name="panel-left" /></button>
        <select className="input element-select" aria-label="Current element" value={activeBlock?.type ?? "action"} disabled={!activeBlock || editorMode === "source" || doc.readOnly || !canEdit} onChange={(event) => setActiveType(event.target.value as ScreenplayElementType)}>
          {ELEMENT_TYPES.map((type, index) => <option key={type} value={type}>{elementLabels[type]} | Ctrl+{index + 1}</option>)}
        </select>
        <div className="tool-group">
          <button className="tool-btn icon-only" aria-label="Undo" title="Undo (Ctrl+Z)" disabled={doc.readOnly || !canEdit || editorMode === "source"} onClick={() => editorHistoryRef.current?.undo()}><Icon name="undo" /></button>
          <button className="tool-btn icon-only" aria-label="Redo" title="Redo (Ctrl+Y)" disabled={doc.readOnly || !canEdit || editorMode === "source"} onClick={() => editorHistoryRef.current?.redo()}><Icon name="redo" /></button>
        </div>
        <div className="tool-spacer" />
        <Segmented
          ariaLabel="Editor view"
          options={[{ value: "formatted", label: "Formatted" }, { value: "source", label: "Fountain Source" }]}
          value={editorMode}
          disabled={doc.readOnly || !canEdit}
          onChange={(value) => value !== editorMode && toggleEditorMode()}
        />
        <select className="input zoom-select" aria-label="Page zoom" value={String(prefs.zoom)} onChange={(event) => setPref("zoom", Number(event.target.value))}>
          <option value="0.85">85%</option>
          <option value="1">100%</option>
          <option value="1.15">115%</option>
          <option value="1.3">130%</option>
        </select>
        <button className="tool-btn icon-only" aria-label="Find in project" title={`Find (${session.workspace.shortcuts.commandPalette || "Ctrl+K"})`} onClick={() => setPaletteOpen(true)}><Icon name="search" /></button>
        <button className="tool-btn icon-only" aria-label="Enter focus mode" title="Focus mode" onClick={() => setFocusMode(true)}><Icon name="focus" /></button>
        <button className="tool-btn icon-only" aria-label={prefs.inspOpen ? "Hide inspector" : "Show inspector"} aria-pressed={prefs.inspOpen} title="Inspector" onClick={() => setPref("inspOpen", !prefs.inspOpen)}><Icon name="panel-right" /></button>
      </div>
      {banners}
      <div className="write-grid">
        {prefs.navOpen && !focusMode && <>
          <aside className="pane pane-nav" style={{ width: prefs.navWidth }}>
            <SceneNavigator
              title={doc.titlePage.title || "Untitled Screenplay"}
              scenes={scenes}
              structure={structure}
              sceneMeta={workspace.sceneMeta ?? {}}
              omittedSceneIds={workspace.omittedSceneIds ?? []}
              pageEstimates={pageEstimates}
              activeSceneId={activeScene?.id ?? null}
              totalPages={pages}
              canEdit={canEdit && !doc.readOnly}
              onSelect={jumpToScene}
              onMoveScene={moveSceneTo}
            />
          </aside>
          <div className="pane-resize" role="separator" aria-orientation="vertical" aria-label="Resize scene navigator" tabIndex={0}
            onPointerDown={(event) => startPaneResize(event, "nav")} onPointerMove={movePaneResize} onPointerUp={stopPaneResize} onPointerCancel={stopPaneResize}
            onKeyDown={(event) => resizePaneWithKeyboard(event, "nav")} />
        </>}
        <div className="canvas" style={{ "--canvas-zoom": prefs.zoom } as React.CSSProperties}>
          <fieldset className="canvas-fieldset" disabled={!canEdit}>
            {editorMode === "formatted"
              ? <Editor documentId={doc.id!} blocks={doc.blocks} onBlocksChange={(blocks) => setDoc({ ...doc, blocks })} titlePage={doc.titlePage} onTitlePageChange={(titlePage) => setDoc({ ...doc, titlePage })} onActiveBlock={setActiveBlockId} focusRequest={focusRequest} readOnly={doc.readOnly || !canEdit || busy} productionPages={productionPageRows} historyRef={editorHistoryRef} historyStore={editorHistoryStore} />
              : <div className="source-wrap"><textarea className="source-editor" value={sourceText} spellCheck={false} readOnly={!canEdit || busy} onChange={(event) => setSourceText(event.target.value)} /><p className="source-hint">Fountain-inspired source. Switching back to Formatted re-parses this text.</p></div>}
          </fieldset>
        </div>
        {prefs.inspOpen && !focusMode && <>
          <div className="pane-resize" role="separator" aria-orientation="vertical" aria-label="Resize inspector" tabIndex={0}
            onPointerDown={(event) => startPaneResize(event, "insp")} onPointerMove={movePaneResize} onPointerUp={stopPaneResize} onPointerCancel={stopPaneResize}
            onKeyDown={(event) => resizePaneWithKeyboard(event, "insp")} />
          <aside className="pane pane-insp" style={{ width: prefs.inspWidth }} aria-label="Inspector">
            <div className="pane-tabs" role="tablist" aria-label="Inspector panels">
              <button role="tab" aria-selected={inspectorTab === "context"} className={inspectorTab === "context" ? "active" : ""} onClick={() => setInspectorTab("context")}>Inspector</button>
              <button role="tab" aria-selected={inspectorTab === "reference"} className={inspectorTab === "reference" ? "active" : ""} onClick={() => setInspectorTab("reference")}>Reference</button>
              <button className="pane-close" aria-label="Hide inspector" onClick={() => setPref("inspOpen", false)}><Icon name="close" size={12} /></button>
            </div>
            {inspectorTab === "context"
              ? <ContextInspector activeBlock={activeBlock} activeScene={activeScene} structure={structure} workspace={workspace} sceneNotes={doc.sceneNotes} canEdit={canEdit && !doc.readOnly} sourceMode={editorMode === "source"} onSetType={setActiveType} onWorkspace={panelProps.onWorkspace} onSceneNote={(sceneId, text) => setDoc({ ...doc, sceneNotes: { ...doc.sceneNotes, [sceneId]: text } })} />
              : <div className="reference-pane">
                  <div className="reference-picker">
                    <select className="input" aria-label="Reference source" value={referenceKind} onChange={(event) => { setReferenceKind(event.target.value as WorkspaceReferenceKind); setReferenceTarget(""); }}>
                      {(Object.keys(REFERENCE_LABELS) as WorkspaceReferenceKind[]).filter((kind) => kind !== "none").map((kind) => <option key={kind} value={kind}>{REFERENCE_LABELS[kind]}</option>)}
                    </select>
                    {referenceTargetOptions[referenceKind] && (
                      <select className="input" aria-label="Reference target" value={referenceTarget} onChange={(event) => setReferenceTarget(event.target.value)}>
                        <option value="">First match</option>
                        {referenceTargetOptions[referenceKind]!.map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}
                      </select>
                    )}
                  </div>
                  {renderReference(referenceKind, referenceTarget)}
                </div>}
          </aside>
        </>}
      </div>
    </div>
  );

  const modeView = (title: string, blurb: string, tabs: { value: PanelTab; label: string }[] | null, activeTab: PanelTab, onTab: (tab: PanelTab) => void, content?: React.ReactNode) => (
    <div className="mode-view">
      <header className="mode-header">
        <div>
          <h2>{title}</h2>
          <p>{blurb}</p>
        </div>
        {tabs && <Segmented ariaLabel={`${title} sections`} options={tabs} value={activeTab} onChange={onTab} />}
      </header>
      {banners}
      <div className="mode-body">
        {content ?? <PanelHost tab={activeTab} {...panelProps} />}
      </div>
    </div>
  );

  const content = mode === "write" ? writeView
    : mode === "outline" ? modeView("Outline", MODE_META.outline.blurb, null, "Story", () => {})
    : mode === "treatment" ? modeView("Treatment", MODE_META.treatment.blurb, null, "Treatment", () => {})
    : mode === "reference" ? modeView("Reference", MODE_META.reference.blurb, [
        { value: "Cast", label: "Cast" },
        { value: "Props", label: "Props" },
        { value: "Places", label: "Places" },
        { value: "Assist", label: "Assist" },
      ], referenceModeTab, setReferenceModeTab)
    : mode === "series" ? modeView("Series", MODE_META.series.blurb, null, "Series", () => {})
    : mode === "breakdown" ? modeView("Breakdown", MODE_META.breakdown.blurb, [
        { value: "Breakdown", label: "Reports" },
        { value: "Production", label: "Production" },
      ], breakdownModeTab, setBreakdownModeTab)
    : mode === "drafts" ? modeView("Drafts", MODE_META.drafts.blurb, null, "Drafts", () => {})
    : mode === "team" ? modeView("Team", MODE_META.team.blurb, null, "Team", () => {})
    : modeView("Companion", MODE_META.companion.blurb, null, "Story", () => {}, (
        <CompanionDashboard documents={session.documents} files={watchFiles} folderPath={session.workspace.sync.watchFolderPath} recursive={session.workspace.sync.watchRecursive} busy={busy} stats={companionStats} onChooseFolder={() => void chooseFdxWatchFolder()} onRefresh={() => void refreshWatchFiles()} onRecursive={setWatchRecursive} onReviewFile={(file) => void reviewWatchFile(file)} onOpenFile={(path) => void openExternalFile(path)} onReveal={(path) => void revealExternalPath(path)} />
      ));

  return <div className={`shell ${focusMode ? "focus-mode" : ""}`}>
    {paletteOpen && <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}>
      <div className="palette" role="dialog" aria-label="Find and command" onMouseDown={(event) => event.stopPropagation()}>
        <input autoFocus value={query} placeholder="Find scenes, dialogue, characters, drafts…" onChange={(event) => setQuery(event.target.value)} />
        <div className="palette-results">
          {query ? searchResults.map((result) => <button key={result.key} onClick={() => { result.action(); setPaletteOpen(false); }}>{result.label}</button>) : <>
            <button disabled={!canEdit || busy} onClick={() => { void saveNow(); setPaletteOpen(false); }}>Save Project</button>
            <button disabled={!canEdit} onClick={() => { saveDraftVersion(); setPaletteOpen(false); }}>Save Draft Version</button>
            <button disabled={busy} onClick={() => { void exportFdx(); setPaletteOpen(false); }}>Export FDX</button>
            <button onClick={() => { setPref("inspOpen", !prefs.inspOpen); setPaletteOpen(false); }}>Toggle Inspector</button>
            <button onClick={() => { setPref("navOpen", !prefs.navOpen); setPaletteOpen(false); }}>Toggle Scene Navigator</button>
            <button onClick={() => { setMode("write"); setFocusMode(true); setPaletteOpen(false); }}>Enter Focus Mode</button>
            {modes.map((entry) => <button key={entry} onClick={() => { setMode(entry); setPaletteOpen(false); }}>Go to {MODE_META[entry].label}</button>)}
          </>}
          {query && !searchResults.length && <div className="palette-empty">No matches in this project.</div>}
        </div>
      </div>
    </div>}

    <header className="titlebar">
      <button className="titlebar-mark" onClick={onExit} title="Back to launcher">SCS</button>
      <input className="project-name" aria-label="Project name" value={session.name} disabled={!canEdit} onChange={(event) => setSession({ ...session, name: event.target.value })} />
      <span className="titlebar-context">{MODE_META[mode].label}</span>
      <div className="tool-spacer" />
      <span className={`save-chip ${savedAt ? "saved" : ""}`} title="SCS autosaves a local recovery copy while you write">{savedAt ? `Saved · ${savedAt}` : doc.readOnly ? "Read-only" : "Autosave ready"}</span>
      <button className="tool-btn" disabled={busy || !canEdit} onClick={() => void saveNow()}>Save</button>
      <Menu label="Project" items={projectMenu} />
      <button className="tool-btn icon-only" aria-label="Find in project" title={`Find (${session.workspace.shortcuts.commandPalette || "Ctrl+K"})`} onClick={() => setPaletteOpen(true)}><Icon name="search" /></button>
      <ThemeToggle />
    </header>

    {isTelevision && <div className="episode-strip" aria-label="Television episodes">
      <div className="episode-tabs">
        {episodeDocs.map((episode, index) => <button key={episode.id ?? episode.source?.path ?? index} className={`episode-tab ${index === activeEpisode ? "active" : ""}`} onClick={() => selectEpisode(episode.id!)}>
          {session.workspace.series.episodes[episode.id!]?.title || episode.titlePage.title || `Episode ${index + 1}`}
        </button>)}
      </div>
      <Menu label="Episode" icon={<Icon name="plus" size={12} />} items={episodeMenu} buttonClassName="tool-btn episode-add" />
    </div>}

    <div className="shell-body">
      <nav className="mode-rail" aria-label="Workspaces">
        {modes.map((entry) => (
          <button key={entry} className={`rail-btn ${mode === entry ? "active" : ""}`} aria-pressed={mode === entry} title={MODE_META[entry].blurb} onClick={() => setMode(entry)}>
            <Icon name={MODE_META[entry].icon} />
            <span>{MODE_META[entry].label}</span>
          </button>
        ))}
      </nav>
      <main className="shell-main">{content}</main>
    </div>

    {focusMode && <div className="focus-pill" role="toolbar" aria-label="Focus mode controls">
      <button className="tool-btn icon-only" aria-label="Previous scene" disabled={!previousScene} onClick={() => previousScene && jumpToScene(previousScene.id)}><Icon name="back" size={12} /></button>
      <span className="focus-pill-scene">{activeScene ? `${activeScene.sceneNumber ?? activeScene.number} · ${activeScene.heading}` : "No scene"}</span>
      <button className="tool-btn icon-only" aria-label="Next scene" disabled={!nextScene} onClick={() => nextScene && jumpToScene(nextScene.id)}><Icon name="chevron-right" size={12} /></button>
      <span className="focus-pill-element">{activeBlock ? elementLabels[activeBlock.type] : "-"}</span>
      <button className="tool-btn" onClick={() => setFocusMode(false)}>Exit Focus · Esc</button>
    </div>}

    <footer className="statusbar">
      <span className="status-element">{activeBlock ? elementLabels[activeBlock.type] : "-"}</span>
      <span>{scenes.length} scene{scenes.length === 1 ? "" : "s"}</span>
      <span>~{pages} page{pages === 1 ? "" : "s"}</span>
      <span>{words} words</span>
      <div className="tool-spacer" />
      <span className="status-draft">{activeBranch?.name ?? "Main Draft"}</span>
      <span>{doc.readOnly ? `Linked source · ${doc.source?.fileName ?? "FDX"}` : savedAt ? `Saved locally · ${savedAt}` : "Not saved yet"}</span>
    </footer>
  </div>;
}

function availableModes(isTelevision: boolean): Mode[] {
  const modes: Mode[] = ["write", "outline", "treatment", "reference"];
  if (isTelevision) modes.push("series");
  modes.push("breakdown", "drafts", "team", "companion");
  return modes;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
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
  return <div className="reference-panel" aria-label={`${label} reference`}>
    <header><div><span className="kicker">Reference</span><strong>{label}</strong></div><span>{subtitle}</span></header>
    <div className="reference-scroll">
      <p className="reference-prose">{body}</p>
      {items.map((item) => <button className="reference-info-card" key={item.id} onClick={() => onOpen(item)} disabled={!item.documentId}><strong>{item.title}</strong>{item.meta && <span>{item.meta}</span>}{item.detail && <p>{item.detail}</p>}</button>)}
      {!items.length && <div className="reference-empty">No matching records yet. This panel will update as the project develops.</div>}
    </div>
  </div>;
}

function ReferencePanel({ document, label, activeSceneNumber, onSynchronizedScene }: {
  document?: ScreenplayDocument;
  label: string;
  activeSceneNumber: number;
  onSynchronizedScene: (sceneNumber: number) => void;
}) {
  const referenceScenes = useMemo(() => document ? deriveScenes(document.blocks) : [], [document]);
  return <div className="reference-panel" aria-label={`${label} reference`}>
    <header><div><span className="kicker">Synchronized</span><strong>{label}</strong></div><span>{document?.titlePage.title || "Not available"}</span></header>
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
  </div>;
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
  return materializeFountainSource(session, source.document.id, source.sourceText);
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
