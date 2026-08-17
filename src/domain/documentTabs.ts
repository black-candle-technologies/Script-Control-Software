import type { ProjectSession } from "./projectWorkspace.ts";
import { syncSeriesDocuments } from "./projectWorkspace.ts";
import type { ScreenplayDocument } from "./screenplay.ts";
import type { AcknowledgedInternalTransfer } from "./crossWindowDrag.ts";

/** View-only state for one script in one native window. Never persist this in a project file. */
export interface DocumentViewState {
  documentId: string;
  activeBlockId?: string;
  sourceMode: boolean;
  sourceSelection?: { start: number; end: number };
  editorScrollTop: number;
}

/** Open tabs are window-local views; closing one does not delete its screenplay. */
export interface DocumentTabState {
  schemaVersion: 1;
  openDocumentIds: string[];
  activeDocumentId?: string;
  recentlyClosedDocumentIds: string[];
  views: Record<string, DocumentViewState>;
}

export interface DocumentDependencySummary {
  reviewIds: string[];
  writerRoomTaskIds: string[];
  continuityIds: string[];
  legacyVersionIds: string[];
  seasonIds: string[];
}

export interface DocumentRemovalPlan {
  documentId: string;
  title: string;
  allowed: boolean;
  reason?: "permission" | "last-document" | "missing-document";
  dependencies: DocumentDependencySummary;
}

export interface DocumentRemovalResult {
  session: ProjectSession;
  /** A recovery copy callers can place in an undo stack or named snapshot. */
  recoveryDocument: ScreenplayDocument;
  dependencies: DocumentDependencySummary;
}

export interface DocumentTabTransferResult {
  source: DocumentTabState;
  destination: DocumentTabState;
}

const MAX_RECENTLY_CLOSED = 20;

export function defaultDocumentViewState(documentId: string): DocumentViewState {
  return { documentId, sourceMode: false, editorScrollTop: 0 };
}

export function createDocumentTabState(
  documents: readonly ScreenplayDocument[],
  preferredActiveDocumentId?: string,
): DocumentTabState {
  const ids = documentIds(documents);
  const activeDocumentId = ids.includes(preferredActiveDocumentId ?? "")
    ? preferredActiveDocumentId
    : ids[0];
  return {
    schemaVersion: 1,
    openDocumentIds: activeDocumentId ? [activeDocumentId] : [],
    activeDocumentId,
    recentlyClosedDocumentIds: [],
    views: Object.fromEntries(ids.map((id) => [id, defaultDocumentViewState(id)])),
  };
}

export function normalizeDocumentTabState(
  value: unknown,
  documents: readonly ScreenplayDocument[],
  preferredActiveDocumentId?: string,
): DocumentTabState {
  const fallback = createDocumentTabState(documents, preferredActiveDocumentId);
  if (!isRecord(value)) return fallback;
  const ids = documentIds(documents);
  const allowed = new Set(ids);
  const openDocumentIds = uniqueStrings(value.openDocumentIds).filter((id) => allowed.has(id));
  const requestedActive = string(value.activeDocumentId);
  if (requestedActive && allowed.has(requestedActive) && !openDocumentIds.includes(requestedActive)) {
    openDocumentIds.push(requestedActive);
  }
  if (!openDocumentIds.length && ids.length) {
    const preferred = allowed.has(preferredActiveDocumentId ?? "") ? preferredActiveDocumentId! : ids[0];
    openDocumentIds.push(preferred);
  }
  const activeDocumentId = openDocumentIds.includes(requestedActive)
    ? requestedActive
    : openDocumentIds.includes(preferredActiveDocumentId ?? "")
      ? preferredActiveDocumentId
      : openDocumentIds[0];
  const rawViews = isRecord(value.views) ? value.views : {};
  const views = Object.fromEntries(ids.map((id) => [id, normalizeDocumentViewState(rawViews[id], id)]));
  return {
    schemaVersion: 1,
    openDocumentIds,
    activeDocumentId,
    recentlyClosedDocumentIds: uniqueStrings(value.recentlyClosedDocumentIds)
      .filter((id) => allowed.has(id) && !openDocumentIds.includes(id))
      .slice(0, MAX_RECENTLY_CLOSED),
    views,
  };
}

export function openDocumentTab(state: DocumentTabState, documentId: string, activate = true): DocumentTabState {
  const openDocumentIds = state.openDocumentIds.includes(documentId)
    ? [...state.openDocumentIds]
    : [...state.openDocumentIds, documentId];
  return {
    ...state,
    openDocumentIds,
    activeDocumentId: activate ? documentId : state.activeDocumentId ?? documentId,
    recentlyClosedDocumentIds: state.recentlyClosedDocumentIds.filter((id) => id !== documentId),
    views: state.views[documentId]
      ? state.views
      : { ...state.views, [documentId]: defaultDocumentViewState(documentId) },
  };
}

export function closeDocumentTab(state: DocumentTabState, documentId: string): DocumentTabState {
  const closingIndex = state.openDocumentIds.indexOf(documentId);
  if (closingIndex < 0 || state.openDocumentIds.length <= 1) return state;
  const openDocumentIds = state.openDocumentIds.filter((id) => id !== documentId);
  const fallbackIndex = Math.min(closingIndex, openDocumentIds.length - 1);
  const activeDocumentId = state.activeDocumentId === documentId
    ? openDocumentIds[Math.max(0, fallbackIndex)]
    : state.activeDocumentId;
  return {
    ...state,
    openDocumentIds,
    activeDocumentId,
    recentlyClosedDocumentIds: [
      documentId,
      ...state.recentlyClosedDocumentIds.filter((id) => id !== documentId),
    ].slice(0, MAX_RECENTLY_CLOSED),
  };
}

export function reopenLastDocumentTab(state: DocumentTabState): DocumentTabState {
  const documentId = state.recentlyClosedDocumentIds[0];
  return documentId ? openDocumentTab(state, documentId) : state;
}

export function reorderDocumentTab(state: DocumentTabState, documentId: string, toIndex: number): DocumentTabState {
  const fromIndex = state.openDocumentIds.indexOf(documentId);
  if (fromIndex < 0) return state;
  const openDocumentIds = [...state.openDocumentIds];
  openDocumentIds.splice(fromIndex, 1);
  const target = Math.max(0, Math.min(Math.trunc(toIndex), openDocumentIds.length));
  openDocumentIds.splice(target, 0, documentId);
  return { ...state, openDocumentIds };
}

export function activateDocumentTab(state: DocumentTabState, documentId: string): DocumentTabState {
  return state.openDocumentIds.includes(documentId) ? { ...state, activeDocumentId: documentId } : state;
}

export function updateDocumentView(
  state: DocumentTabState,
  documentId: string,
  patch: Partial<Omit<DocumentViewState, "documentId">>,
): DocumentTabState {
  const current = state.views[documentId] ?? defaultDocumentViewState(documentId);
  return { ...state, views: { ...state.views, [documentId]: { ...current, ...patch, documentId } } };
}

export function reconcileDocumentTabsAfterRemoval(
  state: DocumentTabState,
  documents: readonly ScreenplayDocument[],
  preferredActiveDocumentId?: string,
): DocumentTabState {
  return normalizeDocumentTabState(state, documents, preferredActiveDocumentId);
}

/** Applies a coordinator-acknowledged move/copy; unacknowledged drags never call this. */
export function applyAcknowledgedDocumentTabTransfer(
  source: DocumentTabState,
  destination: DocumentTabState,
  transfer: AcknowledgedInternalTransfer,
): DocumentTabTransferResult {
  if (transfer.payload.kind !== "document-tab") throw new Error("Transfer does not contain a document tab.");
  if (!source.openDocumentIds.includes(transfer.payload.documentId)) throw new Error("Source tab no longer exists.");
  const documentId = transfer.payload.documentId;
  let nextDestination = openDocumentTab(destination, documentId);
  const targetDocumentId = transfer.target.zoneId.startsWith("document:")
    ? transfer.target.zoneId.slice("document:".length)
    : undefined;
  if (targetDocumentId) {
    const anchorIndex = nextDestination.openDocumentIds.indexOf(targetDocumentId);
    if (anchorIndex >= 0) {
      const index = anchorIndex + (transfer.target.placement === "after" ? 1 : 0);
      nextDestination = reorderDocumentTab(nextDestination, documentId, index);
    }
  }
  return {
    source: transfer.removeFromSource ? closeDocumentTab(source, documentId) : source,
    destination: nextDestination,
  };
}

export function planDocumentRemoval(
  session: ProjectSession,
  documentId: string,
  canRemove: boolean,
): DocumentRemovalPlan {
  const document = session.documents.find((candidate) => candidate.id === documentId);
  const dependencies = collectDocumentDependencies(session, documentId);
  if (!document) return { documentId, title: "Missing screenplay", allowed: false, reason: "missing-document", dependencies };
  if (!canRemove) return { documentId, title: documentDisplayTitle(document), allowed: false, reason: "permission", dependencies };
  if (session.documents.length <= 1) return { documentId, title: documentDisplayTitle(document), allowed: false, reason: "last-document", dependencies };
  return { documentId, title: documentDisplayTitle(document), allowed: true, dependencies };
}

/**
 * Permanently removes a document after the caller has shown the dependency plan and
 * confirmed the exact id. Historical project snapshots remain immutable recovery points.
 */
export function removeProjectDocument(
  session: ProjectSession,
  documentId: string,
  options: { canRemove: boolean; confirmedDocumentId: string },
): DocumentRemovalResult {
  const plan = planDocumentRemoval(session, documentId, options.canRemove);
  if (!plan.allowed) throw new Error(removalError(plan.reason));
  if (options.confirmedDocumentId !== documentId) throw new Error("Document removal was not confirmed for this screenplay.");
  const recoveryDocument = structuredClone(session.documents.find((document) => document.id === documentId)!);
  const next = structuredClone(session);
  next.documents = next.documents.filter((document) => document.id !== documentId);
  next.versions = next.versions.filter((version) => version.document.id !== documentId);
  next.workspace.reviews = next.workspace.reviews.filter((review) => review.documentId !== documentId
    && !(review.targetType === "episode" && review.targetId === documentId));
  next.workspace.writerRoom.tasks = next.workspace.writerRoom.tasks.filter((task) => task.documentId !== documentId);
  if (next.workspace.writerRoom.activeDocumentId === documentId) {
    next.workspace.writerRoom.activeDocumentId = undefined;
    next.workspace.writerRoom.activeSceneId = undefined;
  }
  for (const continuity of next.workspace.series.continuity) {
    continuity.episodeIds = continuity.episodeIds.filter((id) => id !== documentId);
  }
  delete next.workspace.series.episodes[documentId];
  for (const season of next.workspace.series.seasons) {
    season.episodeIds = season.episodeIds.filter((id) => id !== documentId);
  }
  syncSeriesDocuments(next.workspace.series, next.documents);
  if (next.activeDocumentId === documentId) next.activeDocumentId = next.documents[0].id!;
  return { session: next, recoveryDocument, dependencies: plan.dependencies };
}

export function collectDocumentDependencies(session: ProjectSession, documentId: string): DocumentDependencySummary {
  return {
    reviewIds: session.workspace.reviews
      .filter((review) => review.documentId === documentId || (review.targetType === "episode" && review.targetId === documentId))
      .map((review) => review.id),
    writerRoomTaskIds: session.workspace.writerRoom.tasks.filter((task) => task.documentId === documentId).map((task) => task.id),
    continuityIds: session.workspace.series.continuity.filter((item) => item.episodeIds.includes(documentId)).map((item) => item.id),
    legacyVersionIds: session.versions.filter((version) => version.document.id === documentId).map((version) => version.id),
    seasonIds: session.workspace.series.seasons.filter((season) => season.episodeIds.includes(documentId)).map((season) => season.id),
  };
}

function normalizeDocumentViewState(value: unknown, documentId: string): DocumentViewState {
  if (!isRecord(value)) return defaultDocumentViewState(documentId);
  const activeBlockId = string(value.activeBlockId) || undefined;
  const selection = isRecord(value.sourceSelection)
    && finiteNonNegative(value.sourceSelection.start) !== undefined
    && finiteNonNegative(value.sourceSelection.end) !== undefined
    ? {
        start: finiteNonNegative(value.sourceSelection.start)!,
        end: Math.max(finiteNonNegative(value.sourceSelection.start)!, finiteNonNegative(value.sourceSelection.end)!),
      }
    : undefined;
  return {
    documentId,
    ...(activeBlockId ? { activeBlockId } : {}),
    sourceMode: value.sourceMode === true,
    ...(selection ? { sourceSelection: selection } : {}),
    editorScrollTop: finiteNonNegative(value.editorScrollTop) ?? 0,
  };
}

function documentIds(documents: readonly ScreenplayDocument[]): string[] {
  return [...new Set(documents.flatMap((document) => document.id ? [document.id] : []))];
}

function documentDisplayTitle(document: ScreenplayDocument): string {
  return document.title?.trim() || document.titlePage.title.trim() || "Untitled screenplay";
}

function removalError(reason: DocumentRemovalPlan["reason"]): string {
  if (reason === "permission") return "You do not have permission to remove this screenplay.";
  if (reason === "last-document") return "A project must retain at least one screenplay.";
  return "The screenplay no longer exists.";
}

function uniqueStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.flatMap((item) => typeof item === "string" && item.trim() ? [item.trim()] : []))]
    : [];
}

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function string(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
