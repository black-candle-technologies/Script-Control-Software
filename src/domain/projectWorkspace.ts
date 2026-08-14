import {
  emptyDocument,
  emptyWorkspace,
  reconcileScreenplayDocument,
  screenplayTextFingerprint,
  type ScreenplayDocument,
  type ScreenplayElementType,
  type WorkspaceData,
} from "./screenplay.ts";
import { parseFountain, toFountain } from "./fountain.ts";
import type { DraftSnapshot } from "./studio.ts";
import type { SnapshotScope, VersionHistory } from "./versioning.ts";
import { normalizeWorkspaceLayout, validateWorkspaceLayout, type WorkspaceLayout } from "./workspaceLayouts.ts";

export type ProjectSessionType = "featureFilm" | "television";
export type CollaboratorRole =
  | "owner"
  | "writer"
  | "co-writer"
  | "director"
  | "producer"
  | "story-editor"
  | "script-coordinator"
  | "reader"
  | "viewer";

export interface Collaborator {
  id: string;
  name: string;
  role: CollaboratorRole;
}

export interface ReviewItem {
  id: string;
  kind: "comment" | "suggestion";
  authorId: string;
  targetType: "project" | "episode" | "scene" | "block" | "treatment";
  targetId: string;
  /** Scopes scene, block, and treatment targets inside multi-script projects. */
  documentId?: string;
  text: string;
  suggestedText?: string;
  originalText?: string;
  status: "open" | "resolved" | "accepted" | "rejected";
  createdAt: string;
}

export interface DraftApproval {
  id: string;
  versionId: string;
  reviewerId: string;
  decision: "pending" | "approved" | "changes-requested";
  note: string;
  updatedAt: string;
}

export interface WriterRoomTask {
  id: string;
  text: string;
  assigneeId?: string;
  documentId?: string;
  sceneId?: string;
  done: boolean;
}

export interface WriterRoomState {
  active: boolean;
  agenda: string;
  activeDocumentId?: string;
  activeSceneId?: string;
  tasks: WriterRoomTask[];
}

export interface StoryLine {
  id: string;
  label: string;
  kind: "A" | "B" | "C" | "other";
  sceneIds: string[];
}

export interface EpisodeMeta {
  documentId: string;
  seasonId: string;
  number: number;
  title: string;
  productionCode: string;
  coldOpen: boolean;
  tag: boolean;
  actBreakSceneIds: string[];
  storyLines: StoryLine[];
}

export interface SeasonMeta {
  id: string;
  number: number;
  title: string;
  episodeIds: string[];
  arc: string;
}

export interface ContinuityRecord {
  id: string;
  kind: "timeline" | "character" | "object" | "location" | "plot" | "question";
  title: string;
  detail: string;
  episodeIds: string[];
  timelineOrder?: number;
  timelineDate?: string;
  resolved: boolean;
}

export interface SeriesWorkspace {
  showBible: string;
  seasons: SeasonMeta[];
  episodes: Record<string, EpisodeMeta>;
  characterArcs: Record<string, string>;
  continuity: ContinuityRecord[];
}

export interface SavedLayout {
  id: string;
  name: string;
  navigator: "left" | "right" | "hidden";
  inspector: "left" | "right" | "floating" | "hidden";
  reference: WorkspaceReferenceKind;
  navigatorWidth: number;
  inspectorWidth: number;
}

export type WorkspaceReferenceKind =
  | "none"
  | "previous-episode"
  | "next-episode"
  | "previous-draft"
  | "character"
  | "object"
  | "location"
  | "show-bible"
  | "season-arc"
  | "plot-history"
  | "timeline";

export interface SyncSettings {
  mode: "none" | "folder" | "git";
  /** @deprecated Machine paths are never shared; use ProjectSession.projectPath. */
  folderPath: string;
  /** Final Draft watch folder; independent from project synchronization. */
  watchFolderPath: string;
  watchRecursive: boolean;
  remoteUrl: string;
  branch: string;
  gitAuthorName: string;
  gitAuthorEmail: string;
  lastRemoteHash: string;
  lastSyncedAt: string;
}

export interface ProjectWorkspace {
  series: SeriesWorkspace;
  collaborators: Collaborator[];
  currentUserId: string;
  reviews: ReviewItem[];
  approvals: DraftApproval[];
  writerRoom: WriterRoomState;
  layouts: SavedLayout[];
  activeLayoutId: string;
  shortcuts: Record<string, string>;
  sync: SyncSettings;
}

export interface ProjectSession {
  schemaVersion: 4;
  projectId: string;
  name: string;
  projectType: ProjectSessionType;
  createdAt: string;
  updatedAt: string;
  documents: ScreenplayDocument[];
  /** Legacy per-document snapshots retained only for schema migration. */
  versions: DraftSnapshot[];
  versionHistory: VersionHistory;
  workspace: ProjectWorkspace;
  projectPath: string;
  activeDocumentId: string;
}

const BUILTIN_LAYOUTS: SavedLayout[] = [
  { id: "writer", name: "Writer", navigator: "left", inspector: "right", reference: "none", navigatorWidth: 240, inspectorWidth: 360 },
  { id: "development", name: "Development", navigator: "left", inspector: "right", reference: "none", navigatorWidth: 260, inspectorWidth: 420 },
  { id: "revision", name: "Revision", navigator: "left", inspector: "right", reference: "previous-draft", navigatorWidth: 240, inspectorWidth: 440 },
  { id: "television", name: "Television", navigator: "left", inspector: "right", reference: "previous-episode", navigatorWidth: 260, inspectorWidth: 440 },
  { id: "production", name: "Production", navigator: "left", inspector: "right", reference: "none", navigatorWidth: 240, inspectorWidth: 460 },
  { id: "companion", name: "Companion", navigator: "hidden", inspector: "right", reference: "none", navigatorWidth: 280, inspectorWidth: 460 },
];

export function defaultProjectWorkspace(): ProjectWorkspace {
  return {
    series: { showBible: "", seasons: [{ id: "season-1", number: 1, title: "Season 1", episodeIds: [], arc: "" }], episodes: {}, characterArcs: {}, continuity: [] },
    collaborators: [{ id: "local-owner", name: "Local writer", role: "owner" }],
    currentUserId: "local-owner",
    reviews: [],
    approvals: [],
    writerRoom: { active: false, agenda: "", tasks: [] },
    layouts: BUILTIN_LAYOUTS.map((layout) => ({ ...layout })),
    activeLayoutId: "writer",
    shortcuts: { commandPalette: "mod+k", save: "mod+s", saveVersion: "mod+shift+s" },
    sync: { mode: "none", folderPath: "", watchFolderPath: "", watchRecursive: true, remoteUrl: "", branch: "main", gitAuthorName: "Local writer", gitAuthorEmail: "writer@scs.local", lastRemoteHash: "", lastSyncedAt: "" },
  };
}

/** Remove machine-local identity and paths before writing a portable project. */
export function workspaceForPortableStorage(workspace: ProjectWorkspace): ProjectWorkspace {
  const ownerId = workspace.collaborators.find((collaborator) => collaborator.role === "owner")?.id
    ?? defaultProjectWorkspace().currentUserId;
  return {
    ...workspace,
    currentUserId: ownerId,
    sync: {
      ...workspace.sync,
      folderPath: "",
      watchFolderPath: "",
      watchRecursive: true,
      gitAuthorName: "",
      gitAuthorEmail: "",
      lastRemoteHash: "",
      lastSyncedAt: "",
    },
  };
}

/** Reapply preferences that belong to this device after save, pull, or merge. */
export function restoreLocalWorkspaceState(portable: ProjectWorkspace, local: ProjectWorkspace): ProjectWorkspace {
  const currentUserId = portable.collaborators.some((collaborator) => collaborator.id === local.currentUserId)
    ? local.currentUserId
    : portable.collaborators.find((collaborator) => collaborator.role === "owner")!.id;
  return {
    ...portable,
    currentUserId,
    sync: {
      ...portable.sync,
      folderPath: "",
      watchFolderPath: local.sync.watchFolderPath,
      watchRecursive: local.sync.watchRecursive,
      gitAuthorName: local.sync.gitAuthorName,
      gitAuthorEmail: local.sync.gitAuthorEmail,
      lastRemoteHash: local.sync.lastRemoteHash,
      lastSyncedAt: local.sync.lastSyncedAt,
    },
  };
}

/** Strip device-specific linked-file state before sharing or snapshotting documents. */
export function documentsForPortableStorage(documents: readonly ScreenplayDocument[]): ScreenplayDocument[] {
  return documents.map((document) => ({
    ...structuredClone(document),
    ...(document.source ? {
      source: {
        ...structuredClone(document.source),
        path: "",
        lastImportedModifiedAt: undefined,
      },
    } : {}),
  }));
}

export function versionsForPortableStorage(versions: readonly DraftSnapshot[]): DraftSnapshot[] {
  return versions.map((version) => ({
    ...structuredClone(version),
    document: documentsForPortableStorage([version.document])[0],
  }));
}

/** Reapply linked-file paths/timestamps that belong only to this workstation. */
export function restoreLocalDocumentState(
  portable: readonly ScreenplayDocument[],
  local: readonly ScreenplayDocument[],
): ScreenplayDocument[] {
  const localById = new Map(local.flatMap((document) => document.id ? [[document.id, document] as const] : []));
  return portable.map((document, index) => {
    const localDocument = document.id ? localById.get(document.id) : local[index]?.id ? undefined : local[index];
    if (!document.source || !localDocument?.source?.path || localDocument.source.type !== document.source.type) return document;
    return {
      ...document,
      source: {
        ...document.source,
        path: localDocument.source.path,
        lastImportedModifiedAt: localDocument.source.lastImportedModifiedAt,
      },
    };
  });
}

export function createProjectSession(document = emptyDocument(), projectType: ProjectSessionType = "featureFilm"): ProjectSession {
  ensureDocumentId(document);
  const workspace = defaultProjectWorkspace();
  syncSeriesDocuments(workspace.series, [document]);
  const now = new Date().toISOString();
  return {
    schemaVersion: 4,
    projectId: `project-${crypto.randomUUID()}`,
    name: document.titlePage.title || (projectType === "television" ? "Untitled Show" : "Untitled Screenplay"),
    projectType,
    createdAt: now,
    updatedAt: now,
    documents: [document],
    versions: [],
    versionHistory: emptyVersionHistory(),
    workspace,
    projectPath: "",
    activeDocumentId: document.id!,
  };
}

export function normalizeProjectSession(value: unknown): ProjectSession {
  if (!isRecord(value)) throw new Error("Project data is not an object.");
  const rawDocuments = Array.isArray(value.documents) ? value.documents : value.document ? [value.document] : [];
  if (!rawDocuments.length) throw new Error("Project has no screenplay documents.");
  const documents = repairDocumentIds(rawDocuments.map(normalizeDocument));
  const projectType: ProjectSessionType = value.projectType === "television" || documents.length > 1 ? "television" : "featureFilm";
  const session = createProjectSession(documents[0], projectType);
  session.documents = documents;
  session.projectId = string(value.projectId) || string(value.id) || session.projectId;
  session.name = string(value.name) || documents[0].titlePage.title || session.name;
  session.createdAt = string(value.createdAt) || session.createdAt;
  session.updatedAt = string(value.updatedAt) || session.updatedAt;
  session.versions = Array.isArray(value.versions) ? value.versions.flatMap((item): DraftSnapshot[] => {
    if (!isSnapshot(item) || typeof item.label !== "string" || typeof item.note !== "string" || typeof item.milestone !== "boolean") return [];
    try {
      return [{ ...structuredClone(item), document: normalizeDocument(item.document) }];
    } catch {
      return [];
    }
  }) : [];
  session.versionHistory = normalizeVersionHistory(value.versionHistory);
  session.workspace = normalizeProjectWorkspace(value.workspace);
  session.projectPath = string(value.projectPath);
  session.activeDocumentId = documents.some((document) => document.id === value.activeDocumentId)
    ? String(value.activeDocumentId)
    : documents[0].id!;
  syncSeriesDocuments(session.workspace.series, documents);
  migrateLegacyComments(session);
  repairCollaborationReferences(session);
  return session;
}

export function emptyVersionHistory(): VersionHistory {
  return { snapshots: [], branches: [], milestones: [], activeBranchId: "main" };
}

function normalizeVersionHistory(value: unknown): VersionHistory {
  if (!isRecord(value)) return emptyVersionHistory();
  const snapshotIdsSeen = new Set<string>();
  const snapshots = Array.isArray(value.snapshots) ? value.snapshots.flatMap((snapshot) => {
    if (!isRecord(snapshot) || typeof snapshot.id !== "string" || typeof snapshot.name !== "string" || typeof snapshot.createdAt !== "string" || !isRecord(snapshot.session)) return [];
    if (!snapshot.id.trim() || snapshotIdsSeen.has(snapshot.id)) return [];
    try {
      const session = normalizeProjectSession({ ...snapshot.session, versionHistory: undefined });
      const scope = normalizeSnapshotScope(snapshot.scope, session);
      if (snapshot.scope !== undefined && !scope) return [];
      snapshotIdsSeen.add(snapshot.id);
      return [{
        id: snapshot.id,
        name: snapshot.name,
        description: string(snapshot.description),
        createdAt: snapshot.createdAt,
        parentIds: Array.isArray(snapshot.parentIds) ? snapshot.parentIds.filter((id): id is string => typeof id === "string") : [],
        branchId: typeof snapshot.branchId === "string" ? snapshot.branchId : undefined,
        ...(scope ? { scope } : {}),
        session,
      }];
    } catch {
      return [];
    }
  }) : [];
  const snapshotIds = new Set(snapshots.map((snapshot) => snapshot.id));
  const projectSnapshotIds = new Set(snapshots.filter((snapshot) => !snapshot.scope || snapshot.scope.kind === "project").map((snapshot) => snapshot.id));
  const branchIdsSeen = new Set<string>();
  const branches = Array.isArray(value.branches) ? value.branches.flatMap((branch): VersionHistory["branches"] => {
    if (!isRecord(branch)
      || typeof branch.id !== "string"
      || !branch.id.trim()
      || branchIdsSeen.has(branch.id)
      || typeof branch.name !== "string"
      || typeof branch.baseSnapshotId !== "string"
      || typeof branch.headSnapshotId !== "string"
      || !projectSnapshotIds.has(branch.baseSnapshotId)
      || !projectSnapshotIds.has(branch.headSnapshotId)) return [];
    branchIdsSeen.add(branch.id);
    return [{ id: branch.id, name: branch.name, baseSnapshotId: branch.baseSnapshotId, headSnapshotId: branch.headSnapshotId }];
  }) : [];
  const branchIds = new Set(branches.map((branch) => branch.id));
  const milestoneIdsSeen = new Set<string>();
  const milestones = Array.isArray(value.milestones) ? value.milestones.flatMap((milestone): VersionHistory["milestones"] => {
    if (!isRecord(milestone)
      || typeof milestone.id !== "string"
      || !milestone.id.trim()
      || milestoneIdsSeen.has(milestone.id)
      || typeof milestone.name !== "string"
      || typeof milestone.description !== "string"
      || typeof milestone.snapshotId !== "string"
      || !snapshotIds.has(milestone.snapshotId)) return [];
    milestoneIdsSeen.add(milestone.id);
    return [{ id: milestone.id, name: milestone.name, description: milestone.description, snapshotId: milestone.snapshotId }];
  }) : [];
  const activeBranchId = typeof value.activeBranchId === "string" && branchIds.has(value.activeBranchId)
    ? value.activeBranchId
    : branches[0]?.id ?? "main";
  return { snapshots, branches, milestones, activeBranchId };
}

function normalizeSnapshotScope(value: unknown, session: ProjectSession): SnapshotScope | undefined {
  if (!isRecord(value) || typeof value.kind !== "string") return undefined;
  if (value.kind === "project") return { kind: "project" };
  if (session.projectType !== "television") return undefined;
  if (value.kind === "show-bible") return { kind: "show-bible" };
  if (value.kind === "episode" && typeof value.documentId === "string" && session.documents.some((document) => document.id === value.documentId) && session.workspace.series.episodes[value.documentId]) {
    return { kind: "episode", documentId: value.documentId };
  }
  if (value.kind === "season" && typeof value.seasonId === "string" && session.workspace.series.seasons.some((season) => season.id === value.seasonId)) {
    return { kind: "season", seasonId: value.seasonId };
  }
  return undefined;
}

export function syncSeriesDocuments(series: SeriesWorkspace, documents: ScreenplayDocument[]): void {
  const firstSeason = series.seasons[0] ?? { id: "season-1", number: 1, title: "Season 1", episodeIds: [], arc: "" };
  if (!series.seasons.length) series.seasons.push(firstSeason);
  const live = new Set(documents.map((document) => ensureDocumentId(document)));
  for (const document of documents) {
    const id = document.id!;
    series.episodes[id] ??= {
      documentId: id,
      seasonId: firstSeason.id,
      number: Object.keys(series.episodes).length + 1,
      title: document.titlePage.title || `Episode ${Object.keys(series.episodes).length + 1}`,
      productionCode: "",
      coldOpen: false,
      tag: false,
      actBreakSceneIds: [],
      storyLines: [],
    };
  }
  for (const id of Object.keys(series.episodes)) if (!live.has(id)) delete series.episodes[id];
  for (const season of series.seasons) season.episodeIds = documents
    .map((document) => document.id!)
    .filter((id) => series.episodes[id]?.seasonId === season.id);
}

/**
 * Install newly parsed text into the latest session while carrying every
 * project-level scene/block reference to the reconciled ids.
 */
export function reconcileImportedDocument(
  session: ProjectSession,
  documentId: string,
  parsed: ScreenplayDocument,
): ProjectSession {
  return reconcileDocument(session, documentId, parsed, true);
}

/** Reconcile an in-app Fountain edit without moving the external FDX baseline. */
export function reconcileSourceDocument(
  session: ProjectSession,
  documentId: string,
  parsed: ScreenplayDocument,
): ProjectSession {
  return reconcileDocument(session, documentId, parsed, false);
}

/** Materialize Fountain source only when its serialized screenplay actually changed. */
export function materializeFountainSource(
  session: ProjectSession,
  documentId: string,
  sourceText: string,
): ProjectSession {
  const previous = session.documents.find((document) => document.id === documentId);
  if (!previous) throw new Error(`Screenplay document '${documentId}' no longer exists.`);
  if (sourceText === toFountain(previous)) return session;
  return reconcileSourceDocument(session, documentId, parseFountain(sourceText));
}

function reconcileDocument(
  session: ProjectSession,
  documentId: string,
  parsed: ScreenplayDocument,
  advanceImportedBaseline: boolean,
): ProjectSession {
  const previous = session.documents.find((document) => document.id === documentId);
  if (!previous) throw new Error(`Screenplay document '${documentId}' no longer exists.`);
  const reconciliation = reconcileScreenplayDocument(previous, parsed);
  let document = advanceImportedBaseline
    ? reconciliation.document
    : preserveSourceOpaqueMetadata(previous, reconciliation.document);
  if (advanceImportedBaseline && document.source) {
    document = {
      ...document,
      source: { ...document.source, lastImportedFingerprint: screenplayTextFingerprint(document) },
    };
  }
  const next = structuredClone(session);
  next.documents = next.documents.map((candidate) => candidate.id === documentId ? document : candidate);
  const episode = next.workspace.series.episodes[documentId];
  if (episode) {
    episode.actBreakSceneIds = remapIds(episode.actBreakSceneIds, reconciliation.sceneIds);
    episode.storyLines = episode.storyLines.map((line) => ({
      ...line,
      sceneIds: remapIds(line.sceneIds, reconciliation.sceneIds),
    }));
  }
  next.workspace.reviews = next.workspace.reviews.map((review) => {
    if (review.documentId !== documentId) return review;
    if (review.targetType === "scene") return { ...review, targetId: reconciliation.sceneIds.get(review.targetId) ?? review.targetId };
    if (review.targetType === "block") return { ...review, targetId: reconciliation.blockIds.get(review.targetId) ?? review.targetId };
    return review;
  });
  const room = next.workspace.writerRoom;
  if (room.activeDocumentId === documentId && room.activeSceneId) {
    room.activeSceneId = reconciliation.sceneIds.get(room.activeSceneId);
    if (!room.activeSceneId) room.activeDocumentId = undefined;
  }
  room.tasks = room.tasks.map((task) => task.documentId === documentId && task.sceneId
    ? { ...task, sceneId: reconciliation.sceneIds.get(task.sceneId) }
    : task);
  repairCollaborationReferences(next);
  return next;
}

function preserveSourceOpaqueMetadata(previous: ScreenplayDocument, reconciled: ScreenplayDocument): ScreenplayDocument {
  const previousById = new Map(previous.blocks.map((block) => [block.id, block]));
  return {
    ...reconciled,
    titlePage: {
      ...reconciled.titlePage,
      ...(previous.titlePage.blocks ? { blocks: structuredClone(previous.titlePage.blocks) } : {}),
    },
    blocks: reconciled.blocks.map((block) => {
      const before = previousById.get(block.id);
      if (!before) return block;
      return {
        ...block,
        ...(before.sceneId && !block.sceneId ? { sceneId: before.sceneId } : {}),
        ...(before.originalType && !block.originalType ? { originalType: before.originalType } : {}),
        ...(before.metadata ? { metadata: { ...structuredClone(before.metadata), ...block.metadata } } : {}),
        ...(before.text === block.text && before.textRuns ? { textRuns: structuredClone(before.textRuns) } : {}),
      };
    }),
  };
}

export interface DetachedFdxRelinkResult {
  session: ProjectSession;
  disposition: "relinked" | "updated" | "conflict";
  localChanged: boolean;
  externalChanged: boolean;
}

/** Safely reconnect a portable FDX document to a machine-local file. */
export function relinkDetachedFdxDocument(
  session: ProjectSession,
  documentId: string,
  imported: ScreenplayDocument,
): DetachedFdxRelinkResult {
  const previous = session.documents.find((document) => document.id === documentId);
  if (!previous?.source || previous.source.type !== "fdx" || previous.source.path) {
    throw new Error(`Screenplay document '${documentId}' is not a detached FDX document.`);
  }
  if (!imported.source || imported.source.type !== "fdx" || !imported.source.path) {
    throw new Error("The selected file is not a linked FDX document.");
  }

  const baseline = previous.source.lastImportedFingerprint;
  const localFingerprint = screenplayTextFingerprint(previous);
  const externalFingerprint = imported.source.lastImportedFingerprint ?? screenplayTextFingerprint(imported);
  const fingerprintsConverged = localFingerprint === externalFingerprint;
  const localChanged = baseline ? localFingerprint !== baseline : !fingerprintsConverged;
  const externalChanged = baseline ? externalFingerprint !== baseline : !fingerprintsConverged;

  if (!localChanged && externalChanged) {
    const updated = reconcileImportedDocument(session, documentId, imported);
    return { session: { ...updated, activeDocumentId: documentId }, disposition: "updated", localChanged, externalChanged };
  }

  const linkedFingerprint = fingerprintsConverged ? externalFingerprint : baseline ?? externalFingerprint;
  const next = structuredClone(session);
  next.activeDocumentId = documentId;
  next.documents = next.documents.map((document) => document.id === documentId ? {
    ...document,
    source: {
      ...document.source!,
      ...imported.source!,
      lastImportedFingerprint: linkedFingerprint,
    },
  } : document);
  const conflict = localChanged && externalChanged && !fingerprintsConverged;
  return {
    session: next,
    disposition: conflict ? "conflict" : "relinked",
    localChanged,
    externalChanged,
  };
}

function remapIds(ids: readonly string[], remap: ReadonlyMap<string, string>): string[] {
  return ids.flatMap((id) => remap.get(id) ?? []);
}

function repairDocumentIds(documents: ScreenplayDocument[]): ScreenplayDocument[] {
  const seen = new Set<string>();
  return documents.map((document, index) => {
    const base = document.id?.trim() || `document-${index + 1}`;
    let id = base;
    for (let suffix = 2; seen.has(id); suffix++) id = `${base}-${suffix}`;
    seen.add(id);
    return id === document.id ? document : { ...document, id };
  });
}

const screenplayElementTypes = new Set<ScreenplayElementType>([
  "scene_heading", "action", "character", "dialogue", "parenthetical", "transition", "shot", "note",
  "general", "lyrics", "cast_list", "new_act", "end_of_act", "unknown",
]);
const storyBoardViews = new Set<NonNullable<WorkspaceData["storyBoardView"]>>(["act", "sequence", "scene", "beat", "timeline"]);
const treatmentTargetTypes = new Set<NonNullable<WorkspaceData["treatments"]>[number]["links"][number]["targetType"]>(["act", "sequence", "scene", "beat", "character", "object", "location"]);
const entityKinds = new Set(["character", "location", "object"]);
const revisionColors = new Set(["White", "Blue", "Pink", "Yellow", "Green", "Goldenrod", "Buff", "Salmon", "Cherry"]);
const sceneStatuses = new Set(["outline", "draft", "revised", "locked"]);

function normalizeScriptSource(value: unknown): ScreenplayDocument["source"] {
  if (!isRecord(value) || (value.type !== "fdx" && value.type !== "fountain" && value.type !== "native")) return undefined;
  return {
    type: value.type,
    path: string(value.path),
    fileName: string(value.fileName),
    lastImportedAt: string(value.lastImportedAt),
    ...(typeof value.fdxVersion === "string" ? { fdxVersion: value.fdxVersion } : {}),
    ...(typeof value.lastImportedModifiedAt === "number" && Number.isFinite(value.lastImportedModifiedAt) ? { lastImportedModifiedAt: value.lastImportedModifiedAt } : {}),
    ...(typeof value.lastImportedFingerprint === "string" ? { lastImportedFingerprint: value.lastImportedFingerprint } : {}),
  };
}

function normalizeImportedScenes(value: unknown, blockCount: number): ScreenplayDocument["scenes"] {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  return value.flatMap((scene) => {
    if (!isRecord(scene)
      || typeof scene.id !== "string"
      || !scene.id
      || ids.has(scene.id)
      || typeof scene.heading !== "string"
      || !Number.isInteger(scene.blockStart)
      || !Number.isInteger(scene.blockEnd)
      || (scene.blockStart as number) < 0
      || (scene.blockStart as number) >= blockCount
      || (scene.blockEnd as number) < (scene.blockStart as number)
      || (scene.blockEnd as number) > blockCount) return [];
    ids.add(scene.id);
    return [{
      id: scene.id,
      heading: scene.heading,
      blockStart: scene.blockStart as number,
      blockEnd: scene.blockEnd as number,
      characterIds: stringArray(scene.characterIds),
      metadata: stringRecord(scene.metadata),
      ...(typeof scene.sceneNumber === "string" ? { sceneNumber: scene.sceneNumber } : {}),
      ...(typeof scene.interiorExterior === "string" ? { interiorExterior: scene.interiorExterior } : {}),
      ...(typeof scene.location === "string" ? { location: scene.location } : {}),
      ...(typeof scene.timeOfDay === "string" ? { timeOfDay: scene.timeOfDay } : {}),
    }];
  });
}

function normalizeImportedCharacters(value: unknown): ScreenplayDocument["characters"] {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  return value.flatMap((character) => {
    if (!isRecord(character) || typeof character.id !== "string" || !character.id || ids.has(character.id)
      || typeof character.canonicalName !== "string" || typeof character.displayName !== "string" || typeof character.firstAppearanceBlockId !== "string") return [];
    ids.add(character.id);
    return [{
      id: character.id,
      canonicalName: character.canonicalName,
      displayName: character.displayName,
      aliases: stringArray(character.aliases),
      firstAppearanceBlockId: character.firstAppearanceBlockId,
      sceneIds: stringArray(character.sceneIds),
      dialogueBlockIds: stringArray(character.dialogueBlockIds),
    }];
  });
}

function normalizeImportedLocations(value: unknown): ScreenplayDocument["locations"] {
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  return value.flatMap((location) => {
    if (!isRecord(location) || typeof location.id !== "string" || !location.id || ids.has(location.id)
      || typeof location.canonicalName !== "string" || typeof location.displayName !== "string") return [];
    ids.add(location.id);
    return [{
      id: location.id,
      canonicalName: location.canonicalName,
      displayName: location.displayName,
      interiorExteriorUsages: stringArray(location.interiorExteriorUsages),
      sceneIds: stringArray(location.sceneIds),
    }];
  });
}

function normalizeImportWarnings(value: unknown): ScreenplayDocument["warnings"] {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((warning) => isRecord(warning)
    && typeof warning.code === "string"
    && typeof warning.message === "string"
    && (warning.severity === "info" || warning.severity === "warning" || warning.severity === "error")
    && typeof warning.dataPreserved === "boolean"
    ? [{
      code: warning.code,
      message: warning.message,
      severity: warning.severity,
      dataPreserved: warning.dataPreserved,
      ...(typeof warning.blockIndex === "number" && Number.isInteger(warning.blockIndex) ? { blockIndex: warning.blockIndex } : {}),
    }]
    : []);
}

function normalizeTreatments(value: unknown): NonNullable<WorkspaceData["treatments"]> {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((treatment) => {
    if (!isRecord(treatment) || typeof treatment.id !== "string" || !treatment.id || ids.has(treatment.id)
      || typeof treatment.title !== "string" || typeof treatment.markdown !== "string") return [];
    ids.add(treatment.id);
    const linkIds = new Set<string>();
    const links = Array.isArray(treatment.links) ? treatment.links.flatMap((link) => {
      if (!isRecord(link) || typeof link.id !== "string" || !link.id || linkIds.has(link.id)
        || typeof link.targetType !== "string" || !treatmentTargetTypes.has(link.targetType as never)
        || typeof link.targetId !== "string" || !link.targetId || typeof link.label !== "string") return [];
      linkIds.add(link.id);
      return [{
        id: link.id,
        targetType: link.targetType as NonNullable<WorkspaceData["treatments"]>[number]["links"][number]["targetType"],
        targetId: link.targetId,
        label: link.label,
        ...(typeof link.sectionId === "string" ? { sectionId: link.sectionId } : {}),
        ...(typeof link.sectionLabel === "string" ? { sectionLabel: link.sectionLabel } : {}),
      }];
    }) : [];
    return [{ id: treatment.id, title: treatment.title, markdown: treatment.markdown, links }];
  });
}

function normalizeStoryStructure(value: unknown): WorkspaceData["storyStructure"] {
  if (!isRecord(value) || !Array.isArray(value.acts) || !Array.isArray(value.sequences) || !Array.isArray(value.beats)) return undefined;
  const acts = value.acts.flatMap((act) => isRecord(act) && typeof act.id === "string" && act.id && typeof act.title === "string"
    ? [{ id: act.id, title: act.title }]
    : []);
  const sequences = value.sequences.flatMap((sequence) => isRecord(sequence)
    && typeof sequence.id === "string" && sequence.id
    && typeof sequence.actId === "string"
    && typeof sequence.title === "string"
    ? [{ id: sequence.id, actId: sequence.actId, title: sequence.title, sceneIds: stringArray(sequence.sceneIds) }]
    : []);
  const beats = value.beats.flatMap((beat) => isRecord(beat)
    && typeof beat.id === "string" && beat.id
    && typeof beat.text === "string"
    && (beat.status === "idea" || beat.status === "drafted" || beat.status === "complete")
    ? [{
      id: beat.id,
      text: beat.text,
      status: beat.status as "idea" | "drafted" | "complete",
      moments: Array.isArray(beat.moments) ? beat.moments.flatMap((moment) => isRecord(moment) && typeof moment.id === "string" && moment.id && typeof moment.text === "string" ? [{ id: moment.id, text: moment.text }] : []) : [],
      ...(typeof beat.sceneId === "string" ? { sceneId: beat.sceneId } : {}),
      ...(typeof beat.sequenceId === "string" ? { sequenceId: beat.sequenceId } : {}),
    }]
    : []);
  return { acts, sequences, beats, sceneOrder: stringArray(value.sceneOrder) };
}

function normalizeEntityStatuses(value: unknown): WorkspaceData["entityStatuses"] {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, WorkspaceData["entityStatuses"][string]] => entry[1] === "detected" || entry[1] === "confirmed" || entry[1] === "rejected"));
}

function normalizeEntityOverrides(value: unknown): NonNullable<WorkspaceData["entityOverrides"]> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((override): NonNullable<WorkspaceData["entityOverrides"]> => {
    if (!isRecord(override) || typeof override.entityId !== "string" || typeof override.kind !== "string" || !entityKinds.has(override.kind)) return [];
    const base = { kind: override.kind as "character" | "location" | "object", entityId: override.entityId };
    if ((override.action === "confirm" || override.action === "reject")) return [{ ...base, action: override.action }];
    if (override.action === "rename" && typeof override.name === "string") return [{ ...base, action: "rename", name: override.name }];
    if (override.action === "merge" && typeof override.targetId === "string") return [{ ...base, action: "merge", targetId: override.targetId }];
    if (override.action === "split" && typeof override.newId === "string" && typeof override.name === "string") return [{ ...base, action: "split", newId: override.newId, name: override.name, sceneNumbers: numberArray(override.sceneNumbers) }];
    if (override.action === "add" && override.kind === "object" && typeof override.name === "string" && typeof override.category === "string") {
      return [{ action: "add", kind: "object", entityId: override.entityId, name: override.name, category: override.category }];
    }
    return [];
  });
}

function normalizePlotThreads(value: unknown): NonNullable<WorkspaceData["plotThreads"]> {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((thread) => {
    if (!isRecord(thread) || typeof thread.id !== "string" || !thread.id || ids.has(thread.id) || typeof thread.label !== "string") return [];
    ids.add(thread.id);
    return [{
      id: thread.id,
      label: thread.label,
      sceneIds: stringArray(thread.sceneIds),
      beatIds: stringArray(thread.beatIds),
      keywords: stringArray(thread.keywords),
      ...(typeof thread.resolved === "boolean" ? { resolved: thread.resolved } : {}),
    }];
  });
}

function normalizeRevisionSets(value: unknown): NonNullable<WorkspaceData["revisionSets"]> {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((revision) => {
    if (!isRecord(revision) || typeof revision.id !== "string" || !revision.id || ids.has(revision.id)
      || typeof revision.label !== "string" || typeof revision.color !== "string" || !revisionColors.has(revision.color)
      || typeof revision.createdAt !== "string") return [];
    ids.add(revision.id);
    return [{
      id: revision.id,
      label: revision.label,
      color: revision.color as NonNullable<WorkspaceData["revisionSets"]>[number]["color"],
      createdAt: revision.createdAt,
      blockIds: stringArray(revision.blockIds),
      ...(typeof revision.baselineSnapshotId === "string" ? { baselineSnapshotId: revision.baselineSnapshotId } : {}),
    }];
  });
}

function normalizePageLock(value: unknown): WorkspaceData["pageLock"] {
  if (!isRecord(value) || !Array.isArray(value.pages)) return undefined;
  return {
    pages: value.pages.flatMap((page) => isRecord(page) && typeof page.number === "number" && Number.isInteger(page.number) && page.number > 0
      ? [{ number: page.number, blockIds: stringArray(page.blockIds) }]
      : []),
  };
}

function normalizeSceneMeta(value: unknown): NonNullable<WorkspaceData["sceneMeta"]> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, meta]) => isRecord(meta)
    && typeof meta.summary === "string"
    && typeof meta.tags === "string"
    && typeof meta.status === "string"
    && sceneStatuses.has(meta.status)
    ? [[id, { summary: meta.summary, tags: meta.tags, status: meta.status as NonNullable<WorkspaceData["sceneMeta"]>[string]["status"] }] as const]
    : []));
}

function normalizeDocument(value: unknown): ScreenplayDocument {
  if (!isRecord(value) || !isRecord(value.titlePage) || !Array.isArray(value.blocks)) {
    throw new Error("A screenplay document is malformed.");
  }
  const ids = new Set<string>();
  const blocks = value.blocks.map((raw, index) => {
    if (!isRecord(raw) || typeof raw.text !== "string" || typeof raw.type !== "string") {
      throw new Error(`Screenplay block ${index + 1} is malformed.`);
    }
    let id = string(raw.id) || `imported-${index + 1}`;
    while (ids.has(id)) id = `${id}-${index + 1}`;
    ids.add(id);
    const type = screenplayElementTypes.has(raw.type as ScreenplayElementType) ? raw.type as ScreenplayElementType : "unknown";
    const textRuns = Array.isArray(raw.textRuns) ? raw.textRuns.flatMap((run) => {
      if (!isRecord(run) || typeof run.text !== "string") return [];
      return [{
        text: run.text,
        bold: run.bold === true,
        italic: run.italic === true,
        underline: run.underline === true,
        strikeout: run.strikeout === true,
        ...(typeof run.revisionId === "string" ? { revisionId: run.revisionId } : {}),
        metadata: stringRecord(run.metadata),
      }];
    }) : undefined;
    return {
      id,
      type,
      text: raw.text,
      ...(textRuns?.length ? { textRuns } : {}),
      ...(typeof raw.sceneId === "string" ? { sceneId: raw.sceneId } : {}),
      ...(typeof raw.originalType === "string" ? { originalType: raw.originalType } : {}),
      ...(isRecord(raw.metadata) ? { metadata: stringRecord(raw.metadata) } : {}),
    };
  });
  if (!blocks.length) blocks.push(emptyDocument().blocks[0]);
  const document = {
    ...value,
    id: string(value.id),
    title: typeof value.title === "string" ? value.title : undefined,
    source: normalizeScriptSource(value.source),
    metadata: stringRecord(value.metadata),
    titlePage: {
      title: string(value.titlePage.title),
      author: string(value.titlePage.author),
      ...(Array.isArray(value.titlePage.blocks) ? { blocks: value.titlePage.blocks.flatMap((block) => isRecord(block) && typeof block.type === "string" && typeof block.text === "string"
        ? [{ type: block.type, text: block.text, metadata: stringRecord(block.metadata) }]
        : []) } : {}),
    },
    blocks,
    scenes: normalizeImportedScenes(value.scenes, blocks.length),
    characters: normalizeImportedCharacters(value.characters),
    locations: normalizeImportedLocations(value.locations),
    warnings: normalizeImportWarnings(value.warnings),
    readOnly: value.readOnly === true,
    sceneNotes: stringRecord(value.sceneNotes),
    workspace: normalizeDocumentWorkspace(value.workspace),
  } as ScreenplayDocument;
  ensureDocumentId(document);
  return document;
}

function normalizeDocumentWorkspace(value: unknown) {
  const fallback = emptyWorkspace();
  if (!isRecord(value)) return fallback;
  return {
    ...fallback,
    ...value,
    treatment: string(value.treatment),
    showBible: string(value.showBible),
    continuity: string(value.continuity),
    seasonArc: string(value.seasonArc),
    productionNotes: string(value.productionNotes),
    comments: normalizeLegacyComments(value.comments),
    treatments: normalizeTreatments(value.treatments),
    activeTreatmentId: string(value.activeTreatmentId),
    storyStructure: normalizeStoryStructure(value.storyStructure),
    storyBoardView: storyBoardViews.has(value.storyBoardView as NonNullable<WorkspaceData["storyBoardView"]>)
      ? value.storyBoardView as NonNullable<WorkspaceData["storyBoardView"]>
      : fallback.storyBoardView,
    productionDraftLabel: string(value.productionDraftLabel) || fallback.productionDraftLabel,
    revisionColor: string(value.revisionColor) || fallback.revisionColor,
    lockedPages: string(value.lockedPages),
    omittedSceneIds: stringArray(value.omittedSceneIds),
    entityStatuses: normalizeEntityStatuses(value.entityStatuses),
    entityOverrides: normalizeEntityOverrides(value.entityOverrides),
    entityNotes: stringRecord(value.entityNotes),
    resolvedBeatIds: stringArray(value.resolvedBeatIds),
    plotThreads: normalizePlotThreads(value.plotThreads),
    revisionSets: normalizeRevisionSets(value.revisionSets),
    activeRevisionId: string(value.activeRevisionId),
    pageLock: normalizePageLock(value.pageLock),
    shootingEighthsPerDay: typeof value.shootingEighthsPerDay === "number" && value.shootingEighthsPerDay > 0 ? value.shootingEighthsPerDay : 40,
    sceneMeta: normalizeSceneMeta(value.sceneMeta),
  };
}

function normalizeSeriesWorkspace(value: Record<string, unknown>, fallback: SeriesWorkspace): SeriesWorkspace {
  const seasonIds = new Set<string>();
  const seasons = (Array.isArray(value.seasons) ? value.seasons : []).flatMap((season): SeasonMeta[] => {
    if (!isRecord(season) || typeof season.id !== "string" || !season.id.trim() || seasonIds.has(season.id)
      || typeof season.number !== "number" || !Number.isFinite(season.number) || typeof season.title !== "string") return [];
    seasonIds.add(season.id);
    return [{ id: season.id, number: season.number, title: season.title, episodeIds: stringArray(season.episodeIds), arc: string(season.arc) }];
  });
  if (!seasons.length) {
    seasons.push(...fallback.seasons.map((season) => ({ ...season, episodeIds: [...season.episodeIds] })));
    seasons.forEach((season) => seasonIds.add(season.id));
  }
  const firstSeasonId = seasons[0].id;
  const episodes: Record<string, EpisodeMeta> = {};
  if (isRecord(value.episodes)) {
    for (const [key, episode] of Object.entries(value.episodes)) {
      if (!isRecord(episode)) continue;
      const documentId = string(episode.documentId) || key;
      if (!documentId || episodes[documentId]) continue;
      const storyLineIds = new Set<string>();
      const storyLines = Array.isArray(episode.storyLines) ? episode.storyLines.flatMap((line): StoryLine[] => {
        if (!isRecord(line) || typeof line.id !== "string" || !line.id || storyLineIds.has(line.id)
          || typeof line.label !== "string" || (line.kind !== "A" && line.kind !== "B" && line.kind !== "C" && line.kind !== "other")) return [];
        storyLineIds.add(line.id);
        return [{ id: line.id, label: line.label, kind: line.kind, sceneIds: stringArray(line.sceneIds) }];
      }) : [];
      episodes[documentId] = {
        documentId,
        seasonId: seasonIds.has(string(episode.seasonId)) ? string(episode.seasonId) : firstSeasonId,
        number: typeof episode.number === "number" && Number.isFinite(episode.number) ? episode.number : Object.keys(episodes).length + 1,
        title: string(episode.title),
        productionCode: string(episode.productionCode),
        coldOpen: episode.coldOpen === true,
        tag: episode.tag === true,
        actBreakSceneIds: stringArray(episode.actBreakSceneIds),
        storyLines,
      };
    }
  }
  const continuityIds = new Set<string>();
  const continuity = Array.isArray(value.continuity) ? value.continuity.flatMap((record): ContinuityRecord[] => {
    if (!isRecord(record) || typeof record.id !== "string" || !record.id || continuityIds.has(record.id)
      || (record.kind !== "timeline" && record.kind !== "character" && record.kind !== "object" && record.kind !== "location" && record.kind !== "plot" && record.kind !== "question")
      || typeof record.title !== "string" || typeof record.detail !== "string" || typeof record.resolved !== "boolean") return [];
    continuityIds.add(record.id);
    return [{
      id: record.id,
      kind: record.kind,
      title: record.title,
      detail: record.detail,
      episodeIds: stringArray(record.episodeIds),
      resolved: record.resolved,
      ...(typeof record.timelineOrder === "number" && Number.isFinite(record.timelineOrder) ? { timelineOrder: record.timelineOrder } : {}),
      ...(typeof record.timelineDate === "string" ? { timelineDate: record.timelineDate } : {}),
    }];
  }) : [];
  return {
    showBible: string(value.showBible),
    seasons,
    episodes,
    characterArcs: stringRecord(value.characterArcs),
    continuity,
  };
}

function normalizeSavedLayouts(value: unknown, fallback: SavedLayout[]): SavedLayout[] {
  const savedLayouts = Array.isArray(value) ? value.filter(isRecord) : [];
  const builtins = fallback.map((layout) => {
    const base = normalizeWorkspaceLayout({ ...layout });
    const saved = savedLayouts.find((item) => item.id === base.id);
    if (!saved || !safeLayoutTopology(saved)) return base;
    const candidate = normalizeWorkspaceLayout({ ...base, splits: structuredClone(saved.splits) } as WorkspaceLayout);
    const sameTopology = candidate.splits.length === base.splits.length && candidate.splits.every((split, index) => {
      const original = base.splits[index];
      return split.id === original.id && split.direction === original.direction && split.groupIds.length === original.groupIds.length && split.groupIds.every((id, groupIndex) => id === original.groupIds[groupIndex]);
    });
    return sameTopology && validateWorkspaceLayout(candidate).valid ? candidate : base;
  });
  if (!Array.isArray(value)) return builtins;
  const builtinIds = new Set(builtins.map((layout) => layout.id));
  const ids = new Set(builtinIds);
  const custom = value.flatMap((raw): SavedLayout[] => {
    if (!isRecord(raw)
      || typeof raw.id !== "string" || !raw.id || ids.has(raw.id)
      || typeof raw.name !== "string"
      || (raw.navigator !== "left" && raw.navigator !== "right" && raw.navigator !== "hidden")
      || (raw.inspector !== "left" && raw.inspector !== "right" && raw.inspector !== "floating" && raw.inspector !== "hidden")
      || typeof raw.reference !== "string"
      || typeof raw.navigatorWidth !== "number" || !Number.isFinite(raw.navigatorWidth)
      || typeof raw.inspectorWidth !== "number" || !Number.isFinite(raw.inspectorWidth)) return [];
    const base: Record<string, unknown> = {
      id: raw.id,
      name: raw.name,
      navigator: raw.navigator,
      inspector: raw.inspector,
      reference: raw.reference,
      navigatorWidth: raw.navigatorWidth,
      inspectorWidth: raw.inspectorWidth,
    };
    if (safeLayoutTopology(raw)) {
      for (const key of ["panels", "tabGroups", "splits", "floatingPanels", "synchronizedPanels"] as const) base[key] = structuredClone(raw[key]);
    }
    try {
      const layout = normalizeWorkspaceLayout(base as unknown as SavedLayout);
      if (!validateWorkspaceLayout(layout).valid || builtinIds.has(layout.id)) return [];
      ids.add(layout.id);
      return [layout];
    } catch {
      return [];
    }
  });
  return [...builtins, ...custom];
}

function safeLayoutTopology(value: Record<string, unknown>): boolean {
  const topologyKeys = ["panels", "tabGroups", "splits", "floatingPanels", "synchronizedPanels"] as const;
  if (!topologyKeys.some((key) => value[key] !== undefined)) return false;
  if (!topologyKeys.every((key) => Array.isArray(value[key]))) return false;
  return (value.panels as unknown[]).every((item) => isRecord(item) && typeof item.id === "string" && typeof item.title === "string" && typeof item.kind === "string" && typeof item.closable === "boolean")
    && (value.tabGroups as unknown[]).every((item) => isRecord(item) && typeof item.id === "string" && Array.isArray(item.panelIds) && item.panelIds.every((id) => typeof id === "string") && typeof item.activePanelId === "string")
    && (value.splits as unknown[]).every((item) => isRecord(item) && typeof item.id === "string" && (item.direction === "horizontal" || item.direction === "vertical") && Array.isArray(item.groupIds) && item.groupIds.every((id) => typeof id === "string") && Array.isArray(item.sizes) && item.sizes.every((size) => typeof size === "number"))
    && (value.floatingPanels as unknown[]).every((item) => isRecord(item) && typeof item.panelId === "string" && [item.x, item.y, item.width, item.height].every((number) => typeof number === "number" && Number.isFinite(number)))
    && (value.synchronizedPanels as unknown[]).every((item) => isRecord(item) && typeof item.id === "string" && Array.isArray(item.panelIds) && item.panelIds.every((id) => typeof id === "string") && typeof item.mode === "string");
}

function normalizeProjectWorkspace(value: unknown): ProjectWorkspace {
  const fallback = defaultProjectWorkspace();
  if (!isRecord(value)) return fallback;
  const series = isRecord(value.series) ? value.series : {};
  const sync = isRecord(value.sync) ? value.sync : {};
  const collaborators = normalizeCollaborators(value.collaborators, fallback.collaborators);
  const currentUserId = collaborators.some((collaborator) => collaborator.id === value.currentUserId)
    ? String(value.currentUserId)
    : collaborators.find((collaborator) => collaborator.role === "owner")!.id;
  const normalizedSeries = normalizeSeriesWorkspace(series, fallback.series);
  const layouts = normalizeSavedLayouts(value.layouts, fallback.layouts);
  const activeLayoutId = layouts.some((layout) => layout.id === value.activeLayoutId)
    ? String(value.activeLayoutId)
    : "writer";
  return {
    ...fallback,
    ...value,
    series: normalizedSeries,
    collaborators,
    currentUserId,
    reviews: normalizeReviews(value.reviews),
    approvals: normalizeApprovals(value.approvals),
    writerRoom: normalizeWriterRoom(value.writerRoom, fallback.writerRoom),
    layouts,
    activeLayoutId,
    shortcuts: { ...fallback.shortcuts, ...stringRecord(value.shortcuts) },
    sync: {
      ...fallback.sync,
      ...sync,
      mode: sync.mode === "folder" || sync.mode === "git" ? sync.mode : "none",
      // Legacy absolute shared paths are deliberately discarded. The opened
      // ProjectSession.projectPath is the only safe path on this machine.
      folderPath: "",
      watchFolderPath: string(sync.watchFolderPath),
      watchRecursive: typeof sync.watchRecursive === "boolean" ? sync.watchRecursive : true,
      remoteUrl: string(sync.remoteUrl),
      branch: string(sync.branch) || "main",
      gitAuthorName: string(sync.gitAuthorName) || "Local writer",
      gitAuthorEmail: string(sync.gitAuthorEmail) || "writer@scs.local",
      lastRemoteHash: string(sync.lastRemoteHash),
      lastSyncedAt: string(sync.lastSyncedAt),
    } as SyncSettings,
  };
}

const collaboratorRoles = new Set<CollaboratorRole>(["owner", "writer", "co-writer", "director", "producer", "story-editor", "script-coordinator", "reader", "viewer"]);

function normalizeCollaborators(value: unknown, fallback: Collaborator[]): Collaborator[] {
  if (!Array.isArray(value)) return fallback.map((collaborator) => ({ ...collaborator }));
  const ids = new Set<string>();
  const collaborators = value.flatMap((item): Collaborator[] => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.role !== "string") return [];
    const id = item.id.trim();
    if (!id || !item.name.trim() || !collaboratorRoles.has(item.role as CollaboratorRole) || ids.has(id)) return [];
    ids.add(id);
    return [{ id, name: item.name.trim(), role: item.role as CollaboratorRole }];
  });
  if (!collaborators.some((collaborator) => collaborator.role === "owner")) {
    let id = fallback[0].id;
    for (let suffix = 2; ids.has(id); suffix++) id = `${fallback[0].id}-${suffix}`;
    collaborators.unshift({ ...fallback[0], id });
  }
  return collaborators;
}

const reviewTargetTypes = new Set<ReviewItem["targetType"]>(["project", "episode", "scene", "block", "treatment"]);
const reviewStatuses = new Set<ReviewItem["status"]>(["open", "resolved", "accepted", "rejected"]);

function normalizeReviews(value: unknown): ReviewItem[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item): ReviewItem[] => {
    if (!isRecord(item)) return [];
    const id = string(item.id).trim();
    const authorId = string(item.authorId).trim();
    const targetId = string(item.targetId).trim();
    const createdAt = string(item.createdAt).trim();
    const kind = item.kind === "comment" || item.kind === "suggestion" ? item.kind : undefined;
    const targetType = typeof item.targetType === "string" && reviewTargetTypes.has(item.targetType as ReviewItem["targetType"])
      ? item.targetType as ReviewItem["targetType"]
      : undefined;
    const status = typeof item.status === "string" && reviewStatuses.has(item.status as ReviewItem["status"])
      ? item.status as ReviewItem["status"]
      : undefined;
    if (!id || ids.has(id) || !authorId || !targetId || !createdAt || !kind || !targetType || !status || typeof item.text !== "string") return [];
    ids.add(id);
    return [{
      id,
      kind,
      authorId,
      targetType,
      targetId,
      text: item.text,
      status,
      createdAt,
      ...(typeof item.documentId === "string" && item.documentId.trim() ? { documentId: item.documentId.trim() } : {}),
      ...(typeof item.originalText === "string" ? { originalText: item.originalText } : {}),
      ...(typeof item.suggestedText === "string" ? { suggestedText: item.suggestedText } : {}),
    }];
  });
}

const approvalDecisions = new Set<DraftApproval["decision"]>(["pending", "approved", "changes-requested"]);

function normalizeApprovals(value: unknown): DraftApproval[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item): DraftApproval[] => {
    if (!isRecord(item)) return [];
    const id = string(item.id).trim();
    const versionId = string(item.versionId).trim();
    const reviewerId = string(item.reviewerId).trim();
    const updatedAt = string(item.updatedAt).trim();
    const decision = typeof item.decision === "string" && approvalDecisions.has(item.decision as DraftApproval["decision"])
      ? item.decision as DraftApproval["decision"]
      : undefined;
    if (!id || ids.has(id) || !versionId || !reviewerId || !updatedAt || !decision) return [];
    ids.add(id);
    return [{ id, versionId, reviewerId, decision, note: string(item.note), updatedAt }];
  });
}

function normalizeWriterRoom(value: unknown, fallback: WriterRoomState): WriterRoomState {
  if (!isRecord(value)) return { ...fallback, tasks: [] };
  const ids = new Set<string>();
  const tasks = Array.isArray(value.tasks) ? value.tasks.flatMap((item): WriterRoomTask[] => {
    if (!isRecord(item)) return [];
    const id = string(item.id).trim();
    const text = string(item.text).trim();
    if (!id || ids.has(id) || !text || typeof item.done !== "boolean") return [];
    ids.add(id);
    return [{
      id,
      text,
      done: item.done,
      ...(typeof item.assigneeId === "string" && item.assigneeId.trim() ? { assigneeId: item.assigneeId.trim() } : {}),
      ...(typeof item.documentId === "string" && item.documentId.trim() ? { documentId: item.documentId.trim() } : {}),
      ...(typeof item.sceneId === "string" && item.sceneId.trim() ? { sceneId: item.sceneId.trim() } : {}),
    }];
  }) : [];
  return {
    active: typeof value.active === "boolean" ? value.active : false,
    agenda: string(value.agenda),
    tasks,
    ...(typeof value.activeDocumentId === "string" && value.activeDocumentId.trim() ? { activeDocumentId: value.activeDocumentId.trim() } : {}),
    ...(typeof value.activeSceneId === "string" && value.activeSceneId.trim() ? { activeSceneId: value.activeSceneId.trim() } : {}),
  };
}

function normalizeLegacyComments(value: unknown): NonNullable<ScreenplayDocument["workspace"]>["comments"] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const id = string(item.id).trim();
    const text = string(item.text).trim();
    const createdAt = string(item.createdAt).trim();
    if (!id || ids.has(id) || !text || !createdAt || typeof item.resolved !== "boolean") return [];
    ids.add(id);
    return [{ id, author: string(item.author).trim() || "Unknown", text, resolved: item.resolved, createdAt }];
  });
}

function migrateLegacyComments(session: ProjectSession): void {
  const reviewIds = new Set(session.workspace.reviews.map((review) => review.id));
  const ownerId = session.workspace.collaborators.find((collaborator) => collaborator.role === "owner")!.id;
  for (const document of session.documents) {
    for (const comment of document.workspace?.comments ?? []) {
      const id = `legacy-${document.id}-${comment.id}`;
      if (reviewIds.has(id)) continue;
      const authorId = session.workspace.collaborators.find((collaborator) => collaborator.name.toLowerCase() === comment.author.toLowerCase())?.id ?? ownerId;
      session.workspace.reviews.push({
        id,
        kind: "comment",
        authorId,
        targetType: "episode",
        targetId: document.id!,
        documentId: document.id!,
        text: comment.text,
        status: comment.resolved ? "resolved" : "open",
        createdAt: comment.createdAt,
      });
      reviewIds.add(id);
    }
  }
}

const approvalRoles = new Set<CollaboratorRole>(["owner", "director", "producer", "story-editor"]);

function repairCollaborationReferences(session: ProjectSession): void {
  const collaborators = new Set(session.workspace.collaborators.map((collaborator) => collaborator.id));
  const ownerId = session.workspace.collaborators.find((collaborator) => collaborator.role === "owner")!.id;
  const approvers = new Set(session.workspace.collaborators.filter((collaborator) => approvalRoles.has(collaborator.role)).map((collaborator) => collaborator.id));
  const versionIds = new Set(session.versionHistory.snapshots.map((snapshot) => snapshot.id));
  const documentIds = new Set(session.documents.map((document) => document.id!));
  const sceneOwners = new Map<string, string[]>();
  for (const document of session.documents) for (const block of document.blocks) if (block.type === "scene_heading") sceneOwners.set(block.id, [...(sceneOwners.get(block.id) ?? []), document.id!]);
  const sceneDocument = (sceneId: string, documentId?: string) => documentId && sceneOwners.get(sceneId)?.includes(documentId)
    ? documentId
    : sceneOwners.get(sceneId)?.length === 1 ? sceneOwners.get(sceneId)![0] : undefined;
  const room = session.workspace.writerRoom;
  const activeDocumentId = room.activeSceneId ? sceneDocument(room.activeSceneId, room.activeDocumentId) : undefined;
  session.workspace.reviews = session.workspace.reviews.map((review) => collaborators.has(review.authorId) ? review : { ...review, authorId: ownerId });
  session.workspace.approvals = session.workspace.approvals.filter((approval) => versionIds.has(approval.versionId) && approvers.has(approval.reviewerId));
  session.workspace.writerRoom = {
    ...room,
    activeDocumentId,
    activeSceneId: activeDocumentId ? room.activeSceneId : undefined,
    tasks: room.tasks.map((task) => {
      const next = task.assigneeId && !collaborators.has(task.assigneeId) ? { ...task, assigneeId: undefined } : { ...task };
      if (next.documentId && !documentIds.has(next.documentId)) next.documentId = undefined;
      if (next.sceneId) {
        next.documentId = sceneDocument(next.sceneId, next.documentId);
        if (!next.documentId) next.sceneId = undefined;
      }
      return next;
    }),
  };
}

function ensureDocumentId(document: ScreenplayDocument): string {
  document.id ||= `document-${crypto.randomUUID()}`;
  return document.id;
}

function isSnapshot(value: unknown): value is DraftSnapshot {
  return isRecord(value) && typeof value.id === "string" && typeof value.createdAt === "string" && isRecord(value.document);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function numberArray(value: unknown): number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number" && Number.isFinite(item)) : [];
}
