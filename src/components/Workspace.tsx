import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Editor, { type EditorHistory } from "./Editor.tsx";
import PanelHost, { type PanelTab } from "./Inspector.tsx";
import ContextInspector from "./ContextInspector.tsx";
import SceneNavigator from "./SceneNavigator.tsx";
import CompanionDashboard from "./CompanionDashboard.tsx";
import Icon, { type IconName } from "./Icons.tsx";
import BrandMark from "./BrandMark.tsx";
import { DocumentTabs } from "./workspace/DocumentTabs.tsx";
import { DockLayoutRenderer, PanelPlacementControls } from "./workspace/DockLayoutRenderer.tsx";
import { WORKSPACE_PANEL_REGISTRY, type WorkspacePanelContext } from "./workspace/panelRegistry.tsx";
import { LayoutManager } from "./workspace/LayoutManager.tsx";
import { WindowMenu } from "./workspace/WindowMenu.tsx";
import { CrossWindowDropOverlay } from "./workspace/CrossWindowDropOverlay.tsx";
import "./workspace/workspace.css";
import { Menu, Segmented, ThemeToggle, type MenuEntry } from "./ui.tsx";
import {
  ELEMENT_TYPES,
  analysisToCsv,
  analysisToJson,
  analysisToMarkdown,
  addMilestone,
  buildCharacterSides,
  buildSceneSides,
  breakdownSectionsForScope,
  compareSnapshots,
  compareDrafts,
  compileBreakdown,
  compileAnalysis,
  compileSeriesWorkspace,
  createAlternateDraft,
  createDocumentTabState,
  closeDocumentTab,
  createProjectSnapshot,
  createVersionHistory,
  dialogueOnly,
  dockPanel,
  dockTreeNodes,
  deleteCustomLayout,
  duplicateWorkspaceLayout,
  draftReviewPreview,
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
  floatDockPanel,
  globalBreakdownCategoriesForScope,
  hasPermission,
  hideDockPanel,
  getWorkspaceDockLayout,
  getWorkspaceLayoutShortcut,
  keyboardShortcutMatches,
  loadUiPreferences,
  normalizeDocumentTabState,
  openDocumentTab,
  planDocumentRemoval,
  reconcileDocumentTabsAfterRemoval,
  reorderDocumentTab,
  reconcileStorySelection,
  removeProjectDocument,
  moveScene,
  lockPages,
  markChangedBlocks,
  materializeFountainSource,
  mergeSnapshots,
  mergePortableSaveMetadata,
  markDraftReviewApplied,
  mergeCollaboratorSessions,
  reconcileImportedDocument,
  reconcileFountainSourceBuffer,
  openDraftReview,
  refreshDraftReview,
  relinkDetachedFdxDocument,
  resolveStoryStructure,
  applyStorySceneOrder,
  restoreProjectSnapshot,
  restoreLocalDocumentState,
  restoreLocalWorkspaceState,
  resetBreakdownSections,
  restoreAllHiddenPanels,
  restoreHiddenPanel,
  restoreOffscreenFloatingPanels,
  productionPages,
  productionReports as compileProductionReports,
  productionReportsCsv,
  revisionExportMetadata,
  revisionReportMarkdown,
  saveSnapshot,
  saveCustomLayout,
  saveUiPreferencesForWindow,
  setDraftReviewResolution,
  setWorkspaceLayoutShortcut,
  screenplayTextFingerprint,
  setSceneOmitted,
  summarizeRevision,
  storedUiWindowPreferencesChanged,
  toFdxWithWarnings,
  toFountain,
  toFountainWithWarnings,
  updateDocumentView,
  uniqueWorkspaceLayoutId,
  type ScreenplayDocument,
  type ScreenplayElementType,
  type AnalysisCsvSection,
  type CoverageHook,
  type DraftReviewStatus,
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
  type ScriptTarget,
  type StoryStructure,
  type UiChromePreferences,
  type DocumentTabState,
  type WorkspaceReferenceKind,
  type WorkspaceDockLayout,
  type WorkspacePanelDefinition,
  type DockNode,
  syncSeriesDocuments,
  versionHistoryForPortableStorage,
  updateDraftReviewStatus,
  renameCustomLayout,
  uiPreferenceScope,
  uiWindowPreferences,
  withBreakdownSections,
  withGlobalBreakdownCategories,
  withUiWindowPreferences,
  workspaceForPortableStorage,
} from "../domain/index.ts";
import { saveSession } from "../storage.ts";
import { useCoordinatedSession, type CoordinatedSaveContext } from "../hooks/useCoordinatedSession.ts";
import { useNativeInternalDrag } from "../hooks/useNativeInternalDrag.ts";
import type { InternalDragSession } from "../services/nativeWorkspaceService.ts";
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
import { chooseAndImportTreatment, saveTreatmentExport, type TreatmentFileFormat } from "../services/treatmentService.ts";

interface WorkspaceProps {
  initialSession: ProjectSession;
  onOpenFdx: (beforeReplace?: () => Promise<boolean>) => void;
  onExit: () => void;
}

/** Working modes of the shell. Each swaps the workspace around the same project. */
type Mode = "write" | "outline" | "treatment" | "reference" | "series" | "breakdown" | "drafts" | "team" | "companion";

interface SourceCoordinationConflict {
  documentId: string;
  reason: "changed" | "deleted";
  documentTitle?: string;
  baseText: string;
  localText: string;
  acceptedText: string;
  acceptedRevision: number;
}

type PendingSourceExit =
  | { kind: "formatted" }
  | { kind: "import-warning"; blockIndex: number }
  | { kind: "document-tabs"; tabs: DocumentTabState };

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

const BUILTIN_LAYOUT_ID_SET = new Set(["writer", "development", "revision", "television", "production", "companion"]);

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

interface EditorScrollSnapshot {
  element: HTMLElement | null;
  top: number;
  left: number;
}

export default function Workspace({ initialSession, onOpenFdx, onExit }: WorkspaceProps) {
  const { session, setSession, mutateSession, meta: coordinated } = useCoordinatedSession(initialSession);
  const episodeDocs = session.documents;
  const windowSlotId = workspaceSlotId();
  const registeredNativeWindow = coordinated.windows?.windows.find((window) => window.windowId === coordinated.identity.windowId);
  const nativeDrag = useNativeInternalDrag({
    enabled: coordinated.native && coordinated.ready,
    projectId: coordinated.identity.projectId,
    sessionId: coordinated.identity.sessionId,
    windowId: coordinated.identity.windowId,
    sessionRevision: coordinated.revision,
    viewRevision: registeredNativeWindow?.viewRevision ?? 0,
  });
  const nativeDragControllerRef = useRef(nativeDrag);
  const nativeDragBeginRef = useRef<Promise<InternalDragSession> | null>(null);
  nativeDragControllerRef.current = nativeDrag;
  const [uiPreferences, setUiPreferences] = useState(() => loadUiPreferences(localStorage));
  const [dockLayout, setDockLayout] = useState<WorkspaceDockLayout>(() => {
    const stored = uiWindowPreferences(loadUiPreferences(localStorage), initialSession.projectId, windowSlotId);
    return getWorkspaceDockLayout(initialSession.workspace, stored.activeLayoutId)
      ?? getWorkspaceDockLayout(initialSession.workspace, "writer")!;
  });
  const [layoutWorkspaceOpen, setLayoutWorkspaceOpen] = useState(false);
  const [layoutManagerOpen, setLayoutManagerOpen] = useState(false);
  const [documentTabs, setDocumentTabs] = useState<DocumentTabState>(() => {
    const stored = uiWindowPreferences(loadUiPreferences(localStorage), initialSession.projectId, windowSlotId);
    const fallback = createDocumentTabState(initialSession.documents, initialSession.activeDocumentId);
    return normalizeDocumentTabState({ ...fallback, ...stored.tabs }, initialSession.documents, initialSession.activeDocumentId);
  });
  const activeEpisode = Math.max(0, episodeDocs.findIndex((document) => document.id === documentTabs.activeDocumentId));
  const doc = episodeDocs[activeEpisode];
  const [dirtyDocumentIds, setDirtyDocumentIds] = useState<ReadonlySet<string>>(() => initialSession.projectPath
    ? new Set()
    : new Set(initialSession.documents.flatMap((document) => document.id ? [document.id] : [])));
  const lastSeenDocuments = useRef(new Map(initialSession.documents.flatMap((document) => document.id ? [[document.id, document] as const] : [])));
  const lastSeenDocumentFingerprints = useRef(portableDocumentFingerprintMap(initialSession.documents));
  const pendingCleanDocumentFingerprints = useRef<Map<string, string> | undefined>(undefined);
  const setDoc = (next: ScreenplayDocument) => {
    if (next.id) setDirtyDocumentIds((current) => new Set(current).add(next.id!));
    setSession((current) => ({
      ...current,
      documents: current.documents.map((item, index) => index === activeEpisode ? next : item),
    }));
  };
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ id: string; nonce: number } | null>(null);
  const [scriptTargetRequest, setScriptTargetRequest] = useState<{ target: ScriptTarget; nonce: number } | null>(null);
  const prefs = uiPreferences.chrome;
  const windowPreferences = uiWindowPreferences(uiPreferences, initialSession.projectId, windowSlotId);
  const [modeState, setModeState] = useState<Mode>(() => {
    const stored = uiWindowPreferences(loadUiPreferences(localStorage), initialSession.projectId, windowSlotId);
    return isMode(stored.activeMode) ? stored.activeMode : LAYOUT_TO_MODE[initialSession.workspace.activeLayoutId] ?? "write";
  });
  const mode = modeState;
  const [focusMode, setFocusMode] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"context" | "reference">("context");
  const [referenceKind, setReferenceKind] = useState<WorkspaceReferenceKind>("previous-draft");
  const [referenceTarget, setReferenceTarget] = useState("");
  const [referenceModeTab, setReferenceModeTab] = useState<PanelTab>("Cast");
  const [breakdownModeTab, setBreakdownModeTab] = useState<PanelTab>("Breakdown");
  const [entityFocusRequest, setEntityFocusRequest] = useState<{ kind: "character" | "location"; id: string; nonce: number } | null>(null);
  const [editorMode, setEditorMode] = useState<"formatted" | "source">(() => {
    const activeId = documentTabs.activeDocumentId;
    return activeId && documentTabs.views[activeId]?.sourceMode ? "source" : "formatted";
  });
  const [sourceText, setSourceText] = useState(() => editorMode === "source" ? toFountain(doc) : "");
  const [sourceCoordinationConflict, setSourceCoordinationConflict] = useState<SourceCoordinationConflict | null>(null);
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
  const scriptTargetNonce = useRef(0);
  const entityFocusNonce = useRef(0);
  const editorHistoryRef = useRef<{ undo: () => void; redo: () => void } | null>(null);
  const editorHistoryStore = useRef(new Map<string, EditorHistory>());
  const paneDragRef = useRef<{ pointerId: number; pane: "nav" | "insp"; startX: number; startWidth: number; scroll: EditorScrollSnapshot } | null>(null);
  const scrollRestoreFrame = useRef<number | null>(null);
  const sourceEditorRef = useRef<HTMLTextAreaElement>(null);
  const sourceSelectionTimerRef = useRef<number | null>(null);
  const sourceSelectionRestoreFrame = useRef<number | null>(null);
  const suppressNextNativeViewRevision = useRef(false);
  const sessionRef = useRef(session);
  const sourceBaseRef = useRef<{ documentId: string; text: string; revision: number } | null>(
    editorMode === "source" && doc.id ? { documentId: doc.id, text: toFountain(doc), revision: coordinated.revision } : null,
  );
  const sourceKeepPendingRef = useRef<{ documentId: string; text: string; rawText: string } | null>(null);
  const pendingSourceExitRef = useRef<PendingSourceExit | null>(null);
  const sourceExitVerificationRef = useRef(false);
  const sourceRecoveryRef = useRef({ mode: editorMode, sourceText, document: doc, blocked: Boolean(sourceCoordinationConflict) });
  sourceRecoveryRef.current = { mode: editorMode, sourceText, document: doc, blocked: Boolean(sourceCoordinationConflict) };
  const linkedBaselines = useRef(linkedBaselineMap(initialSession.documents));
  const sharedBaseline = useRef<ProjectSession | null>(null);
  // A local recovery session may be newer than its portable file. Establish
  // this baseline from disk before permitting pull/push operations.
  const portableBaseline = useRef("");
  const canEdit = hasPermission(session.workspace, session.workspace.currentUserId, "edit");
  const isTelevision = session.projectType === "television";
  const breakdownPreferenceKey = uiPreferenceScope(session.projectId, doc.id!);
  const breakdownSections = breakdownSectionsForScope(uiPreferences, breakdownPreferenceKey);
  const globalBreakdownCategories = globalBreakdownCategoriesForScope(uiPreferences, breakdownPreferenceKey);
  const nativeViewFingerprint = JSON.stringify({
    tabs: {
      openDocumentIds: documentTabs.openDocumentIds,
      activeDocumentId: documentTabs.activeDocumentId,
    },
    dockLayout,
  });
  const previousNativeViewFingerprint = useRef(nativeViewFingerprint);

  const setPref = <K extends keyof UiChromePreferences>(key: K, value: UiChromePreferences[K]) => setUiPreferences((current) => ({
    ...current,
    chrome: { ...current.chrome, [key]: value },
  }));
  const rememberNativeDragStart = (start: Promise<InternalDragSession>) => {
    nativeDragBeginRef.current = start;
    void start.catch((error) => setOperationMessage(messageFrom(error)));
  };
  const cancelRememberedNativeDrag = async (force: boolean) => {
    const start = nativeDragBeginRef.current;
    if (!start) return;
    try {
      const started = await start;
      const controller = nativeDragControllerRef.current;
      if (controller.active?.dragId === started.dragId && (force || !controller.active.target)) {
        await controller.cancel(started.dragId);
      }
    } catch {
      // Begin/cancel failures are already exposed by the validated controller.
    } finally {
      if (nativeDragBeginRef.current === start) nativeDragBeginRef.current = null;
    }
  };
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
  const captureSourceSelection = () => {
    const editor = sourceEditorRef.current;
    if (editorMode !== "source" || !editor) return undefined;
    return { start: editor.selectionStart, end: editor.selectionEnd };
  };
  const restoreSourceSelection = (selection?: { start: number; end: number }) => {
    if (sourceSelectionRestoreFrame.current !== null) window.cancelAnimationFrame(sourceSelectionRestoreFrame.current);
    sourceSelectionRestoreFrame.current = window.requestAnimationFrame(() => {
      sourceSelectionRestoreFrame.current = null;
      const editor = sourceEditorRef.current;
      if (!editor || !selection) return;
      const start = Math.min(selection.start, editor.value.length);
      const end = Math.max(start, Math.min(selection.end, editor.value.length));
      editor.setSelectionRange(start, end);
    });
  };
  const persistSourceSelection = (editor: HTMLTextAreaElement, immediate = false) => {
    if (!doc.id) return;
    if (sourceSelectionTimerRef.current !== null) window.clearTimeout(sourceSelectionTimerRef.current);
    const documentId = doc.id;
    const commit = () => {
      sourceSelectionTimerRef.current = null;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      setDocumentTabs((current) => updateDocumentView(current, documentId, { sourceSelection: { start, end } }));
    };
    if (immediate) commit();
    else sourceSelectionTimerRef.current = window.setTimeout(commit, 250);
  };
  useEffect(() => () => {
    if (scrollRestoreFrame.current !== null) window.cancelAnimationFrame(scrollRestoreFrame.current);
    if (sourceSelectionTimerRef.current !== null) window.clearTimeout(sourceSelectionTimerRef.current);
    if (sourceSelectionRestoreFrame.current !== null) window.cancelAnimationFrame(sourceSelectionRestoreFrame.current);
  }, []);
  useEffect(() => {
    saveUiPreferencesForWindow(localStorage, uiPreferences, session.projectId, windowSlotId);
  }, [session.projectId, uiPreferences, windowSlotId]);
  useEffect(() => {
    const receivePreferences = (event: StorageEvent) => {
      if (event.key !== "scs.ui.v2") return;
      const next = loadUiPreferences(localStorage);
      const currentWindowChanged = storedUiWindowPreferencesChanged(
        event.oldValue,
        event.newValue,
        session.projectId,
        windowSlotId,
      );
      if (!currentWindowChanged) {
        // A sibling window saved its own slot. Preserve this window's pending
        // local slot while accepting the rest of the freshly merged snapshot.
        setUiPreferences((current) => withUiWindowPreferences(
          next,
          session.projectId,
          windowSlotId,
          uiWindowPreferences(current, session.projectId, windowSlotId),
        ));
        return;
      }
      setUiPreferences(next);
      const stored = uiWindowPreferences(next, session.projectId, windowSlotId);
      setDocumentTabs((current) => normalizeDocumentTabState({ ...current, ...stored.tabs }, session.documents, current.activeDocumentId));
    };
    window.addEventListener("storage", receivePreferences);
    return () => window.removeEventListener("storage", receivePreferences);
  }, [session.documents, session.projectId, windowSlotId]);
  useEffect(() => {
    setUiPreferences((current) => withUiWindowPreferences(current, session.projectId, windowSlotId, {
      tabs: documentTabs,
      activeMode: mode,
      activeLayoutId: dockLayout.id,
    }));
  }, [dockLayout.id, documentTabs, mode, session.projectId, windowSlotId]);
  useEffect(() => {
    const pendingClean = pendingCleanDocumentFingerprints.current;
    if (pendingClean && session.documents.length === pendingClean.size && session.documents.every((document) => document.id && pendingClean.get(document.id) === portableDocumentFingerprint(document))) {
      pendingCleanDocumentFingerprints.current = undefined;
      lastSeenDocuments.current = new Map(session.documents.flatMap((document) => document.id ? [[document.id, document] as const] : []));
      lastSeenDocumentFingerprints.current = pendingClean;
      setDirtyDocumentIds(new Set());
      return;
    }
    if (pendingClean) pendingCleanDocumentFingerprints.current = undefined;
    const nextFingerprints = new Map<string, string>();
    const changed = session.documents.flatMap((document) => {
      if (!document.id) return [];
      if (lastSeenDocuments.current.get(document.id) === document) {
        const previous = lastSeenDocumentFingerprints.current.get(document.id);
        if (previous) nextFingerprints.set(document.id, previous);
        return [];
      }
      if (dirtyDocumentIds.has(document.id)) return [document.id];
      const fingerprint = portableDocumentFingerprint(document);
      nextFingerprints.set(document.id, fingerprint);
      return lastSeenDocumentFingerprints.current.get(document.id) === fingerprint ? [] : [document.id];
    });
    lastSeenDocuments.current = new Map(session.documents.flatMap((document) => document.id ? [[document.id, document] as const] : []));
    lastSeenDocumentFingerprints.current = nextFingerprints;
    if (changed.length) setDirtyDocumentIds((current) => new Set([...current, ...changed]));
  }, [dirtyDocumentIds, session.documents]);
  useEffect(() => {
    if (previousNativeViewFingerprint.current === nativeViewFingerprint || !nativeDrag.ready) return;
    previousNativeViewFingerprint.current = nativeViewFingerprint;
    if (suppressNextNativeViewRevision.current) {
      suppressNextNativeViewRevision.current = false;
      return;
    }
    void nativeDrag.markViewChanged().catch((error) => setOperationMessage(messageFrom(error)));
  }, [nativeDrag.ready, nativeViewFingerprint]);
  useEffect(() => {
    if (nativeDrag.error) setOperationMessage(nativeDrag.error);
  }, [nativeDrag.error]);
  useEffect(() => {
    if (!doc.id) return;
    const scrollTop = globalThis.document.querySelector<HTMLElement>(".editor-scroll")?.scrollTop ?? documentTabs.views[doc.id]?.editorScrollTop ?? 0;
    setDocumentTabs((current) => updateDocumentView(current, doc.id!, {
      activeBlockId: activeBlockId ?? undefined,
      sourceMode: editorMode === "source",
      editorScrollTop: scrollTop,
    }));
  }, [activeBlockId, doc.id, editorMode]);
  useEffect(() => {
    if (editorMode !== "source" || !doc.id) return;
    restoreSourceSelection(documentTabs.views[doc.id]?.sourceSelection);
  }, [doc.id, editorMode]);

  useEffect(() => {
    if (editorMode !== "source" || !doc.id) return;
    const acceptedText = toFountain(doc);
    const base = sourceBaseRef.current;
    if (base && base.documentId !== doc.id && !session.documents.some((document) => document.id === base.documentId)) {
      const existing = sourceCoordinationConflict?.documentId === base.documentId && sourceCoordinationConflict.reason === "deleted"
        ? sourceCoordinationConflict
        : null;
      setSourceCoordinationConflict({
        documentId: base.documentId,
        reason: "deleted",
        documentTitle: existing?.documentTitle ?? "Removed screenplay",
        baseText: base.text,
        localText: sourceRecoveryRef.current.sourceText,
        acceptedText: "",
        acceptedRevision: coordinated.revision,
      });
      return;
    }
    if (!base || base.documentId !== doc.id) {
      sourceBaseRef.current = { documentId: doc.id, text: acceptedText, revision: coordinated.revision };
      sourceKeepPendingRef.current = null;
      setSourceCoordinationConflict(null);
      setSourceText(acceptedText);
      return;
    }
    const pending = sourceKeepPendingRef.current;
    if (pending?.documentId === doc.id) return;
    const reconciliation = reconcileFountainSourceBuffer({
      documentId: doc.id,
      baseText: base.text,
      localText: sourceRecoveryRef.current.sourceText,
      acceptedText,
      acceptedRevision: coordinated.revision,
    });
    if (reconciliation.kind === "conflict") {
      setSourceCoordinationConflict({ ...reconciliation, reason: "changed", documentTitle: screenplayDisplayTitle(doc) || "Untitled Screenplay" });
      return;
    }
    if (reconciliation.kind === "unchanged") return;
    sourceBaseRef.current = { documentId: doc.id, text: reconciliation.baseText, revision: coordinated.revision };
    sourceKeepPendingRef.current = null;
    setSourceCoordinationConflict(null);
    if (sourceRecoveryRef.current.sourceText !== reconciliation.localText) {
      sourceRecoveryRef.current = { ...sourceRecoveryRef.current, sourceText: reconciliation.localText };
      setSourceText(reconciliation.localText);
    }
  }, [coordinated.revision, doc, editorMode]);

  const setMode = (next: Mode) => {
    setModeState(next);
    const preset = getWorkspaceDockLayout(session.workspace, MODE_TO_LAYOUT[next]);
    if (preset) setDockLayout(preset);
    setLayoutWorkspaceOpen(false);
    if (next !== "write") setFocusMode(false);
  };

  const materializeSourceSession = (current: ProjectSession): ProjectSession => materializeSourceDraft(current, sourceRecoveryRef.current);
  const submitSourceBufferForCoordination = (): boolean => {
    if (editorMode !== "source" || !doc.id) return true;
    if (sourceCoordinationConflict) return false;
    const base = sourceBaseRef.current;
    if (base && base.documentId !== doc.id) {
      setSourceCoordinationConflict({
        documentId: base.documentId,
        reason: "deleted",
        documentTitle: "Removed screenplay",
        baseText: base.text,
        localText: sourceRecoveryRef.current.sourceText,
        acceptedText: "",
        acceptedRevision: coordinated.revision,
      });
      setOperationMessage("The screenplay behind this Fountain buffer is no longer available. Download or discard the protected local source before continuing.");
      return false;
    }
    const current = sessionRef.current;
    const currentDocument = current.documents.find((document) => document.id === doc.id);
    if (!currentDocument) return false;
    const candidate = materializeFountainSource(current, doc.id, sourceRecoveryRef.current.sourceText);
    const candidateDocument = candidate.documents.find((document) => document.id === doc.id);
    if (!candidateDocument) return false;
    const acceptedProjection = toFountain(candidateDocument);
    const currentProjection = toFountain(currentDocument);
    const pending = sourceKeepPendingRef.current;
    if (coordinated.native
      && pending?.documentId === doc.id
      && pending.text === acceptedProjection) {
      if (pending.rawText !== sourceRecoveryRef.current.sourceText) {
        sourceKeepPendingRef.current = { ...pending, rawText: sourceRecoveryRef.current.sourceText };
      }
      return true;
    }
    if (acceptedProjection === currentProjection) {
      sourceBaseRef.current = { documentId: doc.id, text: currentProjection, revision: coordinated.revision };
      sourceKeepPendingRef.current = null;
      if (sourceRecoveryRef.current.sourceText !== currentProjection) setSourceText(currentProjection);
      return true;
    }
    if (coordinated.native) {
      sourceKeepPendingRef.current = {
        documentId: doc.id,
        text: acceptedProjection,
        rawText: sourceRecoveryRef.current.sourceText,
      };
    } else {
      sourceBaseRef.current = { documentId: doc.id, text: acceptedProjection, revision: coordinated.revision };
      sourceKeepPendingRef.current = null;
      if (sourceRecoveryRef.current.sourceText !== acceptedProjection) setSourceText(acceptedProjection);
    }
    setSession(candidate);
    return true;
  };
  const deferSourceExitUntilAcknowledged = (exit: PendingSourceExit, message: string): boolean => {
    if (editorMode !== "source" || !coordinated.native) return false;
    if (sourceCoordinationConflict) {
      setOperationMessage("Resolve the Fountain Source conflict before leaving Source view.");
      return true;
    }
    if (!sourceKeepPendingRef.current && sourceRecoveryRef.current.sourceText === toFountain(doc)) return false;
    pendingSourceExitRef.current = exit;
    if (!submitSourceBufferForCoordination()) return true;
    if (!sourceKeepPendingRef.current) {
      pendingSourceExitRef.current = null;
      return false;
    }
    setOperationMessage(message);
    void resolvePendingSourceExit();
    return true;
  };
  const installProjectSession = (next: ProjectSession): boolean => {
    if (editorMode === "source" && (sourceCoordinationConflict
      || sourceKeepPendingRef.current
      || sourceBaseRef.current?.documentId !== doc.id
      || sourceRecoveryRef.current.sourceText !== toFountain(doc))) {
      setOperationMessage("Resolve or finish coordinating the current Fountain Source buffer before replacing the project session.");
      return false;
    }
    linkedBaselines.current = linkedBaselineMap(next.documents);
    setSession(next);
    setDocumentTabs((current) => normalizeDocumentTabState(current, next.documents, next.activeDocumentId));
    setActiveBlockId(null);
    setEditorMode("formatted");
    setSourceText("");
    sourceBaseRef.current = null;
    sourceKeepPendingRef.current = null;
    pendingSourceExitRef.current = null;
    setSourceCoordinationConflict(null);
    return true;
  };


  useEffect(() => {
    setDocumentTabs((current) => normalizeDocumentTabState(current, session.documents, session.activeDocumentId));
  }, [session.activeDocumentId, session.documents]);

  useEffect(() => {
    if (!initialSession.projectPath) return;
    let stopped = false;
    void openProjectSession(initialSession.projectPath).then((disk) => {
      if (stopped || sharedBaseline.current || portableBaseline.current) return;
      if (disk.updatedAt === initialSession.updatedAt) {
        sharedBaseline.current = disk;
        portableBaseline.current = portableFingerprint(disk);
      } else {
        const diskDocuments = portableDocumentFingerprintMap(disk.documents);
        const changed = initialSession.documents.flatMap((document) => document.id && diskDocuments.get(document.id) !== portableDocumentFingerprint(document) ? [document.id] : []);
        if (changed.length) setDirtyDocumentIds(new Set(changed));
      }
    }).catch(() => { /* the portable file may have moved since local recovery */ });
    return () => { stopped = true; };
  }, [initialSession.projectPath, initialSession.updatedAt]);

  useEffect(() => {
    sessionRef.current = session;
    const timer = setTimeout(() => {
      void coordinated.saveRecovery((snapshot) => saveSession(snapshot)).then((saved) => {
        if (saved) setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
        else setOperationMessage("Local recovery storage is full. Save the portable project now.");
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [coordinated.saveRecovery, session]);

  useEffect(() => () => { void coordinated.saveRecovery((snapshot) => saveSession(snapshot)); }, [coordinated.saveRecovery]);

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
  const customStructure = useMemo(() => resolveStoryStructure(doc.blocks, workspace.storyStructure), [doc.blocks, workspace.storyStructure]);
  const storySelection = useMemo(() => reconcileStorySelection({
    selectedSceneId: windowPreferences.selectedSceneByDocument[doc.id!],
    selectedBeatId: windowPreferences.selectedBeatByDocument[doc.id!],
  }, customStructure, scenes), [customStructure, doc.id, scenes, windowPreferences.selectedBeatByDocument, windowPreferences.selectedSceneByDocument]);
  const collapsedStoryNodes = useMemo(
    () => new Set(windowPreferences.collapsedStoryNodesByDocument[doc.id!] ?? []),
    [doc.id, windowPreferences.collapsedStoryNodesByDocument],
  );
  const structure = useMemo<StoryStructure>(() => ({
    acts: customStructure.acts.map((act) => ({
      id: act.id,
      title: act.title,
      sequences: customStructure.sequences
        .filter((sequence) => sequence.actId === act.id)
        .map((sequence) => ({ id: sequence.id, title: sequence.title, sceneIds: [...sequence.sceneIds] })),
    })),
    beats: customStructure.beats.flatMap((beat) => beat.sceneId
      ? [{ id: beat.id, text: beat.text, sceneId: beat.sceneId, status: beat.status }]
      : []),
  }), [customStructure]);
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
  const activeScene = activeIndex >= 0 ? [...scenes].reverse().find((scene) => scene.blockIndex <= activeIndex) ?? null : null;
  const rawSelectedSceneId = windowPreferences.selectedSceneByDocument[doc.id!];
  const rawSelectedBeatId = windowPreferences.selectedBeatByDocument[doc.id!];
  const updateStoryWindowPreferences = (
    selectedSceneId: string | undefined,
    selectedBeatId: string | undefined,
    collapsedNodeIds: ReadonlySet<string> = collapsedStoryNodes,
  ) => setUiPreferences((current) => {
    const stored = uiWindowPreferences(current, session.projectId, windowSlotId);
    const selectedSceneByDocument = { ...stored.selectedSceneByDocument };
    const selectedBeatByDocument = { ...stored.selectedBeatByDocument };
    if (selectedSceneId) selectedSceneByDocument[doc.id!] = selectedSceneId;
    else delete selectedSceneByDocument[doc.id!];
    if (selectedBeatId) selectedBeatByDocument[doc.id!] = selectedBeatId;
    else delete selectedBeatByDocument[doc.id!];
    return withUiWindowPreferences(current, session.projectId, windowSlotId, {
      selectedSceneByDocument,
      selectedBeatByDocument,
      collapsedStoryNodesByDocument: {
        ...stored.collapsedStoryNodesByDocument,
        [doc.id!]: [...collapsedNodeIds],
      },
    });
  });
  useEffect(() => {
    if (rawSelectedSceneId === storySelection.selectedSceneId && rawSelectedBeatId === storySelection.selectedBeatId) return;
    updateStoryWindowPreferences(storySelection.selectedSceneId, storySelection.selectedBeatId);
  }, [doc.id, rawSelectedBeatId, rawSelectedSceneId, storySelection.selectedBeatId, storySelection.selectedSceneId]);
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

  const selectStoryScene = (sceneId?: string) => {
    const selectedBeat = storySelection.selectedBeatId
      ? customStructure.beats.find((beat) => beat.id === storySelection.selectedBeatId)
      : undefined;
    updateStoryWindowPreferences(sceneId, selectedBeat?.sceneId === sceneId ? storySelection.selectedBeatId : undefined);
  };

  const activateStoryBeat = (beatId: string, sceneId: string) => {
    updateStoryWindowPreferences(sceneId || undefined, beatId);
    if (sceneId) jumpToScene(sceneId);
  };

  const jumpToImportWarning = (blockIndex: number) => {
    let targetDocument = doc;
    if (editorMode === "source") {
      if (sourceCoordinationConflict?.documentId === doc.id) {
        setOperationMessage("Resolve the Fountain Source conflict before leaving Source view.");
        return;
      }
      if (deferSourceExitUntilAcknowledged(
        { kind: "import-warning", blockIndex },
        "Waiting for the Fountain Source change to be acknowledged before opening the import warning.",
      )) return;
      const reconciled = materializeFountainSource(session, doc.id!, sourceRecoveryRef.current.sourceText);
      targetDocument = reconciled.documents.find((document) => document.id === doc.id) ?? doc;
      setSession(reconciled);
      setEditorMode("formatted");
      setSourceText("");
      sourceBaseRef.current = null;
      sourceKeepPendingRef.current = null;
      setSourceCoordinationConflict(null);
    }
    const target = targetDocument.blocks[blockIndex];
    if (!target) return;
    let sceneId: string | undefined;
    for (const scene of deriveScenes(targetDocument.blocks)) {
      if (scene.blockIndex > blockIndex) break;
      sceneId = scene.id;
    }
    setMode("write");
    setScriptTargetRequest({
      target: {
        documentId: targetDocument.id!,
        blockId: target.id,
        ...(sceneId ? { sceneId } : {}),
        source: "import-warning",
        reason: "Open the screenplay paragraph associated with this import warning",
      },
      nonce: ++scriptTargetNonce.current,
    });
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
      if (!submitSourceBufferForCoordination()) return;
      let sourceAccepted = true;
      void coordinated.saveRecovery((snapshot, context) => {
        sourceAccepted = sourceBufferMatchesAuthority(snapshot, context.revision);
        return sourceAccepted && saveSession(snapshot);
      }).then((saved) => {
        if (!sourceAccepted) {
          setOperationMessage("The Fountain Source change was not accepted. Resolve the protected local/accepted versions before saving.");
          return;
        }
        if (!saved) setOperationMessage("Local recovery storage is full. Save the portable project now.");
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [coordinated.saveRecovery, editorMode, sourceText]);

  const applyDocumentTabState = (next: DocumentTabState) => {
    const documentId = next.activeDocumentId;
    const sourceSelection = captureSourceSelection();
    if (sourceSelectionTimerRef.current !== null) {
      window.clearTimeout(sourceSelectionTimerRef.current);
      sourceSelectionTimerRef.current = null;
    }
    const withCurrentView = doc.id ? updateDocumentView(next, doc.id, {
      activeBlockId: activeBlockId ?? undefined,
      sourceMode: editorMode === "source",
      ...(sourceSelection ? { sourceSelection } : {}),
      editorScrollTop: captureEditorScroll().top,
    }) : next;
    if (!documentId || documentId === doc.id) {
      setDocumentTabs(withCurrentView);
      return;
    }
    if (sourceCoordinationConflict?.documentId === doc.id) {
      setOperationMessage("Resolve the Fountain Source conflict before switching screenplays.");
      return;
    }
    if (deferSourceExitUntilAcknowledged(
      { kind: "document-tabs", tabs: withCurrentView },
      "Waiting for the Fountain Source change to be acknowledged before switching screenplays.",
    )) return;
    const target = episodeDocs.find((document) => document.id === documentId);
    if (!target) return;
    const targetView = next.views[documentId];
    const targetSourceText = targetView?.sourceMode ? toFountain(target) : "";
    setSession(materializeSourceSession(session));
    setDocumentTabs(withCurrentView);
    setActiveBlockId(targetView?.activeBlockId ?? null);
    setEditorMode(targetView?.sourceMode ? "source" : "formatted");
    setSourceText(targetSourceText);
    sourceBaseRef.current = targetView?.sourceMode && target.id
      ? { documentId: target.id, text: targetSourceText, revision: coordinated.revision }
      : null;
    sourceKeepPendingRef.current = null;
    setSourceCoordinationConflict(null);
    setScriptTargetRequest(null);
    window.requestAnimationFrame(() => {
      const editor = globalThis.document.querySelector<HTMLElement>(".editor-scroll");
      if (editor) editor.scrollTop = targetView?.editorScrollTop ?? 0;
    });
    if (targetView?.sourceMode) restoreSourceSelection(targetView.sourceSelection);
  };
  const selectEpisode = (documentId: string) => {
    if (!episodeDocs.some((document) => document.id === documentId)) return;
    applyDocumentTabState(openDocumentTab(documentTabs, documentId));
  };

  useEffect(() => {
    const acknowledgement = nativeDrag.lastAcknowledgement;
    if (!acknowledgement) return;
    const isSource = acknowledgement.sourceWindowId === coordinated.identity.windowId;
    const isDestination = acknowledgement.destinationWindowId === coordinated.identity.windowId;
    if (acknowledgement.payload.kind === "document-tab") {
      const documentId = acknowledgement.payload.documentId;
      if (isDestination && acknowledgement.placement.kind === "document-tabs") {
        let next = openDocumentTab(documentTabs, documentId);
        next = reorderDocumentTab(next, documentId, acknowledgement.placement.index);
        if (JSON.stringify(next) !== JSON.stringify(documentTabs)) suppressNextNativeViewRevision.current = true;
        applyDocumentTabState(next);
      } else if (isSource && acknowledgement.effect === "move" && documentTabs.openDocumentIds.length > 1) {
        const next = closeDocumentTab(documentTabs, documentId);
        if (JSON.stringify(next) !== JSON.stringify(documentTabs)) suppressNextNativeViewRevision.current = true;
        applyDocumentTabState(next);
      }
    } else {
      const panelId = acknowledgement.payload.panelId;
      if (isDestination) {
        setDockLayout((current) => {
          const definition = current.panels.find((panel) => panel.id === panelId)
            ?? findWorkspacePanel(session.workspace, panelId);
          if (!definition) return current;
          let next = current.panels.some((panel) => panel.id === panelId) ? current : {
            ...current,
            panels: [...current.panels, definition],
            hiddenPanelIds: [...current.hiddenPanelIds, panelId],
          };
          if (acknowledgement.placement.kind === "floating-layer") {
            const placed = floatDockPanel(next, panelId);
            if (placed !== current) suppressNextNativeViewRevision.current = true;
            return placed;
          }
          if (acknowledgement.placement.kind === "dock-group") {
            const requestedGroupId = acknowledgement.placement.groupId;
            const targetId = dockTreeNodes(next.root).some((node) => node.kind === "tabs" && node.id === requestedGroupId)
              ? requestedGroupId
              : dockTreeNodes(next.root).find((node) => node.kind === "tabs")?.id;
            if (targetId) next = dockPanel(next, panelId, targetId, acknowledgement.placement.edge);
          }
          if (next !== current) suppressNextNativeViewRevision.current = true;
          return next;
        });
      } else if (isSource && acknowledgement.effect === "move") {
        setDockLayout((current) => {
          const next = hideDockPanel(current, panelId);
          if (next !== current) suppressNextNativeViewRevision.current = true;
          return next;
        });
      }
    }
    setOperationMessage(`${acknowledgement.effect === "copy" ? "Copied" : "Moved"} ${acknowledgement.payload.kind === "document-tab" ? "screenplay view" : "workspace panel"} after destination acknowledgement.`);
    nativeDrag.clearOutcome();
  }, [nativeDrag.lastAcknowledgement]);

  useEffect(() => {
    if (!nativeDrag.lastCancellation) return;
    setOperationMessage("The cross-window transfer was canceled; the source stayed unchanged.");
    nativeDrag.clearOutcome();
  }, [nativeDrag.lastCancellation]);

  const toggleEditorMode = () => {
    if (doc.readOnly || !canEdit) return;
    if (editorMode === "formatted") {
      const nextSource = toFountain(doc);
      sourceBaseRef.current = { documentId: doc.id!, text: nextSource, revision: coordinated.revision };
      sourceKeepPendingRef.current = null;
      setSourceCoordinationConflict(null);
      setSourceText(nextSource);
      setEditorMode("source");
      return;
    }
    if (sourceCoordinationConflict?.documentId === doc.id) {
      setOperationMessage("Resolve the Fountain Source conflict before returning to Formatted view.");
      return;
    }
    if (deferSourceExitUntilAcknowledged(
      { kind: "formatted" },
      "Waiting for the Fountain Source change to be acknowledged before returning to Formatted view.",
    )) return;
    setSession((current) => materializeFountainSource(current, doc.id!, sourceRecoveryRef.current.sourceText));
    setEditorMode("formatted");
    setSourceText("");
    sourceBaseRef.current = null;
    sourceKeepPendingRef.current = null;
    setSourceCoordinationConflict(null);
  };

  const runPortableSave = async (
    writer: (authoritative: ProjectSession, context: CoordinatedSaveContext) => Promise<ProjectSession | null>,
  ): Promise<ProjectSession | null> => {
    if (coordinated.native && !coordinated.isLeader) {
      const leader = coordinated.windows?.windows.find((window) => window.isLeader);
      setOperationMessage("Portable saves are serialized by the project leader window. Bringing that window forward now.");
      if (leader) await coordinated.focusWindow(leader.windowId).catch((error) => setOperationMessage(messageFrom(error)));
      return null;
    }
    let saved: ProjectSession | null = null;
    const completed = await coordinated.savePortable(async (authoritative, context) => {
      saved = await writer(authoritative, context);
      return Boolean(saved);
    });
    return completed ? saved : null;
  };

  const writePortableProject = (
    prepare: (authoritative: ProjectSession) => ProjectSession,
    saveAs = false,
  ) => {
    if (sourceCoordinationConflict) {
      setOperationMessage("Resolve the Fountain Source conflict before writing a portable project.");
      return Promise.resolve(null);
    }
    if (!submitSourceBufferForCoordination()) return Promise.resolve(null);
    return runPortableSave((authoritative, context) => sourceBufferMatchesAuthority(authoritative, context.revision)
      ? saveProjectSession(prepare(authoritative), saveAs)
      : Promise.resolve(null));
  };

  const markDocumentsClean = (
    savedDocuments: readonly ScreenplayDocument[],
    liveDocuments: readonly ScreenplayDocument[] = sessionRef.current.documents,
  ) => {
    const savedFingerprints = portableDocumentFingerprintMap(savedDocuments);
    const liveFingerprints = portableDocumentFingerprintMap(liveDocuments);
    const stillDirty = new Set(liveDocuments.flatMap((document) => document.id
      && savedFingerprints.get(document.id) === liveFingerprints.get(document.id)
      ? []
      : document.id ? [document.id] : []));
    pendingCleanDocumentFingerprints.current = undefined;
    lastSeenDocuments.current = new Map(liveDocuments.flatMap((document) => document.id ? [[document.id, document] as const] : []));
    lastSeenDocumentFingerprints.current = liveFingerprints;
    setDirtyDocumentIds(stillDirty);
  };

  const mergePortableSaveIntoLiveSession = (
    saved: ProjectSession,
    applySavedChanges: (current: ProjectSession) => ProjectSession = (current) => current,
  ) => {
    let liveDocuments: readonly ScreenplayDocument[] = sessionRef.current.documents;
    setSession((current) => {
      liveDocuments = current.documents;
      const next = applySavedChanges(current);
      return mergePortableSaveMetadata(next, saved);
    });
    markDocumentsClean(saved.documents, liveDocuments);
  };

  const saveNow = async () => {
    if (!canEdit || busy) return;
    if (sourceCoordinationConflict) {
      setOperationMessage("Resolve the Fountain Source conflict before saving this screenplay.");
      return;
    }
    if (!submitSourceBufferForCoordination()) return;
    let sourceAccepted = true;
    const recoverySaved = await coordinated.saveRecovery((authoritative, context) => {
      sourceAccepted = sourceBufferMatchesAuthority(authoritative, context.revision);
      return sourceAccepted && saveSession(authoritative);
    });
    if (!sourceAccepted) {
      setOperationMessage("The Fountain Source change was not accepted. Resolve the protected local/accepted versions before saving.");
      return;
    }
    if (recoverySaved) setSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    else setOperationMessage("Local recovery storage is full. Save the portable project now.");
    setBusy(true);
    try {
      const saved = await runPortableSave(async (authoritative, context) => {
        if (!sourceBufferMatchesAuthority(authoritative, context.revision)) return null;
        const output = authoritative;
        return saveProjectSession({ ...output, name: output.name || screenplayDisplayTitle(output.documents[0]) || "Untitled Project" });
      });
      if (!saved) {
        if (recoverySaved) setOperationMessage("Local recovery was updated; the portable save was canceled.");
        return;
      }
      mergePortableSaveIntoLiveSession(saved, (current) => ({ ...current, name: current.name || saved.name }));
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
    link.download = `${(screenplayDisplayTitle(doc) || "screenplay").toLowerCase().replace(/\s+/g, "-")}.${extension}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const outputDocument = () => materializeSourceSession(session).documents.find((document) => document.id === doc.id) ?? doc;
  const exportFountain = () => {
    const result = toFountainWithWarnings(outputDocument());
    download(result.text, "fountain", "text/plain");
    setOperationMessage(result.warnings.length
      ? `Fountain exported with ${result.warnings.length} preservation warning${result.warnings.length === 1 ? "" : "s"}: ${result.warnings.join(" ")}`
      : "Fountain exported without preservation warnings.");
  };
  const exportFdx = async () => {
    setBusy(true);
    setOperationMessage(null);
    try {
      const output = outputDocument();
      const { xml, warnings } = toFdxWithWarnings(output);
      const path = await saveFdxExport(xml, screenplayDisplayTitle(output) || "screenplay");
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
  const exportTreatment = async (format: TreatmentFileFormat) => {
    const treatment = workspace.treatments?.find((item) => item.id === workspace.activeTreatmentId) ?? workspace.treatments?.[0];
    const markdown = treatment?.markdown || workspace.treatment || "# Untitled Treatment\n";
    setBusy(true);
    setOperationMessage(null);
    try {
      const result = await saveTreatmentExport({ title: treatment?.title || "Treatment", markdown }, format);
      if (!result) return;
      setOperationMessage(result.warnings.length
        ? `Treatment exported to ${result.path} with ${result.warnings.length} conversion note${result.warnings.length === 1 ? "" : "s"}: ${result.warnings.map((warning) => warning.message).join(" ")}`
        : `Treatment exported to ${result.path}.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };
  const importTreatment = async () => {
    setBusy(true);
    setOperationMessage(null);
    const documentId = doc.id;
    try {
      const imported = await chooseAndImportTreatment();
      if (!imported) return;
      const id = `treatment-${crypto.randomUUID()}`;
      setSession((current) => ({
        ...current,
        documents: current.documents.map((document) => {
          if (document.id !== documentId) return document;
          const currentWorkspace = document.workspace ?? emptyWorkspace();
          const existing = currentWorkspace.treatments?.length
            ? currentWorkspace.treatments
            : currentWorkspace.treatment.trim()
              ? [{ id: "treatment-main", title: "Treatment", markdown: currentWorkspace.treatment, links: [] }]
              : [];
          const treatments = [...existing, { id, title: imported.title, markdown: imported.markdown, links: [] }];
          return { ...document, workspace: { ...currentWorkspace, treatments, activeTreatmentId: id, treatment: treatments[0]?.markdown ?? "" } };
        }),
      }));
      setOperationMessage(imported.warnings.length
        ? `Imported ${imported.fileName} with ${imported.warnings.length} conversion note${imported.warnings.length === 1 ? "" : "s"}: ${imported.warnings.map((warning) => warning.message).join(" ")}`
        : `Imported ${imported.fileName} as a new treatment.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
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
      if (!installProjectSession({ ...current, documents, workspace: projectWorkspace })) return;
      setDocumentTabs((tabs) => openDocumentTab(normalizeDocumentTabState(tabs, documents, current.activeDocumentId), imported.id!));
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      setBusy(false);
    }
  };

  const addBlankEpisode = () => {
    const current = materializeSourceSession(session);
    const imported = emptyDocument(`Screenplay ${current.documents.length + 1}`);
    const documents = [...current.documents, imported];
    const projectWorkspace = structuredClone(current.workspace);
    syncSeriesDocuments(projectWorkspace.series, documents);
    if (!installProjectSession({ ...current, documents, workspace: projectWorkspace })) return;
    setDocumentTabs((tabs) => openDocumentTab(normalizeDocumentTabState(tabs, documents, current.activeDocumentId), imported.id!));
  };

  const saveProjectAs = async () => {
    if (!canEdit) return;
    setBusy(true);
    setOperationMessage(null);
    try {
      const saved = await writePortableProject((authoritative) => ({
        ...authoritative,
        name: authoritative.name || screenplayDisplayTitle(authoritative.documents[0]) || "Untitled Project",
      }), true);
      if (saved) {
        mergePortableSaveIntoLiveSession(saved, (current) => ({ ...current, name: current.name || saved.name }));
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

  const requestRemoveDocument = (documentId: string) => {
    const current = materializeSourceSession(session);
    const plan = planDocumentRemoval(current, documentId, canEdit);
    if (!plan.allowed) {
      setOperationMessage(plan.reason === "last-document"
        ? "A project must retain at least one screenplay."
        : plan.reason === "permission" ? "Your collaboration role cannot remove screenplays." : "That screenplay no longer exists.");
      return;
    }
    const dependencyCount = Object.values(plan.dependencies).reduce((count, ids) => count + ids.length, 0);
    if (!window.confirm(`Remove “${plan.title}” from this project? This closes it in every view and cleans ${dependencyCount} live reference${dependencyCount === 1 ? "" : "s"}. A recovery snapshot will be created first.`)) return;
    try {
      const snapshot = projectSnapshot(current, `Before removing ${plan.title}`, `Protected recovery snapshot created before removing document ${documentId}.`);
      const history = current.versionHistory.snapshots.length
        ? saveSnapshot(current.versionHistory, snapshot)
        : createVersionHistory(snapshot, { id: "main", name: "Main Draft" });
      const result = removeProjectDocument({ ...current, versionHistory: history }, documentId, { canRemove: true, confirmedDocumentId: documentId });
      setSession(result.session);
      setDocumentTabs((tabs) => reconcileDocumentTabsAfterRemoval(tabs, result.session.documents, result.session.activeDocumentId));
      setOperationMessage(`Removed “${plan.title}”. Its protected recovery snapshot remains in Drafts.`);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "The screenplay could not be removed.");
    }
  };

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
    if (!installProjectSession(next)) return;
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
    if (!installProjectSession(next)) return;
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
    if (!installProjectSession(next)) return;
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
    if (!installProjectSession(next)) return;
    cancelDraftCombine();
    setOperationMessage(result.clean ? `Combined ${source.name} without conflicts.` : `Combined ${source.name} with ${result.conflicts.length} explicit conflict choice${result.conflicts.length === 1 ? "" : "s"}.`);
  };

  const openDraftReviewRequest = (title: string, description: string, sourceBranchId: string, targetBranchId: string, reviewerIds: string[]) => {
    if (!canEdit || hasUnsavedSource) {
      if (hasUnsavedSource) setOperationMessage("Save or return to Formatted mode before opening a Draft Review.");
      return;
    }
    try {
      const current = materializeSourceSession(session);
      if (reviewerIds.some((reviewerId) => !hasPermission(current.workspace, reviewerId, "approve"))) {
        throw new Error("Every selected Draft Review reviewer must have approval permission.");
      }
      let history = current.versionHistory;
      const active = history.branches.find((branch) => branch.id === history.activeBranchId);
      const activeHead = history.snapshots.find((snapshot) => snapshot.id === active?.headSnapshotId);
      if (active && (!activeHead || versionableFingerprint(current) !== versionableFingerprint(activeHead.session))) {
        history = saveSnapshot(history, projectSnapshot(current, "Auto-save before Draft Review", "Working changes preserved before opening the review."), active.id);
      }
      history = openDraftReview(history, {
        id: `draft-review-${crypto.randomUUID()}`,
        title,
        description,
        sourceBranchId,
        targetBranchId,
        authorId: current.workspace.currentUserId,
        reviewerIds,
        createdAt: new Date().toISOString(),
      });
      setSession({ ...current, versionHistory: history });
      setOperationMessage(`Opened Draft Review “${title.trim()}”.`);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "The Draft Review could not be opened.");
    }
  };

  const refreshDraftReviewRequest = (reviewId: string) => {
    if (!canEdit) {
      setOperationMessage("The current collaboration role cannot refresh Draft Reviews.");
      return;
    }
    try {
      const active = versionHistory.branches.find((branch) => branch.id === versionHistory.activeBranchId);
      const activeHead = versionHistory.snapshots.find((snapshot) => snapshot.id === active?.headSnapshotId);
      if (activeHead && versionableFingerprint(session) !== versionableFingerprint(activeHead.session)) {
        setOperationMessage("Save a Draft Version before refreshing this review so no working changes are missed.");
        return;
      }
      const history = refreshDraftReview(versionHistory, reviewId, new Date().toISOString());
      setSession((current) => ({ ...current, versionHistory: history }));
      setOperationMessage("Refreshed the Draft Review from both current branch heads.");
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "The Draft Review could not be refreshed.");
    }
  };

  const changeDraftReviewStatus = (reviewId: string, status: Exclude<DraftReviewStatus, "applied">) => {
    try {
      const review = versionHistory.draftReviews.find((item) => item.id === reviewId);
      if (!review) throw new Error(`Draft Review '${reviewId}' does not exist.`);
      const actorId = session.workspace.currentUserId;
      if (status === "approved" || status === "changes-requested") {
        if (!hasPermission(session.workspace, actorId, "approve") || (review.reviewerIds.length > 0 && !review.reviewerIds.includes(actorId))) {
          throw new Error("Only an assigned Draft Review approver can make that decision.");
        }
      } else if (status === "open" && review.status === "changes-requested"
        && hasPermission(session.workspace, actorId, "approve")
        && (review.reviewerIds.length === 0 || review.reviewerIds.includes(actorId))) {
        // The reviewer who requested changes may return the review to discussion.
      } else if (review.authorId !== actorId && !hasPermission(session.workspace, actorId, "manage-reviews")) {
        throw new Error("Only the review author or a review manager can change this Draft Review status.");
      }
      const history = updateDraftReviewStatus(versionHistory, reviewId, status, new Date().toISOString());
      setSession((current) => ({ ...current, versionHistory: history }));
      setOperationMessage(`Draft Review marked ${status.replace(/-/g, " ")}.`);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "The Draft Review status could not be changed.");
    }
  };

  const resolveDraftReview = (reviewId: string, path: string, resolution: "ours" | "theirs" | null) => {
    if (!hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) {
      setOperationMessage("The current collaboration role cannot resolve overlapping edits.");
      return;
    }
    try {
      const history = setDraftReviewResolution(versionHistory, reviewId, path, resolution, new Date().toISOString());
      setSession((current) => ({ ...current, versionHistory: history }));
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "The overlapping edit could not be resolved.");
    }
  };

  const applyDraftReview = (reviewId: string) => {
    if (!canEdit || !hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts") || hasUnsavedSource) return;
    try {
      const preview = draftReviewPreview(versionHistory, reviewId);
      if (!preview.readyToApply) throw new Error("Approve the current review and resolve every overlapping edit before applying it.");
      const active = versionHistory.branches.find((branch) => branch.id === versionHistory.activeBranchId);
      const activeHead = versionHistory.snapshots.find((snapshot) => snapshot.id === active?.headSnapshotId);
      if (activeHead && versionableFingerprint(session) !== versionableFingerprint(activeHead.session)) {
        throw new Error("Save a Draft Version before applying this review so no working changes are overwritten.");
      }
      let history = { ...versionHistory, activeBranchId: preview.review.targetBranchId };
      const mergedSession = sessionWithHistory(preview.mergeResult.merged, session, history);
      const combined = createProjectSnapshot({ ...mergedSession, versionHistory: history }, {
        id: `draft-${Date.now()}-${crypto.randomUUID()}`,
        name: `Applied ${preview.review.title}`,
        description: `Draft Review from ${preview.review.sourceBranchId} into ${preview.review.targetBranchId}.`,
        createdAt: new Date().toISOString(),
        parentIds: [preview.review.targetSnapshotId, preview.review.sourceSnapshotId],
        branchId: preview.review.targetBranchId,
        scope: { kind: "project" },
      });
      history = saveSnapshot(history, combined, preview.review.targetBranchId);
      history = markDraftReviewApplied(history, reviewId, combined.id, new Date().toISOString());
      if (!installProjectSession({ ...mergedSession, versionHistory: history })) return;
      cancelDraftCombine();
      setOperationMessage(`Applied Draft Review “${preview.review.title}” to ${history.branches.find((branch) => branch.id === preview.review.targetBranchId)?.name ?? "the target draft"}.`);
    } catch (error) {
      setOperationMessage(error instanceof Error ? error.message : "The Draft Review could not be applied.");
    }
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
        if (!installProjectSession({ ...currentSession, activeDocumentId: linked.id! })) return;
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
      const first = await writePortableProject((authoritative) => authoritative, true);
      if (!first) return;
      const saved = await writePortableProject((authoritative) => ({
        ...authoritative,
        projectPath: first.projectPath,
        updatedAt: first.updatedAt,
        workspace: {
          ...authoritative.workspace,
          sync: { ...authoritative.workspace.sync, mode: "folder" as const, folderPath: "" },
        },
      }));
      if (!saved) return;
      mergePortableSaveIntoLiveSession(saved, (current) => ({
        ...current,
        workspace: {
          ...current.workspace,
          sync: { ...current.workspace.sync, mode: "folder" as const, folderPath: "" },
        },
      }));
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

  const withCollaborationMergeHistory = (merged: ProjectSession, recoverySource: ProjectSession): ProjectSession => {
    let history = structuredClone(merged.versionHistory);
    if (!history.branches.length && history.snapshots.length) {
      const latest = history.snapshots[history.snapshots.length - 1];
      history.branches = [{ id: "main", name: "Main Draft", baseSnapshotId: history.snapshots[0].id, headSnapshotId: latest.id }];
      history.activeBranchId = "main";
    }
    const recovery = projectSnapshot(recoverySource, "Before shared collaboration merge", "Automatic recovery point before combining collaborator changes.");
    history = history.snapshots.length
      ? saveSnapshot(history, recovery, history.branches.some((branch) => branch.id === history.activeBranchId) ? history.activeBranchId : history.branches[0].id)
      : createVersionHistory(recovery, { id: "main", name: "Main Draft" });
    const combined = { ...merged, versionHistory: history };
    const mergeSnapshot = projectSnapshot(combined, "Shared collaboration merge", "Combined local and shared project changes.");
    return { ...combined, versionHistory: saveSnapshot(history, mergeSnapshot, history.activeBranchId) };
  };

  const persistCollaboratorMerge = async (merged: ProjectSession, theirs: ProjectSession) => {
    const localAtDecision = materializeSourceSession(sessionRef.current);
    const actorId = localAtDecision.workspace.currentUserId;
    let authoritativeAtSave: ProjectSession | null = null;
    const saved = await writePortableProject((authoritative) => {
      authoritativeAtSave = authoritative;
      const rebased = mergeCollaboratorSessions(localAtDecision, authoritative, merged, actorId, "ours");
      if (!rebased.clean) {
        throw new Error("The live project changed while the collaboration merge was being saved. Review the newly detected conflicts before writing the portable project.");
      }
      return {
        ...withCollaborationMergeHistory(rebased.session, authoritative),
        projectPath: theirs.projectPath,
        updatedAt: theirs.updatedAt,
      };
    });
    if (!saved) return;
    let liveMergeConflicts: MergeConflict[] = [];
    let liveDocuments: readonly ScreenplayDocument[] = sessionRef.current.documents;
    setSession((current) => {
      liveDocuments = current.documents;
      if (!authoritativeAtSave) return current;
      const live = mergeCollaboratorSessions(authoritativeAtSave, current, saved, actorId, "ours");
      liveMergeConflicts = live.conflicts;
      if (!live.clean) return current;
      const next = { ...live.session, projectPath: saved.projectPath, updatedAt: saved.updatedAt };
      liveDocuments = next.documents;
      return next;
    });
    markDocumentsClean(saved.documents, liveDocuments);
    sharedBaseline.current = structuredClone(saved);
    portableBaseline.current = portableFingerprint(saved);
    setSharedConflict(null);
    setOperationMessage(liveMergeConflicts.length
      ? "The collaboration merge was saved, but the live project changed during the write. Those newer edits remain in SCS; synchronize again to combine them with the portable file."
      : "Combined local and shared project changes into a new portable version.");
  };

  const syncSharedProject = async () => {
    if (!hasPermission(session.workspace, session.workspace.currentUserId, "resolve-conflicts")) return;
    const path = session.projectPath;
    if (!path || session.workspace.sync.mode !== "folder") return;
    setBusy(true);
    try {
      const saved = await writePortableProject((authoritative) => ({ ...authoritative, projectPath: path }));
      if (!saved) return;
      mergePortableSaveIntoLiveSession(saved);
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
      const saved = await writePortableProject((authoritative) => authoritative);
      if (!saved) return;
      portableBaseline.current = portableFingerprint(saved);
      const result = await gitSyncInit(saved.projectPath, saved.workspace.sync.branch, saved.workspace.sync.remoteUrl);
      mergePortableSaveIntoLiveSession(saved, (current) => ({
        ...current,
        workspace: { ...current.workspace, sync: { ...current.workspace.sync, mode: "git" as const } },
      }));
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
      const saved = await writePortableProject((authoritative) => authoritative);
      if (!saved) return;
      portableBaseline.current = portableFingerprint(saved);
      mergePortableSaveIntoLiveSession(saved);
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
      await coordinated.flushMutations();
      const authorityBeforePull = structuredClone(sessionRef.current);
      const before = await gitSyncStatus(session.projectPath);
      if (before.dirty) throw new Error("Save a Git sync point before pulling the remote project.");
      const result = await gitSyncPull(session.projectPath, session.workspace.sync.branch);
      const portable = await openProjectSession(session.projectPath);
      const opened = { ...portable, documents: restoreLocalDocumentState(portable.documents, authorityBeforePull.documents), workspace: restoreLocalWorkspaceState(portable.workspace, authorityBeforePull.workspace) };
      const live = sessionRef.current;
      const reconciled = mergeCollaboratorSessions(authorityBeforePull, live, opened, live.workspace.currentUserId, "ours");
      if (!reconciled.clean) throw new Error("The live project changed while Git pull was running. Those edits remain in SCS; review and synchronize again before replacing the portable draft.");
      if (!installProjectSession(reconciled.session)) return;
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
        ...document.blocks.flatMap((block, blockIndex) => {
          if (block.type === "scene_heading" || !block.text.toLowerCase().includes(normalizedQuery)) return [];
          const startOffset = block.text.toLowerCase().indexOf(normalizedQuery);
          const matchedText = block.text.slice(startOffset, startOffset + normalizedQuery.length);
          let sceneId: string | undefined;
          for (const scene of documentScenes) {
            if (scene.blockIndex > blockIndex) break;
            sceneId = scene.id;
          }
          return [{
            key: `${document.id}-block-${block.id}`,
            label: `${title} · ${elementLabels[block.type]}: ${block.text.slice(0, 90)}`,
            action: () => openScriptTarget({
              documentId: document.id!,
              blockId: block.id,
              ...(sceneId ? { sceneId } : {}),
              startOffset,
              endOffset: startOffset + matchedText.length,
              matchedText,
              occurrence: 0,
              source: "other",
              reason: "Open exact project search result",
            }),
          }];
        }),
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
        if (nativeDrag.canCancel) void nativeDrag.cancel().catch((error) => setOperationMessage(messageFrom(error)));
        else if (paletteOpen) setPaletteOpen(false);
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

  const openScriptTarget = (target: ScriptTarget) => {
    if (!session.documents.some((document) => document.id === target.documentId)) {
      setOperationMessage("That screenplay reference is no longer available.");
      return;
    }
    selectEpisode(target.documentId);
    setMode("write");
    setScriptTargetRequest({ target, nonce: ++scriptTargetNonce.current });
  };

  const openEntityBreakdown = (kind: "character" | "location", entityId: string) => {
    setEntityFocusRequest({ kind, id: entityId, nonce: ++entityFocusNonce.current });
    setReferenceModeTab(kind === "character" ? "Cast" : "Places");
    setMode("reference");
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
    onApplyStoryStructure: (nextStructure: typeof customStructure) => {
      const blocks = applyStorySceneOrder(doc.blocks, nextStructure.sceneOrder);
      setDoc({ ...doc, blocks, scenes: undefined, characters: undefined, locations: undefined, workspace: { ...workspace, storyStructure: nextStructure } });
      setOperationMessage("The draft now matches the outline scene order.");
    },
    onJumpToScene: (sceneId: string) => {
      setMode("write");
      jumpToScene(sceneId);
    },
    selectedBoardSceneId: storySelection.selectedSceneId,
    activeEditorSceneId: activeScene?.id,
    onSelectedBoardSceneChange: selectStoryScene,
    entityFocusRequest,
    onOpenEntityBreakdown: openEntityBreakdown,
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
    onOpenDraftReview: openDraftReviewRequest,
    onRefreshDraftReview: refreshDraftReviewRequest,
    onUpdateDraftReviewStatus: changeDraftReviewStatus,
    onResolveDraftReview: resolveDraftReview,
    onApplyDraftReview: applyDraftReview,
    onExportBreakdown: exportBreakdown,
    breakdownSections,
    onBreakdownSectionsChange: (sections: typeof breakdownSections) => setUiPreferences((current) => withBreakdownSections(current, breakdownPreferenceKey, sections)),
    onResetBreakdownSections: () => setUiPreferences((current) => resetBreakdownSections(current, breakdownPreferenceKey)),
    globalBreakdownCategories,
    onGlobalBreakdownCategoriesChange: (categories: typeof globalBreakdownCategories) => setUiPreferences((current) => withGlobalBreakdownCategories(current, breakdownPreferenceKey, categories)),
    onOpenScriptTarget: openScriptTarget,
    onImportTreatment: importTreatment,
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

  const applyWorkspaceLayout = (layoutId: string) => {
    const next = getWorkspaceDockLayout(session.workspace, layoutId);
    if (!next) {
      setOperationMessage("That workspace layout is missing or malformed; the Writer layout remains available.");
      return;
    }
    setDockLayout(next);
    setLayoutWorkspaceOpen(true);
    setLayoutManagerOpen(false);
  };
  const requirePortableLayoutEdit = () => {
    if (canEdit) return true;
    setOperationMessage("This project role may customize the current window but cannot change portable project layouts.");
    return false;
  };
  const saveCurrentWorkspaceLayout = (name: string) => {
    if (!requirePortableLayoutEdit()) return;
    try {
      const id = uniqueWorkspaceLayoutId(session.workspace, name);
      const candidate = { ...structuredClone(dockLayout), id, name };
      const preview = saveCustomLayout(session.workspace, candidate);
      const saved = getWorkspaceDockLayout(preview, id);
      if (!saved) throw new Error("The custom layout could not be normalized.");
      mutateSession({ kind: "upsert-layout", layout: saved });
      setDockLayout(saved);
      setOperationMessage(`Saved custom layout ${saved.name}.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const updateCurrentWorkspaceLayout = () => {
    if (!requirePortableLayoutEdit()) return;
    if (BUILTIN_LAYOUT_ID_SET.has(dockLayout.id)) return;
    try {
      const preview = saveCustomLayout(session.workspace, dockLayout);
      const saved = getWorkspaceDockLayout(preview, dockLayout.id);
      if (!saved) throw new Error("The custom layout could not be normalized.");
      mutateSession({ kind: "upsert-layout", layout: saved });
      setDockLayout(saved);
      setOperationMessage(`Updated custom layout ${saved.name}.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const duplicateLayout = (layoutId: string) => {
    if (!requirePortableLayoutEdit()) return;
    try {
      const preview = duplicateWorkspaceLayout(session.workspace, layoutId);
      const created = preview.layouts.find((layout) => !session.workspace.layouts.some((existing) => existing.id === layout.id));
      const saved = created ? getWorkspaceDockLayout(preview, created.id) : undefined;
      if (!saved) throw new Error("The layout copy could not be created.");
      mutateSession({ kind: "upsert-layout", layout: saved });
      setDockLayout(saved);
      setLayoutWorkspaceOpen(true);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const renameLayout = (layoutId: string, name: string) => {
    if (!requirePortableLayoutEdit()) return;
    try {
      const preview = renameCustomLayout(session.workspace, layoutId, name);
      const renamed = getWorkspaceDockLayout(preview, layoutId);
      if (!renamed) throw new Error("The renamed layout is unavailable.");
      mutateSession({ kind: "upsert-layout", layout: renamed });
      if (dockLayout.id === layoutId) setDockLayout(renamed);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const removeLayout = (layoutId: string) => {
    if (!requirePortableLayoutEdit()) return;
    try {
      deleteCustomLayout(session.workspace, layoutId);
      mutateSession({ kind: "delete-layout", layoutId });
      if (dockLayout.id === layoutId) applyWorkspaceLayout("writer");
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const changeLayoutShortcut = (layoutId: string, shortcut: string) => {
    if (!requirePortableLayoutEdit()) return;
    try {
      const workspace = setWorkspaceLayoutShortcut(session.workspace, layoutId, shortcut);
      mutateSession({ kind: "set-workspace", workspace });
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const restoreDockPanel = (panelId: string) => setDockLayout((current) => restoreHiddenPanel(current, panelId));
  const activeDockPanelId = activePanelInDockTree(dockLayout.root);
  const activeDockPanel = dockLayout.panels.find((panel) => panel.id === activeDockPanelId);
  const hiddenDockPanels = dockLayout.hiddenPanelIds.flatMap((panelId) => {
    const panel = dockLayout.panels.find((candidate) => candidate.id === panelId);
    return panel ? [{ id: panel.id, title: panel.title }] : [];
  });
  const layoutMenuEntries = session.workspace.layouts.map((layout) => ({
    id: layout.id,
    name: layout.name,
    active: layoutWorkspaceOpen && dockLayout.id === layout.id,
  }));

  const nativeWindowEntries = coordinated.windows?.windows.map((window, index) => ({
    windowId: window.windowId,
    label: window.label,
    title: window.slotId === "primary" ? "Primary Window" : `Window ${index + 1}`,
    active: window.windowId === coordinated.identity.windowId,
    leader: window.isLeader,
  })) ?? [{ windowId: coordinated.identity.windowId, label: "browser", title: "Current Window", active: true, leader: true }];
  const newWorkspaceWindow = async (openCurrentDocument = false, activeLayoutId?: string): Promise<boolean> => {
    if (!coordinated.native) {
      setOperationMessage("Native workspace windows are available in the Windows desktop build.");
      return false;
    }
    const slotId = `slot-${crypto.randomUUID().slice(0, 8)}`;
    let nextPreferences = uiPreferences;
    if (openCurrentDocument || activeLayoutId) {
      const tabs = openCurrentDocument ? openDocumentTab(createDocumentTabState(session.documents, doc.id), doc.id!) : undefined;
      nextPreferences = withUiWindowPreferences(nextPreferences, session.projectId, slotId, {
        ...(tabs ? { tabs } : {}),
        activeMode: mode,
        activeLayoutId: activeLayoutId ?? MODE_TO_LAYOUT[mode],
      });
      setUiPreferences(nextPreferences);
      saveUiPreferencesForWindow(localStorage, nextPreferences, session.projectId, slotId);
    }
    try {
      await coordinated.createWindow(slotId);
      return true;
    } catch (error) {
      setOperationMessage(messageFrom(error));
      return false;
    }
  };
  const moveDocumentToWindow = async (windowId: string) => {
    const target = coordinated.windows?.windows.find((window) => window.windowId === windowId);
    if (!target || !doc.id) return;
    if (coordinated.native) {
      if (!nativeDrag.ready) {
        setOperationMessage("Cross-window transfer listeners are still starting. Try again in a moment.");
        return;
      }
      try {
        const effect = documentTabs.openDocumentIds.length > 1 ? "move" : "copy";
        await nativeDrag.beginDocumentTransfer(doc.id, effect);
        await coordinated.focusWindow(windowId);
        setOperationMessage(`${effect === "copy" ? "Open" : "Move"} the screenplay by choosing its tab placement in ${target.slotId}; this window changes only after acknowledgement.`);
      } catch (error) {
        setOperationMessage(messageFrom(error));
      }
      return;
    }
    const destinationPreferences = uiWindowPreferences(uiPreferences, session.projectId, target.slotId);
    const destinationTabs = openDocumentTab(normalizeDocumentTabState(destinationPreferences.tabs, session.documents, doc.id), doc.id);
    let nextPreferences = withUiWindowPreferences(uiPreferences, session.projectId, target.slotId, { tabs: destinationTabs });
    const sourceTabs = documentTabs.openDocumentIds.length > 1 ? closeDocumentTab(documentTabs, doc.id) : documentTabs;
    nextPreferences = withUiWindowPreferences(nextPreferences, session.projectId, windowSlotId, { tabs: sourceTabs });
    setUiPreferences(nextPreferences);
    saveUiPreferencesForWindow(localStorage, nextPreferences, session.projectId, target.slotId);
    saveUiPreferencesForWindow(localStorage, nextPreferences, session.projectId, windowSlotId);
    applyDocumentTabState(sourceTabs);
    setOperationMessage(documentTabs.openDocumentIds.length > 1
      ? `Moved ${screenplayDisplayTitle(doc) || "screenplay"} to ${target.slotId}.`
      : `Opened ${screenplayDisplayTitle(doc) || "screenplay"} in ${target.slotId}; this window kept its only open view.`);
  };
  const moveDocumentToNewWindow = async () => {
    if (!doc.id) return;
    if (!coordinated.native || !nativeDrag.ready) {
      setOperationMessage("Cross-window transfer listeners are still starting. Try again in a moment.");
      return;
    }
    const effect = documentTabs.openDocumentIds.length > 1 ? "move" : "copy";
    let drag: InternalDragSession | undefined;
    try {
      drag = await nativeDrag.beginDocumentTransfer(doc.id, effect);
      const created = await newWorkspaceWindow(false);
      if (!created) {
        await nativeDrag.cancel(drag.dragId).catch(() => undefined);
        return;
      }
      setOperationMessage(`${effect === "copy" ? "Open" : "Move"} ${screenplayDisplayTitle(doc) || "screenplay"} by choosing its tab placement in the new window; the source changes only after acknowledgement.`);
    } catch (error) {
      if (drag) await nativeDrag.cancel(drag.dragId).catch(() => undefined);
      setOperationMessage(messageFrom(error));
    }
  };
  const movePanelToWindow = async (windowId: string, copy: boolean) => {
    if (!activeDockPanel) return;
    if (copy && !WORKSPACE_PANEL_REGISTRY[activeDockPanel.kind].copyable) {
      setOperationMessage(`${activeDockPanel.title} is a core window panel and cannot be copied.`);
      return;
    }
    if (!copy && !activeDockPanel.closable) {
      setOperationMessage(`${activeDockPanel.title} is required in this window and cannot be moved out of it.`);
      return;
    }
    const target = coordinated.windows?.windows.find((window) => window.windowId === windowId);
    if (!target || !nativeDrag.ready) {
      setOperationMessage("Cross-window panel transfer is not ready yet.");
      return;
    }
    try {
      await nativeDrag.beginPanelTransfer(activeDockPanel.id, copy ? "copy" : "move");
      await coordinated.focusWindow(windowId);
      setOperationMessage(`Choose where to ${copy ? "copy" : "move"} ${activeDockPanel.title} in ${target.slotId}; the source remains until acknowledgement.`);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const useAcceptedFountainSource = () => {
    const conflict = sourceCoordinationConflict;
    if (!conflict) return;
    if (conflict.reason === "deleted") {
      sourceBaseRef.current = null;
      sourceKeepPendingRef.current = null;
      pendingSourceExitRef.current = null;
      setSourceText("");
      setEditorMode("formatted");
      setSourceCoordinationConflict(null);
      setOperationMessage("The local Fountain buffer for the removed screenplay was discarded.");
      return;
    }
    if (conflict.documentId !== doc.id) return;
    sourceBaseRef.current = { documentId: conflict.documentId, text: conflict.acceptedText, revision: conflict.acceptedRevision };
    sourceKeepPendingRef.current = null;
    setSourceText(conflict.acceptedText);
    setSourceCoordinationConflict(null);
    setOperationMessage("The accepted coordinated draft now replaces the local Fountain buffer.");
  };
  const keepLocalFountainSource = () => {
    const conflict = sourceCoordinationConflict;
    if (!conflict || conflict.reason === "deleted" || conflict.documentId !== doc.id || !canEdit) return;
    const candidate = materializeFountainSource(sessionRef.current, conflict.documentId, sourceText);
    const candidateDocument = candidate.documents.find((document) => document.id === conflict.documentId);
    if (!candidateDocument) return;
    const candidateText = toFountain(candidateDocument);
    setSourceText(candidateText);
    if (!coordinated.native || candidateText === conflict.acceptedText) {
      sourceBaseRef.current = { documentId: conflict.documentId, text: candidateText, revision: coordinated.revision };
      sourceKeepPendingRef.current = null;
      setSourceCoordinationConflict(null);
    } else {
      sourceKeepPendingRef.current = {
        documentId: conflict.documentId,
        text: candidateText,
        rawText: candidateText,
      };
    }
    setSession(candidate);
    setOperationMessage(coordinated.native
      ? "Submitting the local Fountain source to the project coordinator. This buffer remains protected until acknowledgement."
      : "The local Fountain source is now the accepted draft.");
  };
  const downloadRemovedFountainSource = () => {
    const conflict = sourceCoordinationConflict;
    if (!conflict || conflict.reason !== "deleted") return;
    download(conflict.localText, "fountain", "text/plain");
    setOperationMessage("Downloaded the protected Fountain buffer. Discard it here only after confirming the file is safe.");
  };
  const materializeSourceBeforeWindowLifecycle = (): boolean => {
    if (sourceCoordinationConflict) {
      setOperationMessage("Resolve the Fountain Source conflict before closing this window or project.");
      return false;
    }
    return submitSourceBufferForCoordination();
  };
  const sourceBufferMatchesAuthority = (authoritative: ProjectSession, revision: number): boolean => {
    if (editorMode !== "source") return true;
    const base = sourceBaseRef.current;
    if (!base) return true;
    const acceptedDocument = authoritative.documents.find((document) => document.id === base.documentId);
    if (!acceptedDocument) {
      sourceKeepPendingRef.current = null;
      setSourceCoordinationConflict({
        documentId: base.documentId,
        reason: "deleted",
        documentTitle: "Removed screenplay",
        baseText: base.text,
        localText: sourceRecoveryRef.current.sourceText,
        acceptedText: "",
        acceptedRevision: revision,
      });
      return false;
    }
    const acceptedText = toFountain(acceptedDocument);
    const pending = sourceKeepPendingRef.current;
    if (pending?.documentId === base.documentId) {
      if (pending.text !== acceptedText) {
        sourceKeepPendingRef.current = null;
        setSourceCoordinationConflict({
          documentId: base.documentId,
          reason: "changed",
          documentTitle: screenplayDisplayTitle(acceptedDocument) || "Untitled Screenplay",
          baseText: base.text,
          localText: sourceRecoveryRef.current.sourceText,
          acceptedText,
          acceptedRevision: revision,
        });
        return false;
      }
      if (sourceRecoveryRef.current.sourceText !== pending.rawText) {
        sourceKeepPendingRef.current = null;
        sourceBaseRef.current = { documentId: base.documentId, text: acceptedText, revision };
        setSourceCoordinationConflict({
          documentId: base.documentId,
          reason: "changed",
          documentTitle: screenplayDisplayTitle(acceptedDocument) || "Untitled Screenplay",
          baseText: acceptedText,
          localText: sourceRecoveryRef.current.sourceText,
          acceptedText,
          acceptedRevision: revision,
        });
        return false;
      }
      sourceKeepPendingRef.current = null;
      sourceBaseRef.current = { documentId: base.documentId, text: acceptedText, revision };
      sourceRecoveryRef.current = { ...sourceRecoveryRef.current, sourceText: acceptedText, document: acceptedDocument };
      setSourceText(acceptedText);
      setSourceCoordinationConflict(null);
      return true;
    }
    const reconciliation = reconcileFountainSourceBuffer({
      documentId: base.documentId,
      baseText: base.text,
      localText: sourceRecoveryRef.current.sourceText,
      acceptedText,
      acceptedRevision: revision,
    });
    if (reconciliation.kind === "conflict") {
      setSourceCoordinationConflict({
        ...reconciliation,
        reason: "changed",
        documentTitle: screenplayDisplayTitle(acceptedDocument) || "Untitled Screenplay",
      });
      return false;
    }
    sourceBaseRef.current = { documentId: base.documentId, text: acceptedText, revision };
    sourceRecoveryRef.current = { ...sourceRecoveryRef.current, sourceText: acceptedText, document: acceptedDocument };
    setSourceText(acceptedText);
    setSourceCoordinationConflict(null);
    return true;
  };
  async function resolvePendingSourceExit() {
    if (sourceExitVerificationRef.current || !pendingSourceExitRef.current) return;
    sourceExitVerificationRef.current = true;
    try {
      const authority = await coordinated.flushMutations();
      if (!sourceBufferMatchesAuthority(authority.session, authority.revision)) {
        setOperationMessage("The Fountain Source change was not accepted. Resolve the protected local/accepted versions before leaving Source view.");
        return;
      }
      const pendingExit = pendingSourceExitRef.current;
      pendingSourceExitRef.current = null;
      if (!pendingExit) return;
      if (pendingExit.kind === "formatted") toggleEditorMode();
      else if (pendingExit.kind === "import-warning") jumpToImportWarning(pendingExit.blockIndex);
      else applyDocumentTabState(pendingExit.tabs);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    } finally {
      sourceExitVerificationRef.current = false;
    }
  }
  const closeCurrentWindow = async () => {
    if (!materializeSourceBeforeWindowLifecycle()) return;
    const authority = await coordinated.flushMutations();
    if (!sourceBufferMatchesAuthority(authority.session, authority.revision)) {
      setOperationMessage("The Fountain Source change was not accepted. Resolve the protected local/accepted versions before closing.");
      return;
    }
    if (!coordinated.native) { onExit(); return; }
    try {
      const disposition = await coordinated.closeWindow();
      if (disposition !== "final-window") return;
      const allow = window.confirm("Close the final project window? SCS will write the latest local recovery state before closing.");
      if (!allow) {
        await coordinated.confirmFinalClose(false);
        return;
      }
      const recoverySaved = await coordinated.saveRecovery((snapshot) => saveSession(snapshot));
      const closeWithoutRecovery = recoverySaved || window.confirm("SCS could not write the emergency recovery copy. Close the final project window anyway?");
      await coordinated.confirmFinalClose(closeWithoutRecovery);
    } catch (error) {
      setOperationMessage(messageFrom(error));
    }
  };
  const leaveCurrentProject = async (): Promise<boolean> => {
    try {
      if (!materializeSourceBeforeWindowLifecycle()) return false;
      const authority = await coordinated.flushMutations();
      if (!sourceBufferMatchesAuthority(authority.session, authority.revision)) {
        setOperationMessage("The Fountain Source change was not accepted. Resolve the protected local/accepted versions before leaving the project.");
        return false;
      }
      const recoverySaved = await coordinated.saveRecovery((snapshot) => saveSession(snapshot));
      if (!recoverySaved && !window.confirm("SCS could not write the emergency recovery copy. Leave this project anyway?")) return false;
      await coordinated.leaveProject(true);
      return true;
    } catch (error) {
      setOperationMessage(messageFrom(error));
      return false;
    }
  };
  const exitToLauncher = async () => {
    if (await leaveCurrentProject()) onExit();
  };
  useEffect(() => {
    if (coordinated.closeRequest) void closeCurrentWindow();
  }, [coordinated.closeRequest]);

  const projectMenu: MenuEntry[] = [
    { label: "Save Project", hint: session.workspace.shortcuts.save || "", disabled: busy || !canEdit, onSelect: () => void saveNow() },
    { label: "Save Project As…", disabled: busy || !canEdit, onSelect: () => void saveProjectAs() },
    { label: "Save Draft Version", hint: session.workspace.shortcuts.saveVersion || "", disabled: !canEdit, onSelect: () => saveDraftVersion() },
    "divider",
    { label: "Export Fountain", onSelect: exportFountain },
    { label: "Export FDX", disabled: busy, onSelect: () => void exportFdx() },
    "divider",
    { label: "Open FDX…", disabled: busy || !canEdit, onSelect: () => onOpenFdx(leaveCurrentProject) },
    ...(doc.source?.type === "fdx" && doc.source.path ? [
      { label: "Open linked FDX externally", onSelect: () => void openExternalFile(doc.source!.path) },
      { label: "Reveal linked FDX", onSelect: () => void revealExternalPath(doc.source!.path) },
    ] satisfies MenuEntry[] : []),
    "divider",
    { label: "Close Project", onSelect: () => void exitToLauncher() },
  ];

  const episodeMenu: MenuEntry[] = [
    { label: "New Blank Screenplay", disabled: busy || !canEdit, onSelect: addBlankEpisode },
    { label: "Import Screenplay FDX…", disabled: busy || !canEdit, onSelect: () => void addEpisode() },
  ];

  const modes = availableModes(isTelevision);
  const activeBranch = versionHistory.branches.find((branch) => branch.id === versionHistory.activeBranchId);
  const previousScene = activeScene ? scenes[scenes.findIndex((scene) => scene.id === activeScene.id) - 1] : undefined;
  const nextScene = activeScene ? scenes[scenes.findIndex((scene) => scene.id === activeScene.id) + 1] : undefined;

  const banners = <>
    {coordinated.error && <div className="notice notice-warning" role="alert">Native window coordination needs attention: {coordinated.error}</div>}
    {sourceCoordinationConflict && <div className="notice notice-warning" role="alert"><span>{sourceCoordinationConflict.reason === "deleted" ? "This screenplay was removed in another window while its Fountain buffer was open. The local source is protected until you download or explicitly discard it." : "Fountain Source changed in another window while this buffer had local edits. Choose which complete source to keep; SCS will not merge or save over either version automatically."}</span> {sourceCoordinationConflict.reason === "deleted" ? <><button className="btn" type="button" onClick={downloadRemovedFountainSource}>Download local source</button><button className="btn btn-ghost" type="button" onClick={useAcceptedFountainSource}>Discard local buffer</button></> : <><button className="btn" type="button" onClick={useAcceptedFountainSource}>Use accepted draft</button><button className="btn btn-ghost" type="button" disabled={!canEdit} onClick={keepLocalFountainSource}>Keep my source</button></>}</div>}
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
              collapsedNodeIds={collapsedStoryNodes}
              onCollapsedNodeIdsChange={(collapsed) => updateStoryWindowPreferences(storySelection.selectedSceneId, storySelection.selectedBeatId, collapsed)}
              selectedSceneId={storySelection.selectedSceneId ?? null}
              selectedBeatId={storySelection.selectedBeatId ?? null}
              onSceneActivate={(sceneId) => { selectStoryScene(sceneId); jumpToScene(sceneId); }}
              onBeatActivate={activateStoryBeat}
            />
          </aside>
          <div className="pane-resize" role="separator" aria-orientation="vertical" aria-label="Resize scene navigator" tabIndex={0}
            onPointerDown={(event) => startPaneResize(event, "nav")} onPointerMove={movePaneResize} onPointerUp={stopPaneResize} onPointerCancel={stopPaneResize}
            onKeyDown={(event) => resizePaneWithKeyboard(event, "nav")} />
        </>}
        <div className="canvas" style={{ "--canvas-zoom": prefs.zoom } as React.CSSProperties}>
          <fieldset className="canvas-fieldset" disabled={!canEdit}>
            {editorMode === "formatted"
              ? <Editor documentId={doc.id!} blocks={doc.blocks} onBlocksChange={(blocks) => setDoc({ ...doc, blocks })} titlePage={doc.titlePage} onTitlePageChange={(titlePage) => setDoc({ ...doc, titlePage })} onActiveBlock={setActiveBlockId} focusRequest={focusRequest} scriptTargetRequest={scriptTargetRequest} readOnly={doc.readOnly || !canEdit || busy} productionPages={productionPageRows} historyRef={editorHistoryRef} historyStore={editorHistoryStore} />
              : <div className="source-wrap"><textarea ref={sourceEditorRef} className="source-editor" value={sourceText} spellCheck={false} readOnly={!canEdit || busy || sourceCoordinationConflict?.reason === "deleted"} onChange={(event) => setSourceText(event.target.value)} onSelect={(event) => persistSourceSelection(event.currentTarget)} onBlur={(event) => persistSourceSelection(event.currentTarget, true)} /><p className="source-hint">Fountain-inspired source. Switching back to Formatted re-parses this text.</p></div>}
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

  const dockNavigatorPanel = (
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
      collapsedNodeIds={collapsedStoryNodes}
      onCollapsedNodeIdsChange={(collapsed) => updateStoryWindowPreferences(storySelection.selectedSceneId, storySelection.selectedBeatId, collapsed)}
      selectedSceneId={storySelection.selectedSceneId ?? null}
      selectedBeatId={storySelection.selectedBeatId ?? null}
      onSceneActivate={(sceneId) => { selectStoryScene(sceneId); jumpToScene(sceneId); }}
      onBeatActivate={activateStoryBeat}
    />
  );
  const dockScreenplayPanel = (
    <div className="dock-screenplay-surface">
      <div className="write-toolbar" role="toolbar" aria-label="Screenplay panel tools">
        <select className="input element-select" aria-label="Current element" value={activeBlock?.type ?? "action"} disabled={!activeBlock || editorMode === "source" || doc.readOnly || !canEdit} onChange={(event) => setActiveType(event.target.value as ScreenplayElementType)}>
          {ELEMENT_TYPES.map((type, index) => <option key={type} value={type}>{elementLabels[type]} | Ctrl+{index + 1}</option>)}
        </select>
        <button className="tool-btn icon-only" aria-label="Undo" disabled={doc.readOnly || !canEdit || editorMode === "source"} onClick={() => editorHistoryRef.current?.undo()}><Icon name="undo" /></button>
        <button className="tool-btn icon-only" aria-label="Redo" disabled={doc.readOnly || !canEdit || editorMode === "source"} onClick={() => editorHistoryRef.current?.redo()}><Icon name="redo" /></button>
        <div className="tool-spacer" />
        <Segmented ariaLabel="Editor view" options={[{ value: "formatted", label: "Formatted" }, { value: "source", label: "Fountain Source" }]} value={editorMode} disabled={doc.readOnly || !canEdit} onChange={(value) => value !== editorMode && toggleEditorMode()} />
      </div>
      <div className="canvas dock-screenplay-canvas" style={{ "--canvas-zoom": prefs.zoom } as React.CSSProperties}>
        <fieldset className="canvas-fieldset" disabled={!canEdit}>
          {editorMode === "formatted"
            ? <Editor documentId={doc.id!} blocks={doc.blocks} onBlocksChange={(blocks) => setDoc({ ...doc, blocks })} titlePage={doc.titlePage} onTitlePageChange={(titlePage) => setDoc({ ...doc, titlePage })} onActiveBlock={setActiveBlockId} focusRequest={focusRequest} scriptTargetRequest={scriptTargetRequest} readOnly={doc.readOnly || !canEdit || busy} productionPages={productionPageRows} historyRef={editorHistoryRef} historyStore={editorHistoryStore} />
            : <div className="source-wrap"><textarea ref={sourceEditorRef} className="source-editor" value={sourceText} spellCheck={false} readOnly={!canEdit || busy || sourceCoordinationConflict?.reason === "deleted"} onChange={(event) => setSourceText(event.target.value)} onSelect={(event) => persistSourceSelection(event.currentTarget)} onBlur={(event) => persistSourceSelection(event.currentTarget, true)} /><p className="source-hint">Fountain-inspired source. Switching back to Formatted re-parses this text.</p></div>}
        </fieldset>
      </div>
    </div>
  );
  const dockInspectorPanel = (
    <ContextInspector activeBlock={activeBlock} activeScene={activeScene} structure={structure} workspace={workspace} sceneNotes={doc.sceneNotes} canEdit={canEdit && !doc.readOnly} sourceMode={editorMode === "source"} onSetType={setActiveType} onWorkspace={panelProps.onWorkspace} onSceneNote={(sceneId, text) => setDoc({ ...doc, sceneNotes: { ...doc.sceneNotes, [sceneId]: text } })} />
  );
  const dockPanelContext: WorkspacePanelContext = {
    renderers: {
      navigator: () => dockNavigatorPanel,
      screenplay: () => dockScreenplayPanel,
      inspector: () => dockInspectorPanel,
      reference: (definition) => renderReference(definition.referenceKind ?? referenceKind, definition.targetId ?? referenceTarget),
      story: () => <PanelHost tab="Story" {...panelProps} />,
      treatment: () => <PanelHost tab="Treatment" {...panelProps} />,
      breakdown: () => <PanelHost tab="Breakdown" {...panelProps} />,
      versions: () => <PanelHost tab="Drafts" {...panelProps} />,
      series: () => <PanelHost tab="Series" {...panelProps} />,
      production: () => <PanelHost tab="Production" {...panelProps} />,
      companion: () => <CompanionDashboard documents={session.documents} files={watchFiles} folderPath={session.workspace.sync.watchFolderPath} recursive={session.workspace.sync.watchRecursive} busy={busy} stats={companionStats} onChooseFolder={() => void chooseFdxWatchFolder()} onRefresh={() => void refreshWatchFiles()} onRecursive={setWatchRecursive} onReviewFile={(file) => void reviewWatchFile(file)} onOpenFile={(path) => void openExternalFile(path)} onReveal={(path) => void revealExternalPath(path)} />,
    },
  };

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

  const content = layoutWorkspaceOpen ? (
    <div className="mode-view layout-workspace-view">
      <header className="mode-header"><div><h2>{dockLayout.name}</h2><p>Customizable panels · logical placement travels only when saved as a project layout.</p></div><button className="btn" type="button" onClick={() => setLayoutManagerOpen(true)}>Manage layouts</button></header>
      {banners}
      <div className="mode-body dock-mode-body">
        <DockLayoutRenderer
          layout={dockLayout}
          context={dockPanelContext}
          onLayoutChange={setDockLayout}
          onBeginExternalPanelDrag={(panel, event) => {
            if (!nativeDrag.ready) return;
            const effect = (event.altKey || event.ctrlKey) && WORKSPACE_PANEL_REGISTRY[panel.kind].copyable ? "copy" : "move";
            if ((effect === "copy" && !WORKSPACE_PANEL_REGISTRY[panel.kind].copyable) || (effect === "move" && !panel.closable)) {
              setOperationMessage(`${panel.title} is required in this window; use a movable or copyable workspace panel instead.`);
              return;
            }
            rememberNativeDragStart(nativeDrag.beginPanelTransfer(panel.id, effect));
          }}
          onEndExternalPanelDrag={(_panel, event) => {
            if (event.dataTransfer.dropEffect === "none") void cancelRememberedNativeDrag(false);
          }}
          onInternalPanelDrop={() => void cancelRememberedNativeDrag(true)}
        />
      </div>
    </div>
  ) : mode === "write" ? writeView
    : mode === "outline" ? modeView("Outline", MODE_META.outline.blurb, null, "Story", () => {})
    : mode === "treatment" ? modeView("Treatment", MODE_META.treatment.blurb, null, "Treatment", () => {})
    : mode === "reference" ? modeView("Reference", MODE_META.reference.blurb, [
        { value: "Cast", label: "Cast" },
        { value: "Props", label: "Props" },
        { value: "Places", label: "Places" },
      ], referenceModeTab, setReferenceModeTab)
    : mode === "series" ? modeView("Series", MODE_META.series.blurb, null, "Series", () => {})
    : mode === "breakdown" ? modeView("Breakdown", MODE_META.breakdown.blurb, [
        { value: "Breakdown", label: "Reports" },
        { value: "Global", label: "Global" },
        { value: "Production", label: "Production" },
      ], breakdownModeTab, setBreakdownModeTab)
    : mode === "drafts" ? modeView("Drafts", MODE_META.drafts.blurb, null, "Drafts", () => {})
    : mode === "team" ? modeView("Team", MODE_META.team.blurb, null, "Team", () => {})
    : modeView("Companion", MODE_META.companion.blurb, null, "Story", () => {}, (
        <CompanionDashboard documents={session.documents} files={watchFiles} folderPath={session.workspace.sync.watchFolderPath} recursive={session.workspace.sync.watchRecursive} busy={busy} stats={companionStats} onChooseFolder={() => void chooseFdxWatchFolder()} onRefresh={() => void refreshWatchFiles()} onRecursive={setWatchRecursive} onReviewFile={(file) => void reviewWatchFile(file)} onOpenFile={(path) => void openExternalFile(path)} onReveal={(path) => void revealExternalPath(path)} />
      ));

  const activeNativeDrag = nativeDrag.active;
  const activeNativeDocumentId = activeNativeDrag?.payload.kind === "document-tab" ? activeNativeDrag.payload.documentId : undefined;
  const activeNativePanelId = activeNativeDrag?.payload.kind === "workspace-panel" ? activeNativeDrag.payload.panelId : undefined;
  const nativeDragTitle = activeNativeDocumentId
    ? screenplayDisplayTitle(session.documents.find((document) => document.id === activeNativeDocumentId) ?? doc) || "screenplay"
    : activeNativePanelId
      ? findWorkspacePanel(session.workspace, activeNativePanelId)?.title ?? "workspace panel"
      : "workspace item";
  const documentStatusById = Object.fromEntries(session.documents.flatMap((document) => {
    if (!document.id) return [];
    const dirty = dirtyDocumentIds.has(document.id)
      || (document.id === doc.id && editorMode === "source" && sourceText !== toFountain(doc));
    const status = document.id === doc.id && externalConflict ? "conflict"
      : document.id === doc.id && busy ? "saving"
        : dirty ? "dirty" : "saved";
    return [[document.id, status] as const];
  }));

  return <div className={`shell ${focusMode ? "focus-mode" : ""}`}>
    {nativeDrag.active ? (
      <CrossWindowDropOverlay
        active={nativeDrag.active}
        windowId={coordinated.identity.windowId}
        title={nativeDragTitle}
        documentTabCount={documentTabs.openDocumentIds.filter((documentId) => documentId !== activeNativeDocumentId).length}
        dockGroupIds={dockTreeNodes(dockLayout.root).flatMap((node) => node.kind === "tabs" ? [node.id] : [])}
        onPreview={nativeDrag.preview}
        onAcknowledge={nativeDrag.acknowledge}
        onCancel={nativeDrag.cancel}
      />
    ) : null}
    {layoutManagerOpen && <div className="layout-manager-backdrop" onMouseDown={() => setLayoutManagerOpen(false)}>
      <div className="layout-manager-dialog" role="dialog" aria-modal="true" aria-label="Workspace layout manager" onMouseDown={(event) => event.stopPropagation()}>
        <button className="tool-btn icon-only layout-manager-close" type="button" aria-label="Close layout manager" onClick={() => setLayoutManagerOpen(false)}><Icon name="close" size={12} /></button>
        <LayoutManager
          readOnly={!canEdit}
          layouts={session.workspace.layouts.map((layout) => ({ id: layout.id, name: layout.name, builtin: BUILTIN_LAYOUT_ID_SET.has(layout.id), active: dockLayout.id === layout.id, shortcut: getWorkspaceLayoutShortcut(session.workspace, layout.id) }))}
          hiddenPanelCount={dockLayout.hiddenPanelIds.length}
          onApply={applyWorkspaceLayout}
          onSaveCurrent={saveCurrentWorkspaceLayout}
          {...(!BUILTIN_LAYOUT_ID_SET.has(dockLayout.id) ? { onUpdateCurrent: updateCurrentWorkspaceLayout } : {})}
          onDuplicate={duplicateLayout}
          onRename={renameLayout}
          onDelete={removeLayout}
          onResetBuiltin={applyWorkspaceLayout}
          onRestoreHidden={() => setDockLayout((current) => restoreAllHiddenPanels(current))}
          onResetFloatingPlacement={() => setDockLayout((current) => restoreOffscreenFloatingPanels(current))}
          onShortcut={changeLayoutShortcut}
          placementControls={<PanelPlacementControls layout={dockLayout} onChange={setDockLayout} readOnly={!canEdit} />}
        />
      </div>
    </div>}
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
      <button className="titlebar-mark brand-mark-button" onClick={() => void exitToLauncher()} title="Back to launcher" aria-label="Back to launcher"><BrandMark size={22} decorative /></button>
      <input className="project-name" aria-label="Project name" value={session.name} disabled={!canEdit} onChange={(event) => setSession({ ...session, name: event.target.value })} />
      <span className="titlebar-context">{MODE_META[mode].label}</span>
      <div className="tool-spacer" />
      <span className={`save-chip ${savedAt ? "saved" : ""}`} title="SCS autosaves a local recovery copy while you write">{savedAt ? `Saved · ${savedAt}` : doc.readOnly ? "Read-only" : "Autosave ready"}</span>
      <button className="tool-btn" disabled={busy || !canEdit} onClick={() => void saveNow()}>Save</button>
      <Menu label="Project" items={projectMenu} />
      <WindowMenu
        windows={nativeWindowEntries}
        currentDocumentTitle={screenplayDisplayTitle(doc) || "Current screenplay"}
        activePanelTitle={activeDockPanel?.title}
        canMoveActivePanel={Boolean(activeDockPanel?.closable)}
        canCopyActivePanel={Boolean(activeDockPanel && WORKSPACE_PANEL_REGISTRY[activeDockPanel.kind].copyable)}
        documentTransferKeepsSource={documentTabs.openDocumentIds.length <= 1}
        canMoveDocumentToNewWindow={documentTabs.openDocumentIds.length > 1}
        hiddenPanels={hiddenDockPanels}
        layouts={layoutMenuEntries}
        onNewWindow={() => void newWorkspaceWindow()}
        onOpenDocumentInNewWindow={() => void newWorkspaceWindow(true)}
        onOpenLayoutInNewWindow={() => void newWorkspaceWindow(false, dockLayout.id)}
        onMoveDocumentToNewWindow={() => void moveDocumentToNewWindow()}
        onMoveDocumentToWindow={(windowId) => void moveDocumentToWindow(windowId)}
        onMovePanelToWindow={(windowId, copy) => void movePanelToWindow(windowId, copy)}
        onBringAllToFront={() => void coordinated.bringAllToFront().catch((error) => setOperationMessage(messageFrom(error)))}
        onFocusWindow={(windowId) => void coordinated.focusWindow(windowId).catch((error) => setOperationMessage(messageFrom(error)))}
        onCloseWindow={() => void closeCurrentWindow()}
        onResetPlacement={() => void coordinated.resetPlacement().catch((error) => setOperationMessage(messageFrom(error)))}
        onRestorePanel={restoreDockPanel}
        onApplyLayout={applyWorkspaceLayout}
        onCustomizeLayout={() => setLayoutWorkspaceOpen(true)}
        onManageLayouts={() => setLayoutManagerOpen(true)}
      />
      <button className="tool-btn icon-only" aria-label="Find in project" title={`Find (${session.workspace.shortcuts.commandPalette || "Ctrl+K"})`} onClick={() => setPaletteOpen(true)}><Icon name="search" /></button>
      <ThemeToggle />
    </header>

    <div className="episode-strip document-strip" aria-label="Project screenplays">
      <DocumentTabs
        documents={episodeDocs}
        state={documentTabs}
        onChange={applyDocumentTabState}
        onRequestRemove={requestRemoveDocument}
        onBeginExternalDrag={(documentId) => {
          if (!nativeDrag.ready) return;
          const effect = documentTabs.openDocumentIds.length > 1 ? "move" : "copy";
          rememberNativeDragStart(nativeDrag.beginDocumentTransfer(documentId, effect));
        }}
        onEndExternalDrag={(_documentId, event) => {
          if (event.dataTransfer.dropEffect === "none") void cancelRememberedNativeDrag(false);
        }}
        onInternalDrop={() => void cancelRememberedNativeDrag(true)}
        statusByDocumentId={documentStatusById}
        readOnly={!canEdit}
      />
      <Menu label="Screenplay" icon={<Icon name="plus" size={12} />} items={episodeMenu} buttonClassName="tool-btn episode-add" />
    </div>

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
      <span>{coordinated.native ? `${coordinated.isLeader ? "Leader" : "Window"} · revision ${coordinated.revision}` : "Single-window browser"}</span>
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
  source: { mode: "formatted" | "source"; sourceText: string; document: ScreenplayDocument; blocked?: boolean },
): ProjectSession {
  if (source.mode !== "source" || !source.document.id || source.blocked) return session;
  return materializeFountainSource(session, source.document.id, source.sourceText);
}

function workspaceSlotId(): string {
  const params = new URLSearchParams(globalThis.location?.search ?? "");
  const requested = (params.get("scsSlotId") ?? params.get("slot"))?.trim();
  return requested && /^[a-zA-Z0-9_-]{1,96}$/.test(requested) ? requested : "primary";
}

function activePanelInDockTree(node: DockNode): string {
  if (node.kind === "tabs") return node.activePanelId;
  return activePanelInDockTree(node.children[0]);
}

function findWorkspacePanel(workspace: ProjectSession["workspace"], panelId: string): WorkspacePanelDefinition | undefined {
  for (const layout of workspace.layouts) {
    const panel = getWorkspaceDockLayout(workspace, layout.id)?.panels.find((candidate) => candidate.id === panelId);
    if (panel) return structuredClone(panel);
  }
  return undefined;
}

function isMode(value: string): value is Mode {
  return Object.prototype.hasOwnProperty.call(MODE_META, value);
}

function screenplayDisplayTitle(document: ScreenplayDocument): string {
  return document.title?.trim() || document.titlePage.title.trim();
}

function versionableFingerprint(session: ProjectSession): string {
  const { versionHistory: _history, versions: _legacy, projectPath: _path, updatedAt: _updated, activeDocumentId: _activeDocumentId, ...content } = session;
  // Collaboration, review, layout, and sync state is project-global and is
  // deliberately preserved by sessionWithHistory when changing draft branches.
  // It must not make an otherwise clean branch look edited or force comments
  // into a screenplay version before a Draft Review can be applied.
  return JSON.stringify({
    ...content,
    documents: documentsForPortableStorage(content.documents),
    workspace: { series: content.workspace.series },
  });
}

function portableFingerprint(session: ProjectSession): string {
  const { projectPath: _path, updatedAt: _updated, activeDocumentId: _activeDocumentId, ...portable } = session;
  return JSON.stringify({ ...portable, documents: documentsForPortableStorage(portable.documents), workspace: workspaceForPortableStorage(portable.workspace), versionHistory: versionHistoryForPortableStorage(portable.versionHistory) });
}

function portableDocumentFingerprint(document: ScreenplayDocument): string {
  return JSON.stringify(documentsForPortableStorage([document])[0]);
}

function portableDocumentFingerprintMap(documents: readonly ScreenplayDocument[]): Map<string, string> {
  return new Map(documents.flatMap((document) => document.id ? [[document.id, portableDocumentFingerprint(document)] as const] : []));
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
