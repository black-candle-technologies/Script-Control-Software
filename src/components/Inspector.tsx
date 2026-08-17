import { useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import TeamPanel, { type CollaborationSyncControls } from "./TeamPanel.tsx";
import CollapsibleSection from "./CollapsibleSection.tsx";
import {
  DEFAULT_BREAKDOWN_SECTION_STATE,
  DEFAULT_GLOBAL_BREAKDOWN_VIEW_OPTIONS,
  applyBoardScenePlacement,
  boardPlacementOptions,
  createManualObjectOverride,
  createStoryBeat,
  describeBoardPlacement,
  draftReviewPreview,
  filterAndSortGlobalBreakdownRows,
  globalBreakdownSortOptions,
  hasPermission,
  moveStoryScene,
  neighboringBoardPlacement,
  nextRevisionColor,
  normalizeBeatEdit,
  parseHeading,
  REVISION_COLORS,
  resolveBoardPointerPlacement,
  reconcileStorySelection,
  resolveNewBeatTarget,
  sceneOrderForSequences,
  type Breakdown,
  type BoardScenePlacement,
  type BreakdownSectionId,
  type BreakdownSectionState,
  type GlobalBreakdownCategoryState,
  type GlobalBreakdownViewOptions,
  type AnalysisCsvSection,
  type AnalysisEntityKind,
  type CharacterRef,
  type ContinuityRecord,
  type CustomStoryStructure,
  type DraftReviewStatus,
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
  type ProductionCategory,
  type ProductionRow,
  type ProductionPage,
  type ProductionReports,
  type RevisionColor,
  type RevisionSet,
  type ProductionRevisionSummary,
  type SeriesWorkspaceReport,
  type ScriptAnalysis,
  type ScriptTarget,
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
  onApplyStoryStructure: (structure: CustomStoryStructure) => void;
  onJumpToScene: (sceneId: string) => void;
  selectedBoardSceneId?: string;
  activeEditorSceneId?: string;
  onSelectedBoardSceneChange?: (sceneId: string | undefined) => void;
  entityFocusRequest: { kind: "character" | "location"; id: string; nonce: number } | null;
  onOpenEntityBreakdown: (kind: "character" | "location", entityId: string) => void;
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
  onOpenDraftReview: (title: string, description: string, sourceBranchId: string, targetBranchId: string, reviewerIds: string[]) => void;
  onRefreshDraftReview: (reviewId: string) => void;
  onUpdateDraftReviewStatus: (reviewId: string, status: Exclude<DraftReviewStatus, "applied">) => void;
  onResolveDraftReview: (reviewId: string, path: string, resolution: "ours" | "theirs" | null) => void;
  onApplyDraftReview: (reviewId: string) => void;
  onExportBreakdown: (format: "md" | "csv" | "json" | "pdf", section?: AnalysisCsvSection) => void;
  breakdownSections: BreakdownSectionState;
  onBreakdownSectionsChange: (sections: BreakdownSectionState) => void;
  onResetBreakdownSections: () => void;
  globalBreakdownCategories: GlobalBreakdownCategoryState;
  onGlobalBreakdownCategoriesChange: (categories: GlobalBreakdownCategoryState) => void;
  onOpenScriptTarget: (target: ScriptTarget) => void;
  onImportTreatment: () => void;
  onExportTreatment: (format: "md" | "docx" | "pdf") => void;
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
export type PanelTab = "Story" | "Treatment" | "Cast" | "Props" | "Places" | "Drafts" | "Breakdown" | "Global" | "Series" | "Production" | "Team" | "Assist";
const Hint = ({ children }: { children: React.ReactNode }) => <p className="insp-hint">{children}</p>;

const storyCssColor = (value?: string) => {
  if (!value) return undefined;
  const rgb16 = /^#([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})$/i.exec(value);
  return rgb16 ? `#${rgb16.slice(1).map((channel) => channel.slice(0, 2)).join("")}` : /^#[0-9a-f]{6}$/i.test(value) ? value : undefined;
};

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
    {tab !== "Team" && tab !== "Assist" && tab !== "Drafts" && tab !== "Breakdown" && tab !== "Global" && <fieldset className="permission-scope" disabled={!props.editable}>
      {tab === "Story" && <StoryWorkspaceTab {...props} />}
      {tab === "Treatment" && <TreatmentWorkspaceTab {...props} />}
      {tab === "Cast" && <CastTab {...props} />}
      {tab === "Props" && <PropsTab {...props} />}
      {tab === "Places" && <PlacesTab {...props} />}
      {tab === "Series" && <SeriesTab {...props} />}
      {tab === "Production" && <ProductionTab {...props} />}
    </fieldset>}
    {tab === "Breakdown" && <BreakdownTab {...props} />}
    {tab === "Global" && <GlobalBreakdownTab {...props} />}
    {tab === "Drafts" && <DraftsTab {...props} />}
    {tab === "Team" && <TeamPanel session={props.collaborationSession} activeScene={props.activeScene} onSession={props.onCollaborationSession} onOpenTarget={props.onCollaborationTarget} onMessage={props.onCollaborationMessage} sync={props.collaborationSync} />}
    {tab === "Assist" && <AssistTab {...props} />}
  </div>;
}

type StoryDragItem = { kind: "sequence" | "scene" | "beat"; id: string };
type BoardScenePreview = { sceneId: string; placement: BoardScenePlacement };
type StoryBeat = CustomStoryStructure["beats"][number];
type BeatEditorState = { beatId: string; draft: StoryBeat; error?: string };
type SceneContextMenuState = { sceneId: string; x: number; y: number; trigger: HTMLElement };
type SceneLabelEditorState = { sceneId: string; value: string; restoreFocus?: HTMLElement };

const STORY_DRAG_MIME = "application/x-scs-story-item";

function storyDragItem(value: unknown): StoryDragItem | null {
  if (!value || typeof value !== "object" || !("kind" in value) || !("id" in value)) return null;
  return (value.kind === "sequence" || value.kind === "scene" || value.kind === "beat")
    && typeof value.id === "string"
    && Boolean(value.id)
    ? { kind: value.kind, id: value.id }
    : null;
}

function sameBoardScenePreview(left: BoardScenePreview | null, right: BoardScenePreview | null): boolean {
  if (!left || !right) return left === right;
  return left.sceneId === right.sceneId && JSON.stringify(left.placement) === JSON.stringify(right.placement);
}

function StoryWorkspaceTab({
  customStructure,
  scenes,
  workspace,
  onWorkspace,
  onApplyStoryStructure,
  onJumpToScene,
  selectedBoardSceneId,
  activeEditorSceneId,
  onSelectedBoardSceneChange,
  editable,
}: InspectorProps) {
  const [draggedItem, setDraggedItem] = useState<StoryDragItem | null>(null);
  const draggedItemRef = useRef<StoryDragItem | null>(null);
  const [scenePreview, setScenePreview] = useState<BoardScenePreview | null>(null);
  const scenePreviewRef = useRef<BoardScenePreview | null>(null);
  const announcementNonce = useRef(0);
  const [boardAnnouncement, setBoardAnnouncement] = useState({ nonce: 0, message: "" });
  const [localSelectedSceneId, setLocalSelectedSceneId] = useState<string>();
  const selectedSceneId = onSelectedBoardSceneChange ? selectedBoardSceneId : localSelectedSceneId;
  const sceneClickTimer = useRef<number | null>(null);
  const [beatEditor, setBeatEditor] = useState<BeatEditorState | null>(null);
  const beatCardRefs = useRef(new Map<string, HTMLDivElement>());
  const [sceneContextMenu, setSceneContextMenu] = useState<SceneContextMenuState | null>(null);
  const sceneContextMenuRef = useRef<HTMLDivElement | null>(null);
  const [sceneLabelEditor, setSceneLabelEditor] = useState<SceneLabelEditorState | null>(null);
  const [deleteAllArmed, setDeleteAllArmed] = useState(false);
  const view = workspace.storyBoardView ?? "scene";
  const save = (next: CustomStoryStructure) => onWorkspace({ storyStructure: next });
  const applyOutlineToDraft = () => onApplyStoryStructure(customStructure);
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
  const assignScene = (sequenceId: string, sceneId: string) => {
    const next = {
      ...customStructure,
      sequences: customStructure.sequences.map((sequence) => ({
        ...sequence,
        sceneIds: sequence.id === sequenceId
          ? [...sequence.sceneIds.filter((id) => id !== sceneId), sceneId]
          : sequence.sceneIds.filter((id) => id !== sceneId),
      })),
    };
    save(next);
  };
  const removeScene = (sequenceId: string, sceneId: string) => save({
    ...customStructure,
    sequences: customStructure.sequences.map((sequence) => sequence.id === sequenceId
      ? { ...sequence, sceneIds: sequence.sceneIds.filter((id) => id !== sceneId) }
      : sequence),
  });
  const moveSequence = (sequenceId: string, actId: string, beforeId?: string) => {
    const sequence = customStructure.sequences.find((item) => item.id === sequenceId);
    if (!sequence) return;
    if (beforeId === sequenceId && sequence.actId === actId) return;
    const next = customStructure.sequences.filter((item) => item.id !== sequenceId);
    const insertion = beforeId ? next.findIndex((item) => item.id === beforeId) : -1;
    next.splice(insertion < 0 ? next.length : insertion, 0, { ...sequence, actId });
    save({ ...customStructure, sequences: next, sceneOrder: sceneOrderForSequences(customStructure, next) });
  };
  const moveSequenceWithinAct = (sequenceId: string, direction: -1 | 1) => {
    const sequence = customStructure.sequences.find((item) => item.id === sequenceId);
    if (!sequence) return;
    const siblings = customStructure.sequences.filter((item) => item.actId === sequence.actId);
    const index = siblings.findIndex((item) => item.id === sequenceId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= siblings.length) return;
    const beforeId = direction < 0 ? siblings[target].id : siblings[target + 1]?.id;
    moveSequence(sequenceId, sequence.actId, beforeId);
  };
  const canMoveSequenceWithinAct = (sequenceId: string, direction: -1 | 1) => {
    const sequence = customStructure.sequences.find((item) => item.id === sequenceId);
    if (!sequence) return false;
    const siblings = customStructure.sequences.filter((item) => item.actId === sequence.actId);
    const index = siblings.findIndex((item) => item.id === sequenceId);
    return index >= 0 && index + direction >= 0 && index + direction < siblings.length;
  };
  const newBeatTarget = resolveNewBeatTarget(selectedSceneId, activeEditorSceneId, scenes);
  const addBeatForTarget = (target = newBeatTarget) => {
    if (!editable) return;
    const beat = createStoryBeat(target);
    save({ ...customStructure, beats: [...customStructure.beats, beat] });
    setBeatEditor({ beatId: beat.id, draft: { ...beat, moments: beat.moments.map((moment) => ({ ...moment })) } });
    announceBoard(`Added a beat to ${target.label}.`);
  };
  const addBeat = () => addBeatForTarget();
  const updateBeat = (id: string, patch: Partial<CustomStoryStructure["beats"][number]>) => save({
    ...customStructure,
    beats: customStructure.beats.map((beat) => beat.id === id ? { ...beat, ...patch } : beat),
  });
  const moveBeat = (id: string, to: number) => {
    const beats = customStructure.beats.filter((beat) => beat.id !== id);
    const beat = customStructure.beats.find((item) => item.id === id);
    if (!beat) return;
    beats.splice(Math.max(0, Math.min(to, beats.length)), 0, beat);
    save({ ...customStructure, beats });
  };
  const orderedScenes = customStructure.sceneOrder
    .map((id) => scenes.find((scene) => scene.id === id))
    .filter((scene): scene is Scene => Boolean(scene));
  const assignedSceneIds = new Set(customStructure.sequences.flatMap((sequence) => sequence.sceneIds));
  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const draftSceneOrder = scenes.map((scene) => scene.id);
  const outlineDiffersFromDraft = customStructure.sceneOrder.length !== draftSceneOrder.length
    || customStructure.sceneOrder.some((sceneId, index) => sceneId !== draftSceneOrder[index]);
  const sceneReference = (scene: Scene) => scene.sceneNumber?.trim() || customStructure.sceneLabels?.[scene.id] || String(scene.number);
  const sceneBoardLabel = (scene: Scene) => {
    const reference = sceneReference(scene);
    const outlinePosition = customStructure.sceneOrder.indexOf(scene.id) + 1;
    const positionContext = outlinePosition > 0 && outlinePosition !== scene.number
      ? ` · outline ${outlinePosition}, draft ${scene.number}`
      : "";
    return `Scene ${reference}${positionContext}: ${scene.heading}`;
  };
  const announceBoard = (message: string) => setBoardAnnouncement({ nonce: ++announcementNonce.current, message });
  const changeSelectedScene = (sceneId: string | undefined) => {
    if (!onSelectedBoardSceneChange) setLocalSelectedSceneId(sceneId);
    onSelectedBoardSceneChange?.(sceneId);
  };
  const cancelPendingSceneClick = () => {
    if (sceneClickTimer.current === null) return;
    window.clearTimeout(sceneClickTimer.current);
    sceneClickTimer.current = null;
  };
  const openSceneInWrite = (sceneId: string) => {
    cancelPendingSceneClick();
    onJumpToScene(sceneId);
  };
  const handleSceneClick = (sceneId: string) => {
    cancelPendingSceneClick();
    sceneClickTimer.current = window.setTimeout(() => {
      sceneClickTimer.current = null;
      onJumpToScene(sceneId);
    }, 220);
  };
  const handleSceneDoubleClick = (event: ReactMouseEvent<HTMLElement>, scene: Scene) => {
    if (event.target instanceof Element && event.target.closest(".story-board-beat, .story-board-move-menu, .story-board-scene-menu-trigger, .story-board-label-editor")) return;
    event.preventDefault();
    cancelPendingSceneClick();
    changeSelectedScene(scene.id);
    announceBoard(`Selected Scene ${sceneReference(scene)} for board operations.`);
  };
  const clearScenePreview = () => {
    scenePreviewRef.current = null;
    setScenePreview(null);
  };
  const clearDrag = () => {
    draggedItemRef.current = null;
    scenePreviewRef.current = null;
    setDraggedItem(null);
    setScenePreview(null);
  };
  const beginDrag = (event: DragEvent<HTMLElement>, item: StoryDragItem) => {
    if (!editable) {
      event.preventDefault();
      return;
    }
    clearDrag();
    draggedItemRef.current = item;
    setDraggedItem(item);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(STORY_DRAG_MIME, JSON.stringify(item));
    event.dataTransfer.setData("text/plain", `${item.kind}:${item.id}`);
  };
  const dragItemExists = (item: StoryDragItem) => item.kind === "scene"
    ? customStructure.sceneOrder.includes(item.id) && sceneById.has(item.id)
    : item.kind === "sequence"
      ? customStructure.sequences.some((sequence) => sequence.id === item.id)
      : customStructure.beats.some((beat) => beat.id === item.id);
  const readDraggedItem = (event: DragEvent<HTMLElement>): StoryDragItem | null => {
    const hasTypedPayload = Array.from(event.dataTransfer.types).includes(STORY_DRAG_MIME);
    if (hasTypedPayload) {
      const encoded = event.dataTransfer.getData(STORY_DRAG_MIME);
      if (encoded) {
        try {
          return storyDragItem(JSON.parse(encoded));
        } catch {
          return null;
        }
      }
    }
    return draggedItemRef.current;
  };
  const allowDrop = (event: DragEvent<HTMLElement>): StoryDragItem | null => {
    if (!editable) {
      clearDrag();
      return null;
    }
    const item = readDraggedItem(event);
    if (!item || !dragItemExists(item)) {
      clearDrag();
      return null;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    return item;
  };
  const previewScenePlacement = (sceneId: string, placement: BoardScenePlacement) => {
    const next = applyBoardScenePlacement(customStructure, sceneId, placement);
    const preview = next === customStructure ? null : { sceneId, placement };
    if (sameBoardScenePreview(scenePreviewRef.current, preview)) return;
    scenePreviewRef.current = preview;
    setScenePreview(preview);
  };
  const previewOnScene = (event: DragEvent<HTMLElement>, sequenceId: string, sceneId: string) => {
    const item = allowDrop(event);
    if (!item) return;
    if (item.kind === "sequence") {
      clearScenePreview();
      return;
    }
    event.stopPropagation();
    if (item.kind !== "scene") {
      clearScenePreview();
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    previewScenePlacement(item.id, resolveBoardPointerPlacement({
      sequenceId,
      targetSceneId: sceneId,
      targetTop: bounds.top,
      targetHeight: bounds.height,
      pointerY: event.clientY,
      sequenceSceneCount: customStructure.sequences.find((sequence) => sequence.id === sequenceId)?.sceneIds.length ?? 0,
    }));
  };
  const previewOnSequence = (event: DragEvent<HTMLElement>, sequenceId: string) => {
    const item = allowDrop(event);
    if (!item) return;
    if (item.kind !== "scene") {
      clearScenePreview();
      return;
    }
    event.stopPropagation();
    const sequenceSceneCount = customStructure.sequences.find((sequence) => sequence.id === sequenceId)?.sceneIds.length ?? 0;
    previewScenePlacement(item.id, resolveBoardPointerPlacement({ sequenceId, sequenceSceneCount }));
  };
  const previewOnUnassigned = (event: DragEvent<HTMLElement>) => {
    const item = allowDrop(event);
    if (!item) return;
    if (item.kind !== "scene") {
      clearScenePreview();
      return;
    }
    event.stopPropagation();
    previewScenePlacement(item.id, { kind: "unassigned" });
  };
  const commitScenePlacement = (sceneId: string, placement: BoardScenePlacement) => {
    if (!editable) return;
    const next = applyBoardScenePlacement(customStructure, sceneId, placement);
    if (next === customStructure) {
      announceBoard("Scene position unchanged.");
      return;
    }
    const scene = sceneById.get(sceneId);
    const anchorScene = placement.kind === "before" || placement.kind === "after" ? sceneById.get(placement.anchorSceneId) : undefined;
    const describedPlacement = placement.kind === "before" || placement.kind === "after"
      ? { ...placement, anchorSceneId: anchorScene ? `Scene ${sceneReference(anchorScene)}` : placement.anchorSceneId }
      : placement;
    save(next);
    announceBoard(describeBoardPlacement(customStructure, scene ? `Scene ${sceneReference(scene)}` : sceneId, describedPlacement));
  };
  const matchingPreview = (sceneId: string, predicate: (placement: BoardScenePlacement) => boolean) => {
    const preview = scenePreviewRef.current;
    return preview?.sceneId === sceneId && predicate(preview.placement) ? preview.placement : undefined;
  };
  const dropOnAct = (event: DragEvent<HTMLElement>, actId: string) => {
    const item = allowDrop(event);
    if (item?.kind === "sequence") moveSequence(item.id, actId);
    clearDrag();
  };
  const dropOnSequence = (event: DragEvent<HTMLElement>, sequenceId: string, actId: string) => {
    event.stopPropagation();
    const item = allowDrop(event);
    if (item?.kind === "sequence") moveSequence(item.id, actId, sequenceId);
    else if (item?.kind === "scene") {
      const sequenceSceneCount = customStructure.sequences.find((sequence) => sequence.id === sequenceId)?.sceneIds.length ?? 0;
      const displayedPlacement = event.currentTarget.dataset.dropPlacement;
      const placement: BoardScenePlacement = displayedPlacement === "append" || displayedPlacement === "empty"
        ? { kind: displayedPlacement, sequenceId }
        : matchingPreview(item.id, (candidate) => candidate.kind !== "unassigned" && candidate.sequenceId === sequenceId && (candidate.kind === "append" || candidate.kind === "empty"))
        ?? resolveBoardPointerPlacement({ sequenceId, sequenceSceneCount });
      commitScenePlacement(item.id, placement);
    }
    clearDrag();
  };
  const dropOnScene = (event: DragEvent<HTMLElement>, sequenceId: string, sceneId: string) => {
    event.stopPropagation();
    const item = allowDrop(event);
    if (item?.kind === "scene") {
      const bounds = event.currentTarget.getBoundingClientRect();
      const sequenceSceneCount = customStructure.sequences.find((sequence) => sequence.id === sequenceId)?.sceneIds.length ?? 0;
      const displayedPlacement = event.currentTarget.dataset.dropPlacement;
      const placement: BoardScenePlacement = displayedPlacement === "before" || displayedPlacement === "after"
        ? { kind: displayedPlacement, sequenceId, anchorSceneId: sceneId }
        : matchingPreview(item.id, (candidate) => (candidate.kind === "before" || candidate.kind === "after") && candidate.sequenceId === sequenceId && candidate.anchorSceneId === sceneId)
        ?? resolveBoardPointerPlacement({ sequenceId, targetSceneId: sceneId, targetTop: bounds.top, targetHeight: bounds.height, pointerY: event.clientY, sequenceSceneCount });
      commitScenePlacement(item.id, placement);
    }
    else if (item?.kind === "beat") updateBeat(item.id, { sceneId, sequenceId: undefined });
    clearDrag();
  };
  const dropOnUnassigned = (event: DragEvent<HTMLElement>) => {
    event.stopPropagation();
    const item = allowDrop(event);
    if (item?.kind === "scene") commitScenePlacement(item.id, { kind: "unassigned" });
    else if (item?.kind === "beat") updateBeat(item.id, { sceneId: undefined, sequenceId: undefined });
    clearDrag();
  };
  const leaveVisualBoard = (event: DragEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    clearDrag();
  };
  useEffect(() => {
    const cancelDrag = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (!draggedItemRef.current && !scenePreviewRef.current)) return;
      event.preventDefault();
      clearDrag();
      announceBoard("Story board move cancelled.");
    };
    window.addEventListener("keydown", cancelDrag);
    return () => window.removeEventListener("keydown", cancelDrag);
  }, []);
  useEffect(() => {
    const item = draggedItemRef.current;
    if (!item || dragItemExists(item)) return;
    clearDrag();
    announceBoard("Story board move cancelled because its source is no longer available.");
  }, [customStructure, scenes]);
  useEffect(() => {
    if (view === "board") return;
    cancelPendingSceneClick();
    if (draggedItemRef.current || scenePreviewRef.current) clearDrag();
    setBeatEditor(null);
    setSceneContextMenu(null);
    setSceneLabelEditor(null);
  }, [view]);
  useEffect(() => () => cancelPendingSceneClick(), []);
  useEffect(() => {
    const repaired = reconcileStorySelection({ ...(selectedSceneId ? { selectedSceneId } : {}) }, customStructure, scenes).selectedSceneId;
    if (repaired === selectedSceneId) return;
    changeSelectedScene(repaired);
  }, [customStructure, scenes, selectedSceneId]);
  useEffect(() => {
    if (beatEditor && !customStructure.beats.some((beat) => beat.id === beatEditor.beatId)) setBeatEditor(null);
    if (sceneContextMenu && !scenes.some((scene) => scene.id === sceneContextMenu.sceneId)) setSceneContextMenu(null);
    if (sceneLabelEditor && !scenes.some((scene) => scene.id === sceneLabelEditor.sceneId)) setSceneLabelEditor(null);
  }, [beatEditor, customStructure.beats, sceneContextMenu, sceneLabelEditor, scenes]);

  const closeSceneContextMenu = (restoreFocus = true) => {
    const trigger = sceneContextMenu?.trigger;
    setSceneContextMenu(null);
    if (restoreFocus && trigger) window.requestAnimationFrame(() => trigger.isConnected && trigger.focus());
  };
  const openSceneContextMenu = (sceneId: string, trigger: HTMLElement, x: number, y: number) => {
    cancelPendingSceneClick();
    setSceneContextMenu({
      sceneId,
      x: Math.max(8, Math.min(x, window.innerWidth - 272)),
      y: Math.max(8, Math.min(y, window.innerHeight - 360)),
      trigger,
    });
  };
  const openSceneContextFromPointer = (event: ReactMouseEvent<HTMLElement>, sceneId: string) => {
    event.preventDefault();
    event.stopPropagation();
    openSceneContextMenu(sceneId, event.currentTarget, event.clientX, event.clientY);
  };
  const openSceneContextFromKeyboard = (event: ReactKeyboardEvent<HTMLElement>, sceneId: string) => {
    if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) return;
    event.preventDefault();
    event.stopPropagation();
    const bounds = event.currentTarget.getBoundingClientRect();
    openSceneContextMenu(sceneId, event.currentTarget, bounds.left + Math.min(bounds.width, 36), bounds.top + Math.min(bounds.height, 28));
  };
  const handleSceneContextMenuKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menu = sceneContextMenuRef.current;
    if (!menu) return;
    const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')];
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      closeSceneContextMenu();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End" || event.key === "Tab") {
      event.preventDefault();
      if (!items.length) return;
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (current + ((event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey)) ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    }
  };
  useEffect(() => {
    if (!sceneContextMenu) return;
    const frame = window.requestAnimationFrame(() => sceneContextMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus());
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && sceneContextMenuRef.current?.contains(event.target)) return;
      closeSceneContextMenu();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", dismiss, true);
    };
  }, [sceneContextMenu]);

  const beginSceneLabelEdit = (scene: Scene) => {
    if (!editable) return;
    setSceneLabelEditor({
      sceneId: scene.id,
      value: customStructure.sceneLabels?.[scene.id] ?? scene.sceneNumber ?? String(scene.number),
      ...(sceneContextMenu?.trigger ? { restoreFocus: sceneContextMenu.trigger } : {}),
    });
    closeSceneContextMenu(false);
  };
  const closeSceneLabelEditor = (restoreFocus = true) => {
    const trigger = sceneLabelEditor?.restoreFocus;
    setSceneLabelEditor(null);
    if (restoreFocus && trigger) window.requestAnimationFrame(() => trigger.isConnected && trigger.focus());
  };
  const saveSceneLabel = () => {
    if (!editable || !sceneLabelEditor) return;
    const labels = { ...(customStructure.sceneLabels ?? {}) };
    const value = sceneLabelEditor.value.trim();
    if (value) labels[sceneLabelEditor.sceneId] = value;
    else delete labels[sceneLabelEditor.sceneId];
    save({ ...customStructure, sceneLabels: labels });
    closeSceneLabelEditor();
    announceBoard(value ? `Updated the board label to ${value}.` : "Cleared the custom board label.");
  };
  const renderSceneLabelEditor = (scene: Scene) => sceneLabelEditor?.sceneId === scene.id && <form
    className="story-board-label-editor"
    onSubmit={(event) => { event.preventDefault(); saveSceneLabel(); }}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSceneLabelEditor();
    }}
  >
    <label>Board label<input autoFocus value={sceneLabelEditor.value} onChange={(event) => setSceneLabelEditor({ ...sceneLabelEditor, value: event.target.value })} /></label>
    <span className="btn-row"><button type="submit" className="link-btn">Save label</button><button type="button" className="link-btn" onClick={() => closeSceneLabelEditor()}>Cancel</button></span>
  </form>;

  const restoreBeatFocus = (beatId: string) => window.requestAnimationFrame(() => beatCardRefs.current.get(beatId)?.focus());
  const beginBeatEdit = (beat: StoryBeat) => {
    if (!editable) return;
    setBeatEditor({ beatId: beat.id, draft: { ...beat, moments: beat.moments.map((moment) => ({ ...moment })) } });
  };
  const changeBeatDraft = (patch: Partial<StoryBeat>) => setBeatEditor((current) => current
    ? { ...current, draft: { ...current.draft, ...patch }, error: undefined }
    : current);
  const cancelBeatEdit = () => {
    if (!beatEditor) return;
    const beatId = beatEditor.beatId;
    setBeatEditor(null);
    restoreBeatFocus(beatId);
    announceBoard("Beat edit cancelled.");
  };
  const saveBeatEdit = () => {
    if (!editable || !beatEditor) return;
    const original = customStructure.beats.find((beat) => beat.id === beatEditor.beatId);
    if (!original) {
      setBeatEditor(null);
      return;
    }
    if (!beatEditor.draft.title?.trim() && !beatEditor.draft.text.trim()) {
      setBeatEditor({ ...beatEditor, error: "A beat needs a title or body." });
      return;
    }
    const normalized = normalizeBeatEdit(original, beatEditor.draft, customStructure, scenes);
    save({ ...customStructure, beats: customStructure.beats.map((beat) => beat.id === normalized.id ? normalized : beat) });
    setBeatEditor(null);
    restoreBeatFocus(normalized.id);
    announceBoard(`Saved ${normalized.title || normalized.text || "beat"}.`);
  };
  const setBeatPlacement = (value: string) => {
    const separator = value.indexOf(":");
    const kind = separator < 0 ? "" : value.slice(0, separator);
    const id = separator < 0 ? "" : value.slice(separator + 1);
    changeBeatDraft({ sceneId: kind === "scene" ? id : undefined, sequenceId: kind === "sequence" ? id : undefined });
  };
  const renderBeatEditor = (editor: BeatEditorState) => {
    const beat = editor.draft;
    const placement = beat.sceneId ? `scene:${beat.sceneId}` : beat.sequenceId ? `sequence:${beat.sequenceId}` : "";
    return <form className="story-board-beat-editor" onSubmit={(event) => { event.preventDefault(); saveBeatEdit(); }} onKeyDown={(event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelBeatEdit();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveBeatEdit();
      }
    }}>
      <label>Title<input autoFocus value={beat.title ?? ""} onChange={(event) => changeBeatDraft({ title: event.target.value })} /></label>
      <label>Body<textarea value={beat.text} onChange={(event) => changeBeatDraft({ text: event.target.value })} /></label>
      <div className="story-board-beat-editor-grid">
        <label>Status<select value={beat.status} onChange={(event) => {
          const status = event.target.value;
          if (status === "idea" || status === "drafted" || status === "complete") changeBeatDraft({ status });
        }}><option value="idea">Idea</option><option value="drafted">Drafted</option><option value="complete">Complete</option></select></label>
        <label>Color<input value={beat.color ?? ""} placeholder="#F5C451 or blue" onChange={(event) => changeBeatDraft({ color: event.target.value || undefined })} /></label>
      </div>
      <label>Placement<select value={placement} onChange={(event) => setBeatPlacement(event.target.value)}><option value="">Unassigned</option><optgroup label="Scenes">{scenes.map((scene) => <option value={`scene:${scene.id}`} key={scene.id}>{sceneBoardLabel(scene)}</option>)}</optgroup><optgroup label="Sequences">{customStructure.sequences.map((sequence) => <option value={`sequence:${sequence.id}`} key={sequence.id}>{sequence.title || "Untitled sequence"}</option>)}</optgroup></select></label>
      <fieldset className="story-board-moments"><legend>Moments</legend>{beat.moments.map((moment, index) => <div key={moment.id}><input aria-label={`Moment ${index + 1}`} value={moment.text} onChange={(event) => changeBeatDraft({ moments: beat.moments.map((item) => item.id === moment.id ? { ...item, text: event.target.value } : item) })} /><button type="button" className="link-btn" aria-label={`Remove moment ${index + 1}`} onClick={() => changeBeatDraft({ moments: beat.moments.filter((item) => item.id !== moment.id) })}>Remove</button></div>)}<button type="button" className="link-btn" onClick={() => changeBeatDraft({ moments: [...beat.moments, { id: `moment-${crypto.randomUUID()}`, text: "New moment" }] })}>Add moment</button></fieldset>
      {editor.error && <p className="story-board-editor-error" role="alert">{editor.error}</p>}
      <div className="btn-row"><button type="submit" className="btn">Save beat</button><button type="button" className="btn btn-ghost" onClick={cancelBeatEdit}>Cancel</button><span className="insp-card-meta">Ctrl/⌘+Enter saves · Escape cancels</span></div>
    </form>;
  };
  const renderSceneContextMenu = () => {
    if (!sceneContextMenu) return null;
    const scene = sceneById.get(sceneContextMenu.sceneId);
    if (!scene) return null;
    const earlier = neighboringBoardPlacement(customStructure, scene.id, -1);
    const later = neighboringBoardPlacement(customStructure, scene.id, 1);
    const placements = boardPlacementOptions(customStructure, scene.id);
    const selected = selectedSceneId === scene.id;
    const selectScene = () => {
      changeSelectedScene(selected ? undefined : scene.id);
      announceBoard(selected ? `Deselected Scene ${sceneReference(scene)}.` : `Selected Scene ${sceneReference(scene)} for board operations.`);
      closeSceneContextMenu();
    };
    const copyReference = () => {
      const text = `Scene ${sceneReference(scene)}: ${scene.heading}`;
      closeSceneContextMenu();
      if (!navigator.clipboard?.writeText) {
        announceBoard("The scene reference could not be copied.");
        return;
      }
      void navigator.clipboard.writeText(text)
        .then(() => announceBoard(`Copied ${text}.`))
        .catch(() => announceBoard("The scene reference could not be copied."));
    };
    return <div
      ref={sceneContextMenuRef}
      className="story-board-context-menu"
      role="menu"
      aria-label={`Scene ${sceneReference(scene)} options`}
      style={{ left: sceneContextMenu.x, top: sceneContextMenu.y }}
      onKeyDown={handleSceneContextMenuKeys}
    >
      <button type="button" role="menuitem" onClick={selectScene}>{selected ? "Deselect Scene" : "Select Scene"}</button>
      <button type="button" role="menuitem" onClick={() => { closeSceneContextMenu(false); openSceneInWrite(scene.id); }}>Open in Write</button>
      <button type="button" role="menuitem" disabled={!editable} onClick={() => { addBeatForTarget(resolveNewBeatTarget(scene.id, undefined, scenes)); closeSceneContextMenu(); }}>Add Beat to Scene</button>
      <button type="button" role="menuitem" disabled={!editable} onClick={() => beginSceneLabelEdit(scene)}>Edit Board Label</button>
      <div role="separator" />
      <button type="button" role="menuitem" disabled={!editable || !earlier} onClick={() => { if (earlier) commitScenePlacement(scene.id, earlier); closeSceneContextMenu(); }}>Move Before Previous Scene</button>
      <button type="button" role="menuitem" disabled={!editable || !later} onClick={() => { if (later) commitScenePlacement(scene.id, later); closeSceneContextMenu(); }}>Move After Next Scene</button>
      {placements.map((option) => <button type="button" role="menuitem" key={option.id} disabled={!editable || option.disabled} onClick={() => { commitScenePlacement(scene.id, option.placement); closeSceneContextMenu(); }}>{option.label}</button>)}
      <div role="separator" />
      <button type="button" role="menuitem" onClick={copyReference}>Copy Scene Reference</button>
    </div>;
  };
  const renderSceneMoveControls = (scene: Scene) => {
    const label = `Scene ${sceneReference(scene)}`;
    const earlier = neighboringBoardPlacement(customStructure, scene.id, -1);
    const later = neighboringBoardPlacement(customStructure, scene.id, 1);
    const options = boardPlacementOptions(customStructure, scene.id);
    return <details className="story-board-move-menu">
      <summary className="link-btn">Move {label}…</summary>
      <div className="story-board-move-options" role="group" aria-label={`Move options for ${label}`}>
        <button type="button" className="link-btn" disabled={!editable || !earlier} onClick={() => { if (earlier) commitScenePlacement(scene.id, earlier); }}>Move before previous scene</button>
        <button type="button" className="link-btn" disabled={!editable || !later} onClick={() => { if (later) commitScenePlacement(scene.id, later); }}>Move after next scene</button>
        {options.map((option) => <button type="button" className="link-btn" key={option.id} disabled={!editable || option.disabled} onClick={() => commitScenePlacement(scene.id, option.placement)}>{option.label}</button>)}
      </div>
    </details>;
  };
  const renderBoardBeat = (beat: StoryBeat, extraClass = "") => {
    const beatIndex = customStructure.beats.findIndex((item) => item.id === beat.id);
    const label = beat.title || beat.text || "Untitled beat";
    const editing = beatEditor?.beatId === beat.id;
    return <div
      className={`story-board-beat ${extraClass}${editing ? " is-editing" : ""}`.trim()}
      key={beat.id}
      ref={(element) => { if (element) beatCardRefs.current.set(beat.id, element); else beatCardRefs.current.delete(beat.id); }}
      style={storyCssColor(editing ? beatEditor.draft.color : beat.color) ? { borderColor: storyCssColor(editing ? beatEditor.draft.color : beat.color) } : undefined}
      draggable={editable && !editing}
      tabIndex={0}
      role="group"
      aria-label={`${label}. Double-click or press Enter to edit.`}
      onDragStart={(event) => { event.stopPropagation(); beginDrag(event, { kind: "beat", id: beat.id }); }}
      onDragEnd={clearDrag}
      onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); beginBeatEdit(beat); }}
      onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); beginBeatEdit(beat); }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== "F2")) return;
        event.preventDefault();
        beginBeatEdit(beat);
      }}
    >
      {editing ? renderBeatEditor(beatEditor) : <>
        <span>{label}</span>
        <span className="story-board-reorder" role="group" aria-label={`Actions for ${label}`}>
          <button type="button" className="link-btn" aria-label={`Edit ${label}`} disabled={!editable} onClick={(event) => { event.stopPropagation(); beginBeatEdit(beat); }}>Edit</button>
          <button type="button" className="link-btn" aria-label={`Move ${label} earlier`} disabled={!editable || beatIndex <= 0} onClick={(event) => { event.stopPropagation(); moveBeat(beat.id, beatIndex - 1); }}>↑</button>
          <button type="button" className="link-btn" aria-label={`Move ${label} later`} disabled={!editable || beatIndex < 0 || beatIndex === customStructure.beats.length - 1} onClick={(event) => { event.stopPropagation(); moveBeat(beat.id, beatIndex + 1); }}>↓</button>
        </span>
      </>}
    </div>;
  };

  return <div className="insp-stack">
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true"><span key={boardAnnouncement.nonce}>{boardAnnouncement.message}</span></span>
    <Hint>Use the grip to organize the outline. The draft stays unchanged until you choose Make Draft Match Outline.</Hint>
    <div className="btn-row">
      <button className="btn" disabled={!outlineDiffersFromDraft} onClick={applyOutlineToDraft}>Make Draft Match Outline</button>
      <span className="insp-card-meta" role="status">{outlineDiffersFromDraft ? "Outline changes are not yet in the draft." : "Draft matches outline."}</span>
    </div>
    <div className="board-view-switch">
      {(["board", "act", "sequence", "scene", "beat", "timeline"] as StoryBoardView[]).map((name) =>
        <button key={name} className={`btn btn-ghost ${view === name ? "active" : ""}`} onClick={() => onWorkspace({ storyBoardView: name })}>{name === "board" ? "Visual Board" : name[0].toUpperCase() + name.slice(1)}</button>,
      )}
    </div>
    {view === "board" && <>
      <div className="btn-row"><button className="btn" onClick={addAct}>Add Act</button><button className="btn btn-ghost" onClick={addSequence}>Add Sequence</button><button className="btn btn-ghost" onClick={addBeat}>Add Beat</button><span className="story-board-beat-target">New beat target: {newBeatTarget.label}</span></div>
      <div className="story-board" aria-label="Visual story board" onDragLeave={leaveVisualBoard}>
        {customStructure.acts.map((act) => <section className="story-board-act" key={act.id} aria-label={`${act.title} drop zone`} onDragOver={(event) => { allowDrop(event); clearScenePreview(); }} onDrop={(event) => dropOnAct(event, act.id)}>
          <header><input aria-label="Act title" value={act.title} onChange={(event) => updateAct(act.id, event.target.value)} /><span>{customStructure.sequences.filter((sequence) => sequence.actId === act.id).length} sequences</span></header>
          <div className="story-board-lane">
            {customStructure.sequences.filter((sequence) => sequence.actId === act.id).map((sequence) => {
              const sequencePreview = scenePreview?.placement.kind !== "unassigned" && scenePreview?.placement.sequenceId === sequence.id
                ? scenePreview.placement
                : undefined;
              const appendPreview = sequencePreview?.kind === "append" || sequencePreview?.kind === "empty" ? sequencePreview.kind : undefined;
              return <article
                className={`story-board-sequence ${draggedItem?.kind === "sequence" && draggedItem.id === sequence.id ? "is-dragging" : ""}`}
                data-drop-placement={appendPreview}
                key={sequence.id}
                draggable={editable}
                onDragStart={(event) => beginDrag(event, { kind: "sequence", id: sequence.id })}
                onDragEnd={clearDrag}
                onDragOver={(event) => previewOnSequence(event, sequence.id)}
                onDrop={(event) => dropOnSequence(event, sequence.id, act.id)}
              >
                <div className="story-board-sequence-header"><span className="story-board-drag-handle" draggable={editable} role="img" aria-label={`Drag handle for ${sequence.title || "sequence"}`} title={`Drag ${sequence.title || "sequence"}`} onDragStart={(event) => { event.stopPropagation(); beginDrag(event, { kind: "sequence", id: sequence.id }); }} onDragEnd={clearDrag}>⠿</span><input aria-label="Sequence title" value={sequence.title} onChange={(event) => updateSequence(sequence.id, { title: event.target.value })} /></div>
                <div className="story-board-reorder" role="group" aria-label={`Reorder ${sequence.title || "sequence"}`}><button className="link-btn" aria-label={`Move ${sequence.title || "sequence"} earlier`} disabled={!canMoveSequenceWithinAct(sequence.id, -1)} onClick={(event) => { event.stopPropagation(); moveSequenceWithinAct(sequence.id, -1); }}>←</button><button className="link-btn" aria-label={`Move ${sequence.title || "sequence"} later`} disabled={!canMoveSequenceWithinAct(sequence.id, 1)} onClick={(event) => { event.stopPropagation(); moveSequenceWithinAct(sequence.id, 1); }}>→</button></div>
                <div
                  className={`story-board-append-zone${appendPreview ? " is-drop-target" : ""}`}
                  data-drop-placement={appendPreview}
                  aria-label={`${sequence.sceneIds.length ? "Append scene to" : "Drop scene into empty"} ${sequence.title || "sequence"}`}
                  onDragOver={(event) => previewOnSequence(event, sequence.id)}
                  onDrop={(event) => dropOnSequence(event, sequence.id, act.id)}
                >{appendPreview === "empty" ? "Drop into empty sequence" : appendPreview === "append" ? "Drop at end of sequence" : sequence.sceneIds.length ? "Drop at end" : "Drop scenes here"}</div>
                <div className="story-board-scenes" role="listbox" aria-label={`Scenes in ${sequence.title || "sequence"}`} data-drop-placement={appendPreview}>
                  {customStructure.sceneOrder.filter((sceneId) => sequence.sceneIds.includes(sceneId)).map((sceneId) => {
                    const scene = sceneById.get(sceneId);
                    if (!scene) return null;
                    const sceneDropPosition = sequencePreview?.kind === "before" || sequencePreview?.kind === "after"
                      ? sequencePreview.anchorSceneId === scene.id ? sequencePreview.kind : undefined
                      : undefined;
                    return <div
                      className={`story-board-scene${selectedSceneId === scene.id ? " is-selected" : ""}${draggedItem?.kind === "scene" && draggedItem.id === scene.id ? " is-dragging" : ""}${sceneDropPosition ? ` is-drop-${sceneDropPosition}` : ""}`}
                      data-scene-id={scene.id}
                      data-drop-placement={sceneDropPosition}
                      key={scene.id}
                      draggable={editable}
                      role="option"
                      aria-selected={selectedSceneId === scene.id}
                      tabIndex={0}
                      onDragStart={(event) => { event.stopPropagation(); beginDrag(event, { kind: "scene", id: scene.id }); }}
                      onDragEnd={clearDrag}
                      onDragOver={(event) => previewOnScene(event, sequence.id, scene.id)}
                      onDrop={(event) => dropOnScene(event, sequence.id, scene.id)}
                      onDoubleClick={(event) => handleSceneDoubleClick(event, scene)}
                      onContextMenu={(event) => openSceneContextFromPointer(event, scene.id)}
                      onKeyDown={(event) => openSceneContextFromKeyboard(event, scene.id)}
                    >
                      {sceneDropPosition && <span className={`story-board-drop-indicator is-${sceneDropPosition}`} aria-hidden="true">Drop {sceneDropPosition}</span>}
                      <div className="story-board-scene-heading"><button className="link-btn story-board-scene-open" onClick={() => handleSceneClick(scene.id)}>{sceneBoardLabel(scene)}</button><button type="button" className="link-btn story-board-scene-menu-trigger" aria-label={`Scene options for Scene ${sceneReference(scene)}`} aria-haspopup="menu" onClick={(event) => { event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); openSceneContextMenu(scene.id, event.currentTarget, bounds.right, bounds.bottom); }}>⋯</button></div>
                      {renderSceneLabelEditor(scene)}
                      {customStructure.beats.filter((beat) => beat.sceneId === scene.id).map((beat) => renderBoardBeat(beat))}
                      {renderSceneMoveControls(scene)}
                    </div>;
                  })}
                </div>
                {customStructure.beats.filter((beat) => beat.sequenceId === sequence.id && !beat.sceneId).map((beat) => renderBoardBeat(beat, "sequence-beat"))}
              </article>;
            })}
            {!customStructure.sequences.some((sequence) => sequence.actId === act.id) && <div className="story-board-empty">Drop a sequence into this act</div>}
          </div>
        </section>)}
        <section className={`story-board-unassigned${scenePreview?.placement.kind === "unassigned" ? " is-drop-target" : ""}`} data-drop-placement={scenePreview?.placement.kind === "unassigned" ? "unassigned" : undefined} aria-label="Unassigned scenes and beats" onDragOver={previewOnUnassigned} onDrop={dropOnUnassigned}>
          <strong>Unassigned scenes</strong>
          {scenePreview?.placement.kind === "unassigned" && <div className="story-board-drop-slot is-unassigned" aria-hidden="true">Drop into Unassigned</div>}
          <div className="story-board-unassigned-scenes" role="listbox" aria-label="Unassigned scenes">
            {orderedScenes.filter((scene) => !assignedSceneIds.has(scene.id)).map((scene) => <div className="story-board-unassigned-scene" key={scene.id}>
              <span className="story-board-drag-handle" draggable={editable} role="img" aria-label={`Drag handle for Scene ${sceneReference(scene)}`} title={`Drag Scene ${sceneReference(scene)}`} onDragStart={(event) => { event.stopPropagation(); beginDrag(event, { kind: "scene", id: scene.id }); }} onDragEnd={clearDrag}>⠿</span>
              <div
                className={`story-board-scene${selectedSceneId === scene.id ? " is-selected" : ""}${draggedItem?.kind === "scene" && draggedItem.id === scene.id ? " is-dragging" : ""}`}
                data-scene-id={scene.id}
                draggable={editable}
                role="option"
                aria-selected={selectedSceneId === scene.id}
                tabIndex={0}
                onDragStart={(event) => beginDrag(event, { kind: "scene", id: scene.id })}
                onDragEnd={clearDrag}
                onDoubleClick={(event) => handleSceneDoubleClick(event, scene)}
                onContextMenu={(event) => openSceneContextFromPointer(event, scene.id)}
                onKeyDown={(event) => openSceneContextFromKeyboard(event, scene.id)}
              >
                <div className="story-board-scene-heading"><button className="link-btn story-board-scene-open" onClick={() => handleSceneClick(scene.id)}>{sceneBoardLabel(scene)}</button><button type="button" className="link-btn story-board-scene-menu-trigger" aria-label={`Scene options for Scene ${sceneReference(scene)}`} aria-haspopup="menu" onClick={(event) => { event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); openSceneContextMenu(scene.id, event.currentTarget, bounds.right, bounds.bottom); }}>⋯</button></div>
                {renderSceneLabelEditor(scene)}
                {customStructure.beats.filter((beat) => beat.sceneId === scene.id).map((beat) => renderBoardBeat(beat))}
                {renderSceneMoveControls(scene)}
              </div>
            </div>)}
          </div>
          <strong>Unplaced beats</strong>
          {customStructure.beats.filter((beat) => !beat.sceneId && !beat.sequenceId).map((beat) => renderBoardBeat(beat))}
        </section>
      </div>
      {renderSceneContextMenu()}
      {!!customStructure.connections?.length && <div className="story-board-connections"><strong>Beat connections</strong>{customStructure.connections.map((connection) => <span key={connection.id}><i style={storyCssColor(connection.color) ? { background: storyCssColor(connection.color) } : undefined} />{customStructure.beats.find((beat) => beat.id === connection.fromId)?.title || customStructure.beats.find((beat) => beat.id === connection.fromId)?.text || "Beat"} → {customStructure.beats.find((beat) => beat.id === connection.toId)?.title || customStructure.beats.find((beat) => beat.id === connection.toId)?.text || "Beat"}</span>)}</div>}
    </>}
    {view === "act" && <>
      <button className="btn" onClick={addAct}>Add Act</button>
      {customStructure.acts.map((act) => <div className="insp-card" key={act.id}>
        <input aria-label="Act title" className="insp-notes-input" value={act.title} onChange={(event) => updateAct(act.id, event.target.value)} />
        <div className="insp-card-meta">{customStructure.sequences.filter((sequence) => sequence.actId === act.id).length} sequences · {customStructure.sequences.filter((sequence) => sequence.actId === act.id).flatMap((sequence) => sequence.sceneIds).length} scenes</div>
        <button className="link-btn" disabled={customStructure.acts.length === 1} onClick={() => removeAct(act.id)}>Remove</button>
      </div>)}
    </>}
    {view === "sequence" && <>
      <div className="btn-row"><button className="btn" onClick={addSequence}>Add Sequence</button>{customStructure.sequences.length > 0 && <button className={deleteAllArmed ? "btn btn-danger" : "btn btn-ghost"} onClick={() => { if (!deleteAllArmed) { setDeleteAllArmed(true); return; } save({ ...customStructure, sequences: [], beats: customStructure.beats.map((beat) => ({ ...beat, sequenceId: undefined })) }); setDeleteAllArmed(false); }}>{deleteAllArmed ? "Confirm Delete All" : "Delete All Sequences"}</button>}{deleteAllArmed && <button className="link-btn" onClick={() => setDeleteAllArmed(false)}>Cancel</button>}</div>
      {!customStructure.sequences.length && <Hint>No sequences yet. Add one when the story needs it.</Hint>}
      {customStructure.sequences.map((sequence) => {
        const siblings = customStructure.sequences.filter((item) => item.actId === sequence.actId);
        const siblingIndex = siblings.findIndex((item) => item.id === sequence.id);
        return <details className="insp-card compact-sequence" key={sequence.id}>
          <summary><strong>{sequence.title || "Untitled sequence"}</strong><span>{sequence.sceneIds.length} scene{sequence.sceneIds.length === 1 ? "" : "s"}</span></summary>
          <input aria-label="Sequence title" className="insp-notes-input" value={sequence.title} onChange={(event) => updateSequence(sequence.id, { title: event.target.value })} />
          <select className="element-select" aria-label="Parent act" value={sequence.actId} onChange={(event) => moveSequence(sequence.id, event.target.value)}>
            {customStructure.acts.map((act) => <option key={act.id} value={act.id}>{act.title}</option>)}
          </select>
          <div className="btn-row" aria-label={`Reorder ${sequence.title || "sequence"}`}><button className="btn btn-ghost" aria-label={`Move ${sequence.title || "sequence"} earlier`} disabled={siblingIndex <= 0} onClick={() => moveSequenceWithinAct(sequence.id, -1)}>Move Earlier</button><button className="btn btn-ghost" aria-label={`Move ${sequence.title || "sequence"} later`} disabled={siblingIndex < 0 || siblingIndex === siblings.length - 1} onClick={() => moveSequenceWithinAct(sequence.id, 1)}>Move Later</button></div>
          <label className="insp-card-meta">Add a scene<select className="element-select" aria-label={`Add scene to ${sequence.title}`} value="" onChange={(event) => { if (event.target.value) assignScene(sequence.id, event.target.value); }}><option value="">Choose scene...</option>{scenes.filter((scene) => !sequence.sceneIds.includes(scene.id)).map((scene) => <option value={scene.id} key={scene.id}>{sceneReference(scene)}. {scene.heading}{assignedSceneIds.has(scene.id) ? " (move)" : ""}</option>)}</select></label>
          <div className="compact-scene-list">{sequence.sceneIds.map((id) => { const scene = sceneById.get(id); return scene ? <div key={id}><button className="link-btn" onClick={() => onJumpToScene(id)}>{sceneBoardLabel(scene)}</button><button className="link-btn" aria-label={`Remove ${scene.heading} from ${sequence.title}`} onClick={() => removeScene(sequence.id, id)}>Remove</button></div> : null; })}</div>
          <div className="btn-row"><button className="btn btn-ghost" disabled={!sequence.sceneIds.length} onClick={() => updateSequence(sequence.id, { sceneIds: [] })}>Clear All Scenes</button><button className="link-btn" onClick={() => save({ ...customStructure, sequences: customStructure.sequences.filter((item) => item.id !== sequence.id), beats: customStructure.beats.map((beat) => beat.sequenceId === sequence.id ? { ...beat, sequenceId: undefined } : beat) })}>Delete Sequence</button></div>
        </details>;
      })}
    </>}
    {view === "scene" && <div className="story-card-grid">
      {orderedScenes.map((scene, index) => <div className="insp-card" key={scene.id} draggable={editable} onDragStart={(event) => beginDrag(event, { kind: "scene", id: scene.id })} onDragEnd={clearDrag} onDragOver={(event) => { allowDrop(event); }} onDrop={(event) => { const item = allowDrop(event); if (item?.kind === "scene" && item.id !== scene.id) save(moveStoryScene(customStructure, item.id, index)); clearDrag(); }}>
        <button className="link-btn insp-card-title" onClick={() => onJumpToScene(scene.id)}>{sceneBoardLabel(scene)}</button>
        <div className="insp-card-meta">{workspace.sceneMeta?.[scene.id]?.summary || "No summary"}</div>
        <div className="insp-card-meta">Drag to reorder this scene in the outline.</div><div className="btn-row"><button className="btn btn-ghost" disabled={index === 0} onClick={() => save(moveStoryScene(customStructure, scene.id, index - 1))}>↑</button><button className="btn btn-ghost" disabled={index === orderedScenes.length - 1} onClick={() => save(moveStoryScene(customStructure, scene.id, index + 1))}>↓</button></div>
      </div>)}
    </div>}
    {view === "beat" && <>
      <div className="btn-row"><button className="btn" onClick={addBeat}>Add Beat</button><span className="story-board-beat-target">New beat target: {newBeatTarget.label}</span></div>
      {customStructure.beats.map((beat, beatIndex) => <div className="insp-card" key={beat.id}>
        <input aria-label="Beat title" className="insp-notes-input" value={beat.title ?? ""} placeholder="Beat title" onChange={(event) => updateBeat(beat.id, { title: event.target.value })} />
        <textarea className="insp-notes-input" value={beat.text} onChange={(event) => updateBeat(beat.id, { text: event.target.value })} />
        <label className="insp-card-meta">Card color<input aria-label="Beat color" className="insp-notes-input" value={beat.color ?? ""} placeholder="#F5C451 or Final Draft color" onChange={(event) => updateBeat(beat.id, { color: event.target.value || undefined })} /></label>
        <select className="element-select" aria-label="Beat placement" value={beat.sceneId ? `scene:${beat.sceneId}` : beat.sequenceId ? `sequence:${beat.sequenceId}` : ""} onChange={(event) => { const [kind, id] = event.target.value.split(":"); updateBeat(beat.id, { sceneId: kind === "scene" ? id : undefined, sequenceId: kind === "sequence" ? id : undefined }); }}>
          <option value="">Unplaced</option>
          <optgroup label="Scenes">{scenes.map((scene) => <option value={`scene:${scene.id}`} key={scene.id}>{scene.heading}</option>)}</optgroup>
          <optgroup label="Sequences">{customStructure.sequences.map((sequence) => <option value={`sequence:${sequence.id}`} key={sequence.id}>{sequence.title}</option>)}</optgroup>
        </select>
        <select className="element-select" value={beat.status} onChange={(event) => updateBeat(beat.id, { status: event.target.value as typeof beat.status })}><option value="idea">Idea</option><option value="drafted">Drafted</option><option value="complete">Complete</option></select>
        <h4>Moments</h4>
        {beat.moments.map((moment) => <input key={moment.id} className="insp-notes-input" value={moment.text} onChange={(event) => updateBeat(beat.id, { moments: beat.moments.map((item) => item.id === moment.id ? { ...item, text: event.target.value } : item) })} />)}
        <label className="insp-card-meta">Connect to beat<select aria-label={`Connect ${beat.title || beat.text} to beat`} className="element-select" value="" onChange={(event) => { const targetId = event.target.value; if (!targetId) return; save({ ...customStructure, connections: [...(customStructure.connections ?? []), { id: `connection-${crypto.randomUUID()}`, fromId: beat.id, toId: targetId }] }); }}><option value="">Choose beat...</option>{customStructure.beats.filter((target) => target.id !== beat.id && !(customStructure.connections ?? []).some((connection) => connection.fromId === beat.id && connection.toId === target.id)).map((target) => <option key={target.id} value={target.id}>{target.title || target.text}</option>)}</select></label>
        {(customStructure.connections ?? []).filter((connection) => connection.fromId === beat.id || connection.toId === beat.id).map((connection) => { const otherId = connection.fromId === beat.id ? connection.toId : connection.fromId; const other = customStructure.beats.find((item) => item.id === otherId); return <div className="chip" key={connection.id}>{connection.fromId === beat.id ? "To" : "From"}: {other?.title || other?.text || "Beat"}<button className="link-btn" aria-label="Remove beat connection" onClick={() => save({ ...customStructure, connections: customStructure.connections?.filter((item) => item.id !== connection.id) })}>×</button></div>; })}
        <div className="btn-row" aria-label={`Reorder ${beat.title || beat.text}`}><button className="btn btn-ghost" aria-label={`Move ${beat.title || beat.text} earlier`} disabled={beatIndex === 0} onClick={() => moveBeat(beat.id, beatIndex - 1)}>Move Earlier</button><button className="btn btn-ghost" aria-label={`Move ${beat.title || beat.text} later`} disabled={beatIndex === customStructure.beats.length - 1} onClick={() => moveBeat(beat.id, beatIndex + 1)}>Move Later</button></div>
        <div className="btn-row"><button className="btn btn-ghost" onClick={() => updateBeat(beat.id, { moments: [...beat.moments, { id: `moment-${crypto.randomUUID()}`, text: "New moment" }] })}>Add Moment</button><button className="link-btn" onClick={() => save({ ...customStructure, beats: customStructure.beats.filter((item) => item.id !== beat.id), connections: customStructure.connections?.filter((connection) => connection.fromId !== beat.id && connection.toId !== beat.id) })}>Remove Beat</button></div>
      </div>)}
    </>}
    {view === "timeline" && <ol className="timeline-list">
      {orderedScenes.map((scene) => { const heading = parseHeading(scene.heading); return <li key={scene.id}><button className="link-btn" onClick={() => onJumpToScene(scene.id)}>{scene.heading}</button><span>{heading.timeOfDay || "Unspecified time"}</span>{customStructure.beats.filter((beat) => beat.sceneId === scene.id).map((beat) => <small key={beat.id}>{beat.text}</small>)}</li>; })}
    </ol>}
  </div>;
}

function TreatmentWorkspaceTab({ workspace, onWorkspace, onImportTreatment, onExportTreatment, scenes, characters, objects, locations, customStructure }: InspectorProps) {
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
      <button className="btn btn-ghost" onClick={onImportTreatment}>Import</button>
    </div>
    <input className="insp-notes-input" aria-label="Treatment title" value={active.title} onChange={(event) => update({ title: event.target.value })} />
    <textarea className="insp-notes-input treatment-input" value={active.markdown} placeholder="# Treatment\n\n## Act I\n…" onChange={(event) => update({ markdown: event.target.value })} />
    <h4>Linked references</h4>
    <select className="element-select" aria-label="Treatment section" value={sections.some((section) => section.id === linkSection) ? linkSection : ""} onChange={(event) => setLinkSection(event.target.value)}><option value="">Whole treatment</option>{sections.map((section) => <option key={section.id} value={section.id}>{"-".repeat(section.level - 1)} {section.label}</option>)}</select>
    <div className="btn-row">
      <select className="element-select" value={linkType} onChange={(event) => { setLinkType(event.target.value as LinkType); setLinkTarget(""); }}>{Object.keys(targets).map((type) => <option key={type} value={type}>{type}</option>)}</select>
      <select className="element-select" value={linkTarget} onChange={(event) => setLinkTarget(event.target.value)}><option value="">Choose…</option>{targets[linkType].map((target) => <option key={target.id} value={target.id}>{target.label}</option>)}</select>
      <button className="btn btn-ghost" onClick={addLink}>Link</button>
    </div>
    {active.links.map((link) => <div className="chip" key={link.id}>{link.sectionLabel ? `${link.sectionLabel} → ` : ""}{link.targetType}: {link.label}<button className="link-btn" aria-label={`Remove ${link.label} link`} onClick={() => update({ links: active.links.filter((item) => item.id !== link.id) })}>×</button></div>)}
    <div className="btn-row">
      <button className="btn" onClick={() => onExportTreatment("md")}>Export Markdown</button>
      <button className="btn btn-ghost" onClick={() => onExportTreatment("docx")}>Export Word</button>
      <button className="btn btn-ghost" onClick={() => onExportTreatment("pdf")}>Export PDF</button>
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

function EntityDetails({ entityId, focused, defaultOpen, summary, children }: {
  entityId: string;
  focused: boolean;
  defaultOpen: boolean;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen || focused);
  return <details className="insp-card" data-entity-id={entityId} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="insp-card-title" autoFocus={focused}>{summary}</summary>
    {children}
  </details>;
}

function CastTab({ analysis, workspace, onWorkspace, entityFocusRequest, activeDocumentId, onOpenScriptTarget }: InspectorProps) {
  const characters = analysis.entities.characters;
  const scenesById = new Map(analysis.scenes.map((scene) => [scene.id, scene]));
  if (!characters.length) return <Hint>No character cues detected.</Hint>;
  return <div className="insp-stack"><Hint>Character sheets are derived from cues and dialogue; corrections remain editable project metadata.</Hint>{characters.map((character) => <EntityDetails key={character.id} entityId={character.id} focused={entityFocusRequest?.kind === "character" && entityFocusRequest.id === character.id} defaultOpen={characters.length <= 3 && character.status !== "rejected"} summary={<>{character.name} <small>· {character.status}</small></>}>
    <div className="insp-card-meta">{character.sceneCount} scenes · {character.cueCount} cues · {character.dialogueCount} dialogue blocks · {character.dialogueWords} dialogue words · first/last {character.firstScene}/{character.lastScene}</div>
    {character.firstDescription && <p className="insp-card-desc">{character.firstDescription}</p>}
    {!!character.aliases.length && <p className="insp-card-desc">Aliases: {character.aliases.join(", ")}</p>}
    {!!character.coAppearances.length && <p className="insp-card-desc">Co-appears: {character.coAppearances.map((item) => `${item.character} (${item.count})`).join(", ")}</p>}
    {!!character.absenceGaps.length && <p className="insp-card-desc">Continuity gaps: {character.absenceGaps.map((gap) => `${gap.scenesAbsent} scenes after ${gap.afterScene}`).join(", ")}</p>}
    <EntityNote entityId={character.id} workspace={workspace} onWorkspace={onWorkspace} />
    <EntityControls kind="character" entity={character} peers={characters} workspace={workspace} onWorkspace={onWorkspace} />
    <h4>Scenes and dialogue</h4>
    {character.appearances.map((appearance) => <div className="entity-scene-breakdown" key={appearance.sceneId}>
      <div className="insp-card-meta"><strong>Scene {appearance.sceneNumber} · {scenesById.get(appearance.sceneId)?.heading ?? "Untitled scene"}</strong> · {appearance.cueCount} cues · {appearance.dialogueCount} dialogue blocks · {appearance.dialogueWords} words</div>
      {character.dialogueLines.filter((line) => line.sceneId === appearance.sceneId).map((line, index) => <button
        type="button"
        className="link-btn script-reference-link"
        key={line.blockId}
        onClick={() => onOpenScriptTarget(scriptTarget(activeDocumentId, line.sceneId, line.blockId, line, "character-dialogue", `Open ${character.name} dialogue`))}
        aria-label={`Open ${character.name} dialogue ${index + 1} in Scene ${line.sceneNumber}`}
      >{line.text || "(empty dialogue)"}</button>)}
    </div>)}
  </EntityDetails>)}</div>;
}

function PropsTab({ analysis, workspace, onWorkspace, activeDocumentId, onOpenScriptTarget }: InspectorProps) {
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
    <div className="insp-card-meta">{object.productionCategory} · {object.mentions} mentions · scenes {object.sceneNumbers.join(", ") || "-"} · {Math.round(object.confidence * 100)}%</div>
    {object.likelyOwner && <p className="insp-card-desc">Likely owner: {object.likelyOwner}</p>}
    {!!object.associations.length && <p className="insp-card-desc">Associations: {object.associations.map((item) => `${item.character} (${item.reason})`).join(", ")}</p>}
    <EntityNote entityId={object.id} workspace={workspace} onWorkspace={onWorkspace} />
    <EntityControls kind="object" entity={object} peers={objects} workspace={workspace} onWorkspace={onWorkspace} />
    <details><summary className="link-btn">Continuity ({object.continuity.length})</summary>{object.continuity.map((entry) => <div key={entry.blockId} className="script-reference-row">
      <p className="insp-card-desc"><strong>Scene {entry.sceneNumber}:</strong> {entry.excerpt}{entry.ownershipCharacters.length ? ` · owner signal: ${entry.ownershipCharacters.join(", ")}` : ""}</p>
      <div className="script-reference-actions" aria-label={`${object.name} occurrences in Scene ${entry.sceneNumber}`}>
        {entry.occurrences.map((occurrence) => <button
          type="button"
          className="link-btn script-reference-link"
          key={`${entry.blockId}-${occurrence.startOffset}-${occurrence.endOffset}`}
          onClick={() => onOpenScriptTarget(scriptTarget(activeDocumentId, entry.sceneId, entry.blockId, occurrence, "object-continuity", `Open ${object.name} continuity occurrence`))}
          aria-label={`Open ${object.name} occurrence ${occurrence.occurrence + 1} in Scene ${entry.sceneNumber}`}
        >{occurrence.matchedText} · occurrence {occurrence.occurrence + 1}</button>)}
      </div>
    </div>)}</details>
  </details>)}</div>;
}

function scriptTarget(
  documentId: string,
  sceneId: string,
  blockId: string,
  occurrence: { startOffset: number; endOffset: number; matchedText: string; occurrence: number },
  source: ScriptTarget["source"],
  reason: string,
): ScriptTarget {
  return { documentId, sceneId, blockId, ...occurrence, source, reason };
}

function PlacesTab({ analysis, workspace, onWorkspace, entityFocusRequest, activeDocumentId, onOpenScriptTarget }: InspectorProps) {
  const locations = analysis.entities.locations;
  if (!locations.length) return <Hint>No locations detected.</Hint>;
  return <div className="insp-stack"><Hint>Location sheets normalize repeated headings while preserving aliases and usage details.</Hint>{locations.map((location) => <EntityDetails key={location.id} entityId={location.id} focused={entityFocusRequest?.kind === "location" && entityFocusRequest.id === location.id} defaultOpen={locations.length <= 3 && location.status !== "rejected"} summary={<>{location.name} <small>· {location.status}</small></>}>
    <div className="insp-card-meta">{location.sceneCount} scenes · {location.interiorExterior.join(" / ") || "-"} · {location.timesOfDay.join(" / ") || "time unspecified"} · scenes {location.sceneNumbers.join(", ")}</div>
    {!!location.aliases.length && <p className="insp-card-desc">Aliases: {location.aliases.join(", ")}</p>}
    <EntityNote entityId={location.id} workspace={workspace} onWorkspace={onWorkspace} />
    <EntityControls kind="location" entity={location} peers={locations} workspace={workspace} onWorkspace={onWorkspace} />
    <h4>Scene appearances</h4>
    {location.appearances.map((entry) => <p key={entry.sceneId} className="insp-card-desc"><strong>Scene {entry.sceneNumber}:</strong>{" "}<button
      type="button"
      className="link-btn script-reference-link"
      onClick={() => onOpenScriptTarget(scriptTarget(activeDocumentId, entry.sceneId, entry.blockId, entry, "location-appearance", `Open ${location.name} location appearance`))}
      aria-label={`Open ${location.name} appearance in Scene ${entry.sceneNumber}`}
    >{entry.heading}</button></p>)}
  </EntityDetails>)}</div>;
}

function DraftsTab({ versionHistory, versionComparison, onSaveVersion, onRestoreVersion, onCompareVersions, onCreateAlternateDraft, onSwitchAlternateDraft, onOpenDraftReview, onRefreshDraftReview, onUpdateDraftReviewStatus, onResolveDraftReview, onApplyDraftReview, collaborationSession, projectWorkspace, onProjectWorkspace, activeDocumentId, editable }: InspectorProps) {
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
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewDescription, setReviewDescription] = useState("");
  const [reviewSource, setReviewSource] = useState("");
  const [reviewTarget, setReviewTarget] = useState("");
  const [reviewerIds, setReviewerIds] = useState<string[]>([]);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const actorId = projectWorkspace.currentUserId;
  const canComment = hasPermission(projectWorkspace, actorId, "comment");
  const canResolveConflicts = hasPermission(projectWorkspace, actorId, "resolve-conflicts");
  const activeBranch = versionHistory.branches.find((branch) => branch.id === versionHistory.activeBranchId);
  const defaultAlternateBase = projectSnapshots.some((snapshot) => snapshot.id === activeBranch?.headSnapshotId)
    ? activeBranch!.headSnapshotId
    : projectSnapshots[0]?.id ?? "";
  const milestones = new Map(versionHistory.milestones.map((item) => [item.snapshotId, item]));
  const defaultReviewTarget = versionHistory.branches.some((branch) => branch.id === reviewTarget)
    ? reviewTarget
    : versionHistory.activeBranchId;
  const defaultReviewSource = versionHistory.branches.some((branch) => branch.id === reviewSource && branch.id !== defaultReviewTarget)
    ? reviewSource
    : versionHistory.branches.find((branch) => branch.id !== defaultReviewTarget)?.id ?? "";
  const branchName = (id: string) => versionHistory.branches.find((branch) => branch.id === id)?.name ?? id;
  const addReviewComment = (reviewId: string) => {
    const text = reviewComments[reviewId]?.trim();
    if (!text) return;
    onProjectWorkspace({ reviews: [...projectWorkspace.reviews, {
      id: `review-comment-${crypto.randomUUID()}`,
      kind: "comment" as const,
      authorId: projectWorkspace.currentUserId,
      targetType: "draft-review" as const,
      targetId: reviewId,
      text,
      status: "open" as const,
      createdAt: new Date().toISOString(),
    }] });
    setReviewComments((current) => ({ ...current, [reviewId]: "" }));
  };
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
    <Hint>Save versions, branch Alternate Drafts, and use Draft Reviews to discuss, approve, resolve overlaps, and apply work safely.</Hint>
    <fieldset className="permission-scope" aria-label="Draft editing controls" disabled={!editable}>
      <h4>Save Draft Version</h4>
      <input className="insp-notes-input" value={name} placeholder={`Draft ${versionHistory.snapshots.length + 1} name`} onChange={(event) => setName(event.target.value)} />
      <textarea className="insp-notes-input" value={description} placeholder="What changed?" onChange={(event) => setDescription(event.target.value)} />
      {collaborationSession.projectType === "television" && <label className="insp-card-meta">Version scope<select aria-label="Version scope" className="element-select" value={snapshotScope} onChange={(event) => setSnapshotScope(event.target.value as SnapshotScope["kind"])}><option value="project">Whole project</option><option value="episode">Active episode</option><option value="season">Active season</option><option value="show-bible">Show bible</option></select></label>}
      <label className="check-row"><input type="checkbox" checked={milestone} onChange={(event) => setMilestone(event.target.checked)} /> Mark as milestone</label>
      <button className="btn btn-primary" onClick={save}>Save Draft Version</button>
      {!!versionHistory.branches.length && <><h4>Draft Branches</h4><label className="insp-card-meta">Working draft<select className="element-select" value={versionHistory.activeBranchId} onChange={(event) => onSwitchAlternateDraft(event.target.value)}>{versionHistory.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></>}
      {!!projectSnapshots.length && <div className="insp-card">
        <input className="insp-notes-input" value={alternateName} placeholder="Alternate draft name" onChange={(event) => setAlternateName(event.target.value)} />
        <select className="element-select" value={alternateBase} onChange={(event) => setAlternateBase(event.target.value)}><option value="">Branch from active draft head…</option>{projectSnapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>)}</select>
        <button className="btn btn-ghost" disabled={!alternateName.trim() || !defaultAlternateBase} onClick={() => { onCreateAlternateDraft(alternateName, alternateBase || defaultAlternateBase); setAlternateName(""); }}>Create Alternate Draft</button>
      </div>}
      {versionHistory.branches.length > 1 && <>
        <h4>Open Draft Review</h4>
        <div className="insp-card draft-review-create">
          <input className="insp-notes-input" aria-label="Draft Review title" value={reviewTitle} placeholder="Review title" onChange={(event) => setReviewTitle(event.target.value)} />
          <textarea className="insp-notes-input" aria-label="Draft Review description" value={reviewDescription} placeholder="What should reviewers focus on?" onChange={(event) => setReviewDescription(event.target.value)} />
          <div className="draft-review-route"><label className="insp-card-meta">From<select className="element-select" aria-label="Review source draft" value={defaultReviewSource} onChange={(event) => setReviewSource(event.target.value)}>{versionHistory.branches.filter((branch) => branch.id !== defaultReviewTarget).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><span aria-hidden="true">→</span><label className="insp-card-meta">Into<select className="element-select" aria-label="Review target draft" value={defaultReviewTarget} onChange={(event) => { setReviewTarget(event.target.value); if (event.target.value === defaultReviewSource) setReviewSource(""); }}>{versionHistory.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>
          <details><summary className="link-btn">Choose reviewers ({reviewerIds.length})</summary>{projectWorkspace.collaborators.filter((person) => person.id !== projectWorkspace.currentUserId && hasPermission(projectWorkspace, person.id, "approve")).map((person) => <label className="check-row" key={person.id}><input type="checkbox" checked={reviewerIds.includes(person.id)} onChange={() => setReviewerIds((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id])} /> {person.name} · {person.role}</label>)}</details>
          <button className="btn btn-primary" disabled={!reviewTitle.trim() || !defaultReviewSource || defaultReviewSource === defaultReviewTarget} onClick={() => { onOpenDraftReview(reviewTitle, reviewDescription, defaultReviewSource, defaultReviewTarget, reviewerIds); setReviewTitle(""); setReviewDescription(""); setReviewerIds([]); }}>Open Draft Review</button>
        </div>
      </>}
    </fieldset>
    {!!versionHistory.draftReviews.length && <><h4>Draft Reviews</h4><div className="draft-review-list">{[...versionHistory.draftReviews].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((review) => {
      const preview = draftReviewPreview(versionHistory, review.id);
      const comments = projectWorkspace.reviews.filter((item) => item.targetType === "draft-review" && item.targetId === review.id);
      const changeCount = preview.comparison.documentChanges.length + preview.comparison.blockChanges.length + preview.comparison.metadataChanges.length;
      const closed = review.status === "closed" || review.status === "applied";
      const assignedReviewer = review.reviewerIds.length === 0 || review.reviewerIds.includes(actorId);
      const canDecide = assignedReviewer && hasPermission(projectWorkspace, actorId, "approve");
      const canManageReview = review.authorId === actorId || hasPermission(projectWorkspace, actorId, "manage-reviews");
      const reviewerNames = review.reviewerIds.map((reviewerId) => projectWorkspace.collaborators.find((person) => person.id === reviewerId)?.name ?? "Unknown reviewer");
      return <details className="insp-card draft-review" key={review.id}>
        <summary><span><strong>{review.title}</strong><small>{branchName(review.sourceBranchId)} → {branchName(review.targetBranchId)}</small><small>{reviewerNames.length ? `Reviewers: ${reviewerNames.join(", ")}` : "No assigned reviewers"}</small></span><span className={`draft-review-status status-${review.status}`}>{review.status.replace(/-/g, " ")}</span></summary>
        {review.description && <p className="insp-card-desc">{review.description}</p>}
        <div className="insp-card-meta">{changeCount} change{changeCount === 1 ? "" : "s"} · {preview.conflicts.length} overlapping edit{preview.conflicts.length === 1 ? "" : "s"} · updated {new Date(review.updatedAt).toLocaleString()}</div>
        {preview.outdated && review.status !== "applied" && <div className="draft-review-warning"><span>This review is out of date because one of its drafts changed.</span><button className="btn btn-ghost" disabled={!editable} onClick={() => onRefreshDraftReview(review.id)}>Refresh Review</button></div>}
        <details><summary className="link-btn">Changes ({changeCount})</summary><div className="diff-comparison">
          {preview.comparison.documentChanges.slice(0, 30).map((change) => <div className="diff-row" key={`review-document-${change.documentId}`}><strong>{change.kind} document · {change.title}</strong></div>)}
          {preview.comparison.blockChanges.slice(0, 30).map((change, index) => <div className="diff-row" key={`review-block-${change.documentId}-${change.blockId}-${index}`}><strong>{change.kind} script block</strong><div className="diff-values"><div><span>Before</span><pre>{formatDiffValue(change.before)}</pre></div><div><span>After</span><pre>{formatDiffValue(change.after)}</pre></div></div></div>)}
          {preview.comparison.metadataChanges.slice(0, 30).map((change) => <div className="diff-row" key={`review-meta-${change.path}`}><strong>{change.path.replace(/[.[\]]+/g, " ").trim()}</strong><div className="diff-values"><div><span>Before</span><pre>{formatDiffValue(change.before)}</pre></div><div><span>After</span><pre>{formatDiffValue(change.after)}</pre></div></div></div>)}
          {changeCount > 30 && <Hint>Showing the first 30 changes. Use Compare Drafts below for a focused view.</Hint>}
        </div></details>
        {!!preview.conflicts.length && <details open><summary className="link-btn">Overlapping edits ({preview.conflicts.length})</summary>{preview.conflicts.map((conflict) => <div className="diff-row" key={conflict.path}><strong>{conflict.kind.replace(/-/g, " ")} · {conflict.path.replace(/[.[\]]+/g, " ").trim()}</strong><div className="diff-values"><div><span>Common version</span><pre>{formatDiffValue(conflict.base)}</pre></div><div><span>{branchName(review.targetBranchId)}</span><pre>{formatDiffValue(conflict.ours)}</pre></div><div><span>{branchName(review.sourceBranchId)}</span><pre>{formatDiffValue(conflict.theirs)}</pre></div></div><label className="insp-card-meta">Keep in the applied draft<select className="element-select" aria-label={`Resolve ${conflict.path}`} disabled={preview.outdated || closed || !canResolveConflicts} value={review.resolutions[conflict.path] ?? ""} onChange={(event) => onResolveDraftReview(review.id, conflict.path, event.target.value ? event.target.value as "ours" | "theirs" : null)}><option value="">Choose a version...</option><option value="ours">{branchName(review.targetBranchId)}</option><option value="theirs">{branchName(review.sourceBranchId)}</option></select></label></div>)}</details>}
        <h5>Discussion</h5>
        {comments.length ? comments.map((comment) => <div className="draft-review-comment" key={comment.id}><div><strong>{projectWorkspace.collaborators.find((person) => person.id === comment.authorId)?.name ?? "Collaborator"}</strong><span>{new Date(comment.createdAt).toLocaleString()}</span></div><p>{comment.text}</p>{comment.status === "open" && (comment.authorId === actorId ? canComment : hasPermission(projectWorkspace, actorId, "manage-reviews")) && <button className="link-btn" onClick={() => onProjectWorkspace({ reviews: projectWorkspace.reviews.map((item) => item.id === comment.id ? { ...item, status: "resolved" } : item) })}>Resolve</button>}</div>) : <Hint>No comments yet.</Hint>}
        {!closed && canComment && <div className="btn-row"><input className="insp-notes-input" aria-label={`Comment on ${review.title}`} value={reviewComments[review.id] ?? ""} placeholder="Leave a review comment" onChange={(event) => setReviewComments((current) => ({ ...current, [review.id]: event.target.value }))} /><button className="btn btn-ghost" disabled={!reviewComments[review.id]?.trim()} onClick={() => addReviewComment(review.id)}>Comment</button></div>}
        <div className="btn-row">
          {!closed && canDecide && <button className="btn btn-ghost" onClick={() => onUpdateDraftReviewStatus(review.id, "changes-requested")}>Request Changes</button>}
          {!closed && canDecide && <button className="btn" disabled={preview.outdated || preview.unresolvedConflictPaths.length > 0} onClick={() => onUpdateDraftReviewStatus(review.id, "approved")}>Approve</button>}
          {review.status === "changes-requested" && canDecide && <button className="btn btn-ghost" onClick={() => onUpdateDraftReviewStatus(review.id, "open")}>Reopen</button>}
          {preview.readyToApply && editable && canResolveConflicts && <button className="btn btn-primary" onClick={() => onApplyDraftReview(review.id)}>Apply Draft</button>}
          {review.status !== "applied" && canManageReview && <button className="link-btn" onClick={() => onUpdateDraftReviewStatus(review.id, review.status === "closed" ? "open" : "closed")}>{review.status === "closed" ? "Reopen Review" : "Close Review"}</button>}
        </div>
      </details>;
    })}</div></>}
    {snapshots.length > 1 && <><h4>Compare Drafts</h4><select className="element-select" value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)}><option value="">Earlier draft…</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>)}</select><select className="element-select" value={compareTo} onChange={(event) => setCompareTo(event.target.value)}><option value="">Later draft…</option>{snapshots.map((snapshot) => <option key={snapshot.id} value={snapshot.id}>{snapshot.name}</option>)}</select><select className="element-select" value={compareMode} onChange={(event) => setCompareMode(event.target.value as SnapshotDiffMode)}>{modes.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}</select><button className="btn btn-ghost" disabled={!compareFrom || !compareTo || compareFrom === compareTo} onClick={() => onCompareVersions(compareFrom, compareTo, compareMode)}>Compare</button></>}
    {versionComparison && <div className="insp-card diff-comparison"><div className="insp-card-title">{versionComparison.mode} comparison</div><div className="insp-card-meta">Scope: {snapshotScopeLabel(versionComparison.scope)}</div>
      {!versionComparison.documentChanges.length && !versionComparison.blockChanges.length && !versionComparison.metadataChanges.length && <Hint>No differences in this view.</Hint>}
      {versionComparison.documentChanges.slice(0, 200).map((change) => <div className="diff-row" key={`document-${change.documentId}`}><strong>{change.kind} document · {change.title}</strong><code>{change.documentId}</code><div className="diff-values"><div><span>Before</span><pre>{formatDocumentDiff(change.before)}</pre></div><div><span>After</span><pre>{formatDocumentDiff(change.after)}</pre></div></div></div>)}
      {versionComparison.blockChanges.slice(0, 200).map((change, index) => <div className="diff-row" key={`block-${change.documentId}-${change.blockId}-${change.kind}-${index}`}><strong>{change.kind} block · {change.documentId}</strong><code>{change.blockId} · {change.beforeIndex ?? "-"} → {change.afterIndex ?? "-"}</code><div className="diff-values"><div><span>Before</span><pre>{formatDiffValue(change.before)}</pre></div><div><span>After</span><pre>{formatDiffValue(change.after)}</pre></div></div></div>)}
      {versionComparison.metadataChanges.slice(0, 200).map((change) => <div className="diff-row" key={`metadata-${change.path}`}><strong>{change.path}</strong><div className="diff-values"><div><span>Before</span><pre>{formatDiffValue(change.before)}</pre></div><div><span>After</span><pre>{formatDiffValue(change.after)}</pre></div></div></div>)}
      {versionComparison.documentChanges.length + versionComparison.blockChanges.length + versionComparison.metadataChanges.length > 200 && <Hint>Showing the first 200 changes. Export or narrow the comparison mode for a focused review.</Hint>}
    </div>}
    <h4>Project History{activeBranch ? ` · ${activeBranch.name}` : ""}</h4>
    <div className="version-list">{snapshots.map((snapshot) => <div className="version-row" key={snapshot.id}><div className="version-top"><span className="version-label">{snapshot.name}</span>{milestones.has(snapshot.id) && <span className="milestone-tag">milestone</span>}<span className="milestone-tag">{snapshotScopeLabel(snapshot.scope)}</span><span className="version-when">{new Date(snapshot.createdAt).toLocaleString()}</span></div><div className="version-note">{snapshot.description || "No description"} · {versionHistory.branches.find((branch) => branch.id === snapshot.branchId)?.name ?? snapshot.branchId ?? "Main Draft"}</div><button className="link-btn" disabled={!editable} onClick={() => onRestoreVersion(snapshot)}>Restore</button></div>)}</div>
  </div>;
}

const PRODUCTION_CATEGORY_LABELS: Record<ProductionCategory, string> = {
  cast: "Cast",
  locations: "Locations",
  props: "Props",
  vehicles: "Vehicles",
  animals: "Animals",
  weapons: "Weapons",
  stunts: "Stunts",
  vfx: "Visual effects",
  sfx: "Sound effects",
  wardrobe: "Wardrobe",
  makeup: "Makeup",
  nightScenes: "Night scenes",
  crowdScenes: "Crowd scenes",
  highComplexityScenes: "High-complexity scenes",
};

const BREAKDOWN_SECTION_IDS = Object.keys(DEFAULT_BREAKDOWN_SECTION_STATE) as BreakdownSectionId[];

function BreakdownTab({
  analysis,
  workspace,
  onWorkspace,
  onExportBreakdown,
  breakdownSections,
  onBreakdownSectionsChange,
  onResetBreakdownSections,
  editable,
}: InspectorProps) {
  const [csvSection, setCsvSection] = useState<AnalysisCsvSection>("all");
  const [bulkMessage, setBulkMessage] = useState("");
  const threads = workspace.plotThreads ?? [];
  const updateThread = (id: string, patch: Partial<(typeof threads)[number]>) => onWorkspace({ plotThreads: threads.map((thread) => thread.id === id ? { ...thread, ...patch } : thread) });
  const toggleThreadTarget = (id: string, field: "sceneIds" | "beatIds", targetId: string) => {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    const values = [...(thread[field] ?? [])];
    updateThread(id, { [field]: values.includes(targetId) ? values.filter((value) => value !== targetId) : [...values, targetId] });
  };
  const resolvedBeatIds = workspace.resolvedBeatIds ?? [];
  const characterCount = analysis.entities.characters.filter((item) => item.status !== "rejected" && item.status !== "merged").length;
  const locationCount = analysis.entities.locations.filter((item) => item.status !== "rejected" && item.status !== "merged").length;
  const openThreadCount = threads.filter((thread) => !thread.resolved).length;
  const facts: [string, string | number][] = [
    ["Scenes", analysis.scenes.length], ["Pages", `~${analysis.pageEstimate}`], ["Runtime", `~${analysis.episode.runtimeMinutes} min`], ["Words", analysis.wordCount],
    ["Dialogue", `${analysis.dialogueWords} words (${Math.round(analysis.dialogueDensity * 100)}%)`], ["Characters", characterCount],
    ["Locations", locationCount], ["Acts / sequences / beats", `${analysis.structure.acts.length} / ${analysis.structure.sequences.length} / ${analysis.structure.beats.length}`],
  ];
  const setSection = (id: BreakdownSectionId, open: boolean) => onBreakdownSectionsChange({ ...breakdownSections, [id]: open });
  const setAllSections = (open: boolean) => {
    onBreakdownSectionsChange(Object.fromEntries(BREAKDOWN_SECTION_IDS.map((id) => [id, open])) as BreakdownSectionState);
    setBulkMessage(open ? "All breakdown sections expanded." : "All breakdown sections collapsed.");
  };
  const resetSections = () => {
    onResetBreakdownSections();
    setBulkMessage("Breakdown sections reset to their defaults.");
  };
  return <div className="insp-stack">
    <div className="breakdown-disclosure-toolbar" role="group" aria-label="Breakdown section controls">
      <button type="button" className="btn btn-ghost" onClick={() => setAllSections(true)}>Expand All</button>
      <button type="button" className="btn btn-ghost" onClick={() => setAllSections(false)}>Collapse All</button>
      <button type="button" className="link-btn" onClick={resetSections}>Reset Sections</button>
      <span className="sr-only" role="status" aria-live="polite">{bulkMessage}</span>
    </div>

    <CollapsibleSection id="breakdown-overview" title="Overview" summary={`${analysis.scenes.length} scenes · ~${analysis.pageEstimate} pages`} open={breakdownSections.overview} onOpenChange={(open) => setSection("overview", open)}>
      <dl className="insp-facts">{facts.map(([label, value]) => <div className="fact-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
      <p className="insp-card-desc">{analysis.episode.summary}</p>
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-plot-threads" title={`Plot threads (${threads.length})`} summary={openThreadCount ? `${openThreadCount} open` : "Clear"} summaryTone={openThreadCount ? "warning" : "success"} open={breakdownSections["plot-threads"]} onOpenChange={(open) => setSection("plot-threads", open)}>
      <button className="btn" disabled={!editable} onClick={() => onWorkspace({ plotThreads: [...threads, { id: `thread-${crypto.randomUUID()}`, label: "New thread", keywords: [], sceneIds: [], beatIds: [], resolved: false }] })}>Add Plot Thread</button>
      {!threads.length && <Hint>No plot threads yet.</Hint>}
      {threads.map((thread) => <div className="insp-card" key={thread.id}>
        <input disabled={!editable} aria-label="Plot thread name" className="insp-notes-input" value={thread.label} onChange={(event) => updateThread(thread.id, { label: event.target.value })} />
        <input disabled={!editable} aria-label="Plot thread keywords" className="insp-notes-input" value={(thread.keywords ?? []).join(", ")} placeholder="Keywords, comma separated" onChange={(event) => updateThread(thread.id, { keywords: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} />
        <label className="check-row"><input disabled={!editable} type="checkbox" checked={thread.resolved ?? false} onChange={(event) => updateThread(thread.id, { resolved: event.target.checked })} /> Resolved</label>
        <details><summary className="link-btn">Link scenes and beats</summary>{analysis.scenes.map((scene) => <label className="check-row" key={scene.id}><input disabled={!editable} type="checkbox" checked={thread.sceneIds?.includes(scene.id) ?? false} onChange={() => toggleThreadTarget(thread.id, "sceneIds", scene.id)} /> Scene {scene.number}: {scene.heading}</label>)}{analysis.structure.beats.map((beat) => <label className="check-row" key={beat.id}><input disabled={!editable} type="checkbox" checked={thread.beatIds?.includes(beat.id) ?? false} onChange={() => toggleThreadTarget(thread.id, "beatIds", beat.id)} /> Beat: {beat.text}</label>)}</details>
        <button className="link-btn" disabled={!editable} onClick={() => onWorkspace({ plotThreads: threads.filter((item) => item.id !== thread.id) })}>Remove</button>
      </div>)}
      {!!analysis.plotThreads.length && <ul className="insp-list">{analysis.plotThreads.map((thread) => <li key={thread.id}>{thread.label}: {thread.status}{thread.resolved ? " · resolved" : ""}</li>)}</ul>}
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-structure" title="Structure and coverage" summary={`${analysis.structure.acts.length} acts · ${analysis.structure.sequences.length} sequences`} open={breakdownSections["structure-coverage"]} onOpenChange={(open) => setSection("structure-coverage", open)}>
      {analysis.structure.acts.map((act) => <div className="insp-card" key={act.id}><div className="insp-card-title">{act.title}</div><div className="insp-card-meta">{act.sceneCount} scenes · ~{act.estimatedPages} pages</div><p className="insp-card-desc">{act.summary}</p></div>)}
      {!analysis.structure.acts.length && <Hint>No act structure is available.</Hint>}
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-treatment" title={`Treatment coverage (${analysis.treatmentCoverage.length})`} summary={analysis.treatmentCoverage.length ? "Tracked" : "Empty"} open={breakdownSections["treatment-coverage"]} onOpenChange={(open) => setSection("treatment-coverage", open)}>
      {analysis.treatmentCoverage.length ? <ul className="insp-list">{analysis.treatmentCoverage.map((item) => <li key={item.id}>{item.label}: {item.status}</li>)}</ul> : <Hint>No treatment coverage is available.</Hint>}
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-unresolved" title={`Unresolved beats (${analysis.unresolvedBeats.length})`} summary={analysis.unresolvedBeats.length ? "Action needed" : "Clear"} summaryTone={analysis.unresolvedBeats.length ? "warning" : "success"} open={breakdownSections["unresolved-beats"]} onOpenChange={(open) => setSection("unresolved-beats", open)}>
      {analysis.unresolvedBeats.length ? analysis.unresolvedBeats.map((beat) => <div className="insp-card" key={beat.id}><div className="insp-card-desc">{beat.text}</div><button className="btn btn-ghost" disabled={!editable} onClick={() => onWorkspace({ resolvedBeatIds: [...resolvedBeatIds, beat.id] })}>Mark resolved</button></div>) : <Hint>No unresolved beats.</Hint>}
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-character-arcs" title={`Character arcs (${analysis.characterArcs.length})`} summary={`${characterCount} characters`} open={breakdownSections["character-arcs"]} onOpenChange={(open) => setSection("character-arcs", open)}>
      {analysis.characterArcs.length ? analysis.characterArcs.map((arc) => <p className="insp-card-desc" key={arc.character}><strong>{arc.character}:</strong> {arc.summary}</p>) : <Hint>No character arcs detected.</Hint>}
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-pacing" title={`Pacing checks (${analysis.pacingWarnings.length})`} summary={analysis.pacingWarnings.length ? "Warning" : "Clear"} summaryTone={analysis.pacingWarnings.length ? "warning" : "success"} open={breakdownSections["pacing-checks"]} onOpenChange={(open) => setSection("pacing-checks", open)}>
      {analysis.pacingWarnings.length ? <ul className="insp-list">{analysis.pacingWarnings.map((warning, index) => <li key={`${warning.code}-${index}`}>{warning.message}</li>)}</ul> : <Hint>No pacing warnings.</Hint>}
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-scenes" title={`Detailed scenes (${analysis.scenes.length})`} summary={`~${analysis.pageEstimate} pages`} open={breakdownSections["detailed-scenes"]} onOpenChange={(open) => setSection("detailed-scenes", open)}>
      {analysis.scenes.map((scene) => <details className="insp-card" key={scene.id}><summary className="insp-card-title">Scene {scene.sceneNumber ?? scene.number} · {scene.heading}</summary><div className="insp-card-meta">~{scene.estimatedPages} pages · {scene.dialogueWords} dialogue words · complexity {scene.complexityScore}/5</div><p className="insp-card-desc">Cast: {scene.characters.join(", ") || "-"}<br />Objects: {scene.objects.join(", ") || "-"}</p></details>)}
    </CollapsibleSection>

    <CollapsibleSection id="breakdown-export" title="Export" summary="Markdown · CSV · JSON · PDF" open={breakdownSections.export} onOpenChange={(open) => setSection("export", open)}>
      <div className="btn-row"><button className="btn btn-ghost" onClick={() => onExportBreakdown("md")}>Markdown</button><select aria-label="CSV report" className="element-select" value={csvSection} onChange={(event) => setCsvSection(event.target.value as AnalysisCsvSection)}>{(["all", "summary", "scenes", "characters", "locations", "objects", "structure", "arcs", "coverage", "warnings", "revision", "production"] as const).map((section) => <option key={section} value={section}>{section}</option>)}</select><button className="btn btn-ghost" onClick={() => onExportBreakdown("csv", csvSection)}>CSV</button><button className="btn btn-ghost" onClick={() => onExportBreakdown("json")}>JSON</button><button className="btn btn-ghost" onClick={() => onExportBreakdown("pdf")}>Print PDF</button></div>
    </CollapsibleSection>
  </div>;
}

function GlobalBreakdownCategory({
  category,
  rows,
  analysis,
  activeDocumentId,
  onOpenEntityBreakdown,
  onOpenScriptTarget,
  open,
  onOpenChange,
  viewOptions,
  filterOpen,
  onFilterOpenChange,
  onViewOptionsChange,
}: Pick<InspectorProps, "analysis" | "activeDocumentId" | "onOpenEntityBreakdown" | "onOpenScriptTarget"> & {
  category: ProductionCategory;
  rows: ProductionRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  viewOptions: GlobalBreakdownViewOptions;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  onViewOptionsChange: (options: GlobalBreakdownViewOptions) => void;
}) {
  const label = PRODUCTION_CATEGORY_LABELS[category];
  const visibleRows = useMemo(
    () => filterAndSortGlobalBreakdownRows(category, rows, analysis.entities, viewOptions),
    [analysis.entities, category, rows, viewOptions],
  );
  const sortOptions = globalBreakdownSortOptions(category);
  const queryActive = Boolean(viewOptions.query.trim());
  const activeFilterCount = Number(queryActive) + Number(viewOptions.sort !== "appearance");
  const filterPanelId = `global-breakdown-${category}-filters`;
  const resultNoun = category === "cast" ? "characters" : category === "locations" ? "locations" : "items";
  const updateViewOptions = (patch: Partial<GlobalBreakdownViewOptions>) => onViewOptionsChange({ ...viewOptions, ...patch });
  return <CollapsibleSection
    id={`global-breakdown-${category}`}
    title={label}
    summary={`${rows.length} cue${rows.length === 1 ? "" : "s"}`}
    open={open}
    onOpenChange={onOpenChange}
    className="global-breakdown-category"
  >
    <div className="global-breakdown-filter-bar">
      <button
        type="button"
        className={`btn btn-ghost global-breakdown-filter-toggle${activeFilterCount ? " active" : ""}`}
        aria-label={`Filter and sort ${label}`}
        aria-expanded={filterOpen}
        aria-controls={filterPanelId}
        disabled={!rows.length}
        onClick={() => onFilterOpenChange(!filterOpen)}
      >Filter &amp; sort{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>
      <span
        className="insp-card-meta"
        role={filterOpen ? "status" : undefined}
        aria-live={filterOpen ? "polite" : undefined}
      >
        {visibleRows.length} of {rows.length} {resultNoun}
      </span>
    </div>
    {filterOpen && <div className="global-breakdown-filter-panel" id={filterPanelId} role="group" aria-label={`${label} filters`}>
      <label className="global-breakdown-filter-field global-breakdown-search-field">Search
        <input
          type="search"
          className="insp-notes-input"
          aria-label={`Search ${label}`}
          placeholder="Name, alias, scene, or evidence"
          value={viewOptions.query}
          onChange={(event) => updateViewOptions({ query: event.target.value })}
        />
      </label>
      <label className="global-breakdown-filter-field">Search behavior
        <select
          className="element-select"
          aria-label={`${label} search behavior`}
          value={viewOptions.filterMode}
          disabled={!queryActive}
          onChange={(event) => updateViewOptions({ filterMode: event.target.value as GlobalBreakdownViewOptions["filterMode"] })}
        >
          <option value="include">Show matches</option>
          <option value="exclude">Exclude matches</option>
        </select>
      </label>
      <label className="global-breakdown-filter-field">Sort
        <select
          className="element-select"
          aria-label={`Sort ${label}`}
          value={viewOptions.sort}
          onChange={(event) => updateViewOptions({ sort: event.target.value as GlobalBreakdownViewOptions["sort"] })}
        >{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
      </label>
      <button
        type="button"
        className="link-btn global-breakdown-filter-clear"
        disabled={!queryActive && viewOptions.sort === "appearance" && viewOptions.filterMode === "include"}
        onClick={() => onViewOptionsChange(DEFAULT_GLOBAL_BREAKDOWN_VIEW_OPTIONS)}
      >Clear</button>
    </div>}
    {!rows.length && <Hint>No {label.toLowerCase()} detected.</Hint>}
    {!!rows.length && !visibleRows.length && <Hint>No {label.toLowerCase()} match this filter.</Hint>}
    {visibleRows.map((row, index) => {
      const entityKind = category === "cast" ? "character" : category === "locations" ? "location" : null;
      const object = row.entityId ? analysis.entities.objects.find((item) => item.id === row.entityId) : undefined;
      const references = object?.continuity.filter((entry) => entry.sceneId === row.sceneId) ?? [];
      const targets = references.length
        ? references.flatMap((entry) => entry.occurrences.map((occurrence) => ({ blockId: entry.blockId, ...occurrence })))
        : row.occurrences ?? [];
      return <div className="script-reference-row" key={`${row.sceneId}-${row.item}-${index}`}>
        <p className="insp-card-desc">
          {entityKind && row.entityId
            ? <button className="link-btn" data-entity-id={row.entityId} onClick={() => onOpenEntityBreakdown(entityKind, row.entityId!)}>{row.item}</button>
            : <strong>Scene {row.sceneNumber} · {row.item}</strong>}
          {": "}{row.evidence}
        </p>
        {!!targets.length && <div className="script-reference-actions" aria-label={`${row.item} production evidence in Scene ${row.sceneNumber}`}>{targets.map((occurrence, occurrenceIndex) => <button
          type="button"
          className="link-btn script-reference-link"
          key={`${occurrence.blockId}-${occurrence.startOffset}-${occurrence.endOffset}`}
          onClick={() => onOpenScriptTarget(scriptTarget(activeDocumentId, row.sceneId, occurrence.blockId, occurrence, "production-evidence", `Open ${row.item} production evidence`))}
          aria-label={object
            ? `Open ${row.item} occurrence ${occurrence.occurrence + 1} in Scene ${row.sceneNumber}`
            : `Open ${row.item} production evidence ${occurrenceIndex + 1} in Scene ${row.sceneNumber}`}
        >{occurrence.matchedText} · {object ? `occurrence ${occurrence.occurrence + 1}` : `evidence ${occurrenceIndex + 1}`}</button>)}</div>}
      </div>;
    })}
  </CollapsibleSection>;
}

function GlobalBreakdownTab(props: InspectorProps) {
  const productionEntries = Object.entries(props.analysis.production) as [ProductionCategory, ProductionRow[]][];
  const defaultViewOptions = () => Object.fromEntries(productionEntries.map(([category]) => [category, { ...DEFAULT_GLOBAL_BREAKDOWN_VIEW_OPTIONS }])) as Record<ProductionCategory, GlobalBreakdownViewOptions>;
  const [bulkMessage, setBulkMessage] = useState("");
  const [filterCategory, setFilterCategory] = useState<ProductionCategory | null>(null);
  const [viewOptionsByCategory, setViewOptionsByCategory] = useState<Record<ProductionCategory, GlobalBreakdownViewOptions>>(defaultViewOptions);
  useEffect(() => {
    setFilterCategory(null);
    setViewOptionsByCategory(defaultViewOptions());
  }, [props.activeDocumentId]);
  const cueCount = productionEntries.reduce((total, [, rows]) => total + rows.length, 0);
  const activeCategories = productionEntries.filter(([, rows]) => rows.length > 0).length;
  const setAllCategories = (open: boolean) => {
    props.onGlobalBreakdownCategoriesChange(Object.fromEntries(productionEntries.map(([category]) => [category, open])) as GlobalBreakdownCategoryState);
    setBulkMessage(open ? "All Global categories expanded." : "All Global categories collapsed.");
  };
  return <div className="insp-stack global-breakdown">
    <div className="insp-card global-breakdown-summary">
      <div className="insp-kicker">Screenplay-wide elements</div>
      <div className="insp-card-title">{cueCount} cues across {activeCategories} categories</div>
      <p className="insp-card-desc">Cast, locations, props, weapons, vehicles, and every other production category are collected here for the whole screenplay.</p>
    </div>
    <div className="breakdown-disclosure-toolbar" role="group" aria-label="Global category controls">
      <button type="button" className="btn btn-ghost" onClick={() => setAllCategories(true)}>Expand All</button>
      <button type="button" className="btn btn-ghost" onClick={() => setAllCategories(false)}>Collapse All</button>
      <span className="sr-only" role="status" aria-live="polite">{bulkMessage}</span>
    </div>
    {productionEntries.map(([category, rows]) => <GlobalBreakdownCategory
      key={category}
      category={category}
      rows={rows}
      analysis={props.analysis}
      activeDocumentId={props.activeDocumentId}
      onOpenEntityBreakdown={props.onOpenEntityBreakdown}
      onOpenScriptTarget={props.onOpenScriptTarget}
      open={props.globalBreakdownCategories[category]}
      onOpenChange={(open) => props.onGlobalBreakdownCategoriesChange({ ...props.globalBreakdownCategories, [category]: open })}
      viewOptions={viewOptionsByCategory[category] ?? DEFAULT_GLOBAL_BREAKDOWN_VIEW_OPTIONS}
      filterOpen={filterCategory === category}
      onFilterOpenChange={(open) => setFilterCategory(open ? category : null)}
      onViewOptionsChange={(options) => setViewOptionsByCategory((current) => ({ ...current, [category]: options }))}
    />)}
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
    {seriesReport.seasonBoard.map((row) => <div className="insp-card" key={row.episodeId}><button className="link-btn insp-card-title" onClick={() => onSelectEpisode(row.episodeId)}>S{row.seasonNumber}E{row.episodeNumber} · {row.title}</button><div className="insp-card-meta">{row.productionCode || "No code"} · {row.sceneCount} scenes · ~{row.pageEstimate} pages · {row.coldOpen ? "cold open · " : ""}{row.tag ? "tag · " : ""}{row.continuityIssueCount} continuity flags</div><p className="insp-card-desc">A: {row.stories.A.join(", ") || "-"}<br />B: {row.stories.B.join(", ") || "-"}<br />C: {row.stories.C.join(", ") || "-"}</p></div>)}
    <h4>Show-level character arcs</h4>
    {seriesReport.continuity.characters.map((character) => <label className="insp-card-meta" key={character.name}>{character.name}<textarea className="insp-notes-input" value={series.characterArcs[character.name] ?? ""} placeholder="Season-long character arc…" onChange={(event) => saveSeries({ characterArcs: { ...series.characterArcs, [character.name]: event.target.value } })} /></label>)}
    <h4>Recurring references</h4>
    {([["characters", seriesReport.continuity.characters], ["locations", seriesReport.continuity.locations], ["objects", seriesReport.continuity.objects]] as const).map(([label, entries]) => <details className="insp-card" key={label}><summary className="insp-card-title">{label} ({entries.filter((entry) => entry.episodeIds.length > 1).length} recurring)</summary>{entries.map((entry) => <div key={entry.name}><strong>{entry.name}</strong><div className="chip-row">{entry.episodeIds.map((id) => <button className="chip" key={id} onClick={() => onSelectEpisode(id)}>{seriesReport.episodes.find((episode) => episode.documentId === id)?.title ?? id}</button>)}</div>{!!entry.absentEpisodeIdsBetween.length && <p className="insp-card-desc">Absent between appearances: {entry.absentEpisodeIdsBetween.length} episode(s)</p>}</div>)}</details>)}
    <h4>Plot thread history</h4>
    {seriesReport.plotThreads.length ? seriesReport.plotThreads.map((thread) => <div className="insp-card" key={thread.id}><div className="insp-card-title">{thread.kind} · {thread.label}</div><div className="insp-card-meta">{thread.status} · {thread.episodes.length} episode(s)</div><div className="chip-row">{thread.episodes.map((episode) => <button className="chip" key={episode.episodeId} onClick={() => onSelectEpisode(episode.episodeId)}>{seriesReport.episodes.find((item) => item.documentId === episode.episodeId)?.title}: {episode.status}</button>)}</div></div>) : <Hint>Add episode story lines or plot threads in Breakdown.</Hint>}
    <h4>Season timeline</h4>
    {series.continuity.filter((record) => record.kind === "timeline").sort((left, right) => (left.timelineOrder ?? Number.MAX_SAFE_INTEGER) - (right.timelineOrder ?? Number.MAX_SAFE_INTEGER) || (left.timelineDate ?? "").localeCompare(right.timelineDate ?? "")).map((record) => <div className="insp-card" key={`timeline-${record.id}`}><div className="insp-card-title">{record.timelineOrder ?? "-"} · {record.title}</div><div className="insp-card-meta">{record.timelineDate || "Relative story order"} · {record.episodeIds.map((id) => series.episodes[id]?.title ?? id).join(", ")}</div><p className="insp-card-desc">{record.detail}</p><div className="btn-row"><input aria-label={`${record.title} timeline order`} className="insp-notes-input" type="number" value={record.timelineOrder ?? ""} onChange={(event) => updateContinuity(record.id, { timelineOrder: Number(event.target.value) || undefined })} /><input aria-label={`${record.title} story date`} className="insp-notes-input" type="datetime-local" value={record.timelineDate ?? ""} onChange={(event) => updateContinuity(record.id, { timelineDate: event.target.value })} /></div></div>)}
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
