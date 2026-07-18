import { compileAnalysis } from "./analysis.ts";
import type { ProjectSession } from "./projectWorkspace.ts";
import { deriveScenes, paginateBlocks, type ScreenplayBlock, type ScreenplayDocument } from "./screenplay.ts";

export interface ProjectSnapshot {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  parentIds: string[];
  branchId?: string;
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

export interface VersionHistory {
  snapshots: ProjectSnapshot[];
  branches: DraftBranch[];
  milestones: Milestone[];
  activeBranchId: string;
}

export interface SnapshotDetails {
  id: string;
  name: string;
  createdAt: string;
  description?: string;
  parentIds?: readonly string[];
  branchId?: string;
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
  | "season";

export interface DocumentChange {
  kind: "added" | "removed" | "modified";
  documentId: string;
  title: string;
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
  documentChanges: DocumentChange[];
  blockChanges: BlockChange[];
  metadataChanges: MetadataChange[];
}

export type MergeResolution = "ours" | "theirs";
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

export function createProjectSnapshot(session: ProjectSession, details: SnapshotDetails): ProjectSnapshot {
  if (!details.id.trim() || !details.name.trim() || !details.createdAt.trim()) throw new Error("Snapshot id, name, and createdAt are required.");
  const snapshotSession = clone(session);
  // History belongs to the containing project, not to each historical state.
  // Clearing it prevents recursively nested snapshots and keeps portable files small.
  snapshotSession.versionHistory = { snapshots: [], branches: [], milestones: [], activeBranchId: "main" };
  snapshotSession.versions = [];
  return {
    id: details.id,
    name: details.name.trim(),
    description: details.description?.trim() ?? "",
    createdAt: details.createdAt,
    parentIds: [...details.parentIds ?? []],
    branchId: details.branchId,
    session: snapshotSession,
  };
}

export function restoreProjectSnapshot(snapshot: ProjectSnapshot): ProjectSession {
  return clone(snapshot.session);
}

export function createVersionHistory(initial: ProjectSnapshot, branch = { id: "main", name: "Main Draft" }): VersionHistory {
  if (!branch.id.trim() || !branch.name.trim()) throw new Error("Branch id and name are required.");
  const snapshot = clone(initial);
  snapshot.branchId ||= branch.id;
  return {
    snapshots: [snapshot],
    branches: [{ id: branch.id, name: branch.name.trim(), baseSnapshotId: snapshot.id, headSnapshotId: snapshot.id }],
    milestones: [],
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
  if (!saved.parentIds.length) saved.parentIds = [branch.headSnapshotId];
  next.snapshots.push(saved);
  next.branches.find((item) => item.id === branchId)!.headSnapshotId = saved.id;
  next.activeBranchId = branchId;
  return next;
}

export function createAlternateDraft(history: VersionHistory, branch: { id: string; name: string; fromSnapshotId: string }): VersionHistory {
  if (!branch.id.trim() || !branch.name.trim()) throw new Error("Branch id and name are required.");
  if (history.branches.some((item) => item.id === branch.id)) throw new Error(`Branch '${branch.id}' already exists.`);
  if (!history.snapshots.some((item) => item.id === branch.fromSnapshotId)) throw new Error(`Snapshot '${branch.fromSnapshotId}' does not exist.`);
  const next = clone(history);
  next.branches.push({ id: branch.id, name: branch.name.trim(), baseSnapshotId: branch.fromSnapshotId, headSnapshotId: branch.fromSnapshotId });
  next.activeBranchId = branch.id;
  return next;
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
  const comparison: SnapshotComparison = {
    fromSnapshotId: from.id,
    toSnapshotId: to.id,
    mode,
    documentChanges: [],
    blockChanges: [],
    metadataChanges: [],
  };
  if (mode === "document") comparison.documentChanges = compareDocuments(from.session.documents, to.session.documents);
  else if (mode === "block") comparison.blockChanges = compareBlocks(from.session.documents, to.session.documents);
  else if (mode === "dialogue") comparison.blockChanges = compareBlocks(from.session.documents, to.session.documents).filter((change) => {
    const type = change.after?.type ?? change.before?.type;
    return type === "character" || type === "dialogue" || type === "parenthetical";
  });
  else if (mode === "metadata") diffMetadata(metadataView(from.session), metadataView(to.session), "", comparison.metadataChanges);
  else diffMetadata(semanticView(from.session, mode), semanticView(to.session, mode), "", comparison.metadataChanges);
  return comparison;
}

function semanticView(session: ProjectSession, mode: Exclude<SnapshotDiffMode, "document" | "block" | "metadata" | "dialogue">): unknown {
  if (mode === "season") return session.workspace.series;
  return Object.fromEntries(session.documents.map((document, index) => {
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

export function mergeSnapshots(base: ProjectSnapshot, ours: ProjectSnapshot, theirs: ProjectSnapshot, resolution: MergeResolution = "ours"): SnapshotMergeResult {
  const context: MergeContext = { conflicts: [], resolution };
  const baseMetadata = withoutKey(base.session, "documents");
  const oursMetadata = withoutKey(ours.session, "documents");
  const theirsMetadata = withoutKey(theirs.session, "documents");
  const metadata = mergeValue(baseMetadata, oursMetadata, theirsMetadata, "", context);
  const merged = {
    ...(metadata === MISSING ? {} : metadata as Omit<ProjectSession, "documents">),
    documents: mergeDocuments(base.session.documents, ours.session.documents, theirs.session.documents, context),
  } as ProjectSession;
  return { merged, conflicts: context.conflicts, clean: context.conflicts.length === 0, resolution };
}

function compareDocuments(before: ScreenplayDocument[], after: ScreenplayDocument[]): DocumentChange[] {
  const left = documentsById(before);
  const right = documentsById(after);
  const changes: DocumentChange[] = [];
  for (const id of uniqueSorted([...left.keys(), ...right.keys()])) {
    const from = left.get(id)?.value;
    const to = right.get(id)?.value;
    if (!from && to) changes.push({ kind: "added", documentId: id, title: documentTitle(to) });
    else if (from && !to) changes.push({ kind: "removed", documentId: id, title: documentTitle(from) });
    else if (from && to && !equal(from, to)) changes.push({ kind: "modified", documentId: id, title: documentTitle(to) });
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

function metadataView(session: ProjectSession): unknown {
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
    context.conflicts.push({ path, kind: "order", base: clone(base), ours: clone(ours), theirs: clone(theirs), resolution: context.resolution });
    preferred = context.resolution === "ours" ? ours : theirs;
  }
  const secondary = preferred === ours ? theirs : ours;
  return [...preferred, ...secondary, ...base].filter((id, index, all) => valid.has(id) && all.indexOf(id) === index);
}

function mergeValue(base: MaybeValue, ours: MaybeValue, theirs: MaybeValue, path: string, context: MergeContext): MaybeValue {
  if (same(ours, theirs)) return cloneMaybe(ours);
  if (same(ours, base)) return cloneMaybe(theirs);
  if (same(theirs, base)) return cloneMaybe(ours);
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
  context.conflicts.push({ path: path || "/", kind, base: conflictValue(base), ours: conflictValue(ours), theirs: conflictValue(theirs), resolution: context.resolution });
  return cloneMaybe(context.resolution === "ours" ? ours : theirs);
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
