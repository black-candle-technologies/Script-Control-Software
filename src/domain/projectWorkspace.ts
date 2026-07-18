import { emptyDocument, emptyWorkspace, type ScreenplayDocument } from "./screenplay.ts";
import type { DraftSnapshot } from "./studio.ts";

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
  sceneId?: string;
  done: boolean;
}

export interface WriterRoomState {
  active: boolean;
  agenda: string;
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
  reference: "none" | "previous-episode" | "previous-draft";
  navigatorWidth: number;
  inspectorWidth: number;
}

export interface SyncSettings {
  mode: "none" | "folder" | "git";
  folderPath: string;
  remoteUrl: string;
  branch: string;
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
  schemaVersion: 3;
  projectId: string;
  name: string;
  projectType: ProjectSessionType;
  createdAt: string;
  updatedAt: string;
  documents: ScreenplayDocument[];
  versions: DraftSnapshot[];
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
  { id: "companion", name: "Companion", navigator: "left", inspector: "right", reference: "none", navigatorWidth: 280, inspectorWidth: 520 },
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
    sync: { mode: "none", folderPath: "", remoteUrl: "", branch: "main", lastRemoteHash: "", lastSyncedAt: "" },
  };
}

export function createProjectSession(document = emptyDocument(), projectType: ProjectSessionType = "featureFilm"): ProjectSession {
  ensureDocumentId(document);
  const workspace = defaultProjectWorkspace();
  syncSeriesDocuments(workspace.series, [document]);
  const now = new Date().toISOString();
  return {
    schemaVersion: 3,
    projectId: `project-${crypto.randomUUID()}`,
    name: document.titlePage.title || (projectType === "television" ? "Untitled Show" : "Untitled Screenplay"),
    projectType,
    createdAt: now,
    updatedAt: now,
    documents: [document],
    versions: [],
    workspace,
    projectPath: "",
    activeDocumentId: document.id!,
  };
}

export function normalizeProjectSession(value: unknown): ProjectSession {
  if (!isRecord(value)) throw new Error("Project data is not an object.");
  const rawDocuments = Array.isArray(value.documents) ? value.documents : value.document ? [value.document] : [];
  if (!rawDocuments.length) throw new Error("Project has no screenplay documents.");
  const documents = rawDocuments.map(normalizeDocument);
  const projectType: ProjectSessionType = value.projectType === "television" || documents.length > 1 ? "television" : "featureFilm";
  const session = createProjectSession(documents[0], projectType);
  session.documents = documents;
  session.projectId = string(value.projectId) || string(value.id) || session.projectId;
  session.name = string(value.name) || documents[0].titlePage.title || session.name;
  session.createdAt = string(value.createdAt) || session.createdAt;
  session.updatedAt = string(value.updatedAt) || session.updatedAt;
  session.versions = Array.isArray(value.versions) ? value.versions.filter(isSnapshot).map((item) => structuredClone(item)) : [];
  session.workspace = normalizeProjectWorkspace(value.workspace);
  session.projectPath = string(value.projectPath);
  session.activeDocumentId = documents.some((document) => document.id === value.activeDocumentId)
    ? String(value.activeDocumentId)
    : documents[0].id!;
  syncSeriesDocuments(session.workspace.series, documents);
  return session;
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
    return { ...raw, id, text: raw.text } as ScreenplayDocument["blocks"][number];
  });
  if (!blocks.length) blocks.push(emptyDocument().blocks[0]);
  const document = {
    ...value,
    id: string(value.id),
    titlePage: { ...value.titlePage, title: string(value.titlePage.title), author: string(value.titlePage.author) },
    blocks,
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
    comments: Array.isArray(value.comments) ? value.comments : [],
    entityStatuses: isRecord(value.entityStatuses) ? value.entityStatuses : {},
    sceneMeta: isRecord(value.sceneMeta) ? value.sceneMeta : {},
  };
}

function normalizeProjectWorkspace(value: unknown): ProjectWorkspace {
  const fallback = defaultProjectWorkspace();
  if (!isRecord(value)) return fallback;
  const series = isRecord(value.series) ? value.series : {};
  const sync = isRecord(value.sync) ? value.sync : {};
  return {
    ...fallback,
    ...value,
    series: {
      ...fallback.series,
      ...series,
      showBible: string(series.showBible),
      seasons: Array.isArray(series.seasons) ? series.seasons : fallback.series.seasons,
      episodes: isRecord(series.episodes) ? series.episodes : {},
      characterArcs: stringRecord(series.characterArcs),
      continuity: Array.isArray(series.continuity) ? series.continuity : [],
    } as SeriesWorkspace,
    collaborators: Array.isArray(value.collaborators) && value.collaborators.length ? value.collaborators as Collaborator[] : fallback.collaborators,
    currentUserId: string(value.currentUserId) || fallback.currentUserId,
    reviews: Array.isArray(value.reviews) ? value.reviews as ReviewItem[] : [],
    approvals: Array.isArray(value.approvals) ? value.approvals as DraftApproval[] : [],
    writerRoom: isRecord(value.writerRoom) ? { ...fallback.writerRoom, ...value.writerRoom, agenda: string(value.writerRoom.agenda), tasks: Array.isArray(value.writerRoom.tasks) ? value.writerRoom.tasks as WriterRoomTask[] : [] } : fallback.writerRoom,
    layouts: Array.isArray(value.layouts) && value.layouts.length ? value.layouts as SavedLayout[] : fallback.layouts,
    activeLayoutId: string(value.activeLayoutId) || fallback.activeLayoutId,
    shortcuts: { ...fallback.shortcuts, ...stringRecord(value.shortcuts) },
    sync: {
      ...fallback.sync,
      ...sync,
      folderPath: string(sync.folderPath),
      remoteUrl: string(sync.remoteUrl),
      branch: string(sync.branch) || "main",
      lastRemoteHash: string(sync.lastRemoteHash),
      lastSyncedAt: string(sync.lastSyncedAt),
    } as SyncSettings,
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
