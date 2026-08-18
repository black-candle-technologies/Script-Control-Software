import { compileAnalysis } from "./analysis.ts";
import {
  documentsForPortableStorage,
  restoreLocalDocumentState,
  syncSeriesDocuments,
  versionsForPortableStorage,
  workspaceForPortableStorage,
  type ProjectSession,
} from "./projectWorkspace.ts";
import { deriveCharacters, deriveScenes, paginateBlocks, type ScreenplayBlock, type ScreenplayDocument } from "./screenplay.ts";

export type SnapshotScope =
  | { kind: "project" }
  | { kind: "episode"; documentId: string }
  | { kind: "season"; seasonId: string }
  | { kind: "show-bible" };

export interface ProjectSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  parentIds: string[];
  branchId?: string;
  /** Missing on older snapshots and therefore treated as project-wide. */
  scope?: SnapshotScope;
  session: ProjectSession;
}

export interface DraftBranch {
  id: string;
  name: string;
  baseSnapshotId: string;
  headSnapshotId: string;
}

export interface Milestone {
  id: string;
  name: string;
  snapshotId: string;
  description: string;
}

export type DraftReviewStatus = "open" | "changes-requested" | "approved" | "applied" | "closed";

/** A writer-facing review request between two immutable Alternate Draft heads. */
export interface DraftReview {
  id: string;
  title: string;
  description: string;
  sourceBranchId: string;
  targetBranchId: string;
  baseSnapshotId: string;
  sourceSnapshotId: string;
  targetSnapshotId: string;
  authorId: string;
  reviewerIds: string[];
  status: DraftReviewStatus;
  createdAt: string;
  updatedAt: string;
  /** Explicit choices for overlapping edits. Missing paths remain unresolved. */
  resolutions: Record<string, MergeResolution>;
  appliedSnapshotId?: string;
}

export interface OpenDraftReviewInput {
  id: string;
  title: string;
  description?: string;
  sourceBranchId: string;
  targetBranchId: string;
  authorId: string;
  reviewerIds?: readonly string[];
  createdAt: string;
}

export interface VersionHistory {
  snapshots: ProjectSnapshot[];
  branches: DraftBranch[];
  milestones: Milestone[];
  draftReviews: DraftReview[];
  activeBranchId: string;
}

export interface SnapshotDetails {
  id: string;
  name: string;
  createdAt: string;
  description?: string;
  parentIds?: readonly string[];
  branchId?: string;
  scope?: SnapshotScope;
}

export type SnapshotDiffMode =
  | "document"
  | "block"
  | "metadata"
  | "page"
  | "scene"
  | "dialogue"
  | "structure"
  | "character"
  | "object"
  | "treatment"
  | "episode"
  | "season"
  | "show-bible";

export interface DocumentChange {
  kind: "added" | "removed" | "modified";
  documentId: string;
  title: string;
  before?: ScreenplayDocument;
  after?: ScreenplayDocument;
}

export interface BlockChange {
  kind: "added" | "removed" | "edited" | "moved";
  documentId: string;
  blockId: string;
  beforeIndex?: number;
  afterIndex?: number;
  before?: ScreenplayBlock;
  after?: ScreenplayBlock;
}

export interface MetadataChange {
  path: string;
  before: unknown;
  after: unknown;
}

export interface SnapshotComparison {
  fromSnapshotId: string;
  toSnapshotId: string;
  mode: SnapshotDiffMode;
  scope: SnapshotScope;
  documentChanges: DocumentChange[];
  blockChanges: BlockChange[];
  metadataChanges: MetadataChange[];
}

export type MergeResolution = "ours" | "theirs";
export interface MergeResolutionPlan {
  default: MergeResolution;
  paths: Record<string, MergeResolution>;
}
export type MergeConflictKind = "value" | "delete-edit" | "add-add" | "order";

export interface MergeConflict {
  path: string;
  kind: MergeConflictKind;
  base: unknown;
  ours: unknown;
  theirs: unknown;
  resolution: MergeResolution;
}

export interface SnapshotMergeResult {
  merged: ProjectSession;
  conflicts: MergeConflict[];
  clean: boolean;
  resolution: MergeResolution;
}

export interface DraftReviewPreview {
  review: DraftReview;
  baseSnapshot: ProjectSnapshot;
  sourceSnapshot: ProjectSnapshot;
  targetSnapshot: ProjectSnapshot;
  sourceHeadSnapshotId: string;
  targetHeadSnapshotId: string;
  comparison: SnapshotComparison;
  mergeResult: SnapshotMergeResult;
  conflicts: MergeConflict[];
  unresolvedConflictPaths: string[];
  sourceOutdated: boolean;
  targetOutdated: boolean;
  outdated: boolean;
  readyToApply: boolean;
}

export function createProjectSnapshot(session: ProjectSession, details: SnapshotDetails): ProjectSnapshot {
  if (!details.id.trim() || !details.name.trim() || !details.createdAt.trim()) throw new Error("Snapshot id, name, and createdAt are required.");
  const scope = details.scope ? validateSnapshotScope(session, details.scope) : undefined;
  const snapshotSession = clone(session);
  // History belongs to the containing project, not to each historical state.
  // Clearing it prevents recursively nested snapshots and keeps portable files small.
  snapshotSession.versionHistory = { snapshots: [], branches: [], milestones: [], draftReviews: [], activeBranchId: "main" };
  snapshotSession.versions = [];
  snapshotSession.projectPath = "";
  snapshotSession.documents = documentsForPortableStorage(snapshotSession.documents);
  snapshotSession.workspace = workspaceForPortableStorage(snapshotSession.workspace);
  return {
    id: details.id,
    name: details.name.trim(),
    description: details.description?.trim() ?? "",
    createdAt: details.createdAt,
    parentIds: [...details.parentIds ?? []],
    branchId: details.branchId,
    ...(scope ? { scope } : {}),
    session: snapshotSession,
  };
}

export function versionHistoryForPortableStorage(history: VersionHistory): VersionHistory {
  return {
    ...clone(history),
    snapshots: history.snapshots.map((snapshot) => ({
      ...clone(snapshot),
      session: {
        ...clone(snapshot.session),
        projectPath: "",
        documents: documentsForPortableStorage(snapshot.session.documents),
        versions: versionsForPortableStorage(snapshot.session.versions),
        workspace: workspaceForPortableStorage(snapshot.session.workspace),
      },
    })),
  };
}

export function restoreProjectSnapshot(snapshot: ProjectSnapshot, current?: ProjectSession): ProjectSession {
  const scope = snapshotScopeOf(snapshot);
  if (scope.kind === "project") {
    const restored = clone(snapshot.session);
    if (current) restored.documents = restoreLocalDocumentState(restored.documents, current.documents);
    return restored;
  }
  if (!current) throw new Error("Restoring an episode, season, or show-bible snapshot requires the current project.");
  if (snapshot.session.projectId !== current.projectId) throw new Error("A scoped snapshot can only be restored into its original project.");
  if (scope.kind === "show-bible") {
    const restored = clone(current);
    restored.workspace.series.showBible = snapshot.session.workspace.series.showBible;
    return restored;
  }
  if (scope.kind === "episode") return restoreEpisodeSnapshot(snapshot.session, current, scope.documentId);
  return restoreSeasonSnapshot(snapshot.session, current, scope.seasonId);
}

/** Older snapshots have no scope field and remain whole-project snapshots. */
export function snapshotScopeOf(snapshot: ProjectSnapshot): SnapshotScope {
  return snapshot.scope ? validateSnapshotScope(snapshot.session, snapshot.scope) : { kind: "project" };
}

function validateSnapshotScope(session: ProjectSession, scope: SnapshotScope): SnapshotScope {
  if (scope.kind === "project") return { kind: "project" };
  if (session.projectType !== "television") throw new Error("Episode, season, and show-bible snapshots require a television project.");
  if (scope.kind === "show-bible") return { kind: "show-bible" };
  if (scope.kind === "episode") {
    const documentId = scope.documentId.trim();
    if (!documentId || !session.documents.some((document) => document.id === documentId) || !session.workspace.series.episodes[documentId]) {
      throw new Error(`Episode '${documentId || scope.documentId}' does not exist in this project.`);
    }
    return { kind: "episode", documentId };
  }
  if (scope.kind === "season") {
    const seasonId = scope.seasonId.trim();
    if (!seasonId || !session.workspace.series.seasons.some((season) => season.id === seasonId)) {
      throw new Error(`Season '${seasonId || scope.seasonId}' does not exist in this project.`);
    }
    return { kind: "season", seasonId };
  }
  throw new Error("Snapshot scope is invalid.");
}

function comparisonScope(from: ProjectSnapshot, to: ProjectSnapshot): SnapshotScope {
  const left = snapshotScopeOf(from);
  const right = snapshotScopeOf(to);
  if (sameScope(left, right)) return left;
  if (left.kind === "project") return right;
  if (right.kind === "project") return left;
  throw new Error("Only snapshots of the same episode, season, or show bible can be compared.");
}

function sameScope(left: SnapshotScope, right: SnapshotScope): boolean {
  return left.kind === right.kind
    && (left.kind !== "episode" || right.kind !== "episode" || left.documentId === right.documentId)
    && (left.kind !== "season" || right.kind !== "season" || left.seasonId === right.seasonId);
}

function documentsForScope(session: ProjectSession, scope: SnapshotScope): ScreenplayDocument[] {
  if (scope.kind === "project") return session.documents;
  if (scope.kind === "show-bible") return [];
  if (scope.kind === "episode") return session.documents.filter((document) => document.id === scope.documentId);
  const ids = new Set(episodeIdsForSeason(session, scope.seasonId));
  return session.documents.filter((document) => document.id && ids.has(document.id));
}

function episodeIdsForSeason(session: ProjectSession, seasonId: string): string[] {
  return session.documents.flatMap((document) => document.id && session.workspace.series.episodes[document.id]?.seasonId === seasonId ? [document.id] : []);
}

function seriesForScope(session: ProjectSession, scope: SnapshotScope): unknown {
  const series = session.workspace.series;
  if (scope.kind === "project") return series;
  if (scope.kind === "show-bible") return { showBible: series.showBible };
  if (scope.kind === "episode") {
    const episode = series.episodes[scope.documentId];
    return { episodes: episode ? { [scope.documentId]: episode } : {} };
  }
  const season = series.seasons.find((item) => item.id === scope.seasonId);
  const episodeIds = new Set(episodeIdsForSeason(session, scope.seasonId));
  const characterNames = seasonCharacterNames(session, episodeIds);
  return {
    seasons: season ? { [scope.seasonId]: season } : {},
    episodes: Object.fromEntries(Object.entries(series.episodes).filter(([, episode]) => episode.seasonId === scope.seasonId)),
    continuity: series.continuity.filter((record) => record.episodeIds.some((id) => episodeIds.has(id))),
    characterArcs: Object.fromEntries(Object.entries(series.characterArcs).filter(([name]) => characterNames.has(name))),
  };
}

function seasonCharacterNames(session: ProjectSession, episodeIds: ReadonlySet<string>): Set<string> {
  return new Set(session.documents
    .filter((document) => document.id && episodeIds.has(document.id))
    .flatMap((document) => deriveCharacters(document.blocks).map((character) => character.name)));
}

function restoreEpisodeSnapshot(source: ProjectSession, current: ProjectSession, documentId: string): ProjectSession {
  const document = source.documents.find((item) => item.id === documentId);
  const episode = source.workspace.series.episodes[documentId];
  if (!document || !episode) throw new Error(`Episode '${documentId}' is missing from its snapshot.`);
  if (!current.workspace.series.seasons.some((season) => season.id === episode.seasonId)) {
    throw new Error(`Season '${episode.seasonId}' must be restored before episode '${documentId}'.`);
  }
  const restored = clone(current);
  const index = restored.documents.findIndex((item) => item.id === documentId);
  if (index < 0) restored.documents.push(clone(document));
  else restored.documents[index] = clone(document);
  restored.workspace.series.episodes[documentId] = clone(episode);
  syncSeriesDocuments(restored.workspace.series, restored.documents);
  restored.documents = restoreLocalDocumentState(restored.documents, current.documents);
  restored.activeDocumentId = documentId;
  return restored;
}

function restoreSeasonSnapshot(source: ProjectSession, current: ProjectSession, seasonId: string): ProjectSession {
  const season = source.workspace.series.seasons.find((item) => item.id === seasonId);
  if (!season) throw new Error(`Season '${seasonId}' is missing from its snapshot.`);
  const sourceIds = episodeIdsForSeason(source, seasonId);
  const sourceIdSet = new Set(sourceIds);
  const sourceDocuments = source.documents.filter((document) => document.id && sourceIdSet.has(document.id));
  const restored = clone(current);
  const currentIds = episodeIdsForSeason(restored, seasonId);
  const affectedIds = new Set([...currentIds, ...sourceIds]);
  const firstAffected = restored.documents.findIndex((document) => document.id && affectedIds.has(document.id));
  const remaining = restored.documents.filter((document) => !document.id || !affectedIds.has(document.id));
  remaining.splice(firstAffected < 0 ? remaining.length : Math.min(firstAffected, remaining.length), 0, ...clone(sourceDocuments));
  restored.documents = remaining;
  for (const id of affectedIds) delete restored.workspace.series.episodes[id];
  for (const id of sourceIds) {
    const episode = source.workspace.series.episodes[id];
    if (!episode) throw new Error(`Episode '${id}' is missing season metadata in its snapshot.`);
    restored.workspace.series.episodes[id] = clone(episode);
  }
  const seasonIndex = restored.workspace.series.seasons.findIndex((item) => item.id === seasonId);
  const restoredSeason = { ...clone(season), episodeIds: [...sourceIds] };
  if (seasonIndex < 0) restored.workspace.series.seasons.push(restoredSeason);
  else restored.workspace.series.seasons[seasonIndex] = restoredSeason;
  restored.workspace.series.seasons.sort((left, right) => left.number - right.number || left.id.localeCompare(right.id));
  const sourceContinuity = source.workspace.series.continuity.filter((record) => record.episodeIds.some((id) => sourceIdSet.has(id)));
  const affectedContinuityIds = new Set(sourceContinuity.map((record) => record.id));
  restored.workspace.series.continuity = [
    ...restored.workspace.series.continuity.filter((record) => !affectedContinuityIds.has(record.id) && !record.episodeIds.some((id) => affectedIds.has(id))),
    ...clone(sourceContinuity),
  ];
  const affectedCharacterNames = new Set([
    ...seasonCharacterNames(source, sourceIdSet),
    ...seasonCharacterNames(current, new Set(currentIds)),
  ]);
  for (const name of affectedCharacterNames) delete restored.workspace.series.characterArcs[name];
  for (const [name, arc] of Object.entries(source.workspace.series.characterArcs)) {
    if (affectedCharacterNames.has(name)) restored.workspace.series.characterArcs[name] = arc;
  }
  syncSeriesDocuments(restored.workspace.series, restored.documents);
  restored.documents = restoreLocalDocumentState(restored.documents, current.documents);
  if (!restored.documents.some((document) => document.id === restored.activeDocumentId)) {
    restored.activeDocumentId = sourceIds[0] ?? restored.documents[0]?.id ?? "";
  }
  return restored;
}

export function createVersionHistory(initial: ProjectSnapshot, branch = { id: "main", name: "Main Draft" }): VersionHistory {
  if (!branch.id.trim() || !branch.name.trim()) throw new Error("Branch id and name are required.");
  if (snapshotScopeOf(initial).kind !== "project") throw new Error("Project History must begin with a project-wide snapshot.");
  const snapshot = clone(initial);
  snapshot.branchId ||= branch.id;
  return {
    snapshots: [snapshot],
    branches: [{ id: branch.id, name: branch.name.trim(), baseSnapshotId: snapshot.id, headSnapshotId: snapshot.id }],
    milestones: [],
    draftReviews: [],
    activeBranchId: branch.id,
  };
}

export function saveSnapshot(history: VersionHistory, snapshot: ProjectSnapshot, branchId = snapshot.branchId ?? history.activeBranchId): VersionHistory {
  if (history.snapshots.some((item) => item.id === snapshot.id)) throw new Error(`Snapshot '${snapshot.id}' already exists.`);
  const branch = history.branches.find((item) => item.id === branchId);
  if (!branch) throw new Error(`Branch '${branchId}' does not exist.`);
  const next = clone(history);
  const saved = clone(snapshot);
  saved.branchId = branchId;
  const scope = snapshotScopeOf(saved);
  if (!saved.parentIds.length) {
    if (scope.kind === "project") saved.parentIds = [branch.headSnapshotId];
    else {
      const previous = [...next.snapshots].reverse().find((item) => item.branchId === branchId && sameScope(snapshotScopeOf(item), scope));
      saved.parentIds = previous ? [previous.id] : [];
    }
  }
  next.snapshots.push(saved);
  if (scope.kind === "project") next.branches.find((item) => item.id === branchId)!.headSnapshotId = saved.id;
  next.activeBranchId = branchId;
  return next;
}

export function createAlternateDraft(history: VersionHistory, branch: { id: string; name: string; fromSnapshotId: string }): VersionHistory {
  if (!branch.id.trim() || !branch.name.trim()) throw new Error("Branch id and name are required.");
  if (history.branches.some((item) => item.id === branch.id)) throw new Error(`Branch '${branch.id}' already exists.`);
  const source = history.snapshots.find((item) => item.id === branch.fromSnapshotId);
  if (!source) throw new Error(`Snapshot '${branch.fromSnapshotId}' does not exist.`);
  if (snapshotScopeOf(source).kind !== "project") throw new Error("Alternate Drafts must branch from a project-wide snapshot.");
  const next = clone(history);
  next.branches.push({ id: branch.id, name: branch.name.trim(), baseSnapshotId: branch.fromSnapshotId, headSnapshotId: branch.fromSnapshotId });
  next.activeBranchId = branch.id;
  return next;
}

export function findCommonSnapshot(snapshots: readonly ProjectSnapshot[], leftId: string, rightId: string): ProjectSnapshot | undefined {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const leftAncestors = new Set<string>();
  const leftQueue = [leftId];
  while (leftQueue.length) {
    const id = leftQueue.shift()!;
    if (leftAncestors.has(id)) continue;
    leftAncestors.add(id);
    leftQueue.push(...(byId.get(id)?.parentIds ?? []));
  }
  const rightQueue = [rightId];
  const seen = new Set<string>();
  while (rightQueue.length) {
    const id = rightQueue.shift()!;
    if (leftAncestors.has(id)) return byId.get(id);
    if (seen.has(id)) continue;
    seen.add(id);
    rightQueue.push(...(byId.get(id)?.parentIds ?? []));
  }
  return undefined;
}

export function openDraftReview(history: VersionHistory, input: OpenDraftReviewInput): VersionHistory {
  const id = requiredDraftReviewValue(input.id, "Draft Review id");
  const title = requiredDraftReviewValue(input.title, "Draft Review title");
  const sourceBranchId = requiredDraftReviewValue(input.sourceBranchId, "Source draft id");
  const targetBranchId = requiredDraftReviewValue(input.targetBranchId, "Target draft id");
  const authorId = requiredDraftReviewValue(input.authorId, "Draft Review author id");
  const createdAt = requiredDraftReviewValue(input.createdAt, "Draft Review timestamp");
  if (history.draftReviews.some((review) => review.id === id)) throw new Error(`Draft Review '${id}' already exists.`);
  if (sourceBranchId === targetBranchId) throw new Error("A Draft Review requires different source and target drafts.");
  const source = draftReviewBranch(history, sourceBranchId);
  const target = draftReviewBranch(history, targetBranchId);
  const base = findCommonSnapshot(history.snapshots, source.headSnapshotId, target.headSnapshotId);
  if (!base) throw new Error("The source and target drafts do not share a project baseline.");
  draftReviewProjectSnapshot(history, base.id, "Draft Review baseline");
  draftReviewProjectSnapshot(history, source.headSnapshotId, "Source draft head");
  draftReviewProjectSnapshot(history, target.headSnapshotId, "Target draft head");
  const review: DraftReview = {
    id,
    title,
    description: input.description?.trim() ?? "",
    sourceBranchId,
    targetBranchId,
    baseSnapshotId: base.id,
    sourceSnapshotId: source.headSnapshotId,
    targetSnapshotId: target.headSnapshotId,
    authorId,
    reviewerIds: uniqueNonempty(input.reviewerIds ?? []),
    status: "open",
    createdAt,
    updatedAt: createdAt,
    resolutions: {},
  };
  const next = clone(history);
  next.draftReviews.push(review);
  return next;
}

export function refreshDraftReview(history: VersionHistory, reviewId: string, updatedAt: string): VersionHistory {
  const review = draftReview(history, reviewId);
  const refreshedAt = requiredDraftReviewValue(updatedAt, "Draft Review timestamp");
  if (review.status === "applied" || review.status === "closed") throw new Error(`A ${review.status} Draft Review cannot be refreshed.`);
  const source = draftReviewBranch(history, review.sourceBranchId);
  const target = draftReviewBranch(history, review.targetBranchId);
  const base = findCommonSnapshot(history.snapshots, source.headSnapshotId, target.headSnapshotId);
  if (!base) throw new Error("The source and target drafts do not share a project baseline.");
  draftReviewProjectSnapshot(history, base.id, "Draft Review baseline");
  draftReviewProjectSnapshot(history, source.headSnapshotId, "Source draft head");
  draftReviewProjectSnapshot(history, target.headSnapshotId, "Target draft head");
  if (review.sourceSnapshotId === source.headSnapshotId && review.targetSnapshotId === target.headSnapshotId && review.baseSnapshotId === base.id) return clone(history);
  return replaceDraftReview(history, {
    ...review,
    baseSnapshotId: base.id,
    sourceSnapshotId: source.headSnapshotId,
    targetSnapshotId: target.headSnapshotId,
    status: "open",
    updatedAt: refreshedAt,
    resolutions: {},
    appliedSnapshotId: undefined,
  });
}

export function updateDraftReviewStatus(history: VersionHistory, reviewId: string, status: Exclude<DraftReviewStatus, "applied">, updatedAt: string): VersionHistory {
  const review = draftReview(history, reviewId);
  if (review.status === "applied") throw new Error("An applied Draft Review is final.");
  if (review.status === "closed" && status !== "open" && status !== "closed") throw new Error("Reopen a closed Draft Review before changing its status.");
  return replaceDraftReview(history, { ...review, status, updatedAt: requiredDraftReviewValue(updatedAt, "Draft Review timestamp") });
}

export function draftReviewPreview(history: VersionHistory, reviewId: string, mode: SnapshotDiffMode = "scene"): DraftReviewPreview {
  const review = draftReview(history, reviewId);
  const sourceBranch = draftReviewBranch(history, review.sourceBranchId);
  const targetBranch = draftReviewBranch(history, review.targetBranchId);
  const baseSnapshot = draftReviewProjectSnapshot(history, review.baseSnapshotId, "Draft Review baseline");
  const sourceSnapshot = draftReviewProjectSnapshot(history, review.sourceSnapshotId, "Source draft version");
  const targetSnapshot = draftReviewProjectSnapshot(history, review.targetSnapshotId, "Target draft version");
  const mergeResult = mergeSnapshots(baseSnapshot, targetSnapshot, sourceSnapshot, { default: "ours", paths: review.resolutions });
  const unresolvedConflictPaths = mergeResult.conflicts
    .map((conflict) => conflict.path)
    .filter((path) => !Object.prototype.hasOwnProperty.call(review.resolutions, path));
  const sourceOutdated = sourceBranch.headSnapshotId !== review.sourceSnapshotId;
  const targetOutdated = targetBranch.headSnapshotId !== review.targetSnapshotId;
  const outdated = sourceOutdated || targetOutdated;
  return {
    review: clone(review),
    baseSnapshot,
    sourceSnapshot,
    targetSnapshot,
    sourceHeadSnapshotId: sourceBranch.headSnapshotId,
    targetHeadSnapshotId: targetBranch.headSnapshotId,
    comparison: compareSnapshots(baseSnapshot, sourceSnapshot, mode),
    mergeResult,
    conflicts: mergeResult.conflicts,
    unresolvedConflictPaths,
    sourceOutdated,
    targetOutdated,
    outdated,
    readyToApply: review.status === "approved" && !outdated && unresolvedConflictPaths.length === 0,
  };
}

export function setDraftReviewResolution(
  history: VersionHistory,
  reviewId: string,
  path: string,
  resolution: MergeResolution | null,
  updatedAt: string,
): VersionHistory {
  const review = draftReview(history, reviewId);
  if (review.status === "applied" || review.status === "closed") throw new Error(`A ${review.status} Draft Review cannot be changed.`);
  const preview = draftReviewPreview(history, review.id);
  if (preview.outdated) throw new Error("Refresh this Draft Review before resolving overlapping edits.");
  const conflictPath = requiredDraftReviewValue(path, "Overlapping edit path");
  if (!preview.conflicts.some((conflict) => conflict.path === conflictPath)) throw new Error(`Draft Review conflict '${conflictPath}' does not exist.`);
  const resolutions = { ...review.resolutions };
  if (resolution === null) delete resolutions[conflictPath];
  else resolutions[conflictPath] = resolution;
  return replaceDraftReview(history, {
    ...review,
    resolutions,
    status: review.status === "approved" ? "open" : review.status,
    updatedAt: requiredDraftReviewValue(updatedAt, "Draft Review timestamp"),
  });
}

export function markDraftReviewApplied(history: VersionHistory, reviewId: string, appliedSnapshotId: string, updatedAt: string): VersionHistory {
  const review = draftReview(history, reviewId);
  if (review.status !== "approved") throw new Error("Approve the Draft Review before applying it.");
  const source = draftReviewBranch(history, review.sourceBranchId);
  const target = draftReviewBranch(history, review.targetBranchId);
  const applied = draftReviewProjectSnapshot(history, requiredDraftReviewValue(appliedSnapshotId, "Applied snapshot id"), "Applied draft version");
  const preview = draftReviewPreview(history, review.id);
  if (source.headSnapshotId !== review.sourceSnapshotId) throw new Error("Refresh this Draft Review before applying it.");
  if (preview.unresolvedConflictPaths.length) throw new Error("Resolve every overlapping edit before applying this Draft Review.");
  if (target.headSnapshotId !== applied.id || applied.branchId !== target.id) throw new Error("The applied version must be the target draft head.");
  if (!applied.parentIds.includes(review.targetSnapshotId) || !applied.parentIds.includes(review.sourceSnapshotId)) {
    throw new Error("The applied version must join the reviewed source and target versions.");
  }
  return replaceDraftReview(history, {
    ...review,
    status: "applied",
    appliedSnapshotId: applied.id,
    updatedAt: requiredDraftReviewValue(updatedAt, "Draft Review timestamp"),
  });
}

export function addMilestone(history: VersionHistory, milestone: Milestone): VersionHistory {
  if (!milestone.id.trim() || !milestone.name.trim()) throw new Error("Milestone id and name are required.");
  if (history.milestones.some((item) => item.id === milestone.id)) throw new Error(`Milestone '${milestone.id}' already exists.`);
  if (!history.snapshots.some((item) => item.id === milestone.snapshotId)) throw new Error(`Snapshot '${milestone.snapshotId}' does not exist.`);
  const next = clone(history);
  next.milestones.push(clone(milestone));
  return next;
}

export function compareSnapshots(from: ProjectSnapshot, to: ProjectSnapshot, mode: SnapshotDiffMode): SnapshotComparison {
  const scope = comparisonScope(from, to);
  const beforeDocuments = documentsForScope(from.session, scope);
  const afterDocuments = documentsForScope(to.session, scope);
  const comparison: SnapshotComparison = {
    fromSnapshotId: from.id,
    toSnapshotId: to.id,
    mode,
    scope,
    documentChanges: [],
    blockChanges: [],
    metadataChanges: [],
  };
  if (mode === "document") comparison.documentChanges = compareDocuments(beforeDocuments, afterDocuments);
  else if (mode === "block") comparison.blockChanges = compareBlocks(beforeDocuments, afterDocuments);
  else if (mode === "dialogue") comparison.blockChanges = compareBlocks(beforeDocuments, afterDocuments).filter((change) => {
    const type = change.after?.type ?? change.before?.type;
    return type === "character" || type === "dialogue" || type === "parenthetical";
  });
  else if (mode === "metadata") diffMetadata(metadataView(from.session, scope), metadataView(to.session, scope), "", comparison.metadataChanges);
  else diffMetadata(semanticView(from.session, mode, scope), semanticView(to.session, mode, scope), "", comparison.metadataChanges);
  return comparison;
}

function semanticView(session: ProjectSession, mode: Exclude<SnapshotDiffMode, "document" | "block" | "metadata" | "dialogue">, scope: SnapshotScope): unknown {
  if (mode === "show-bible") return scope.kind === "episode" || scope.kind === "season" ? {} : { showBible: session.workspace.series.showBible };
  if (mode === "season") return seriesForScope(session, scope);
  return Object.fromEntries(documentsForScope(session, scope).map((document, index) => {
    const id = documentId(document, index);
    if (mode === "page") return [id, paginateBlocks(document.blocks).map((page, pageIndex) => ({ page: pageIndex + 1, blocks: page.map((block) => ({ id: block.id, type: block.type, text: block.text })) }))];
    if (mode === "scene") return [id, deriveScenes(document.blocks).map((scene) => ({
      id: scene.id,
      number: scene.sceneNumber ?? scene.number,
      heading: scene.heading,
      characters: scene.characters,
      summary: document.workspace?.sceneMeta?.[scene.id]?.summary ?? "",
      notes: document.sceneNotes[scene.id] ?? "",
    }))];
    if (mode === "structure") return [id, document.workspace?.storyStructure ?? null];
    if (mode === "treatment") return [id, document.workspace?.treatments ?? document.workspace?.treatment ?? ""];
    const analysis = compileAnalysis(document, {
      entityOverrides: document.workspace?.entityOverrides,
      storyStructure: document.workspace?.storyStructure,
      plotThreads: document.workspace?.plotThreads,
      resolvedBeatIds: document.workspace?.resolvedBeatIds,
    });
    if (mode === "character") return [id, analysis.entities.characters.map(({ dialogueLines, appearances, coAppearances, ...profile }) => ({ ...profile, dialogueLineIds: dialogueLines.map((line) => line.blockId), appearances, coAppearances }))];
    if (mode === "object") return [id, analysis.entities.objects];
    return [id, { title: analysis.episode.title, episode: analysis.episode, plotThreads: analysis.plotThreads, metadata: session.workspace.series.episodes[id] }];
  }));
}

export function mergeSnapshots(base: ProjectSnapshot, ours: ProjectSnapshot, theirs: ProjectSnapshot, resolution: MergeResolution | MergeResolutionPlan = "ours"): SnapshotMergeResult {
  if ([base, ours, theirs].some((snapshot) => snapshotScopeOf(snapshot).kind !== "project")) {
    throw new Error("Alternate Drafts can only combine project-wide snapshots.");
  }
  const plan = typeof resolution === "string" ? { default: resolution, paths: {} } : resolution;
  const context: MergeContext = { conflicts: [], resolution: plan.default, resolutions: plan.paths };
  const baseMetadata = withoutKey(base.session, "documents");
  const oursMetadata = withoutKey(ours.session, "documents");
  const theirsMetadata = withoutKey(theirs.session, "documents");
  const metadata = mergeValue(baseMetadata, oursMetadata, theirsMetadata, "", context);
  const merged = {
    ...(metadata === MISSING ? {} : metadata as Omit<ProjectSession, "documents">),
    documents: mergeDocuments(base.session.documents, ours.session.documents, theirs.session.documents, context),
  } as ProjectSession;
  return { merged, conflicts: context.conflicts, clean: context.conflicts.length === 0, resolution: plan.default };
}

function compareDocuments(before: ScreenplayDocument[], after: ScreenplayDocument[]): DocumentChange[] {
  const left = documentsById(before);
  const right = documentsById(after);
  const changes: DocumentChange[] = [];
  for (const id of uniqueSorted([...left.keys(), ...right.keys()])) {
    const from = left.get(id)?.value;
    const to = right.get(id)?.value;
    if (!from && to) changes.push({ kind: "added", documentId: id, title: documentTitle(to), after: clone(to) });
    else if (from && !to) changes.push({ kind: "removed", documentId: id, title: documentTitle(from), before: clone(from) });
    else if (from && to && !equal(from, to)) changes.push({ kind: "modified", documentId: id, title: documentTitle(to), before: clone(from), after: clone(to) });
  }
  return changes;
}

function compareBlocks(before: ScreenplayDocument[], after: ScreenplayDocument[]): BlockChange[] {
  const changes: BlockChange[] = [];
  const left = documentsById(before);
  const right = documentsById(after);
  for (const documentId of uniqueSorted([...left.keys(), ...right.keys()])) {
    const from = left.get(documentId)?.value;
    const to = right.get(documentId)?.value;
    if (!from || !to) {
      const document = from ?? to!;
      document.blocks.forEach((block, index) => changes.push({
        kind: from ? "removed" : "added",
        documentId,
        blockId: block.id,
        beforeIndex: from ? index : undefined,
        afterIndex: to ? index : undefined,
        before: from ? clone(block) : undefined,
        after: to ? clone(block) : undefined,
      }));
      continue;
    }
    const fromBlocks = valuesById(from.blocks);
    const toBlocks = valuesById(to.blocks);
    const commonIds = from.blocks.map((block, index) => valueId(block, index)).filter((id) => toBlocks.has(id));
    const afterCommonIds = to.blocks.map((block, index) => valueId(block, index)).filter((id) => fromBlocks.has(id));
    for (const blockId of uniqueSorted([...fromBlocks.keys(), ...toBlocks.keys()])) {
      const oldBlock = fromBlocks.get(blockId);
      const newBlock = toBlocks.get(blockId);
      if (!oldBlock && newBlock) changes.push({ kind: "added", documentId, blockId, afterIndex: newBlock.index, after: clone(newBlock.value) });
      else if (oldBlock && !newBlock) changes.push({ kind: "removed", documentId, blockId, beforeIndex: oldBlock.index, before: clone(oldBlock.value) });
      else if (oldBlock && newBlock) {
        if (!equal(oldBlock.value, newBlock.value)) changes.push({ kind: "edited", documentId, blockId, beforeIndex: oldBlock.index, afterIndex: newBlock.index, before: clone(oldBlock.value), after: clone(newBlock.value) });
        if (commonIds.indexOf(blockId) !== afterCommonIds.indexOf(blockId)) changes.push({ kind: "moved", documentId, blockId, beforeIndex: oldBlock.index, afterIndex: newBlock.index, before: clone(oldBlock.value), after: clone(newBlock.value) });
      }
    }
  }
  const kindOrder: Record<BlockChange["kind"], number> = { removed: 0, added: 1, moved: 2, edited: 3 };
  return changes.sort((a, b) => a.documentId.localeCompare(b.documentId)
    || Math.min(a.beforeIndex ?? Number.MAX_SAFE_INTEGER, a.afterIndex ?? Number.MAX_SAFE_INTEGER) - Math.min(b.beforeIndex ?? Number.MAX_SAFE_INTEGER, b.afterIndex ?? Number.MAX_SAFE_INTEGER)
    || kindOrder[a.kind] - kindOrder[b.kind]
    || a.blockId.localeCompare(b.blockId));
}

function metadataView(session: ProjectSession, scope: SnapshotScope): unknown {
  if (scope.kind !== "project") {
    return {
      workspace: { series: seriesForScope(session, scope) },
      documents: Object.fromEntries(documentsForScope(session, scope).map((document, index) => [
        documentId(document, index),
        withoutKey(document, "blocks"),
      ])),
    };
  }
  const { documents, versions, ...project } = session;
  return {
    ...project,
    versions: versions.map((version) => ({ ...withoutKey(version, "document"), document: withoutKey(version.document, "blocks") })),
    documents: Object.fromEntries([...documentsById(documents)].sort(([a], [b]) => a.localeCompare(b)).map(([id, entry]) => {
      return [id, withoutKey(entry.value, "blocks")];
    })),
  };
}

function diffMetadata(before: unknown, after: unknown, path: string, changes: MetadataChange[]) {
  if (equal(before, after)) return;
  if (isRecord(before) && isRecord(after)) {
    for (const key of uniqueSorted([...Object.keys(before), ...Object.keys(after)])) {
      diffMetadata(Object.prototype.hasOwnProperty.call(before, key) ? before[key] : MISSING, Object.prototype.hasOwnProperty.call(after, key) ? after[key] : MISSING, childPath(path, key), changes);
    }
  } else if (Array.isArray(before) && Array.isArray(after)) {
    for (let index = 0; index < Math.max(before.length, after.length); index++) diffMetadata(index < before.length ? before[index] : MISSING, index < after.length ? after[index] : MISSING, childPath(path, String(index)), changes);
  } else changes.push({ path: path || "/", before: conflictValue(before), after: conflictValue(after) });
}

interface MergeContext {
  conflicts: MergeConflict[];
  resolution: MergeResolution;
  resolutions: Record<string, MergeResolution>;
}

const MISSING = Symbol("missing");
type MaybeValue = unknown | typeof MISSING;

function mergeDocuments(base: ScreenplayDocument[], ours: ScreenplayDocument[], theirs: ScreenplayDocument[], context: MergeContext): ScreenplayDocument[] {
  const baseMap = documentsById(base);
  const oursMap = documentsById(ours);
  const theirsMap = documentsById(theirs);
  const merged = new Map<string, ScreenplayDocument>();
  for (const id of uniqueSorted([...baseMap.keys(), ...oursMap.keys(), ...theirsMap.keys()])) {
    const ancestor = baseMap.get(id)?.value;
    const ourDocument = oursMap.get(id)?.value;
    const theirDocument = theirsMap.get(id)?.value;
    let value: MaybeValue;
    if (ancestor && ourDocument && theirDocument) value = mergeDocument(ancestor, ourDocument, theirDocument, childPath("/documents", id), context);
    else value = mergeValue(ancestor ?? MISSING, ourDocument ?? MISSING, theirDocument ?? MISSING, childPath("/documents", id), context);
    if (value !== MISSING) merged.set(id, value as ScreenplayDocument);
  }
  const order = mergeOrder(base.map((document, index) => documentId(document, index)), ours.map((document, index) => documentId(document, index)), theirs.map((document, index) => documentId(document, index)), new Set(merged.keys()), "/documents/order", context);
  return order.map((id) => merged.get(id)!).filter(Boolean);
}

function mergeDocument(base: ScreenplayDocument, ours: ScreenplayDocument, theirs: ScreenplayDocument, path: string, context: MergeContext): ScreenplayDocument {
  const metadata = mergeValue(withoutKey(base, "blocks"), withoutKey(ours, "blocks"), withoutKey(theirs, "blocks"), path, context);
  return {
    ...(metadata === MISSING ? {} : metadata as Omit<ScreenplayDocument, "blocks">),
    blocks: mergeBlocks(base.blocks, ours.blocks, theirs.blocks, `${path}/blocks`, context),
  } as ScreenplayDocument;
}

function mergeBlocks(base: ScreenplayBlock[], ours: ScreenplayBlock[], theirs: ScreenplayBlock[], path: string, context: MergeContext): ScreenplayBlock[] {
  const baseMap = valuesById(base);
  const oursMap = valuesById(ours);
  const theirsMap = valuesById(theirs);
  const merged = new Map<string, ScreenplayBlock>();
  for (const id of uniqueSorted([...baseMap.keys(), ...oursMap.keys(), ...theirsMap.keys()])) {
    const value = mergeValue(baseMap.get(id)?.value ?? MISSING, oursMap.get(id)?.value ?? MISSING, theirsMap.get(id)?.value ?? MISSING, childPath(path, id), context);
    if (value !== MISSING) merged.set(id, value as ScreenplayBlock);
  }
  const order = mergeOrder(base.map(valueId), ours.map(valueId), theirs.map(valueId), new Set(merged.keys()), `${path}/order`, context);
  return order.map((id) => merged.get(id)!).filter(Boolean);
}

function mergeOrder(base: string[], ours: string[], theirs: string[], valid: Set<string>, path: string, context: MergeContext): string[] {
  const shared = base.filter((id) => ours.includes(id) && theirs.includes(id) && valid.has(id));
  const baseOrder = base.filter((id) => shared.includes(id));
  const ourOrder = ours.filter((id) => shared.includes(id));
  const theirOrder = theirs.filter((id) => shared.includes(id));
  let preferred: string[];
  if (equal(ourOrder, theirOrder)) preferred = ours;
  else if (equal(ourOrder, baseOrder)) preferred = theirs;
  else if (equal(theirOrder, baseOrder)) preferred = ours;
  else {
    const resolution = resolutionFor(path, context);
    context.conflicts.push({ path, kind: "order", base: clone(base), ours: clone(ours), theirs: clone(theirs), resolution });
    preferred = resolution === "ours" ? ours : theirs;
  }
  const secondary = preferred === ours ? theirs : ours;
  return [...preferred, ...secondary, ...base].filter((id, index, all) => valid.has(id) && all.indexOf(id) === index);
}

function mergeValue(base: MaybeValue, ours: MaybeValue, theirs: MaybeValue, path: string, context: MergeContext): MaybeValue {
  if (same(ours, theirs)) return cloneMaybe(ours);
  if (same(ours, base)) return cloneMaybe(theirs);
  if (same(theirs, base)) return cloneMaybe(ours);
  const baseItems = base === MISSING ? [] : idRecordArray(base);
  const ourItems = idRecordArray(ours);
  const theirItems = idRecordArray(theirs);
  if (baseItems && ourItems && theirItems) return mergeIdRecordArrays(baseItems, ourItems, theirItems, path, context);
  if (isRecordMaybe(ours) && isRecordMaybe(theirs) && (base === MISSING || isRecordMaybe(base))) {
    const ancestor = base === MISSING ? {} : base;
    const result: Record<string, unknown> = {};
    for (const key of uniqueSorted([...Object.keys(ancestor), ...Object.keys(ours), ...Object.keys(theirs)])) {
      const value = mergeValue(property(ancestor, key), property(ours, key), property(theirs, key), childPath(path, key), context);
      if (value !== MISSING) result[key] = value;
    }
    return result;
  }
  const kind: MergeConflictKind = base === MISSING ? "add-add" : ours === MISSING || theirs === MISSING ? "delete-edit" : "value";
  const conflictPath = path || "/";
  const resolution = resolutionFor(conflictPath, context);
  context.conflicts.push({ path: conflictPath, kind, base: conflictValue(base), ours: conflictValue(ours), theirs: conflictValue(theirs), resolution });
  return cloneMaybe(resolution === "ours" ? ours : theirs);
}

function resolutionFor(path: string, context: MergeContext): MergeResolution {
  return context.resolutions[path] ?? context.resolution;
}

type IdRecord = Record<string, unknown> & { id: string };

function mergeIdRecordArrays(base: IdRecord[], ours: IdRecord[], theirs: IdRecord[], path: string, context: MergeContext): IdRecord[] {
  const baseMap = idRecordsById(base);
  const oursMap = idRecordsById(ours);
  const theirsMap = idRecordsById(theirs);
  const merged = new Map<string, IdRecord>();
  for (const id of uniqueSorted([...baseMap.keys(), ...oursMap.keys(), ...theirsMap.keys()])) {
    const value = mergeValue(baseMap.get(id) ?? MISSING, oursMap.get(id) ?? MISSING, theirsMap.get(id) ?? MISSING, childPath(path, id), context);
    if (value !== MISSING) merged.set(id, value as IdRecord);
  }
  const order = mergeOrder(base.map(recordId), ours.map(recordId), theirs.map(recordId), new Set(merged.keys()), `${path}/order`, context);
  return order.map((id) => merged.get(id)!).filter(Boolean);
}

function idRecordArray(value: MaybeValue): IdRecord[] | undefined {
  if (value === MISSING || !Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id.trim())) return undefined;
    ids.add(item.id.trim());
  }
  return value as IdRecord[];
}

function idRecordsById(values: IdRecord[]): Map<string, IdRecord> {
  return new Map(values.map((value) => [recordId(value), value]));
}

function recordId(value: IdRecord): string {
  return value.id.trim();
}

function documentsById(documents: ScreenplayDocument[]) {
  return new Map(documents.map((document, index) => [documentId(document, index), { value: document, index }]));
}

function valuesById<T extends { id: string }>(values: T[]) {
  return new Map(values.map((value, index) => [valueId(value, index), { value, index }]));
}

function documentId(document: ScreenplayDocument, index: number) {
  return document.id?.trim() || `@document-${index + 1}`;
}

function valueId(value: { id: string }, index: number) {
  return value.id?.trim() || `@item-${index + 1}`;
}

function documentTitle(document: ScreenplayDocument) {
  return document.title ?? (document.titlePage.title || "Untitled Script");
}

function withoutKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const result = { ...value };
  delete result[key];
  return result;
}

function childPath(path: string, key: string) {
  return `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`;
}

function property(value: Record<string, unknown>, key: string): MaybeValue {
  return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : MISSING;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordMaybe(value: MaybeValue): value is Record<string, unknown> {
  return value !== MISSING && isRecord(value);
}

function same(left: MaybeValue, right: MaybeValue) {
  return left === MISSING || right === MISSING ? left === right : equal(left, right);
}

function equal(left: unknown, right: unknown) {
  return stable(left) === stable(right);
}

function stable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

function cloneMaybe(value: MaybeValue): MaybeValue {
  return value === MISSING ? MISSING : clone(value);
}

function conflictValue(value: MaybeValue): unknown {
  return value === MISSING ? { missing: true } : clone(value);
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function uniqueNonempty(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function requiredDraftReviewValue(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function draftReview(history: VersionHistory, reviewId: string): DraftReview {
  const id = requiredDraftReviewValue(reviewId, "Draft Review id");
  const review = history.draftReviews.find((item) => item.id === id);
  if (!review) throw new Error(`Draft Review '${id}' does not exist.`);
  return review;
}

function draftReviewBranch(history: VersionHistory, branchId: string): DraftBranch {
  const branch = history.branches.find((item) => item.id === branchId);
  if (!branch) throw new Error(`Draft '${branchId}' does not exist.`);
  return branch;
}

function draftReviewProjectSnapshot(history: VersionHistory, snapshotId: string, label: string): ProjectSnapshot {
  const snapshot = history.snapshots.find((item) => item.id === snapshotId);
  if (!snapshot) throw new Error(`${label} '${snapshotId}' does not exist.`);
  if (snapshotScopeOf(snapshot).kind !== "project") throw new Error(`${label} must be a whole-project version.`);
  return snapshot;
}

function replaceDraftReview(history: VersionHistory, review: DraftReview): VersionHistory {
  const next = clone(history);
  next.draftReviews = next.draftReviews.map((item) => item.id === review.id ? clone(review) : item);
  return next;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

/** Compatibility names retained for the original public domain vocabulary. */
export type Snapshot = ProjectSnapshot;
export type Branch = DraftBranch;
export type ProjectHistory = VersionHistory;

export interface Commit {
  id: string;
  parentIds: string[];
  createdAt: string;
  message: string;
}

export interface SceneChangeSummary {
  sceneId: string;
  changeKind: "added" | "removed" | "moved" | "edited";
  summary: string;
}

export interface Diff {
  fromCommitId: string;
  toCommitId: string;
  sceneChanges: SceneChangeSummary[];
}
